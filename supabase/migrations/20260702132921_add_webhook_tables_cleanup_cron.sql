-- C6修正: stripe-webhookの補助テーブルを無期限に肥大化させないよう、日次で古いレコードを掃除する。
select cron.schedule(
  'cleanup-webhook-tables-daily',
  '30 18 * * *',  -- UTC 18:30 = JST 03:30（負荷の低い深夜帯）
  $cron$
    delete from public.webhook_processed_events where processed_at < now() - interval '30 days';
    delete from public.webhook_debug where created_at < now() - interval '7 days';
  $cron$
);
