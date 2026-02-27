import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient()
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dealer_id, amount_dollars, credits } = await req.json();

    // Validate inputs
    if (!dealer_id || !amount_dollars || !credits) {
      throw new Error('Missing required parameters: dealer_id, amount_dollars, credits');
    }

    // Ensure minimum $20 and $20 increments
    if (amount_dollars < 20 || amount_dollars % 20 !== 0) {
      throw new Error('Amount must be at least $20 and in $20 increments');
    }

    const price_cents = amount_dollars * 100;

    // Get Stripe customer
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('dealer_id', dealer_id)
      .single();

    if (!subscription?.stripe_customer_id) {
      throw new Error('No Stripe customer found. Please set up billing first.');
    }

    // Create Stripe Checkout session for one-time payment
    const session = await stripe.checkout.sessions.create({
      customer: subscription.stripe_customer_id,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${credits} Credit Pack`,
            description: `Add ${credits} credits to your account`,
          },
          unit_amount: price_cents,
        },
        quantity: 1,
      }],
      success_url: `${req.headers.get('origin') || 'http://localhost:5173'}/settings?tab=billing&payment=credits_success`,
      cancel_url: `${req.headers.get('origin') || 'http://localhost:5173'}/settings?tab=billing&payment=canceled`,
      metadata: {
        dealer_id: dealer_id.toString(),
        credits: credits.toString(),
        type: 'credit_pack'
      }
    });

    // Record purchase (will be updated by webhook when payment completes)
    await supabase.from('credit_packs').insert({
      dealer_id,
      stripe_payment_intent_id: session.payment_intent as string,
      credits_purchased: credits,
      price_cents: price_cents,
      status: 'pending'
    });

    return new Response(
      JSON.stringify({
        session_id: session.id,
        url: session.url,
        amount: amount_dollars,
        credits: credits
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Credit purchase error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
