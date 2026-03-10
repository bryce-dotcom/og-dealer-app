import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
const PLAID_SECRET = Deno.env.get('PLAID_SECRET');

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const webhook = await req.json();

    console.log('Received Plaid webhook:', webhook);

    const { webhook_type, webhook_code } = webhook;

    // Handle different webhook types
    switch (webhook_type) {
      case 'TRANSFER':
        return await handleTransferWebhook(supabase, webhook);

      case 'TRANSACTIONS':
        return await handleTransactionsWebhook(supabase, webhook);

      case 'ITEM':
        return await handleItemWebhook(supabase, webhook);

      default:
        console.log('Unhandled webhook type:', webhook_type);
        return new Response(JSON.stringify({ received: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
    }

  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function handleTransferWebhook(supabase: any, webhook: any) {
  const { webhook_code, transfer_id, transfer_type, transfer_status, failure_reason } = webhook;

  console.log(`Transfer webhook: ${webhook_code} - Transfer ${transfer_id} is now ${transfer_status}`);

  // Find the capital transaction with this transfer_id
  const { data: capitalRecord, error: findError } = await supabase
    .from('investor_capital')
    .select('*')
    .eq('plaid_transfer_id', transfer_id)
    .single();

  if (findError || !capitalRecord) {
    console.error('Capital record not found for transfer:', transfer_id);
    return new Response(JSON.stringify({ received: true, error: 'Record not found' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Map Plaid transfer status to our status
  let newStatus = capitalRecord.status;
  let shouldProcess = false;

  switch (transfer_status) {
    case 'pending':
      newStatus = 'pending';
      break;
    case 'posted':
      newStatus = 'processing';
      break;
    case 'settled':
      newStatus = 'completed';
      shouldProcess = true; // Process the deposit/withdrawal now
      break;
    case 'failed':
    case 'cancelled':
    case 'returned':
      newStatus = 'failed';
      break;
  }

  // Update the capital record
  const { error: updateError } = await supabase
    .from('investor_capital')
    .update({
      status: newStatus,
      metadata: {
        ...capitalRecord.metadata,
        transfer_status: transfer_status,
        failure_reason: failure_reason,
        updated_at: new Date().toISOString()
      }
    })
    .eq('id', capitalRecord.id);

  if (updateError) {
    console.error('Error updating capital record:', updateError);
  }

  // If transfer is settled, process the transaction
  if (shouldProcess) {
    if (capitalRecord.transaction_type === 'deposit') {
      await processDeposit(supabase, capitalRecord);
    } else if (capitalRecord.transaction_type === 'withdrawal') {
      await processWithdrawal(supabase, capitalRecord);
    }
  }

  return new Response(JSON.stringify({ received: true, processed: shouldProcess }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function processDeposit(supabase: any, capitalRecord: any) {
  console.log('Processing deposit:', capitalRecord.id);

  try {
    // Call the existing SQL function to process the deposit
    const { error } = await supabase.rpc('process_investor_deposit', {
      p_capital_transaction_id: capitalRecord.id
    });

    if (error) {
      console.error('Error processing deposit:', error);

      // Mark as failed if processing fails
      await supabase
        .from('investor_capital')
        .update({
          status: 'failed',
          metadata: {
            ...capitalRecord.metadata,
            processing_error: error.message
          }
        })
        .eq('id', capitalRecord.id);
    } else {
      console.log('Deposit processed successfully:', capitalRecord.id);
    }
  } catch (error) {
    console.error('Exception processing deposit:', error);
  }
}

async function processWithdrawal(supabase: any, capitalRecord: any) {
  console.log('Processing withdrawal:', capitalRecord.id);

  try {
    // Get investor details
    const { data: investor, error: investorError } = await supabase
      .from('investors')
      .select('*')
      .eq('id', capitalRecord.investor_id)
      .single();

    if (investorError || !investor) {
      throw new Error('Investor not found');
    }

    // Check if investor has sufficient balance
    if (investor.available_balance < capitalRecord.amount) {
      throw new Error('Insufficient balance');
    }

    // Deduct from investor's balance
    const { error: updateError } = await supabase
      .from('investors')
      .update({
        available_balance: investor.available_balance - capitalRecord.amount,
        total_returned: investor.total_returned + capitalRecord.amount
      })
      .eq('id', investor.id);

    if (updateError) {
      throw updateError;
    }

    console.log('Withdrawal processed successfully:', capitalRecord.id);

  } catch (error) {
    console.error('Exception processing withdrawal:', error);

    // Mark as failed
    await supabase
      .from('investor_capital')
      .update({
        status: 'failed',
        metadata: {
          ...capitalRecord.metadata,
          processing_error: error.message
        }
      })
      .eq('id', capitalRecord.id);
  }
}

async function handleTransactionsWebhook(supabase: any, webhook: any) {
  const { webhook_code, item_id } = webhook;

  console.log(`Transactions webhook: ${webhook_code} for item ${item_id}`);

  // Check if this is a pool account
  const { data: pool, error: poolError } = await supabase
    .from('investment_pools')
    .select('id')
    .eq('plaid_item_id', item_id)
    .single();

  if (poolError || !pool) {
    console.log('Not a pool account or pool not found');
    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Trigger transaction sync for this pool
  console.log('Triggering transaction sync for pool:', pool.id);

  try {
    const { error } = await supabase.functions.invoke('plaid-sync-pool-transactions', {
      body: { pool_id: pool.id }
    });

    if (error) {
      console.error('Error syncing transactions:', error);
    }
  } catch (error) {
    console.error('Exception syncing transactions:', error);
  }

  return new Response(JSON.stringify({ received: true, synced: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleItemWebhook(supabase: any, webhook: any) {
  const { webhook_code, item_id, error: plaidError } = webhook;

  console.log(`Item webhook: ${webhook_code} for item ${item_id}`);

  // Handle various item events
  switch (webhook_code) {
    case 'ERROR':
      console.error('Plaid item error:', plaidError);

      // Check if this is an investor or pool item
      const { data: investor } = await supabase
        .from('investors')
        .select('id, email')
        .eq('plaid_item_id', item_id)
        .single();

      if (investor) {
        console.log(`Item error for investor ${investor.id}: ${plaidError.error_message}`);
        // TODO: Send email notification to investor to re-link account
      }

      const { data: pool } = await supabase
        .from('investment_pools')
        .select('id, name')
        .eq('plaid_item_id', item_id)
        .single();

      if (pool) {
        console.log(`Item error for pool ${pool.id}: ${plaidError.error_message}`);
        // TODO: Alert admin to re-link pool account
      }
      break;

    case 'PENDING_EXPIRATION':
      console.log('Item access token will expire soon:', item_id);
      // TODO: Trigger update mode to refresh credentials
      break;

    case 'USER_PERMISSION_REVOKED':
      console.log('User revoked permissions for item:', item_id);
      // TODO: Mark account as disconnected, notify user
      break;

    default:
      console.log('Unhandled item webhook code:', webhook_code);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
