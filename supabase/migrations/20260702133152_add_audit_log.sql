-- D4修正: 予約のステータス変更(承認/却下/完了/キャンセル)を誰がいつ行ったか記録する監査ログ。
create table public.audit_log (
  id             uuid primary key default gen_random_uuid(),
  actor_id       uuid,
  action         text not null,
  reservation_id uuid references public.reservations(id) on delete set null,
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index idx_audit_log_reservation on public.audit_log (reservation_id);
create index idx_audit_log_actor on public.audit_log (actor_id);

alter table public.audit_log enable row level security;

-- 管理者のみ閲覧可能（is_admin()はfix_profiles_rls_infinite_recursionで導入済み）
create policy "audit_log_admin_select" on public.audit_log
  for select using (public.is_admin());

-- RPC専用の書き込みヘルパー。actor_idはauth.uid()から自動取得するため、
-- 呼び出し側が他人になりすませない。
create or replace function public.log_audit(p_action text, p_reservation_id uuid, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.audit_log(actor_id, action, reservation_id, detail)
  values (auth.uid(), p_action, p_reservation_id, p_detail);
end
$$;

revoke execute on function public.log_audit(text, uuid, jsonb) from public, anon;
grant execute on function public.log_audit(text, uuid, jsonb) to authenticated;

comment on table public.audit_log is '予約のステータス変更・電話予約作成の監査ログ。誰が(actor_id)いつ何をしたか。管理者のみSELECT可。書き込みはlog_audit()経由のRPCからのみ。';

-- ── 各RPCにaudit_log書き込みを追加 ──

create or replace function public.approve_reservation(p_reservation_id uuid)
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
BEGIN
  SELECT * INTO v_res FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_not_found'; END IF;
  IF v_res.status <> 'pending' THEN RAISE EXCEPTION 'reservation_not_pending'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses WHERE id = v_res.business_id AND user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'reservation_approve_unauthorized';
  END IF;

  -- ★ 二重承認ガード：同じ車両・同じ日・重なる時間帯に既に確定済みがあれば拒否
  IF v_res.vehicle_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.vehicle_id = v_res.vehicle_id
        AND r.id <> v_res.id
        AND r.status = 'confirmed'
        AND r.reservation_date = v_res.reservation_date
        AND r.start_time < v_res.end_time
        AND r.end_time   > v_res.start_time
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

create or replace function public.reject_reservation(p_reservation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
  PERFORM public.log_audit('reject_reservation', p_reservation_id, '{}'::jsonb);
END
$function$;

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
  update public.reservations set status = 'completed' where id = p_reservation_id;
  if v_res.slot_id is not null then
    update public.availability_slots
      set confirmed_count = greatest(0, coalesce(confirmed_count, 0) - 1),
          is_available    = true
      where id = v_res.slot_id;
  end if;
  perform public.log_audit('complete_reservation', p_reservation_id, '{}'::jsonb);
end $function$;

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
  if v_res.status = 'confirmed' and v_res.slot_id is not null then
    update public.availability_slots
      set confirmed_count = greatest(0, coalesce(confirmed_count, 0) - 1),
          is_available    = true
      where id = v_res.slot_id;
  end if;
  update public.reservations set status = 'cancelled' where id = p_reservation_id;
  perform public.log_audit('cancel_reservation_by_msw', p_reservation_id, jsonb_build_object('was_status', v_res.status));
end $function$;
