-- C3修正: past_due（決済失敗）になった時刻を記録し、猶予期間中はMSW検索から除外しないようにする。
alter table public.businesses add column if not exists past_due_since timestamptz;

comment on column public.businesses.past_due_since is 'subscription_statusが最初にpast_dueになった時刻。stripe-webhookが管理。14日超過でMSW検索から除外する猶予判定に使う。past_due以外に戻ったらnullにリセットされる。';
