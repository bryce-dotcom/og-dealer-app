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
// SYNC POOL TRANSACTIONS FROM PLAID
// ============================================
// Fetches transactions from shared pool bank account
// Stores in pool_transactions table for investor transparency

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pool_id, start_date, end_date } = await req.json();

    if (!pool_id) {
      throw new Error("pool_id is required");
    }

    console.log(`[PLAID-SYNC] Syncing transactions for pool ${pool_id}`);

    // Get pool info
    const { data: pool, error: poolError } = await supabase
      .from('investment_pools')
      .select('plaid_access_token')
      .eq('id', pool_id)
      .single();

    if (poolError || !pool || !pool.plaid_access_token) {
      throw new Error('Pool not found or Plaid not connected');
    }

    // Date range (default: last 30 days)
    const endDate = end_date || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`[PLAID-SYNC] Fetching transactions from ${startDate} to ${endDate}`);

    // Plaid API endpoint
    const plaidUrl = PLAID_ENV === 'production'
      ? 'https://production.plaid.com/transactions/get'
      : PLAID_ENV === 'development'
      ? 'https://development.plaid.com/transactions/get'
      : 'https://sandbox.plaid.com/transactions/get';

    // Fetch transactions
    const response = await fetch(plaidUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        access_token: pool.plaid_access_token,
        start_date: startDate,
        end_date: endDate,
        options: {
          count: 500,
          offset: 0,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Plaid API error: ${data.error_message || 'Unknown error'}`);
    }

    const transactions = data.transactions || [];
    console.log(`[PLAID-SYNC] Found ${transactions.length} transactions`);

    // Process and store each transaction
    let newCount = 0;
    let updatedCount = 0;

    for (const tx of transactions) {
      // Categorize transaction
      const transactionType = categorizeTransaction(tx);

      // Check if already exists
      const { data: existing } = await supabase
        .from('pool_transactions')
        .select('id')
        .eq('pool_id', pool_id)
        .eq('plaid_transaction_id', tx.transaction_id)
        .single();

      if (existing) {
        // Update existing
        await supabase
          .from('pool_transactions')
          .update({
            amount: tx.amount,
            description: tx.name,
            merchant_name: tx.merchant_name,
            plaid_category: tx.category?.[0],
            metadata: {
              pending: tx.pending,
              category: tx.category,
              payment_channel: tx.payment_channel,
            },
          })
          .eq('id', existing.id);

        updatedCount++;
      } else {
        // Insert new
        await supabase
          .from('pool_transactions')
          .insert({
            pool_id: pool_id,
            transaction_type: transactionType,
            amount: tx.amount,
            description: tx.name,
            merchant_name: tx.merchant_name,
            plaid_transaction_id: tx.transaction_id,
            plaid_category: tx.category?.[0],
            transaction_date: tx.date,
            metadata: {
              pending: tx.pending,
              category: tx.category,
              payment_channel: tx.payment_channel,
            },
          });

        newCount++;
      }
    }

    console.log(`[PLAID-SYNC] Complete: ${newCount} new, ${updatedCount} updated`);

    // Get current balance
    const balanceUrl = plaidUrl.replace('/transactions/get', '/accounts/balance/get');
    const balanceResponse = await fetch(balanceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        access_token: pool.plaid_access_token,
      }),
    });

    const balanceData = await balanceResponse.json();
    const currentBalance = balanceData.accounts?.[0]?.balances?.current || 0;

    console.log('[PLAID-SYNC] Current balance:', currentBalance);

    return new Response(
      JSON.stringify({
        success: true,
        transactions_synced: transactions.length,
        new_transactions: newCount,
        updated_transactions: updatedCount,
        current_balance: currentBalance,
        date_range: { start: startDate, end: endDate },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[PLAID-SYNC] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================
// CATEGORIZE TRANSACTION
// ============================================
function categorizeTransaction(tx: any): string {
  const name = (tx.name || '').toLowerCase();
  const category = (tx.category?.[0] || '').toLowerCase();

  // Investor deposit
  if (name.includes('deposit') || name.includes('transfer in') || category.includes('transfer in')) {
    return 'investor_deposit';
  }

  // Vehicle purchase (negative, to auto dealer/auction)
  if (tx.amount < 0 && (name.includes('auto') || name.includes('dealer') || name.includes('auction'))) {
    return 'vehicle_purchase';
  }

  // Vehicle sale (positive, from customer)
  if (tx.amount > 0 && tx.amount > 5000) {
    return 'vehicle_sale';
  }

  // Distribution to investor
  if (name.includes('distribution') || name.includes('payout') || (tx.amount < 0 && name.includes('transfer'))) {
    return 'distribution';
  }

  // Platform fee
  if (name.includes('fee') || name.includes('og dealer')) {
    return 'fee';
  }

  // Interest earned
  if (name.includes('interest')) {
    return 'interest';
  }

  // Default
  return 'other';
}
