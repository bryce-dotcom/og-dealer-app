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

const CREDIT_PACKS = {
  100: { credits: 100, price: 2500 }, // $25
  500: { credits: 500, price: 10000 }, // $100
  1000: { credits: 1000, price: 17500 } // $175
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dealer_id, pack_size } = await req.json();
    const pack = CREDIT_PACKS[pack_size];

    if (!pack) {
      throw new Error('Invalid pack size. Choose 100, 500, or 1000.');
    }

    // Get Stripe customer
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('dealer_id', dealer_id)
      .single();

    if (!subscription?.stripe_customer_id) {
      throw new Error('No Stripe customer found. Please set up billing first.');
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: pack.price,
      currency: 'usd',
      customer: subscription.stripe_customer_id,
      metadata: {
        dealer_id: dealer_id.toString(),
        credits: pack.credits.toString(),
        type: 'credit_pack'
      },
      description: `${pack.credits} Credit Pack Purchase`
    });

    // Record purchase
    await supabase.from('credit_packs').insert({
      dealer_id,
      stripe_payment_intent_id: paymentIntent.id,
      credits_purchased: pack.credits,
      price_cents: pack.price,
      status: 'pending'
    });

    return new Response(
      JSON.stringify({
        client_secret: paymentIntent.client_secret,
        amount: pack.price / 100,
        credits: pack.credits
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
