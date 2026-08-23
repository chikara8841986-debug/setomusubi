-- 問い合わせフォーム: inquiries テーブル新設
-- チラシ経由で電話番号を載せず、Webフォームのみが唯一の問い合わせ窓口になる想定。
-- 公開フォーム(anon)からの投稿を受けるため、スパム対策(ハニーポット/簡易レート制限/文字数上限)を
-- DBトリガ側にも実装し、フロントのJSバイパスにも耐えるようにする。

create table public.inquiries (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  email       text not null check (
                char_length(email) <= 254
                and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
              ),
  body        text not null check (char_length(body) between 1 and 3000),
  user_id     uuid references auth.users(id) on delete set null,
  status      text not null default 'new' check (status in ('new', 'in_progress', 'done')),
  website     text,
  client_ip   text
);

comment on table public.inquiries is '問い合わせフォームからの投稿。未ログイン(anon)からのINSERTのみ許可し、SELECT/UPDATEは管理者(is_admin())限定。個人情報を含むため他ユーザーからは一切閲覧不可。';
comment on column public.inquiries.website is 'ハニーポット用フィールド(非表示)。値が入っていたらスパムとみなし破棄する。';
comment on column public.inquiries.client_ip is 'レート制限判定用。トリガがrequest.headersのx-forwarded-forから自動設定する(クライアント指定値は上書きされる)。';

create index idx_inquiries_status_created on public.inquiries (status, created_at desc);
create index idx_inquiries_rate_email on public.inquiries (lower(email), created_at);
create index idx_inquiries_rate_ip on public.inquiries (client_ip, created_at);

alter table public.inquiries enable row level security;

create policy inquiries_insert_public
  on public.inquiries
  for insert
  to anon, authenticated
  with check (
    user_id is null or user_id = auth.uid()
  );

create policy inquiries_select_admin
  on public.inquiries
  for select
  to authenticated
  using (public.is_admin());

create policy inquiries_update_admin
  on public.inquiries
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant insert on public.inquiries to anon, authenticated;
grant select, update on public.inquiries to authenticated;

create or replace function public.inquiries_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text;
  v_recent_count int;
begin
  if new.website is not null and char_length(btrim(new.website)) > 0 then
    return null;
  end if;

  v_ip := coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', '');
  if v_ip <> '' then
    v_ip := btrim(split_part(v_ip, ',', 1));
  end if;
  new.client_ip := nullif(v_ip, '');
  new.status := 'new';
  new.created_at := now();
  new.updated_at := now();

  select count(*) into v_recent_count
  from public.inquiries i
  where i.created_at > now() - interval '3 minutes'
    and (
      lower(i.email) = lower(new.email)
      or (new.client_ip is not null and i.client_ip = new.client_ip)
    );

  if v_recent_count >= 3 then
    raise exception 'inquiry_rate_limited'
      using errcode = 'P0001', hint = 'too many inquiries from the same sender in a short time';
  end if;

  return new;
end;
$$;

revoke execute on function public.inquiries_before_insert() from public, anon, authenticated;

create trigger trg_inquiries_before_insert
  before insert on public.inquiries
  for each row
  execute function public.inquiries_before_insert();

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
  return new;
end;
$$;

revoke execute on function public.inquiries_before_update() from public, anon, authenticated;

create trigger trg_inquiries_before_update
  before update on public.inquiries
  for each row
  execute function public.inquiries_before_update();
