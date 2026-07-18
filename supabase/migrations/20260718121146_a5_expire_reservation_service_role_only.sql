-- A5追補: expire_reservation は send-reminder(cron, service_role) 専用の失効処理で、
-- 関数内に呼び出し元の権限チェックが無い。authenticated へのEXECUTE付与は
-- 「予約UUIDを知っている当事者が承認/却下フローを飛ばして申請を握りつぶせる」
-- 抜け道になるため撤回する。
revoke execute on function public.expire_reservation(uuid) from authenticated;
