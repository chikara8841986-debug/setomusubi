-- 問い合わせフォーム送信者への自動返信（受付確認＋各種登録フォームへの案内）を
-- 1件につき1回だけ送るための記録欄。
-- notify-inquiry は verify_jwt=false で誰でも叩けるため、同じ inquiry_id で繰り返し
-- 呼ばれても送信者にメールが連投されないよう、この列で二重送信を防ぐ。
alter table public.inquiries
  add column if not exists auto_reply_sent_at timestamptz;

comment on column public.inquiries.auto_reply_sent_at is
  '送信者への自動返信を送った日時。NULLなら未送信。notify-inquiryが二重送信防止に使う。';

-- 既存の BEFORE UPDATE トリガは status 以外の列を old の値に強制的に戻すため、
-- Edge Function(service_role)から auto_reply_sent_at を更新できるように許可する。
create or replace function public.inquiries_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.name := old.name;
  new.email := old.email;
  new.body := old.body;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.website := old.website;
  new.client_ip := old.client_ip;
  -- auto_reply_sent_at は一方向のみ許可する。
  -- 既にセット済みなら old を維持し、未設定のときだけ new を受け入れる（取り消し不可）。
  if old.auto_reply_sent_at is not null then
    new.auto_reply_sent_at := old.auto_reply_sent_at;
  end if;
  return new;
end;
$$;
