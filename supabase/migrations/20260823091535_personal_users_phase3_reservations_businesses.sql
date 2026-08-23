-- Phase 3 (区分B: 個人利用者) + 事業所側スイッチ
-- GENERAL_USERS_PLAN.md §4, §5 準拠。既存のRLS/RPC/トリガは変更せず「純粋な追加」を基本方針とする。
-- 例外: guard_reservation_columns と handle_new_user_registration は既存関数の CREATE OR REPLACE
--       （新ロール・新RPCを許可リストに追加するため。ロジックの削除・変更は行わない）。

-- ============================================================
-- 1) profiles.role に 'personal' を追加
-- ============================================================
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('business', 'msw', 'admin', 'personal'));

-- ============================================================
-- 2) 登録トリガのホワイトリストに 'personal' を追加。
--    role='personal' のときは profiles 行のみ INSERT し、hospitals/businesses 行は作らない。
--    'admin' は引き続きホワイトリスト外（自己申告での付与は不可のまま）。
-- ============================================================
create or replace function public.handle_new_user_registration()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'auth'
as $function$
declare
  v_role text;
  v_hospital_id uuid;
begin
  v_role := new.raw_user_meta_data->>'role';

  -- Admin invite flow has no role metadata → skip; admin role assigned manually.
  if v_role is null then
    return new;
  end if;

  -- Whitelist signup roles. 'admin' must NEVER be self-assigned.
  if v_role not in ('business', 'msw', 'personal') then
    raise exception 'registration_invalid_role: %', v_role;
  end if;

  insert into public.profiles(id, role) values (new.id, v_role);

  if v_role = 'business' then
    insert into public.businesses(user_id, name, phone, approved, service_areas, closed_days)
    values (
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data->>'business_name'), ''), '(未設定)'),
      nullif(trim(new.raw_user_meta_data->>'business_phone'), ''),
      false,
      '{}'::text[],
      '{}'::int[]
    );
  elsif v_role = 'msw' then
    insert into public.hospitals(user_id, name, address, phone)
    values (
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data->>'hospital_name'), ''), '(未設定)'),
      nullif(trim(new.raw_user_meta_data->>'hospital_address'), ''),
      nullif(trim(new.raw_user_meta_data->>'hospital_phone'), '')
    )
    returning id into v_hospital_id;

    if nullif(trim(new.raw_user_meta_data->>'contact_name'), '') is not null then
      insert into public.msw_contacts(hospital_id, name)
      values (v_hospital_id, trim(new.raw_user_meta_data->>'contact_name'));
    end if;
  end if;
  -- v_role = 'personal' の場合はここで何もしない（hospitals/businesses 行を作らない）。

  return new;
end $function$;

-- ============================================================
-- 3) reservations.requester_user_id を追加（個人予約の申込者を直接紐づける）
-- ============================================================
alter table public.reservations
  add column requester_user_id uuid references auth.users(id);

create index if not exists idx_reservations_requester_user_id
  on public.reservations(requester_user_id)
  where requester_user_id is not null;

-- ============================================================
-- 4) reservations.source に 'personal' を追加
-- ============================================================
alter table public.reservations drop constraint reservations_source_check;
alter table public.reservations add constraint reservations_source_check
  check (source in ('msw', 'phone', 'personal'));

-- ============================================================
-- 5) businesses.accepts_personal_requests スイッチ（デフォルト false = オプトイン）
-- ============================================================
alter table public.businesses
  add column accepts_personal_requests boolean not null default false;

-- ============================================================
-- 6) 個人利用者向け RLS（既存ポリシーは一切変更しない・純粋な追加）
-- ============================================================

-- 6-a. businesses: 個人利用者は「承認済み かつ 個人予約受付ON」の事業所のみ閲覧可。
--      これは検索画面のためだけでなく、下の reservations INSERT ポリシーの EXISTS 副問い合わせが
--      RLS を素通りせず正しく評価されるために必須（RLSのSELECTポリシーは副問い合わせにも適用される）。
create policy "businesses: personal read accepting" on public.businesses
  for select using (
    approved = true
    and accepts_personal_requests = true
    and exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'personal'
    )
  );

-- 6-b. reservations: 個人利用者は自分が申込者(requester_user_id)の予約だけ読める。
create policy "reservations: personal read own" on public.reservations
  for select using (requester_user_id = auth.uid());

-- 6-c. reservations: 個人利用者は「受付ONの承認済み事業所」にのみ、自分名義・source='personal'・
--      hospital_id なしの予約を作成できる。事業所側スイッチの判定をRLS側にも明示的に書く。
create policy "reservations: personal insert" on public.reservations
  for insert with check (
    requester_user_id = auth.uid()
    and source = 'personal'
    and hospital_id is null
    and exists (
      select 1 from public.businesses b
      where b.id = business_id
        and b.approved = true
        and b.accepts_personal_requests = true
    )
  );

-- ============================================================
-- 7) cancel_reservation_by_personal RPC（cancel_reservation_by_msw と同構造）
-- ============================================================
create or replace function public.cancel_reservation_by_personal(p_reservation_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_caller uuid := auth.uid();
  v_res public.reservations%rowtype;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if v_res.status not in ('pending', 'confirmed') then
    raise exception 'reservation_not_cancellable';
  end if;
  if v_res.requester_user_id is null or v_res.requester_user_id <> v_caller then
    raise exception 'reservation_cancel_unauthorized';
  end if;
  perform set_config('app.rpc_context', 'cancel_reservation_by_personal', true);
  if v_res.status = 'confirmed' and v_res.slot_id is not null then
    update public.availability_slots
      set confirmed_count = greatest(0, coalesce(confirmed_count, 0) - 1),
          is_available    = true
      where id = v_res.slot_id;
  end if;
  update public.reservations set status = 'cancelled' where id = p_reservation_id;
  perform public.log_audit('cancel_reservation_by_personal', p_reservation_id, jsonb_build_object('was_status', v_res.status));
end $function$;

revoke all on function public.cancel_reservation_by_personal(uuid) from public;
grant execute on function public.cancel_reservation_by_personal(uuid) to authenticated, service_role;

-- ============================================================
-- 8) guard_reservation_columns の許可リストに cancel_reservation_by_personal を追加。
--    忘れると本番でキャンセルが全部弾かれる（RISK_REGISTER A5参照）。
--    あわせて requester_user_id も他の識別列(business_id/hospital_id/source/slot_id)と
--    同様に「RPC経由の正規UPDATE以外では変更不可」とはせず、単純に不変列として保護する
--    （事業所側のUPDATEポリシーから他人の予約に付け替えられるのを防ぐ）。
-- ============================================================
create or replace function public.guard_reservation_columns()
 returns trigger
 language plpgsql
as $function$
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
  IF OLD.requester_user_id IS DISTINCT FROM NEW.requester_user_id THEN RAISE EXCEPTION 'reservation_requester_user_id_immutable'; END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_rpc_ctx := current_setting('app.rpc_context', true);
    IF COALESCE(v_rpc_ctx, '') NOT IN (
      'approve_reservation', 'reject_reservation', 'complete_reservation',
      'cancel_reservation_by_msw', 'cancel_reservation_by_business', 'expire_reservation',
      'cancel_reservation_by_personal'
    ) THEN
      RAISE EXCEPTION 'reservation_status_change_via_rpc_only';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
