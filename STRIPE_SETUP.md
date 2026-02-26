# Stripe Setup Guide for Credit-Based Billing

This guide walks you through setting up Stripe for the OG Dealer billing system.

## Prerequisites

- Stripe account (free to create at https://stripe.com)
- Access to Supabase project settings
- Access to deploy edge functions

---

## Step 1: Create Stripe Products

1. **Go to Stripe Dashboard** → Products
2. **Create 3 recurring products:**

### Product 1: Pro Plan
- Name: `OG Dealer - Pro`
- Description: `500 credits per month`
- Price: `$79.00 USD / month`
- Billing period: `Monthly`
- **Copy the Price ID** (starts with `price_...`) → Save as `STRIPE_PRICE_PRO`

### Product 2: Dealer Plan
- Name: `OG Dealer - Dealer`
- Description: `1,500 credits per month`
- Price: `$149.00 USD / month`
- Billing period: `Monthly`
- **Copy the Price ID** (starts with `price_...`) → Save as `STRIPE_PRICE_DEALER`

### Product 3: Unlimited Plan
- Name: `OG Dealer - Unlimited`
- Description: `Unlimited credits`
- Price: `$299.00 USD / month`
- Billing period: `Monthly`
- **Copy the Price ID** (starts with `price_...`) → Save as `STRIPE_PRICE_UNLIMITED`

---

## Step 2: Get Stripe API Keys

1. **Go to Stripe Dashboard** → Developers → API keys
2. **Copy the following:**
   - **Publishable key** (starts with `pk_test_...` or `pk_live_...`)
     - Save as `VITE_STRIPE_PUBLISHABLE_KEY` (frontend .env)
   - **Secret key** (starts with `sk_test_...` or `sk_live_...`)
     - Save as `STRIPE_SECRET_KEY` (Supabase secret)

---

## Step 3: Deploy Edge Functions

Deploy the Stripe edge functions:

```bash
# From project root
cd supabase/functions

# Deploy each function
supabase functions deploy stripe-create-checkout
supabase functions deploy stripe-webhook
supabase functions deploy stripe-purchase-credits
```

**Copy the webhook function URL** from the deploy output. It will look like:
```
https://your-project-ref.supabase.co/functions/v1/stripe-webhook
```

---

## Step 4: Create Stripe Webhook

1. **Go to Stripe Dashboard** → Developers → Webhooks
2. Click **Add endpoint**
3. **Endpoint URL:** Paste the webhook function URL from Step 3
4. **Events to listen for:** Select the following events:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
   - `payment_intent.succeeded`
5. Click **Add endpoint**
6. **Copy the Signing secret** (starts with `whsec_...`)
   - Save as `STRIPE_WEBHOOK_SECRET` (Supabase secret)

---

## Step 5: Configure Supabase Secrets

Set environment variables in Supabase:

1. **Go to Supabase Dashboard** → Project Settings → Edge Functions
2. Click **Manage secrets**
3. Add the following secrets:

```bash
STRIPE_SECRET_KEY=sk_test_...your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_...your_webhook_secret
STRIPE_PRICE_PRO=price_...your_pro_price_id
STRIPE_PRICE_DEALER=price_...your_dealer_price_id
STRIPE_PRICE_UNLIMITED=price_...your_unlimited_price_id
```

---

## Step 6: Configure Frontend Environment

Add to your `.env` file in the project root:

```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...your_publishable_key
```

**Important:** Add `.env` to `.gitignore` if not already there!

---

## Step 7: Test the Integration

### Test Mode (Recommended First)

1. Use Stripe test keys (starting with `pk_test_` and `sk_test_`)
2. Use test card numbers:
   - **Success:** `4242 4242 4242 4242`
   - **Requires authentication:** `4000 0027 6000 3184`
   - **Decline:** `4000 0000 0000 0002`
3. Any future expiry date (e.g., `12/34`)
4. Any 3-digit CVC
5. Any 5-digit US ZIP code

### Test Checklist

- [ ] Can see credit balance in header
- [ ] Can navigate to billing page
- [ ] Free tier shows 10 credits
- [ ] Click "Upgrade to Pro" redirects to Stripe Checkout
- [ ] Complete payment with test card `4242 4242 4242 4242`
- [ ] Redirect back to success page
- [ ] Credits updated to 500
- [ ] Plan shows as "Pro"
- [ ] Webhook received in Stripe Dashboard → Webhooks → Events
- [ ] Subscription record updated in `subscriptions` table

### Test Webhook Manually

You can test the webhook locally:

1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Login: `stripe login`
3. Forward webhooks:
   ```bash
   stripe listen --forward-to https://your-project-ref.supabase.co/functions/v1/stripe-webhook
   ```
4. Copy the webhook signing secret from CLI output
5. Update `STRIPE_WEBHOOK_SECRET` in Supabase temporarily
6. Trigger test events:
   ```bash
   stripe trigger payment_intent.succeeded
   stripe trigger invoice.payment_succeeded
   ```

---

## Step 8: Switch to Production (When Ready)

1. **Activate Stripe account** (complete business verification)
2. **Switch to Live mode** in Stripe Dashboard (top right toggle)
3. **Repeat Steps 1-6** with LIVE keys:
   - Live keys start with `pk_live_` and `sk_live_`
   - Create new products in Live mode
   - Create new webhook in Live mode
   - Update Supabase secrets with live keys
   - Update frontend `.env` with live publishable key
4. **Test with real card** (or use `pm_card_visa` test card in live mode)

---

## Pricing Summary

| Plan | Price | Credits | Stripe Price ID Variable |
|------|-------|---------|--------------------------|
| Free | $0/mo | 10 | N/A (no Stripe product) |
| Pro | $79/mo | 500 | `STRIPE_PRICE_PRO` |
| Dealer | $149/mo | 1,500 | `STRIPE_PRICE_DEALER` |
| Unlimited | $299/mo | ∞ | `STRIPE_PRICE_UNLIMITED` |

---

## Credit Packs (Optional - Future Feature)

If you want to sell one-time credit packs:

1. Create one-time payment products in Stripe:
   - 100 credits: $25
   - 500 credits: $100
   - 1,000 credits: $175
2. Use `stripe-purchase-credits` edge function
3. Pass `pack_size` (100, 500, or 1000) to function

---

## Troubleshooting

### Webhook not receiving events

1. Check webhook URL is correct
2. Verify webhook secret matches in Supabase
3. Check Stripe Dashboard → Webhooks → View logs
4. Check Supabase Logs → Edge Functions for errors

### Checkout not redirecting

1. Verify `success_url` and `cancel_url` are correct
2. Check browser console for errors
3. Verify publishable key is correct in frontend `.env`

### Credits not updating

1. Check webhook event in Stripe Dashboard
2. Check `webhook_events` table in Supabase
3. Look for `processed: true` on the event
4. Check for `error_message` field
5. Check Supabase logs for edge function errors

### Payment fails

1. In test mode, use test card `4242 4242 4242 4242`
2. In live mode, ensure real card details
3. Check Stripe Dashboard → Payments for decline reason

---

## Security Notes

- **Never commit** `.env` file to git
- **Never expose** `STRIPE_SECRET_KEY` in frontend code
- **Always use** environment variables for sensitive data
- **Test thoroughly** in test mode before going live
- **Monitor** webhook events regularly for failures

---

## Useful Stripe Dashboard Links

- Products: https://dashboard.stripe.com/products
- API Keys: https://dashboard.stripe.com/apikeys
- Webhooks: https://dashboard.stripe.com/webhooks
- Payments: https://dashboard.stripe.com/payments
- Subscriptions: https://dashboard.stripe.com/subscriptions
- Customers: https://dashboard.stripe.com/customers
- Logs: https://dashboard.stripe.com/logs

---

## Support

**Stripe Support:**
- Documentation: https://stripe.com/docs
- Support: https://support.stripe.com

**Common Issues:**
- Webhook signing: https://stripe.com/docs/webhooks/signatures
- Testing: https://stripe.com/docs/testing
- Subscriptions: https://stripe.com/docs/billing/subscriptions/overview
