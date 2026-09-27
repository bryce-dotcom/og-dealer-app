// Sends "set your password" emails (new-employee invites and password resets)
// through Resend from the verified ogdix.com domain.
//
// The link carries a one-time `token_hash` in the QUERY STRING and points at
// /employee-setup. That page never relies on Supabase's implicit-flow URL-hash
// session handoff (which was dropping sessions on iOS Safari) — it posts the
// token + chosen password to the complete-account-setup edge function, which
// verifies the token server-side and sets the password.

const APP_ORIGIN = 'https://app.ogdix.com';
const FROM_ADDRESS = Deno.env.get('INVITE_FROM_ADDRESS') || 'OG DiX <noreply@ogdix.com>';

export type LinkMode = 'invite' | 'reset';

function escapeHtml(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}

export async function lookupDealerName(supabase: any, userId: string | null, email: string): Promise<string> {
  try {
    let dealerId: number | null = null;
    if (userId) {
      const { data } = await supabase.from('employees').select('dealer_id').eq('user_id', userId).limit(1).maybeSingle();
      dealerId = data?.dealer_id ?? null;
    }
    if (!dealerId) {
      const { data } = await supabase.from('employees').select('dealer_id').eq('email', email.toLowerCase()).limit(1).maybeSingle();
      dealerId = data?.dealer_id ?? null;
    }
    if (!dealerId && userId) {
      const { data: owned } = await supabase.from('dealer_settings').select('id').eq('owner_user_id', userId).maybeSingle();
      dealerId = owned?.id;
    }
    if (!dealerId) return 'OG DiX';
    const { data } = await supabase.from('dealer_settings').select('dealer_name').eq('id', dealerId).single();
    return data?.dealer_name || 'OG DiX';
  } catch {
    return 'OG DiX';
  }
}

/**
 * Generate a one-time token for `email` and email a set-password link.
 * mode 'invite': tries an invite token first (creates the auth user if needed);
 * if the user already exists/confirmed, falls back to a recovery token — both
 * land on the same set-password page.
 * mode 'reset': recovery token only; returns { userId: null } silently if no
 * such user exists (callers must not reveal that to the requester).
 */
export async function sendPasswordLinkEmail(opts: {
  supabase: any;
  email: string;
  name?: string;
  dealerName?: string;
  mode: LinkMode;
}): Promise<{ userId: string | null; error: string | null }> {
  const { supabase, mode } = opts;
  const email = String(opts.email || '').trim().toLowerCase();
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) return { userId: null, error: 'RESEND_API_KEY not configured' };
  if (!email) return { userId: null, error: 'missing email' };

  let tokenType: 'invite' | 'recovery' = mode === 'invite' ? 'invite' : 'recovery';
  let { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({ type: tokenType, email });
  if (linkError && mode === 'invite') {
    // Already-registered users can't be re-invited; a recovery token does the
    // same job (lets them choose a password) on the same page.
    const retry = await supabase.auth.admin.generateLink({ type: 'recovery', email });
    if (retry.error) {
      return { userId: null, error: `could not create link: ${linkError.message} / ${retry.error.message}` };
    }
    linkData = retry.data;
    linkError = null;
    tokenType = 'recovery';
  }
  if (linkError) {
    // mode 'reset' with no such user lands here — not an error for the caller.
    return { userId: null, error: null };
  }

  const hashedToken = linkData?.properties?.hashed_token;
  const userId = linkData?.user?.id || null;
  if (!hashedToken) return { userId, error: 'no hashed_token returned' };

  const firstName = String(opts.name || '').trim().split(/\s+/)[0] || '';
  const dealerName = opts.dealerName || await lookupDealerName(supabase, userId, email);

  const qs = new URLSearchParams({ token_hash: hashedToken, type: tokenType, email });
  if (firstName) qs.set('name', firstName);
  if (dealerName) qs.set('dealer', dealerName);
  const setupUrl = `${APP_ORIGIN}/employee-setup?${qs.toString()}`;

  const isInvite = mode === 'invite';
  const subject = isInvite ? `You're invited to ${dealerName}` : `Reset your ${dealerName} password`;
  const heading = isInvite
    ? `Hi ${escapeHtml(firstName || 'there')}, you've been invited to ${escapeHtml(dealerName)}`
    : `Reset your password`;
  const intro = isInvite
    ? 'Tap the button below and choose a password. After that you sign in with your email and that password.'
    : 'Tap the button below to choose a new password. If you didn\'t ask for this, you can ignore this email.';
  const cta = isInvite ? 'Set up my login' : 'Choose a new password';

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;">
  <div style="background:#fff;border-radius:16px;padding:28px 24px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="font-size:13px;color:#666;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px;">${escapeHtml(dealerName)}</div>
    <h1 style="font-size:22px;margin:0 0 12px 0;font-weight:700;line-height:1.3;">${heading}</h1>
    <p style="font-size:15px;color:#555;line-height:1.55;margin:0 0 20px 0;">${intro}</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${setupUrl}" style="display:inline-block;background:#0a7c2f;color:#fff;text-decoration:none;padding:16px 28px;border-radius:12px;font-size:17px;font-weight:700;">${cta} →</a>
    </div>
    <p style="font-size:13px;color:#666;line-height:1.55;margin:0;">
      This link works once and expires in 24 hours. If you got more than one of these emails, use the newest one.
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <p style="font-size:12px;color:#888;line-height:1.5;margin:0;">Your login email is <strong>${escapeHtml(email)}</strong>.</p>
  </div>
</div>
</body></html>`;

  const text = `${isInvite ? `You've been invited to ${dealerName}.` : 'Reset your password.'}

${cta}: ${setupUrl}

This link works once and expires in 24 hours. If you got more than one of these emails, use the newest one.
Your login email is ${email}.`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [email], subject, html, text }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    return { userId, error: `Resend HTTP ${resp.status}: ${t.slice(0, 300)}` };
  }
  return { userId, error: null };
}
