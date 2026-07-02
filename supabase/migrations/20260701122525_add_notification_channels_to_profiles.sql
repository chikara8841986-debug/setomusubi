
-- 通知チャネル設定（メールは常時ベースライン。LINEは連携済みかつ有効なら追加送信）
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS line_user_id text,
  ADD COLUMN IF NOT EXISTS notify_line boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true;

-- LINE userId から profiles を逆引きする（Webhook用）。1つのLINEユーザーは1プロフィールに紐づく
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_line_user_id
  ON public.profiles (line_user_id)
  WHERE line_user_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.line_user_id IS 'LINE Messaging API の userId（友だち連携時に設定）。未設定ならLINE送信されない。';
COMMENT ON COLUMN public.profiles.notify_line IS 'LINE通知の有効/無効（連携済みユーザー向け）。';
COMMENT ON COLUMN public.profiles.notify_email IS 'メール通知の有効/無効。既定ON（フォールバック用に基本は残す想定）。';
