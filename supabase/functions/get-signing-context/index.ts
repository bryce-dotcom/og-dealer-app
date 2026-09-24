// PUBLIC edge function — the /sign/:token page calls this to show the buyer
// what they're signing (dealer, vehicle, price, doc list). The token in the
// URL is the credential; without it the endpoint returns nothing useful.
// Deploy with `--no-verify-jwt`.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  let token = url.searchParams.get("token") || "";
  if (!token && req.method === "POST") {
    try { token = (await req.json())?.token || ""; } catch {}
  }
  token = String(token).trim();
  if (!token || token.length < 20) {
    return new Response(JSON.stringify({ error: "missing token" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { data: deal, error } = await supabase
    .from("deals")
    .select(`
      id, dealer_id, vehicle_id,
      purchaser_name, co_buyer_name,
      sale_price, total_due, balance_due, date_of_sale,
      signed_at, signed_by_name,
      documents, generated_docs
    `)
    .eq("esign_token", token)
    .single();

  if (error || !deal) {
    return new Response(JSON.stringify({ error: "invalid link" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const [{ data: dealer }, { data: vehicle }] = await Promise.all([
    supabase.from("dealer_settings").select("id, dealer_name, address, city, state, phone").eq("id", deal.dealer_id).single(),
    deal.vehicle_id
      ? supabase.from("inventory").select("id, year, make, model, trim, vin, miles").eq("id", deal.vehicle_id).single()
      : Promise.resolve({ data: null }),
  ]);

  // Normalize doc list from either `documents` or `generated_docs` column.
  const docs = Array.isArray(deal.documents) ? deal.documents
    : Array.isArray(deal.generated_docs) ? deal.generated_docs
    : [];
  const docSummary = docs.map((d: any) => ({
    form_number: d.form_number || d.formNumber || "",
    form_name: d.form_name || d.formName || d.name || "",
    public_url: d.public_url || d.url || null,
  }));

  return new Response(JSON.stringify({
    already_signed: !!deal.signed_at,
    signed_at: deal.signed_at,
    signed_by_name: deal.signed_by_name,
    deal: {
      id: deal.id,
      purchaser_name: deal.purchaser_name,
      co_buyer_name: deal.co_buyer_name,
      sale_price: deal.sale_price,
      total_due: deal.total_due,
      balance_due: deal.balance_due,
      date_of_sale: deal.date_of_sale,
    },
    dealer: dealer ? {
      dealer_name: dealer.dealer_name,
      address: dealer.address,
      city: dealer.city,
      state: dealer.state,
      phone: dealer.phone,
    } : null,
    vehicle: vehicle ? {
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      vin: vehicle.vin,
      miles: vehicle.miles,
    } : null,
    documents: docSummary,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
