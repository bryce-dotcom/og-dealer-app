// PUBLIC edge function — no JWT verification. The `esign_token` in the request
// body is the auth: it's a one-way opaque token stored on the deal row.
// Deploy with `--no-verify-jwt` so anonymous buyers can hit it from /sign/:token.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const token = String(body?.token || "").trim();
  const signaturePng = String(body?.signature_png || "").trim();
  const signedByName = String(body?.signed_by_name || "").trim();

  if (!token || token.length < 20) {
    return new Response(JSON.stringify({ error: "missing or invalid token" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!signaturePng.startsWith("data:image/png;base64,")) {
    return new Response(JSON.stringify({ error: "signature_png must be a data:image/png;base64 URL" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  // 1MB cap on captured signature (well above what signature_pad produces at ~600x200).
  if (signaturePng.length > 1_400_000) {
    return new Response(JSON.stringify({ error: "signature too large" }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Look up the deal by token. Service role bypasses RLS; that's fine because
  // the token itself is the credential — anyone who has it is authorized to
  // sign this one deal.
  const { data: deal, error: dealErr } = await supabase
    .from("deals")
    .select("id, dealer_id, signed_at, purchaser_name, signing_status")
    .eq("esign_token", token)
    .single();

  if (dealErr || !deal) {
    return new Response(JSON.stringify({ error: "invalid token" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (deal.signed_at) {
    return new Response(JSON.stringify({ error: "deal already signed", signed_at: deal.signed_at }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Store the signature + timestamp + buyer's typed name.
  const { error: updErr } = await supabase
    .from("deals")
    .update({
      signature_png: signaturePng,
      signed_by_name: signedByName || deal.purchaser_name || null,
      signed_at: new Date().toISOString(),
      signing_status: "signed",
    })
    .eq("id", deal.id);

  if (updErr) {
    return new Response(JSON.stringify({ error: "could not save signature", detail: updErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Kick off document regeneration. fill-deal-documents will now embed the
  // signature PNG onto every buyer-signature widget. Fire-and-forget with a
  // short await so any obvious error surfaces in the response.
  let regenSummary: any = null;
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/fill-deal-documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ dealer_id: deal.dealer_id, deal_id: deal.id }),
    });
    if (r.ok) {
      const j = await r.json();
      regenSummary = { count: j.count, ok: true };
    } else {
      const text = await r.text();
      regenSummary = { ok: false, status: r.status, error: text.slice(0, 300) };
    }
  } catch (e: any) {
    regenSummary = { ok: false, error: String(e?.message || e) };
  }

  return new Response(
    JSON.stringify({
      success: true,
      deal_id: deal.id,
      signed_at: new Date().toISOString(),
      regen: regenSummary,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
