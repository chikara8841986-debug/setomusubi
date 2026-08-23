-- 問い合わせが新規作成されたら、DBトリガー(pg_net)からnotify-inquiry Edge Functionを
-- 非同期で呼び、管理者に「問い合わせが届きました」の最小限通知を送る。
-- フロント(タブを閉じる等)に依存しないようDB側で完結させる。
-- ハニーポットで破棄された場合(BEFORE INSERTがNULLを返す)はAFTER INSERTが発火しないため対象外。
create or replace function public.inquiries_after_insert_notify()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://lcuoeekhnmbhomcdbedi.supabase.co/functions/v1/notify-inquiry',
    body := jsonb_build_object('inquiry_id', new.id)
  );
  return new;
end;
$$;

revoke execute on function public.inquiries_after_insert_notify() from public, anon, authenticated;

create trigger trg_inquiries_after_insert_notify
  after insert on public.inquiries
  for each row
  execute function public.inquiries_after_insert_notify();
