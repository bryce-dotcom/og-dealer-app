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

const PRICE_IDS = {
  pro: Deno.env.get('STRIPE_PRICE_PRO')!,
  dealer: Deno.env.get('STRIPE_PRICE_DEALER')!,
  unlimited: Deno.env.get('STRIPE_PRICE_UNLIMITED')!
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dealer_id, plan_tier, success_url, cancel_url } = await req.json();

    if (!dealer_id || !plan_tier || !PRICE_IDS[plan_tier]) {
      throw new Error('Invalid request parameters');
    }

    // Get or create Stripe customer
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, dealer_settings!inner(dealer_name, email)')
      .eq('dealer_id', dealer_id)
      .single();

    let customerId = subscription?.stripe_customer_id;

    if (!customerId) {
      const { data: dealerData } = await supabase
        .from('dealer_settings')
        .select('dealer_name, email')
        .eq('id', dealer_id)
        .single();

      const customer = await stripe.customers.create({
        email: dealerData.email,
        name: dealerData.dealer_name,
        metadata: { dealer_id: dealer_id.toString() }
      });
      customerId = customer.id;

      // Save customer ID
      await supabase
        .from('subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('dealer_id', dealer_id);

      await supabase
        .from('dealer_settings')
        .update({ stripe_customer_id: customerId })
        .eq('id', dealer_id);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: PRICE_IDS[plan_tier],
        quantity: 1
      }],
      success_url: success_url || `${req.headers.get('origin')}/settings?payment=success`,
      cancel_url: cancel_url || `${req.headers.get('origin')}/settings?payment=canceled`,
      metadata: {
        dealer_id: dealer_id.toString(),
        plan_tier
      },
      subscription_data: {
        metadata: {
          dealer_id: dealer_id.toString(),
          plan_tier
        }
      }
    });

    return new Response(
      JSON.stringify({ session_id: session.id, url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
