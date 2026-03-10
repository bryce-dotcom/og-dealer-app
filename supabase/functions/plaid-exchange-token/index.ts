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
const PLAID_ENV = Deno.env.get("PLAID_ENV") || "sandbox";

// ============================================
// EXCHANGE PLAID PUBLIC TOKEN
// ============================================
// Exchanges public token from Plaid Link for access token
// Saves access token to investor record (encrypted)

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { investor_id, public_token, account_id, metadata } = await req.json();

    if (!investor_id || !public_token) {
      throw new Error("investor_id and public_token are required");
    }

    console.log(`[PLAID] Exchanging public token for investor ${investor_id}`);

    // Plaid API endpoint
    const plaidUrl = PLAID_ENV === 'production'
      ? 'https://production.plaid.com/item/public_token/exchange'
      : PLAID_ENV === 'development'
      ? 'https://development.plaid.com/item/public_token/exchange'
      : 'https://sandbox.plaid.com/item/public_token/exchange';

    // Exchange public token for access token
    const exchangeResponse = await fetch(plaidUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        public_token: public_token,
      }),
    });

    const exchangeData = await exchangeResponse.json();

    if (!exchangeResponse.ok) {
      throw new Error(`Plaid exchange error: ${exchangeData.error_message || 'Unknown error'}`);
    }

    const accessToken = exchangeData.access_token;
    const itemId = exchangeData.item_id;

    console.log('[PLAID] Token exchanged successfully, item_id:', itemId);

    // Get account details
    const accountsUrl = plaidUrl.replace('/item/public_token/exchange', '/accounts/get');
    const accountsResponse = await fetch(accountsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        access_token: accessToken,
      }),
    });

    const accountsData = await accountsResponse.json();

    if (!accountsResponse.ok) {
      throw new Error(`Plaid accounts error: ${accountsData.error_message || 'Unknown error'}`);
    }

    // Find the selected account
    const selectedAccount = accountsData.accounts.find((acc: any) => acc.account_id === account_id)
      || accountsData.accounts[0]; // Default to first account

    // Prepare bank account info (don't store full account number!)
    const bankAccountInfo = {
      account_id: selectedAccount.account_id,
      name: selectedAccount.name,
      mask: selectedAccount.mask,
      type: selectedAccount.type,
      subtype: selectedAccount.subtype,
    };

    console.log('[PLAID] Linked account:', selectedAccount.name, '****' + selectedAccount.mask);

    // Update investor record with Plaid info
    const { error: updateError } = await supabase
      .from('investors')
      .update({
        plaid_item_id: itemId,
        plaid_access_token: accessToken, // TODO: Encrypt this!
        linked_bank_account: bankAccountInfo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', investor_id);

    if (updateError) {
      throw new Error(`Failed to update investor: ${updateError.message}`);
    }

    console.log('[PLAID] Investor record updated successfully');

    return new Response(
      JSON.stringify({
        success: true,
        item_id: itemId,
        account: bankAccountInfo,
        message: 'Bank account linked successfully',
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
