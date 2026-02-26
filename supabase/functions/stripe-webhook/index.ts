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

const PLAN_CREDITS = {
  pro: 500,
  dealer: 1500,
  unlimited: 999999
};

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')!;
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 });
  }

  console.log('Received webhook event:', event.type, event.id);

  // Check for duplicate event (idempotency)
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .single();

  if (existing) {
    console.log('Duplicate event, skipping:', event.id);
    return new Response(JSON.stringify({ received: true, duplicate: true }));
  }

  // Log event
  await supabase.from('webhook_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    event_data: event.data
  });

  // Process event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'payment_intent.succeeded':
        await handleCreditPackPurchase(event.data.object as Stripe.PaymentIntent);
        break;
    }

    // Mark as processed
    await supabase
      .from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('stripe_event_id', event.id);

  } catch (error) {
    console.error('Error processing webhook:', error);
    await supabase
      .from('webhook_events')
      .update({ error_message: error.message })
      .eq('stripe_event_id', event.id);
  }

  return new Response(JSON.stringify({ received: true }));
});

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log('Processing checkout completed:', session.id);

  const dealerId = parseInt(session.metadata!.dealer_id);
  const planTier = session.metadata!.plan_tier;

  await supabase.from('subscriptions').update({
    stripe_subscription_id: session.subscription as string,
    plan_tier: planTier,
    status: 'active',
    billing_cycle_start: new Date().toISOString(),
    billing_cycle_end: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
    monthly_credit_allowance: PLAN_CREDITS[planTier] || 0,
    credits_remaining: PLAN_CREDITS[planTier] || 0,
    credits_used_this_cycle: 0,
    converted_at: new Date().toISOString()
  }).eq('dealer_id', dealerId);

  console.log(`Activated ${planTier} plan for dealer ${dealerId}`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log('Processing payment succeeded:', invoice.id);

  const customerId = invoice.customer as string;

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!subscription) {
    console.error('No subscription found for customer:', customerId);
    return;
  }

  // Reset monthly credits on successful payment
  await supabase.from('subscriptions').update({
    credits_remaining: subscription.monthly_credit_allowance,
    credits_used_this_cycle: 0,
    billing_cycle_start: new Date().toISOString(),
    billing_cycle_end: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
    status: 'active'
  }).eq('id', subscription.id);

  console.log(`Reset credits for subscription ${subscription.id}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  console.log('Processing payment failed:', invoice.id);

  const customerId = invoice.customer as string;

  await supabase
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_customer_id', customerId);

  console.log(`Marked subscription as past_due for customer ${customerId}`);
}

async function handleSubscriptionCanceled(subscription: Stripe.Subscription) {
  console.log('Processing subscription canceled:', subscription.id);

  const customerId = subscription.customer as string;

  // Downgrade to free tier
  await supabase.from('subscriptions').update({
    status: 'canceled',
    plan_tier: 'free',
    monthly_credit_allowance: 10,
    credits_remaining: 10,
    bonus_credits: 0,
    stripe_subscription_id: null
  }).eq('stripe_customer_id', customerId);

  console.log(`Downgraded to free tier for customer ${customerId}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log('Processing subscription updated:', subscription.id);

  const customerId = subscription.customer as string;
  const metadata = subscription.metadata;

  if (metadata?.plan_tier) {
    const planTier = metadata.plan_tier;

    await supabase.from('subscriptions').update({
      plan_tier: planTier,
      monthly_credit_allowance: PLAN_CREDITS[planTier] || 0,
      status: subscription.status === 'active' ? 'active' : subscription.status
    }).eq('stripe_customer_id', customerId);

    console.log(`Updated plan to ${planTier} for customer ${customerId}`);
  }
}

async function handleCreditPackPurchase(paymentIntent: Stripe.PaymentIntent) {
  if (paymentIntent.metadata?.type !== 'credit_pack') {
    return;
  }

  console.log('Processing credit pack purchase:', paymentIntent.id);

  const dealerId = parseInt(paymentIntent.metadata.dealer_id);
  const credits = parseInt(paymentIntent.metadata.credits);

  // Update credit pack status
  await supabase
    .from('credit_packs')
    .update({ status: 'succeeded' })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  // Add bonus credits
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('bonus_credits')
    .eq('dealer_id', dealerId)
    .single();

  if (subscription) {
    await supabase
      .from('subscriptions')
      .update({ bonus_credits: (subscription.bonus_credits || 0) + credits })
      .eq('dealer_id', dealerId);

    console.log(`Added ${credits} bonus credits to dealer ${dealerId}`);
  }
}
