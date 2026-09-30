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

    // Caller must be signed in and belong to this dealer (owner or active employee).
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null } };
    const user = userData?.user;
    if (!user || !dealer_id) {
      return new Response(JSON.stringify({ success: false, error: "Not signed in" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const [{ data: ownedDealer }, { data: employee }] = await Promise.all([
      supabase.from("dealer_settings").select("id").eq("id", dealer_id).eq("owner_user_id", user.id).maybeSingle(),
      supabase.from("employees").select("id").eq("dealer_id", dealer_id).eq("user_id", user.id).eq("active", true).maybeSingle(),
    ]);
    if (!ownedDealer && !employee) {
      return new Response(JSON.stringify({ success: false, error: "Not allowed for this dealer" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      const initial = await syncTransactions(supabase, plaidUrl, plaidClientId, plaidSecret, access_token, dealer_id, savedAccounts);
      if (initial.error) console.error(`[PLAID] Initial sync failed: ${initial.error}`);

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

      // One Plaid call per bank login (access token), not per account.
      const byToken = new Map<string, any[]>();
      for (const account of accounts) {
        const list = byToken.get(account.plaid_access_token) || [];
        list.push(account);
        byToken.set(account.plaid_access_token, list);
      }

      let totalSynced = 0;
      const failures: { institution: string; error: string; needsReconnect: boolean }[] = [];
      for (const [token, group] of byToken) {
        const result = await syncTransactions(
          supabase, plaidUrl, plaidClientId, plaidSecret, token, dealer_id, group, start_date, end_date
        );
        totalSynced += result.synced;
        if (result.error) {
          failures.push({ institution: group[0].institution_name || "Bank", error: result.error, needsReconnect: result.needsReconnect });
        }
      }

      const message = failures.length
        ? `Synced ${totalSynced} new transaction(s). Problems: ${failures.map((f) => `${f.institution} — ${f.error}`).join("; ")}`
        : `Synced ${totalSynced} new transaction(s)`;

      return new Response(
        JSON.stringify({
          success: failures.length === 0,
          synced: totalSynced,
          failures,
          needs_reconnect: failures.some((f) => f.needsReconnect),
          message,
          error: failures.length ? message : undefined,
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
// Plaid error codes that mean the person has to reconnect the bank in Books.
const RECONNECT_CODES = new Set([
  "ITEM_LOGIN_REQUIRED", "INVALID_ACCESS_TOKEN", "ITEM_NOT_FOUND", "PENDING_EXPIRATION",
  "ACCESS_NOT_GRANTED", "NO_ACCOUNTS", "USER_PERMISSION_REVOKED", "ITEM_LOCKED",
]);

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
): Promise<{ synced: number; error: string | null; needsReconnect: boolean }> {
  let totalSynced = 0;
  const accountIds = accounts.map((a) => a.id);

  // Default window: from a week before the oldest last sync (so a long gap gets
  // backfilled), or the last 30 days for brand-new connections.
  const oldestSync = accounts
    .map((a) => (a.last_synced_at ? new Date(a.last_synced_at).getTime() : null))
    .filter((t) => t !== null) as number[];
  const startDate = customStartDate
    ? new Date(customStartDate)
    : oldestSync.length
      ? new Date(Math.min(...oldestSync) - 7 * 86400000)
      : new Date(Date.now() - 30 * 86400000);
  const endDate = customEndDate ? new Date(customEndDate) : new Date();
  const start = startDate.toISOString().split("T")[0];
  const end = endDate.toISOString().split("T")[0];

  // Page through results; /transactions/get returns at most 500 per call.
  const all: any[] = [];
  let plaidAccounts: any[] = [];
  let offset = 0;
  while (true) {
    const txResponse = await fetch(`${plaidUrl}/transactions/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        secret,
        access_token: accessToken,
        start_date: start,
        end_date: end,
        options: { count: 500, offset },
      }),
    });

    if (!txResponse.ok) {
      const errorData = await txResponse.json().catch(() => ({}));
      const code = errorData.error_code || `HTTP_${txResponse.status}`;
      const needsReconnect = RECONNECT_CODES.has(code);
      const message = needsReconnect
        ? "Bank connection expired — reconnect this bank in Books."
        : errorData.display_message || errorData.error_message || `Plaid error ${code}`;
      console.error(`[PLAID] Failed to fetch transactions:`, errorData);
      // Record it on the accounts so Books stops showing them as healthy.
      await supabase
        .from("bank_accounts")
        .update({ sync_status: needsReconnect ? "needs_reconnect" : "error", plaid_error: `${code}: ${message}` })
        .in("id", accountIds);
      return { synced: 0, error: message, needsReconnect };
    }

    const txData = await txResponse.json();
    all.push(...(txData.transactions || []));
    plaidAccounts = txData.accounts || plaidAccounts;
    offset = all.length;
    if (offset >= (txData.total_transactions || 0) || (txData.transactions || []).length === 0) break;
  }

  console.log(`[PLAID] Found ${all.length} transactions from Plaid (${start} to ${end})`);

  for (const tx of all) {
    const bankAccount = accounts.find((a) => a.plaid_account_id === tx.account_id);
    if (!bankAccount) continue;

    const { data: existing } = await supabase
      .from("bank_transactions")
      .select("id")
      .eq("plaid_transaction_id", tx.transaction_id)
      .maybeSingle();
    if (existing) continue;

    // Plaid: positive = money out, negative = money in. We store money in as positive.
    const isIncome = tx.amount < 0;
    const amount = Math.abs(tx.amount);

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

    if (!insertError) totalSynced++;
    else console.error(`[PLAID] Error inserting transaction: ${insertError.message}`);
  }

  // Refresh balances from the same response, and mark the accounts healthy.
  const now = new Date().toISOString();
  for (const account of accounts) {
    const pa = plaidAccounts.find((x) => x.account_id === account.plaid_account_id);
    const update: Record<string, unknown> = { last_synced_at: now, sync_status: "active", plaid_error: null };
    if (pa?.balances?.current != null) update.current_balance = pa.balances.current;
    await supabase.from("bank_accounts").update(update).eq("id", account.id);
  }

  console.log(`[PLAID] Synced ${totalSynced} new transactions`);
  return { synced: totalSynced, error: null, needsReconnect: false };
}
