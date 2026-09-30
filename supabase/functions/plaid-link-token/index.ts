import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const plaidClientId = Deno.env.get("PLAID_CLIENT_ID");
    const plaidSecret = Deno.env.get("PLAID_SECRET");
    const plaidEnv = Deno.env.get("PLAID_ENV") || "sandbox";

    if (!plaidClientId || !plaidSecret) {
      throw new Error("Missing Plaid credentials - check PLAID_CLIENT_ID and PLAID_SECRET environment variables");
    }

    // user_id is the dealer id (kept for older callers); reconnect_account_id
    // puts Link in "update mode" to re-login an expired bank connection.
    const { user_id, dealer_id: bodyDealerId, reconnect_account_id } = await req.json();
    const dealer_id = bodyDealerId ?? user_id;
    if (!dealer_id) {
      throw new Error("dealer_id is required");
    }

    // Caller must be signed in and belong to this dealer.
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null } };
    const user = userData?.user;
    if (!user) return json({ success: false, error: "Not signed in" }, 401);
    const [{ data: ownedDealer }, { data: employee }] = await Promise.all([
      supabase.from("dealer_settings").select("id").eq("id", dealer_id).eq("owner_user_id", user.id).maybeSingle(),
      supabase.from("employees").select("id").eq("dealer_id", dealer_id).eq("user_id", user.id).eq("active", true).maybeSingle(),
    ]);
    if (!ownedDealer && !employee) return json({ success: false, error: "Not allowed for this dealer" }, 403);

    const plaidUrl = plaidEnv === "production"
      ? "https://production.plaid.com"
      : plaidEnv === "development"
      ? "https://development.plaid.com"
      : "https://sandbox.plaid.com";

    const request: Record<string, unknown> = {
      client_id: plaidClientId,
      secret: plaidSecret,
      user: { client_user_id: String(dealer_id) },
      client_name: "OG Dealer",
      country_codes: ["US"],
      language: "en",
    };

    if (reconnect_account_id) {
      // Update mode: reuse the existing access token (never sent to the browser).
      const { data: account } = await supabase
        .from("bank_accounts")
        .select("plaid_access_token")
        .eq("id", reconnect_account_id)
        .eq("dealer_id", dealer_id)
        .maybeSingle();
      if (!account?.plaid_access_token) throw new Error("That bank account isn't connected through Plaid");
      request.access_token = account.plaid_access_token;
    } else {
      request.products = ["transactions"];
    }

    console.log(`[PLAID] Creating link token for dealer ${dealer_id} (env: ${plaidEnv}, mode: ${reconnect_account_id ? "update" : "new"})`);

    const response = await fetch(`${plaidUrl}/link/token/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`[PLAID] Plaid API error response:`, error);
      throw new Error(`Plaid API error: ${error.error_message || error.display_message || response.statusText}`);
    }

    const data = await response.json();
    return json({ success: true, link_token: data.link_token, expiration: data.expiration });
  } catch (error) {
    console.error("[PLAID] Error:", error);
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
