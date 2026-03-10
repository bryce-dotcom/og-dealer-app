import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
const PLAID_SECRET = Deno.env.get('PLAID_SECRET');
const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'sandbox';

const plaidUrl = PLAID_ENV === 'production'
  ? 'https://production.plaid.com'
  : PLAID_ENV === 'development'
  ? 'https://development.plaid.com'
  : 'https://sandbox.plaid.com';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const {
      investor_id,
      amount,
      transfer_type, // 'deposit' or 'withdrawal'
      description
    } = await req.json();

    if (!investor_id || !amount || !transfer_type) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: investor_id, amount, transfer_type'
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get investor details
    const { data: investor, error: investorError } = await supabase
      .from('investors')
      .select('*')
      .eq('id', investor_id)
      .single();

    if (investorError || !investor) {
      return new Response(
        JSON.stringify({ success: false, error: 'Investor not found' }),
        { headers: { 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (!investor.plaid_access_token || !investor.linked_bank_account) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Bank account not linked. Please link a bank account first.'
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Step 1: Create authorization for the transfer
    const authResponse = await fetch(`${plaidUrl}/transfer/authorization/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        access_token: investor.plaid_access_token,
        account_id: investor.linked_bank_account.account_id,
        type: transfer_type === 'deposit' ? 'debit' : 'credit', // debit pulls from investor, credit sends to investor
        network: 'ach',
        amount: amount.toString(),
        ach_class: 'ppd', // Prearranged Payment and Deposit
        user: {
          legal_name: investor.email,
          email_address: investor.email
        }
      })
    });

    const authData = await authResponse.json();

    if (!authResponse.ok || !authData.authorization) {
      console.error('Transfer authorization failed:', authData);
      return new Response(
        JSON.stringify({
          success: false,
          error: authData.error_message || 'Failed to authorize transfer',
          details: authData
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const authorizationId = authData.authorization.id;

    // Step 2: Create the transfer
    const transferResponse = await fetch(`${plaidUrl}/transfer/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        access_token: investor.plaid_access_token,
        account_id: investor.linked_bank_account.account_id,
        authorization_id: authorizationId,
        description: description || `OG Dealer ${transfer_type}`,
        amount: amount.toString(),
        network: 'ach',
        ach_class: 'ppd'
      })
    });

    const transferData = await transferResponse.json();

    if (!transferResponse.ok || !transferData.transfer) {
      console.error('Transfer creation failed:', transferData);
      return new Response(
        JSON.stringify({
          success: false,
          error: transferData.error_message || 'Failed to create transfer',
          details: transferData
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const transfer = transferData.transfer;

    // Step 3: Record the transfer in investor_capital table
    const { data: capitalRecord, error: capitalError } = await supabase
      .from('investor_capital')
      .insert({
        investor_id: investor_id,
        transaction_type: transfer_type,
        amount: parseFloat(amount),
        status: 'pending', // Will be updated by webhook
        payment_method: 'ach',
        description: description || `ACH ${transfer_type}`,
        plaid_transfer_id: transfer.id,
        metadata: {
          authorization_id: authorizationId,
          transfer_status: transfer.status,
          created: transfer.created,
          network: 'ach'
        }
      })
      .select()
      .single();

    if (capitalError) {
      console.error('Error creating capital record:', capitalError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Transfer created but failed to record in database',
          transfer_id: transfer.id
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Step 4: Return success response
    return new Response(
      JSON.stringify({
        success: true,
        transfer: {
          id: transfer.id,
          status: transfer.status,
          amount: amount,
          type: transfer_type,
          created: transfer.created,
          estimated_settlement: addBusinessDays(new Date(), 3) // ACH typically takes 3-5 business days
        },
        capital_record_id: capitalRecord.id
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error initiating transfer:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      }),
      { headers: { 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

// Helper function to calculate business days (excluding weekends)
function addBusinessDays(date: Date, days: number): string {
  let count = 0;
  const result = new Date(date);

  while (count < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday (0) or Saturday (6)
      count++;
    }
  }

  return result.toISOString();
}
