SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('subscriptions', 'credit_usage_log', 'credit_packs', 'webhook_events')
ORDER BY tablename;
