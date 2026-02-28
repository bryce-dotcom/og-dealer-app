-- =============================================
-- Set up daily cron job for Deal Finder
-- =============================================

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule run-saved-searches to run daily at 3:00 AM UTC
-- This will find deals for all active saved searches
SELECT cron.schedule(
  'run-saved-searches-daily',           -- Job name
  '0 3 * * *',                          -- Cron expression: 3:00 AM every day
  $$
  SELECT
    net.http_post(
      url := 'https://rlzudfinlxonpbwacxpt.supabase.co/functions/v1/run-saved-searches',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.supabase_service_role_key') || '"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Verify the cron job was created
SELECT * FROM cron.job WHERE jobname = 'run-saved-searches-daily';

-- =============================================
-- NOTES:
-- =============================================
-- 1. Runs at 3:00 AM UTC (adjust timezone as needed)
-- 2. Calls the run-saved-searches Edge Function
-- 3. Processes all active saved searches
-- 4. Finds deals and saves to deal_alerts table
--
-- To manually trigger (for testing):
-- SELECT cron.unschedule('run-saved-searches-daily');
--
-- To reschedule at different time:
-- SELECT cron.unschedule('run-saved-searches-daily');
-- Then run this script again with new cron expression
--
-- Common cron expressions:
-- '0 3 * * *'   - 3:00 AM daily
-- '0 */6 * * *' - Every 6 hours
-- '0 8 * * 1'   - 8:00 AM every Monday
-- =============================================
