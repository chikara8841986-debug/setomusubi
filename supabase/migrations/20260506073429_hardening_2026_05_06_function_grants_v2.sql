-- ============================================================================
-- Supabase は public schema の関数に anon/authenticated/service_role への
-- EXECUTE をデフォルトで付与する。trigger関数とRPC関数で適切に絞り直す。
-- ============================================================================

-- Trigger-only: REST 経由で呼ばれるべきではない。すべての role から剥奪。
-- Trigger 自体は所有者(postgres)権限で実行されるので問題なし。
revoke execute on function public.guard_profile_immutable() from anon, authenticated, service_role;
revoke execute on function public.guard_business_owner_immutable() from anon, authenticated, service_role;
revoke execute on function public.guard_hospital_owner_immutable() from anon, authenticated, service_role;
revoke execute on function public.guard_reservation_columns() from anon, authenticated, service_role;
revoke execute on function public.handle_new_user_registration() from anon, authenticated, service_role;

-- RPC: anon は呼べないようにする。authenticated と service_role は維持。
revoke execute on function public.approve_reservation(uuid) from anon;
revoke execute on function public.reject_reservation(uuid) from anon;
revoke execute on function public.complete_reservation(uuid) from anon;
revoke execute on function public.cancel_reservation_by_msw(uuid) from anon;
revoke execute on function public.create_phone_reservation(
  date, time, time, text, text, text, text, text, text, boolean, text
) from anon;
