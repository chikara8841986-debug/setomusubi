-- 新規作成時、プロジェクトのデフォルト権限設定(ALTER DEFAULT PRIVILEGES)により
-- anon ロールにも EXECUTE が自動付与されていた（`revoke all ... from public` では剥がれない）。
-- 個人向けキャンセルRPCは authenticated（ログイン済みユーザー）のみに絞る。
revoke execute on function public.cancel_reservation_by_personal(uuid) from anon;
