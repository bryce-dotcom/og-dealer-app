import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID")!;
const PLAID_SECRET = Deno.env.get("PLAID_SECRET")!;
const PLAID_ENV = Deno.env.get("PLAID_ENV") || "sandbox"; // sandbox, development, production

// ============================================
// CREATE PLAID LINK TOKEN
// ============================================
// Generates a link token for Plaid Link UI
// Used by investors to connect their bank accounts

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { investor_id, is_pool_account = false } = await req.json();

    if (!investor_id) {
      throw new Error("investor_id is required");
    }

    console.log(`[PLAID] Creating link token for investor ${investor_id}`);

    // Get investor info
    const { data: investor, error: investorError } = await supabase
      .from('investors')
      .select('email, full_name')
      .eq('id', investor_id)
      .single();

    if (investorError || !investor) {
      throw new Error('Investor not found');
    }

    // Plaid API endpoint
    const plaidUrl = PLAID_ENV === 'production'
      ? 'https://production.plaid.com/link/token/create'
      : PLAID_ENV === 'development'
      ? 'https://development.plaid.com/link/token/create'
      : 'https://sandbox.plaid.com/link/token/create';

    // Determine products - try 'auth' first since 'transfer' requires separate Plaid approval
    const products = is_pool_account
      ? ['transactions', 'auth']
      : ['auth'];

    const requestBody: any = {
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      user: {
        client_user_id: investor_id,
      },
      client_name: 'OG DiX Motor Club',
      products,
      country_codes: ['US'],
      language: 'en',
      webhook: `${supabaseUrl}/functions/v1/plaid-webhook`,
      account_filters: {
        depository: {
          account_subtypes: ['checking', 'savings'],
        },
      },
    };

    console.log('[PLAID] Request products:', products, 'env:', PLAID_ENV);

    // Create link token
    const response = await fetch(plaidUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[PLAID] API Error:', JSON.stringify(data));
      throw new Error(`Plaid API error: ${data.error_message || data.error_code || 'Unknown error'}`);
    }

    console.log('[PLAID] Link token created successfully');

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
        error: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
