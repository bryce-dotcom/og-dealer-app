-- Create billing and credit tracking system
-- This migration adds comprehensive subscription, credit usage, and payment tracking

-- ================================================================
-- SUBSCRIPTIONS TABLE (Main billing state)
-- ================================================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id INTEGER NOT NULL UNIQUE REFERENCES dealer_settings(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  plan_tier TEXT NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro', 'dealer', 'unlimited')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),

  -- Billing cycle
  billing_cycle_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  billing_cycle_end TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  next_billing_date TIMESTAMPTZ,

  -- Credits
  monthly_credit_allowance INTEGER NOT NULL DEFAULT 0,
  credits_remaining INTEGER NOT NULL DEFAULT 0,
  bonus_credits INTEGER NOT NULL DEFAULT 0, -- From credit pack purchases
  credits_used_this_cycle INTEGER NOT NULL DEFAULT 0,

  -- Trial tracking
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_dealer_id ON subscriptions(dealer_id);
CREATE INDEX idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_next_billing ON subscriptions(next_billing_date) WHERE status = 'active';

COMMENT ON TABLE subscriptions IS 'Dealer subscription and credit balance tracking';
COMMENT ON COLUMN subscriptions.plan_tier IS 'free (10 credits), pro (500), dealer (1500), unlimited (999999)';
COMMENT ON COLUMN subscriptions.bonus_credits IS 'Credits from one-time credit pack purchases';

-- ================================================================
-- CREDIT USAGE LOG (Audit trail)
-- ================================================================
CREATE TABLE credit_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id INTEGER NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  feature_type TEXT NOT NULL CHECK (feature_type IN (
    'vehicle_research', 'deal_doctor', 'market_comp_report', 'ai_arnie_query',
    'vin_decode', 'form_generation', 'plaid_sync', 'payroll_run'
  )),
  credits_used INTEGER NOT NULL,
  context_id TEXT, -- e.g., deal_id, vehicle_id, etc.
  user_id UUID,
  success BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_usage_dealer_id ON credit_usage_log(dealer_id);
CREATE INDEX idx_credit_usage_feature ON credit_usage_log(feature_type);
CREATE INDEX idx_credit_usage_created ON credit_usage_log(created_at DESC);

COMMENT ON TABLE credit_usage_log IS 'Audit log of all credit consumption';
COMMENT ON COLUMN credit_usage_log.credits_used IS '0 for unlimited tier, actual cost for others';

-- ================================================================
-- CREDIT PACKS (One-time purchases)
-- ================================================================
CREATE TABLE credit_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id INTEGER NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  credits_purchased INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credit_packs_dealer_id ON credit_packs(dealer_id);

COMMENT ON TABLE credit_packs IS 'One-time credit pack purchases (100/$25, 500/$100, 1000/$175)';

-- ================================================================
-- WEBHOOK EVENTS (Stripe webhook idempotency)
-- ================================================================
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_stripe_id ON webhook_events(stripe_event_id);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed) WHERE processed = FALSE;

COMMENT ON TABLE webhook_events IS 'Stripe webhook event log for idempotency and debugging';

-- ================================================================
-- UPDATE DEALER_SETTINGS (Add FK references)
-- ================================================================
ALTER TABLE dealer_settings
  ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id),
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE INDEX idx_dealer_settings_subscription ON dealer_settings(subscription_id);

-- ================================================================
-- MIGRATE EXISTING DEALERS TO FREE TIER
-- ================================================================
INSERT INTO subscriptions (dealer_id, plan_tier, status, monthly_credit_allowance, credits_remaining, trial_start, trial_end)
SELECT
  id,
  'free',
  'trialing',
  10,
  10,
  COALESCE(created_at, NOW()),
  COALESCE(trial_ends_at, NOW() + INTERVAL '30 days')
FROM dealer_settings
ON CONFLICT (dealer_id) DO NOTHING;

-- Link subscriptions back to dealer_settings
UPDATE dealer_settings ds
SET subscription_id = s.id
FROM subscriptions s
WHERE s.dealer_id = ds.id
AND ds.subscription_id IS NULL;
