// Sends the buyer a mobile-friendly email with a link to the /sign/:token
// page. The URL is fully self-contained — the token IS the credential — so
// the buyer can tap it from their phone and sign without any login.
// Requires SUPABASE JWT (dealer must be signed in to trigger).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const APP_ORIGIN = Deno.env.get('APP_ORIGIN') || 'https://app.ogdix.com';
const FROM_ADDRESS = Deno.env.get('ESIGN_FROM_ADDRESS') || 'OG DiX <noreply@ogdix.com>';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const dealId = body?.deal_id;
    if (!dealId) {
      return new Response(JSON.stringify({ error: 'Missing deal_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } }
    );

    const { data: deal, error: dealErr } = await supabase
      .from('deals')
      .select('id, dealer_id, vehicle_id, purchaser_name, customer_email, esign_token, signed_at')
      .eq('id', dealId)
      .single();
    if (dealErr || !deal) {
      return new Response(JSON.stringify({ error: 'deal not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!deal.customer_email) {
      return new Response(JSON.stringify({ error: 'deal has no customer_email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (deal.signed_at) {
      return new Response(JSON.stringify({ error: 'deal already signed' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const [{ data: dealer }, { data: vehicle }] = await Promise.all([
      supabase.from('dealer_settings').select('dealer_name, phone').eq('id', deal.dealer_id).single(),
      deal.vehicle_id
        ? supabase.from('inventory').select('year, make, model').eq('id', deal.vehicle_id).single()
        : Promise.resolve({ data: null }),
    ]);

    const buyerFirst = String(deal.purchaser_name || '').trim().split(' ')[0] || 'there';
    const dealerName = dealer?.dealer_name || 'the dealership';
    const vehicleLine = vehicle
      ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim()
      : 'your vehicle';
    const signUrl = `${APP_ORIGIN}/sign/${deal.esign_token}`;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign your paperwork — ${dealerName}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;">
  <div style="background:#fff;border-radius:16px;padding:28px 24px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="font-size:13px;color:#666;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px;">
      ${escapeHtml(dealerName)}
    </div>
    <h1 style="font-size:22px;margin:0 0 12px 0;color:#0a0a0a;font-weight:700;line-height:1.3;">
      Hi ${escapeHtml(buyerFirst)}, your paperwork is ready to sign
    </h1>
    <p style="font-size:15px;color:#555;line-height:1.55;margin:0 0 20px 0;">
      Tap the button below to sign the sale documents for your <strong>${escapeHtml(vehicleLine)}</strong>. It works right in your phone's browser — nothing to download.
    </p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${signUrl}" style="display:inline-block;background:#0a7c2f;color:#fff;text-decoration:none;padding:16px 28px;border-radius:12px;font-size:17px;font-weight:700;">
        Sign my paperwork →
      </a>
    </div>
    <p style="font-size:13px;color:#666;line-height:1.55;margin:16px 0 0 0;text-align:center;">
      Or open this link on any device:<br>
      <a href="${signUrl}" style="color:#0060df;word-break:break-all;">${signUrl}</a>
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
    <p style="font-size:12px;color:#888;line-height:1.5;margin:0;">
      This link is unique to your purchase. Do not share it. If you did not expect this email, please ignore it or contact ${escapeHtml(dealerName)}${dealer?.phone ? ` at ${escapeHtml(dealer.phone)}` : ''}.
    </p>
  </div>
</div>
</body>
</html>`;

    const text = `Hi ${buyerFirst},

Your paperwork for your ${vehicleLine} from ${dealerName} is ready to sign.

Sign here: ${signUrl}

This link is unique to your purchase — please don't share it.
${dealer?.phone ? `\nQuestions? Call ${dealerName} at ${dealer.phone}.` : ''}
`;

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [deal.customer_email],
        subject: `Sign your paperwork — ${dealerName}`,
        html,
        text,
      }),
    });

    if (!resendResp.ok) {
      const errText = await resendResp.text();
      console.error('Resend error:', errText);
      return new Response(JSON.stringify({ error: 'Resend failed', detail: errText.slice(0, 400) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const j = await resendResp.json();
    return new Response(JSON.stringify({ success: true, sent_to: deal.customer_email, email_id: j.id, sign_url: signUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

function escapeHtml(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}
