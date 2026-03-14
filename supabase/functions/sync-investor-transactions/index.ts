import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID')!;
const PLAID_SECRET = Deno.env.get('PLAID_SECRET')!;
const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'sandbox';

const plaidBaseUrl = PLAID_ENV === 'production'
  ? 'https://production.plaid.com'
  : PLAID_ENV === 'development'
  ? 'https://development.plaid.com'
  : 'https://sandbox.plaid.com';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ============================================
// SYNC INVESTOR TRANSACTIONS (Declare & Detect)
// ============================================
// Uses Plaid /transactions/sync (cursor-based) to detect
// outgoing transfers from investor's bank that match
// pending deposit declarations to OG DiX's bank account.

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { investor_id } = await req.json();

    if (!investor_id) {
      throw new Error("investor_id is required");
    }

    console.log(`[INVESTOR-SYNC] Syncing transactions for investor ${investor_id}`);

    // Get investor info
    const { data: investor, error: investorError } = await supabase
      .from('investors')
      .select('id, plaid_access_token, plaid_transactions_cursor, pending_deposits, linked_bank_account')
      .eq('id', investor_id)
      .single();

    if (investorError || !investor) {
      throw new Error('Investor not found');
    }

    if (!investor.plaid_access_token) {
      throw new Error('No Plaid access token — bank not linked');
    }

    // Use /transactions/sync with cursor for incremental updates
    let cursor = investor.plaid_transactions_cursor || '';
    let hasMore = true;
    let allAdded: any[] = [];
    let allModified: any[] = [];
    let allRemoved: any[] = [];

    while (hasMore) {
      const syncResponse = await fetch(`${plaidBaseUrl}/transactions/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: PLAID_CLIENT_ID,
          secret: PLAID_SECRET,
          access_token: investor.plaid_access_token,
          cursor: cursor,
          count: 500,
        }),
      });

      const syncData = await syncResponse.json();

      if (!syncResponse.ok) {
        console.error('[INVESTOR-SYNC] Plaid API error:', JSON.stringify(syncData));
        throw new Error(`Plaid API error: ${syncData.error_message || syncData.error_code || 'Unknown'}`);
      }

      allAdded = allAdded.concat(syncData.added || []);
      allModified = allModified.concat(syncData.modified || []);
      allRemoved = allRemoved.concat(syncData.removed || []);

      hasMore = syncData.has_more;
      cursor = syncData.next_cursor;
    }

    console.log(`[INVESTOR-SYNC] Found ${allAdded.length} new, ${allModified.length} modified, ${allRemoved.length} removed transactions`);

    // Save the new cursor immediately
    await supabase
      .from('investors')
      .update({ plaid_transactions_cursor: cursor })
      .eq('id', investor_id);

    // Get pending deposits for this investor
    const pendingDeposits: any[] = investor.pending_deposits || [];
    const pendingOnly = pendingDeposits.filter((d: any) => d.status === 'pending');

    let matchedCount = 0;
    const matchedDepositIds: string[] = [];

    // Look through new transactions for outgoing transfers that match pending deposits
    for (const tx of allAdded) {
      // Plaid amounts: positive = money leaving the account (debit), negative = money coming in (credit)
      // We're looking for money LEAVING the investor's account (positive amount = outgoing)
      if (tx.amount <= 0) continue; // Skip incoming transactions

      // Skip tiny amounts (under $100) - not investment deposits
      if (tx.amount < 100) continue;

      console.log(`[INVESTOR-SYNC] Checking outgoing tx: $${tx.amount} - ${tx.name} (${tx.date})`);

      // Try to match against pending deposits
      for (const deposit of pendingOnly) {
        if (matchedDepositIds.includes(deposit.id)) continue; // Already matched

        // Match criteria:
        // 1. Amount matches within $1 tolerance (ACH fees can cause slight differences)
        // 2. Deposit was declared within the last 14 days
        const amountDiff = Math.abs(tx.amount - deposit.amount);
        const declaredDate = new Date(deposit.declared_at);
        const txDate = new Date(tx.date);
        const daysSinceDeclared = (txDate.getTime() - declaredDate.getTime()) / (1000 * 60 * 60 * 24);

        if (amountDiff <= 1.00 && daysSinceDeclared >= -1 && daysSinceDeclared <= 14) {
          console.log(`[INVESTOR-SYNC] MATCH! Deposit ${deposit.id} ($${deposit.amount}) matched tx $${tx.amount} on ${tx.date}`);

          matchedDepositIds.push(deposit.id);
          matchedCount++;

          // Update the investor_capital record to confirmed
          const { error: updateError } = await supabase
            .from('investor_capital')
            .update({
              status: 'completed',
              plaid_transaction_id: tx.transaction_id,
              metadata: {
                matched_at: new Date().toISOString(),
                plaid_transaction: {
                  amount: tx.amount,
                  date: tx.date,
                  name: tx.name,
                  merchant_name: tx.merchant_name,
                  transaction_id: tx.transaction_id,
                },
                match_type: 'auto',
              }
            })
            .eq('id', deposit.capital_record_id);

          if (updateError) {
            console.error(`[INVESTOR-SYNC] Error updating capital record ${deposit.capital_record_id}:`, updateError);
          } else {
            // Update investor balances
            const { data: currentInvestor } = await supabase
              .from('investors')
              .select('total_invested')
              .eq('id', investor_id)
              .single();

            if (currentInvestor) {
              await supabase
                .from('investors')
                .update({
                  total_invested: (currentInvestor.total_invested || 0) + deposit.amount,
                })
                .eq('id', investor_id);
            }

            // Send confirmation notification
            try {
              await supabase.functions.invoke('send-investor-notification', {
                body: {
                  investor_id,
                  notification_type: 'deposit_confirmed',
                  data: {
                    amount: deposit.amount,
                    transaction_date: tx.date,
                    bank_name: tx.name,
                  }
                }
              });
            } catch (notifErr) {
              console.error('[INVESTOR-SYNC] Notification error:', notifErr);
            }
          }

          break; // Move to next transaction
        }
      }
    }

    // Update pending_deposits array — mark matched ones as confirmed
    if (matchedDepositIds.length > 0) {
      const updatedDeposits = pendingDeposits.map((d: any) =>
        matchedDepositIds.includes(d.id)
          ? { ...d, status: 'confirmed', confirmed_at: new Date().toISOString() }
          : d
      );

      await supabase
        .from('investors')
        .update({ pending_deposits: updatedDeposits })
        .eq('id', investor_id);
    }

    console.log(`[INVESTOR-SYNC] Complete. Matched ${matchedCount} deposits.`);

    return new Response(
      JSON.stringify({
        success: true,
        transactions_found: allAdded.length,
        deposits_matched: matchedCount,
        pending_remaining: pendingOnly.length - matchedCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[INVESTOR-SYNC] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
