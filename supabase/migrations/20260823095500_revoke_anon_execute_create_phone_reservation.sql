-- 全関数の権限監査で発見: create_phone_reservation に anon(未ログイン)のEXECUTEが付いていた。
-- このプロジェクトは ALTER DEFAULT PRIVILEGES により新規関数へ anon の EXECUTE が自動付与される
-- ため、明示的に revoke しない限り残る（`revoke ... from public` では剥がれない）。
--
-- 即時の脆弱性ではない: 関数内で v_caller := auth.uid() を取り、その user_id を持つ businesses が
-- 無ければ phone_reservation_no_business で弾くため、anon が呼んでも必ず失敗する。
-- ただし「将来この検証を緩めた瞬間に未認証で予約が作れる」状態を残すべきではないため、
-- 最小権限の原則に従って剥がす。事業者(authenticated)からの正規利用には影響しない。
revoke execute on function public.create_phone_reservation(
  date, time without time zone, time without time zone,
  text, text, text, text, text, text, boolean, text, uuid
) from anon;
