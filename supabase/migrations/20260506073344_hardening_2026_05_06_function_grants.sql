-- ============================================================================
-- Lock down SECURITY DEFINER functions:
-- - Trigger-only functions: REVOKE all EXECUTE (PostgreSQL still calls them
--   in trigger context regardless of grants — triggers run as their owner).
-- - RPC functions: revoke PUBLIC, keep authenticated only.
-- ============================================================================

-- Trigger-only (should not be callable via REST)
revoke execute on function public.guard_profile_immutable() from public;
revoke execute on function public.guard_business_owner_immutable() from public;
revoke execute on function public.guard_hospital_owner_immutable() from public;
revoke execute on function public.guard_reservation_columns() from public;
revoke execute on function public.handle_new_user_registration() from public;

-- RPC: revoke PUBLIC default; keep authenticated
revoke execute on function public.approve_reservation(uuid) from public;
revoke execute on function public.reject_reservation(uuid) from public;
revoke execute on function public.complete_reservation(uuid) from public;
revoke execute on function public.cancel_reservation_by_msw(uuid) from public;
revoke execute on function public.create_phone_reservation(
  date, time, time, text, text, text, text, text, text, boolean, text
) from public;
