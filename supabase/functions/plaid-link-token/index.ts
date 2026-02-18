import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const plaidClientId = Deno.env.get("PLAID_CLIENT_ID");
    const plaidSecret = Deno.env.get("PLAID_SECRET");
    const plaidEnv = Deno.env.get("PLAID_ENV") || "sandbox";

    console.log(`[PLAID] Environment check:`, {
      hasClientId: !!plaidClientId,
      hasSecret: !!plaidSecret,
      env: plaidEnv
    });

    if (!plaidClientId || !plaidSecret) {
      throw new Error("Missing Plaid credentials - check PLAID_CLIENT_ID and PLAID_SECRET environment variables");
    }

    const { user_id } = await req.json();

    if (!user_id) {
      throw new Error("user_id is required");
    }

    // Determine Plaid API URL
    const plaidUrl = plaidEnv === "production"
      ? "https://production.plaid.com"
      : plaidEnv === "development"
      ? "https://development.plaid.com"
      : "https://sandbox.plaid.com";

    console.log(`[PLAID] Creating link token for user: ${user_id} (env: ${plaidEnv})`);

    // Create link token
    const response = await fetch(`${plaidUrl}/link/token/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: plaidClientId,
        secret: plaidSecret,
        user: {
          client_user_id: user_id,
        },
        client_name: "OG Dealer",
        products: ["transactions"],
        country_codes: ["US"],
        language: "en",
        webhook: "", // Optional: add webhook URL for automatic updates
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`[PLAID] Plaid API error response:`, error);
      throw new Error(`Plaid API error: ${error.error_message || error.display_message || response.statusText}`);
    }

    const data = await response.json();

    console.log(`[PLAID] Link token created successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        link_token: data.link_token,
        expiration: data.expiration,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[PLAID] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
