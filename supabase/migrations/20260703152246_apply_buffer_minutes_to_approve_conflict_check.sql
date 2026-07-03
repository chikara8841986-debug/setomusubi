-- A4修正: 承認時の重複チェックにも、事業所ごとの回送バッファ(buffer_minutes)を加味する。
CREATE OR REPLACE FUNCTION public.approve_reservation(p_reservation_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_caller        uuid := auth.uid();
  v_res           public.reservations%rowtype;
  v_slot          public.availability_slots%rowtype;
  v_capacity      int;
  v_new_count     int;
  v_auto_rejected int := 0;
  v_buffer        int := 0;
BEGIN
  SELECT * INTO v_res FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_not_found'; END IF;
  IF v_res.status <> 'pending' THEN RAISE EXCEPTION 'reservation_not_pending'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses WHERE id = v_res.business_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'reservation_approve_unauthorized';
  END IF;

  -- ★ 二重承認ガード：同じ車両・同じ日・重なる時間帯(事業所の回送バッファ込み)に既に確定済みがあれば拒否
  IF v_res.vehicle_id IS NOT NULL THEN
    SELECT COALESCE(buffer_minutes, 0) INTO v_buffer FROM public.businesses WHERE id = v_res.business_id;
    IF EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.vehicle_id = v_res.vehicle_id
        AND r.id <> v_res.id
        AND r.status = 'confirmed'
        AND r.reservation_date = v_res.reservation_date
        AND r.start_time < (v_res.end_time + make_interval(mins => v_buffer))
        AND r.end_time   > (v_res.start_time - make_interval(mins => v_buffer))
    ) THEN
      RAISE EXCEPTION 'reservation_conflict';
    END IF;
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
  PERFORM public.log_audit('approve_reservation', p_reservation_id, jsonb_build_object('auto_rejected', v_auto_rejected));
  RETURN v_auto_rejected;
END
$function$;
