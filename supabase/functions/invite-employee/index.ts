import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Deliver invite emails via Resend from our verified domain, NOT via Supabase's
// default (rate-limited, unreliable) built-in emailer. See memory/ogdix-resend.md.
const APP_ORIGIN = 'https://app.ogdix.com';
const REDIRECT_TO = `${APP_ORIGIN}/employee-setup`;
const FROM_ADDRESS = Deno.env.get('INVITE_FROM_ADDRESS') || 'OG DiX <noreply@ogdix.com>';

/**
 * Generate a Supabase invite link for `email` (creates the auth.users row if
 * missing, reuses it otherwise), then send an HTML email with that link via
 * Resend. Returns the auth user id on success.
 */
async function sendInviteViaResend(
  supabase: any,
  email: string,
  name: string,
  dealerName: string,
): Promise<{ userId: string | null; error: string | null }> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    return { userId: null, error: 'RESEND_API_KEY not configured' };
  }

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: REDIRECT_TO },
  });
  if (linkError) {
    return { userId: null, error: `generateLink failed: ${linkError.message}` };
  }
  const actionLink = linkData?.properties?.action_link;
  const userId = linkData?.user?.id || null;
  if (!actionLink) {
    return { userId, error: 'no action_link returned' };
  }

  const firstName = String(name || '').trim().split(' ')[0] || 'there';
  const escape = (s: string) =>
    String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;">
  <div style="background:#fff;border-radius:16px;padding:28px 24px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="font-size:13px;color:#666;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px;">${escape(dealerName)}</div>
    <h1 style="font-size:22px;margin:0 0 12px 0;font-weight:700;line-height:1.3;">Hi ${escape(firstName)}, you've been invited to ${escape(dealerName)}</h1>
    <p style="font-size:15px;color:#555;line-height:1.55;margin:0 0 20px 0;">Tap the button below to set up your login. This link is unique to you — please don't share it.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${actionLink}" style="display:inline-block;background:#0a7c2f;color:#fff;text-decoration:none;padding:16px 28px;border-radius:12px;font-size:17px;font-weight:700;">Accept invitation →</a>
    </div>
    <p style="font-size:13px;color:#666;line-height:1.55;margin:16px 0 0 0;text-align:center;">Or open this link on any device:<br><a href="${actionLink}" style="color:#0060df;word-break:break-all;">${actionLink}</a></p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <p style="font-size:12px;color:#888;line-height:1.5;margin:0;">If you didn't expect this invite, you can ignore this email.</p>
  </div>
</div>
</body></html>`;

  const text = `Hi ${firstName},

You've been invited to ${dealerName}. Set up your login here:
${actionLink}

If you didn't expect this invite, you can ignore this email.`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [email],
      subject: `You're invited to ${dealerName}`,
      html,
      text,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error('Resend failed for invite:', resp.status, t);
    return { userId, error: `Resend HTTP ${resp.status}: ${t.slice(0, 300)}` };
  }
  return { userId, error: null };
}

async function getDealerName(supabase: any, dealerId: number | string): Promise<string> {
  try {
    const { data } = await supabase.from('dealer_settings').select('dealer_name').eq('id', dealerId).single();
    return data?.dealer_name || 'the dealership';
  } catch { return 'the dealership'; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log('Invite employee request:', { ...body, hourly_rate: body.hourly_rate });

    // Handle resend invitation
    if (body.resend && body.employee_id) {
      const { data: employee } = await supabase
        .from('employees')
        .select('email, name, user_id, dealer_id')
        .eq('id', body.employee_id)
        .single();

      if (!employee) {
        return new Response(
          JSON.stringify({ error: 'Employee not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (employee.user_id) {
        return new Response(
          JSON.stringify({ error: 'Employee has already accepted invitation' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const dealerName = await getDealerName(supabase, employee.dealer_id);
      const { userId, error: sendError } = await sendInviteViaResend(
        supabase, employee.email, employee.name || '', dealerName,
      );
      if (sendError) {
        return new Response(
          JSON.stringify({ error: `Failed to resend invitation: ${sendError}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // Stamp the timestamp and link the auth user id so the Team page shows
      // the invite went out.
      await supabase
        .from('employees')
        .update({ invited_at: new Date().toISOString(), user_id: userId })
        .eq('id', body.employee_id);

      return new Response(
        JSON.stringify({ success: true, message: 'Invitation resent successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // New invitation
    const { dealer_id, name, email, role, access_level, pay_type, hourly_rate, employee_id, existing_employee } = body;

    if (!dealer_id || !name || !email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: dealer_id, name, email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If inviting existing employee, update their record instead of creating new
    if (existing_employee && employee_id) {
      const { data: existingEmp } = await supabase
        .from('employees')
        .select('id, email, user_id')
        .eq('id', employee_id)
        .single();

      if (!existingEmp) {
        return new Response(
          JSON.stringify({ error: 'Employee not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (existingEmp.user_id) {
        return new Response(
          JSON.stringify({ error: 'Employee already has app access' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate invite link and send via Resend (not Supabase default emailer).
      const dealerName = await getDealerName(supabase, dealer_id);
      const { userId, error: sendError } = await sendInviteViaResend(supabase, email, name, dealerName);
      if (sendError) {
        return new Response(
          JSON.stringify({ error: `Failed to send invitation: ${sendError}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabase
        .from('employees')
        .update({ user_id: userId, invited_at: new Date().toISOString() })
        .eq('id', employee_id);

      return new Response(
        JSON.stringify({ success: true, message: `Invitation sent to ${email}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if employee already exists
    const { data: existing } = await supabase
      .from('employees')
      .select('id, email')
      .eq('dealer_id', dealer_id)
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'An employee with this email already exists' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Generate invite link (creates auth.users record) and send via
    // Resend from noreply@ogdix.com.
    const dealerNameNew = await getDealerName(supabase, dealer_id);
    const { userId: newUserId, error: sendErrorNew } = await sendInviteViaResend(supabase, email, name, dealerNameNew);
    if (sendErrorNew) {
      return new Response(
        JSON.stringify({ error: `Failed to send invitation: ${sendErrorNew}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const authData = { user: { id: newUserId } } as any;
    console.log('Auth user invited:', authData.user?.id);

    // Step 2: Create employee record in database
    const employeeData: any = {
      dealer_id,
      name,
      email: email.toLowerCase(),
      roles: role ? [role] : [],
      pay_type: [pay_type || 'hourly'],
      active: true,
      user_id: authData.user?.id || null,
      invited_at: new Date().toISOString(),
      hourly_rate: 0,
      salary: 0,
      pto_days_per_year: 10,
      pto_accrued: 0,
      pto_used: 0
    };

    if (pay_type === 'hourly' && hourly_rate) {
      employeeData.hourly_rate = parseFloat(hourly_rate);
    }

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .insert(employeeData)
      .select()
      .single();

    if (employeeError) {
      console.error('Employee creation error:', employeeError);

      // Rollback: Delete the auth user if employee creation fails
      if (authData.user?.id) {
        await supabase.auth.admin.deleteUser(authData.user.id);
      }

      return new Response(
        JSON.stringify({ error: `Failed to create employee record: ${employeeError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Employee created successfully:', employee.id);

    return new Response(
      JSON.stringify({
        success: true,
        employee,
        message: `Invitation sent to ${email}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error',
        stack: error.stack
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
