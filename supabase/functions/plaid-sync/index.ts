import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const plaidClientId = Deno.env.get("PLAID_CLIENT_ID")!;
    const plaidSecret = Deno.env.get("PLAID_SECRET")!;
    const plaidEnv = Deno.env.get("PLAID_ENV") || "sandbox"; // sandbox, development, production

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { action, public_token, dealer_id, account_id, metadata, start_date, end_date } = await req.json();

    console.log(`[PLAID] Action: ${action}`);

    // Determine Plaid API URL based on environment
    const plaidUrl = plaidEnv === "production"
      ? "https://production.plaid.com"
      : plaidEnv === "development"
      ? "https://development.plaid.com"
      : "https://sandbox.plaid.com";

    // ============================================
    // ACTION: EXCHANGE TOKEN
    // ============================================
    if (action === "exchange_token") {
      console.log(`[PLAID] Exchanging public token for dealer: ${dealer_id}`);

      // Exchange public token for access token
      const exchangeResponse = await fetch(`${plaidUrl}/item/public_token/exchange`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: plaidClientId,
          secret: plaidSecret,
          public_token,
        }),
      });

      if (!exchangeResponse.ok) {
        const error = await exchangeResponse.json();
        throw new Error(`Plaid exchange failed: ${error.error_message || exchangeResponse.statusText}`);
      }

      const { access_token, item_id } = await exchangeResponse.json();
      console.log(`[PLAID] Got access token for item: ${item_id}`);

      // Get account details
      const accountsResponse = await fetch(`${plaidUrl}/accounts/get`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: plaidClientId,
          secret: plaidSecret,
          access_token,
        }),
      });

      if (!accountsResponse.ok) {
        throw new Error("Failed to fetch account details from Plaid");
      }

      const accountsData = await accountsResponse.json();
      const institution = accountsData.item?.institution_id || null;

      // Get institution details if available
      let institutionName = metadata?.institution?.name || "Bank Account";
      let institutionLogo = null;

      if (institution) {
        try {
          const instResponse = await fetch(`${plaidUrl}/institutions/get_by_id`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              client_id: plaidClientId,
              secret: plaidSecret,
              institution_id: institution,
              country_codes: ["US"],
            }),
          });

          if (instResponse.ok) {
            const instData = await instResponse.json();
            institutionName = instData.institution?.name || institutionName;
            institutionLogo = instData.institution?.logo || null;
          }
        } catch (e) {
          console.log(`[PLAID] Could not fetch institution details: ${e}`);
        }
      }

      // Save each connected account to database
      const savedAccounts = [];
      for (const account of accountsData.accounts) {
        const accountType = account.type === "credit" ? "credit_card" : account.subtype || account.type;

        const { data: savedAccount, error: insertError } = await supabase
          .from("bank_accounts")
          .insert({
            dealer_id,
            plaid_access_token: access_token,
            plaid_item_id: item_id,
            plaid_account_id: account.account_id,
            account_name: account.name,
            account_type: accountType,
            account_mask: account.mask,
            current_balance: account.balances.current || 0,
            institution_name: institutionName,
            institution_logo: institutionLogo,
            is_plaid_connected: true,
            sync_status: "active",
            last_synced_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (insertError) {
          console.error(`[PLAID] Error saving account: ${insertError.message}`);
          continue;
        }

        savedAccounts.push(savedAccount);
        console.log(`[PLAID] Saved account: ${account.name} (${accountType})`);
      }

      // Immediately sync transactions for these accounts (last 30 days by default)
      await syncTransactions(supabase, plaidUrl, plaidClientId, plaidSecret, access_token, dealer_id, savedAccounts);

      return new Response(
        JSON.stringify({
          success: true,
          accounts: savedAccounts,
          message: `Connected ${savedAccounts.length} account(s) successfully`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // ACTION: SYNC TRANSACTIONS
    // ============================================
    if (action === "sync_transactions") {
      console.log(`[PLAID] Syncing transactions for account: ${account_id || 'all'}`, { start_date, end_date });

      // Get accounts to sync
      let accountsQuery = supabase
        .from("bank_accounts")
        .select("*")
        .eq("dealer_id", dealer_id)
        .eq("is_plaid_connected", true);

      if (account_id) {
        accountsQuery = accountsQuery.eq("id", account_id);
      }

      const { data: accounts, error: accountsError } = await accountsQuery;

      if (accountsError || !accounts || accounts.length === 0) {
        throw new Error("No Plaid-connected accounts found");
      }

      let totalSynced = 0;
      for (const account of accounts) {
        const synced = await syncTransactions(
          supabase,
          plaidUrl,
          plaidClientId,
          plaidSecret,
          account.plaid_access_token,
          dealer_id,
          [account],
          start_date,
          end_date
        );
        totalSynced += synced;
      }

      return new Response(
        JSON.stringify({
          success: true,
          synced: totalSynced,
          message: `Synced ${totalSynced} new transaction(s)`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================
    // ACTION: DISCONNECT ACCOUNT
    // ============================================
    if (action === "disconnect") {
      console.log(`[PLAID] Disconnecting account: ${account_id}`);

      const { error: updateError } = await supabase
        .from("bank_accounts")
        .update({
          is_plaid_connected: false,
          sync_status: "disconnected",
          plaid_access_token: null,
        })
        .eq("id", account_id)
        .eq("dealer_id", dealer_id);

      if (updateError) {
        throw new Error(`Failed to disconnect account: ${updateError.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Account disconnected successfully",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown action: ${action}`);

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

// ============================================
// SYNC TRANSACTIONS HELPER
// ============================================
async function syncTransactions(
  supabase: any,
  plaidUrl: string,
  clientId: string,
  secret: string,
  accessToken: string,
  dealerId: string,
  accounts: any[],
  customStartDate?: string,
  customEndDate?: string
): Promise<number> {
  let totalSynced = 0;

  // Get transactions - use custom dates if provided, otherwise last 30 days
  const startDate = customStartDate ? new Date(customStartDate) : (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  })();
  const endDate = customEndDate ? new Date(customEndDate) : new Date();

  const txResponse = await fetch(`${plaidUrl}/transactions/get`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      secret: secret,
      access_token: accessToken,
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
    }),
  });

  if (!txResponse.ok) {
    const errorData = await txResponse.json();
    console.error(`[PLAID] Failed to fetch transactions:`, errorData);
    return 0;
  }

  const txData = await txResponse.json();
  const transactions = txData.transactions || [];

  console.log(`[PLAID] Found ${transactions.length} transactions from Plaid`);
  console.log(`[PLAID] Date range: ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}`);
  console.log(`[PLAID] Accounts to match:`, accounts.map(a => ({ id: a.id, plaid_account_id: a.plaid_account_id })));

  for (const tx of transactions) {
    // Find the matching bank account
    const bankAccount = accounts.find(a => a.plaid_account_id === tx.account_id);
    if (!bankAccount) continue;

    // Check if transaction already exists
    const { data: existing } = await supabase
      .from("bank_transactions")
      .select("id")
      .eq("plaid_transaction_id", tx.transaction_id)
      .single();

    if (existing) {
      continue; // Skip duplicates
    }

    // Determine if income or expense
    const isIncome = tx.amount < 0; // Plaid uses negative for income
    const amount = Math.abs(tx.amount);

    // Insert transaction
    const { error: insertError } = await supabase
      .from("bank_transactions")
      .insert({
        dealer_id: dealerId,
        bank_account_id: bankAccount.id,
        plaid_transaction_id: tx.transaction_id,
        merchant_name: tx.merchant_name || tx.name || "Unknown",
        amount: isIncome ? amount : -amount,
        transaction_date: tx.date,
        pending: tx.pending || false,
        is_income: isIncome,
        status: "inbox",
      });

    if (!insertError) {
      totalSynced++;
    } else {
      console.error(`[PLAID] Error inserting transaction: ${insertError.message}`);
    }
  }

  // Update last_synced_at for all accounts
  for (const account of accounts) {
    await supabase
      .from("bank_accounts")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", account.id);
  }

  console.log(`[PLAID] Synced ${totalSynced} new transactions`);
  return totalSynced;
}
