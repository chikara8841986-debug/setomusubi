
-- 1. guard_reservation_columns: status変更はapprove/reject RPCからのみ許可
CREATE OR REPLACE FUNCTION public.guard_reservation_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_admin boolean;
  v_rpc_ctx  text;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;
  IF v_is_admin THEN
    RETURN NEW;
  END IF;
  IF OLD.business_id IS DISTINCT FROM NEW.business_id THEN RAISE EXCEPTION 'reservation_business_id_immutable'; END IF;
  IF OLD.hospital_id IS DISTINCT FROM NEW.hospital_id THEN RAISE EXCEPTION 'reservation_hospital_id_immutable'; END IF;
  IF OLD.source      IS DISTINCT FROM NEW.source      THEN RAISE EXCEPTION 'reservation_source_immutable'; END IF;
  IF OLD.slot_id     IS DISTINCT FROM NEW.slot_id     THEN RAISE EXCEPTION 'reservation_slot_id_immutable'; END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_rpc_ctx := current_setting('app.rpc_context', true);
    IF v_rpc_ctx NOT IN ('approve_reservation', 'reject_reservation') THEN
      RAISE EXCEPTION 'reservation_status_change_via_rpc_only';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- 2. approve_reservation: status変更前にrpc_contextをセット
CREATE OR REPLACE FUNCTION public.approve_reservation(p_reservation_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller        uuid := auth.uid();
  v_res           public.reservations%rowtype;
  v_slot          public.availability_slots%rowtype;
  v_capacity      int;
  v_new_count     int;
  v_auto_rejected int := 0;
BEGIN
  SELECT * INTO v_res FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_not_found'; END IF;
  IF v_res.status <> 'pending' THEN RAISE EXCEPTION 'reservation_not_pending'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses WHERE id = v_res.business_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'reservation_approve_unauthorized';
  END IF;

  -- トリガーに「このUPDATEはRPC経由」と知らせる（トランザクション内のみ有効）
  PERFORM set_config('app.rpc_context', 'approve_reservation', true);

  IF v_res.slot_id IS NOT NULL THEN
    SELECT * INTO v_slot FROM public.availability_slots WHERE id = v_res.slot_id FOR UPDATE;
    IF FOUND THEN
      v_capacity  := COALESCE(v_slot.capacity, 1);
      v_new_count := COALESCE(v_slot.confirmed_count, 0) + 1;
      UPDATE public.availability_slots
        SET confirmed_count = v_new_count,
            is_available    = (v_new_count < v_capacity)
        WHERE id = v_slot.id;

      IF v_new_count >= v_capacity THEN
        WITH rejected AS (
          UPDATE public.reservations
            SET status = 'rejected'
            WHERE slot_id = v_res.slot_id
              AND status = 'pending'
              AND id <> p_reservation_id
            RETURNING id
        )
        SELECT count(*) INTO v_auto_rejected FROM rejected;
      END IF;
    END IF;
  END IF;

  UPDATE public.reservations SET status = 'confirmed' WHERE id = p_reservation_id;
  RETURN v_auto_rejected;
END
$$;

-- 3. reject_reservation: 同様にrpc_contextをセット
CREATE OR REPLACE FUNCTION public.reject_reservation(p_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_res    public.reservations%rowtype;
BEGIN
  SELECT * INTO v_res FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_not_found'; END IF;
  IF v_res.status <> 'pending' THEN RAISE EXCEPTION 'reservation_not_pending'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses WHERE id = v_res.business_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'reservation_reject_unauthorized';
  END IF;

  PERFORM set_config('app.rpc_context', 'reject_reservation', true);
  UPDATE public.reservations SET status = 'rejected' WHERE id = p_reservation_id;
END
$$;
