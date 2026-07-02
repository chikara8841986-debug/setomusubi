-- B1修正: 通知送信の記録とリトライのためのoutboxテーブル。
-- client からは触らせない（webhook_debug 等と同様、RLS有効・ポリシー0で service_role 専用）。
create table public.notification_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid,
  business_id  uuid references public.businesses(id) on delete set null,
  hospital_id  uuid references public.hospitals(id) on delete set null,
  channel      text not null check (channel in ('email', 'line')),
  recipient    text not null,
  subject      text not null,
  message      text not null,
  status       text not null check (status in ('sent', 'failed')),
  error        text,
  retry_count  int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_notification_log_retry
  on public.notification_log (created_at)
  where status = 'failed';

alter table public.notification_log enable row level security;

comment on table public.notification_log is '通知(メール/LINE)の送信記録。notify Edge Functionがservice_role経由でのみ読み書きする。失敗分はsend-reminderの再送パスがretry_count<3の間リトライする。';
