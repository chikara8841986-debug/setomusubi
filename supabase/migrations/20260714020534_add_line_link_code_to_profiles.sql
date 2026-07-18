-- F3: LINE友だち連携用の一時コード。アプリ側で発行し、LINE公式アカウントに
-- そのコードをメッセージ送信してもらうことで line_user_id を紐付ける。
alter table public.profiles
  add column if not exists line_link_code text,
  add column if not exists line_link_code_expires_at timestamptz;

create unique index if not exists uq_profiles_line_link_code
  on public.profiles (line_link_code)
  where line_link_code is not null;

comment on column public.profiles.line_link_code is 'LINE友だち連携用の一時コード(6桁)。10分で失効。line-webhookが照合してline_user_idを設定する。';
