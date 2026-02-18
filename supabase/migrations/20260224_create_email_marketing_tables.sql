-- Email Marketing System Tables
-- AI-powered email campaigns similar to Constant Contact

-- Email templates for reusable designs
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject_line TEXT,
  body_html TEXT,
  body_text TEXT,
  thumbnail_url TEXT,
  category TEXT DEFAULT 'general', -- general, promotion, reminder, follow_up, newsletter
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Customer segments for targeted campaigns
CREATE TABLE IF NOT EXISTS customer_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  criteria JSONB DEFAULT '{}'::jsonb, -- Store segment rules: {deal_type: 'BHPH', has_active_loan: true, etc}
  customer_count INTEGER DEFAULT 0,
  is_dynamic BOOLEAN DEFAULT true, -- Dynamically update based on criteria vs static list
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Email campaigns
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject_line TEXT NOT NULL,
  preview_text TEXT, -- Shows in inbox preview
  body_html TEXT NOT NULL,
  body_text TEXT, -- Plain text fallback
  from_name TEXT,
  from_email TEXT,
  reply_to TEXT,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  segment_id UUID REFERENCES customer_segments(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  recipient_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  bounced_count INTEGER DEFAULT 0,
  unsubscribed_count INTEGER DEFAULT 0,
  ai_generated BOOLEAN DEFAULT false, -- Track if content was AI-generated
  ai_prompt TEXT, -- Store the prompt used for AI generation
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Individual email logs for tracking
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject_line TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed')),
  external_id TEXT, -- Email service provider's message ID (e.g., Resend message ID)
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  first_clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  bounce_reason TEXT,
  error_message TEXT,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Track individual link clicks within emails
CREATE TABLE IF NOT EXISTS email_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_log_id UUID NOT NULL REFERENCES email_logs(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  clicked_at TIMESTAMPTZ DEFAULT now()
);

-- Customer communication preferences
CREATE TABLE IF NOT EXISTS customer_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  dealer_id UUID NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT true,
  unsubscribed_at TIMESTAMPTZ,
  unsubscribe_reason TEXT,
  preferred_frequency TEXT DEFAULT 'normal' CHECK (preferred_frequency IN ('daily', 'normal', 'weekly', 'monthly')),
  tags TEXT[] DEFAULT ARRAY[]::TEXT[], -- Custom tags for segmentation
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, dealer_id)
);

-- Automation rules for triggered emails
CREATE TABLE IF NOT EXISTS email_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('bhph_payment_due', 'bhph_payment_overdue', 'new_inventory', 'vehicle_match', 'follow_up', 'birthday', 'custom')),
  trigger_config JSONB DEFAULT '{}'::jsonb, -- Config for trigger: {days_before: 3, deal_type: 'BHPH'}
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  subject_line TEXT,
  body_html TEXT,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_templates_dealer ON email_templates(dealer_id);
CREATE INDEX IF NOT EXISTS idx_customer_segments_dealer ON customer_segments(dealer_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_dealer ON email_campaigns(dealer_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(dealer_id, status);
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign ON email_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_customer ON email_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(dealer_id, status);
CREATE INDEX IF NOT EXISTS idx_email_clicks_log ON email_clicks(email_log_id);
CREATE INDEX IF NOT EXISTS idx_customer_preferences_customer ON customer_preferences(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_automations_dealer ON email_automations(dealer_id, is_active);

-- Add comments
COMMENT ON TABLE email_templates IS 'Reusable email templates with AI-generated content support';
COMMENT ON TABLE customer_segments IS 'Customer groups for targeted campaigns (BHPH customers, recent buyers, etc)';
COMMENT ON TABLE email_campaigns IS 'Email marketing campaigns with tracking metrics';
COMMENT ON TABLE email_logs IS 'Individual email delivery and engagement tracking';
COMMENT ON TABLE email_clicks IS 'Track clicks on links within emails';
COMMENT ON TABLE customer_preferences IS 'Customer opt-in/out preferences and communication settings';
COMMENT ON TABLE email_automations IS 'Automated email triggers (payment reminders, new inventory alerts)';

-- Enable RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_automations ENABLE ROW LEVEL SECURITY;

-- RLS Policies (dealer can access their own data)
CREATE POLICY "Dealers can manage their email templates"
  ON email_templates FOR ALL
  USING (dealer_id IN (SELECT id FROM dealer_settings))
  WITH CHECK (dealer_id IN (SELECT id FROM dealer_settings));

CREATE POLICY "Dealers can manage their customer segments"
  ON customer_segments FOR ALL
  USING (dealer_id IN (SELECT id FROM dealer_settings))
  WITH CHECK (dealer_id IN (SELECT id FROM dealer_settings));

CREATE POLICY "Dealers can manage their email campaigns"
  ON email_campaigns FOR ALL
  USING (dealer_id IN (SELECT id FROM dealer_settings))
  WITH CHECK (dealer_id IN (SELECT id FROM dealer_settings));

CREATE POLICY "Dealers can view their email logs"
  ON email_logs FOR ALL
  USING (dealer_id IN (SELECT id FROM dealer_settings))
  WITH CHECK (dealer_id IN (SELECT id FROM dealer_settings));

CREATE POLICY "Dealers can view their email clicks"
  ON email_clicks FOR SELECT
  USING (campaign_id IN (SELECT id FROM email_campaigns WHERE dealer_id IN (SELECT id FROM dealer_settings)));

CREATE POLICY "Dealers can manage customer preferences"
  ON customer_preferences FOR ALL
  USING (dealer_id IN (SELECT id FROM dealer_settings))
  WITH CHECK (dealer_id IN (SELECT id FROM dealer_settings));

CREATE POLICY "Dealers can manage their email automations"
  ON email_automations FOR ALL
  USING (dealer_id IN (SELECT id FROM dealer_settings))
  WITH CHECK (dealer_id IN (SELECT id FROM dealer_settings));

-- Seed some default email templates
INSERT INTO email_templates (dealer_id, name, subject_line, body_html, category, is_default) VALUES
(NULL, 'Welcome New Customer', 'Welcome to {{dealer_name}}!', '<h1>Welcome {{customer_name}}!</h1><p>Thank you for choosing {{dealer_name}}. We''re here to help with all your automotive needs.</p>', 'general', true),
(NULL, 'Payment Reminder', 'Payment Due: {{amount}} on {{due_date}}', '<h2>Payment Reminder</h2><p>Hi {{customer_name}},</p><p>This is a friendly reminder that your payment of <strong>{{amount}}</strong> is due on <strong>{{due_date}}</strong>.</p><p>Thank you!</p>', 'reminder', true),
(NULL, 'New Inventory Alert', 'New {{year}} {{make}} {{model}} Just Arrived!', '<h2>New Vehicle Alert!</h2><p>Hi {{customer_name}},</p><p>We just got a <strong>{{year}} {{make}} {{model}}</strong> that matches what you''re looking for!</p><p><a href="{{vehicle_url}}">View Details</a></p>', 'promotion', true),
(NULL, 'Thank You - Recent Purchase', 'Thank You for Your Purchase!', '<h1>Thank You {{customer_name}}!</h1><p>We appreciate your business and hope you''re enjoying your new {{year}} {{make}} {{model}}!</p><p>If you need anything, we''re here to help.</p>', 'follow_up', true)
ON CONFLICT DO NOTHING;
