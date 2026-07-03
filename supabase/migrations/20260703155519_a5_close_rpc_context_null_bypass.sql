-- A5修正: guard_reservation_columns の NULL すり抜けを塞ぐ。
-- 手順: (1) 未対応だったRPC(complete_reservation, cancel_reservation_by_msw)にrpc_context設定を追加
--       (2) 直接UPDATEしていた2経路(事業所側キャンセル・失効処理)を新規RPC化
--       (3) guard_reservation_columns を COALESCE fail-closed に厳格化（許可リストに新RPCも追加）
-- 管理者(v_is_admin)は従来どおりバイパスされるため、admin側の直接ステータス編集UIは影響を受けない。

-- 1) complete_reservation に rpc_context 設定を追加
create or replace function public.complete_reservation(p_reservation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller uuid := auth.uid();
  v_res public.reservations%rowtype;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if v_res.status <> 'confirmed' then raise exception 'reservation_not_confirmed'; end if;
  if not exists (select 1 from public.businesses where id = v_res.business_id and user_id = v_caller) then
    raise exception 'reservation_complete_unauthorized';
  end if;
  perform set_config('app.rpc_context', 'complete_reservation', true);
  update public.reservations set status = 'completed' where id = p_reservation_id;
  if v_res.slot_id is not null then
    update public.availability_slots
      set confirmed_count = greatest(0, coalesce(confirmed_count, 0) - 1),
          is_available    = true
      where id = v_res.slot_id;
  end if;
  perform public.log_audit('complete_reservation', p_reservation_id, '{}'::jsonb);
end $function$;

-- 2) cancel_reservation_by_msw に rpc_context 設定を追加
create or replace function public.cancel_reservation_by_msw(p_reservation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller uuid := auth.uid();
  v_res public.reservations%rowtype;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if v_res.status not in ('pending', 'confirmed') then
    raise exception 'reservation_not_cancellable';
  end if;
  if v_res.hospital_id is null
     or not exists (select 1 from public.hospitals where id = v_res.hospital_id and user_id = v_caller) then
    raise exception 'reservation_cancel_unauthorized';
  end if;
  perform set_config('app.rpc_context', 'cancel_reservation_by_msw', true);
  if v_res.status = 'confirmed' and v_res.slot_id is not null then
    update public.availability_slots
      set confirmed_count = greatest(0, coalesce(confirmed_count, 0) - 1),
          is_available    = true
      where id = v_res.slot_id;
  end if;
  update public.reservations set status = 'cancelled' where id = p_reservation_id;
  perform public.log_audit('cancel_reservation_by_msw', p_reservation_id, jsonb_build_object('was_status', v_res.status));
end $function$;

-- 3) 事業所側の確定予約キャンセルを新規RPC化（Calendar.tsxの直接UPDATEを置き換える）
create or replace function public.cancel_reservation_by_business(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller uuid := auth.uid();
  v_res public.reservations%rowtype;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if v_res.status <> 'confirmed' then raise exception 'reservation_not_confirmed'; end if;
  if not exists (select 1 from public.businesses where id = v_res.business_id and user_id = v_caller) then
    raise exception 'reservation_cancel_unauthorized';
  end if;
  perform set_config('app.rpc_context', 'cancel_reservation_by_business', true);
  if v_res.slot_id is not null then
    update public.availability_slots
      set confirmed_count = greatest(0, coalesce(confirmed_count, 0) - 1),
          is_available    = true
      where id = v_res.slot_id;
  end if;
  update public.reservations set status = 'cancelled' where id = p_reservation_id;
  perform public.log_audit('cancel_reservation_by_business', p_reservation_id, '{}'::jsonb);
end
$$;
revoke execute on function public.cancel_reservation_by_business(uuid) from public, anon;
grant execute on function public.cancel_reservation_by_business(uuid) to authenticated;

-- 4) pending失効処理を新規RPC化（send-reminderの直接UPDATEを置き換える。service_roleから呼ぶ）
create or replace function public.expire_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_res public.reservations%rowtype;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then return; end if;
  if v_res.status <> 'pending' then return; end if;
  perform set_config('app.rpc_context', 'expire_reservation', true);
  update public.reservations set status = 'cancelled' where id = p_reservation_id and status = 'pending';
  perform public.log_audit('expire_reservation', p_reservation_id, '{}'::jsonb);
end
$$;
revoke execute on function public.expire_reservation(uuid) from public, anon;
grant execute on function public.expire_reservation(uuid) to authenticated, service_role;

-- 5) guard_reservation_columns を厳格化: NULL(未設定)は素通りさせずCOALESCEで明示的に拒否。
--    許可リストに新設RPCを追加。管理者(v_is_admin)は従来どおり無条件許可。
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
    IF COALESCE(v_rpc_ctx, '') NOT IN (
      'approve_reservation', 'reject_reservation', 'complete_reservation',
      'cancel_reservation_by_msw', 'cancel_reservation_by_business', 'expire_reservation'
    ) THEN
      RAISE EXCEPTION 'reservation_status_change_via_rpc_only';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
