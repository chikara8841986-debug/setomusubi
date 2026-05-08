-- =====================================================
-- せとむすび データベーススキーマ（本番DBと同期）
-- Supabase SQL Editor で実行してください（新規環境構築用）
-- 既存環境のマイグレーションは Supabase Dashboard > Migrations を参照
-- =====================================================

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "pgcrypto"  with schema extensions;
-- pg_net / pg_cron は Supabase 既定で有効

-- =====================================================
-- profiles (auth.users と 1:1)
-- =====================================================
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  role text not null check (role in ('business', 'msw', 'admin')),
  created_at timestamptz default now() not null
);

alter table profiles enable row level security;

-- 自分の行のみ SELECT/INSERT/UPDATE 可（DELETE は ON DELETE CASCADE で代替）
drop policy if exists "profiles self select" on profiles;
drop policy if exists "profiles self insert" on profiles;
drop policy if exists "profiles self update" on profiles;
drop policy if exists "profiles: admin read all" on profiles;
create policy "profiles self select" on profiles
  for select using (auth.uid() = id);
create policy "profiles self insert" on profiles
  for insert with check (auth.uid() = id);
create policy "profiles self update" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles: admin read all" on profiles
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- profiles.id, profiles.role は変更不可（owner も admin もアプリ層から触らない）
create or replace function public.guard_profile_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.id   is distinct from new.id   then raise exception 'profile_id_immutable';   end if;
  if old.role is distinct from new.role then raise exception 'profile_role_immutable'; end if;
  return new;
end $$;
drop trigger if exists guard_profile_columns on profiles;
create trigger guard_profile_columns before update on profiles
  for each row execute function public.guard_profile_immutable();

-- =====================================================
-- businesses
-- =====================================================
create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade unique not null,
  name text not null,
  address text,
  phone text,
  service_areas text[] not null default '{}',
  business_hours_start time,
  business_hours_end time,
  closed_days integer[] not null default '{}',
  has_wheelchair boolean not null default false,
  has_reclining_wheelchair boolean not null default false,
  has_stretcher boolean not null default false,
  rental_wheelchair boolean not null default false,
  rental_reclining_wheelchair boolean not null default false,
  rental_stretcher boolean not null default false,
  has_female_caregiver boolean not null default false,
  long_distance boolean not null default false,
  same_day boolean not null default false,
  qualifications text,
  pricing text,
  cancel_phone text,
  website_url text,
  profile_image_url text,
  vehicle_image_urls text[] not null default '{}',
  pr_text text,
  approved boolean not null default false,
  created_at timestamptz default now() not null
);

alter table businesses enable row level security;

drop policy if exists "businesses owner select" on businesses;
drop policy if exists "businesses owner insert" on businesses;
drop policy if exists "businesses owner update" on businesses;
drop policy if exists "businesses owner delete" on businesses;
drop policy if exists "businesses: msw read approved" on businesses;
drop policy if exists "businesses: admin full access" on businesses;
create policy "businesses owner select" on businesses
  for select using (user_id = auth.uid());
create policy "businesses owner insert" on businesses
  for insert with check (user_id = auth.uid());
create policy "businesses owner update" on businesses
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "businesses owner delete" on businesses
  for delete using (user_id = auth.uid());
create policy "businesses: msw read approved" on businesses
  for select using (
    approved = true and
    exists (select 1 from profiles where id = auth.uid() and role = 'msw')
  );
create policy "businesses: admin full access" on businesses
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- owner は user_id / approved を変更不可（admin はアプリ層から approved を切り替える）
create or replace function public.guard_business_owner_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_is_owner boolean := (auth.uid() = old.user_id);
begin
  if v_is_owner then
    if old.user_id  is distinct from new.user_id  then raise exception 'business_user_id_immutable'; end if;
    if old.approved is distinct from new.approved then raise exception 'business_approved_owner_change_forbidden'; end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_business_columns on businesses;
create trigger guard_business_columns before update on businesses
  for each row execute function public.guard_business_owner_immutable();

-- =====================================================
-- hospitals
-- =====================================================
create table if not exists hospitals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade unique not null,
  name text not null,
  address text,
  phone text,
  created_at timestamptz default now() not null
);

alter table hospitals enable row level security;

drop policy if exists "hospitals owner select" on hospitals;
drop policy if exists "hospitals owner insert" on hospitals;
drop policy if exists "hospitals owner update" on hospitals;
drop policy if exists "hospitals owner delete" on hospitals;
drop policy if exists "hospitals: business read" on hospitals;
drop policy if exists "hospitals: admin full access" on hospitals;
create policy "hospitals owner select" on hospitals
  for select using (user_id = auth.uid());
create policy "hospitals owner insert" on hospitals
  for insert with check (user_id = auth.uid());
create policy "hospitals owner update" on hospitals
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "hospitals owner delete" on hospitals
  for delete using (user_id = auth.uid());
create policy "hospitals: business read" on hospitals
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'business')
  );
create policy "hospitals: admin full access" on hospitals
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create or replace function public.guard_hospital_owner_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_is_owner boolean := (auth.uid() = old.user_id);
begin
  if v_is_owner then
    if old.user_id is distinct from new.user_id then raise exception 'hospital_user_id_immutable'; end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_hospital_columns on hospitals;
create trigger guard_hospital_columns before update on hospitals
  for each row execute function public.guard_hospital_owner_immutable();

-- =====================================================
-- msw_contacts
-- =====================================================
create table if not exists msw_contacts (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid references hospitals(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now() not null
);

alter table msw_contacts enable row level security;

drop policy if exists "msw_contacts: hospital owner full access" on msw_contacts;
create policy "msw_contacts: hospital owner full access" on msw_contacts
  for all using (
    exists (
      select 1 from hospitals h where h.id = hospital_id and h.user_id = auth.uid()
    )
  );

-- =====================================================
-- favorites (MSWがお気に入り登録した事業所)
-- =====================================================
create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid references hospitals(id) on delete cascade not null,
  business_id uuid references businesses(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  unique (hospital_id, business_id)
);

alter table favorites enable row level security;

drop policy if exists "favorites: hospital owner full access" on favorites;
create policy "favorites: hospital owner full access" on favorites
  for all using (
    exists (
      select 1 from hospitals h where h.id = hospital_id and h.user_id = auth.uid()
    )
  );

-- =====================================================
-- availability_slots
-- =====================================================
create table if not exists availability_slots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  is_available boolean not null default true,
  capacity integer not null default 1,
  confirmed_count integer not null default 0,
  created_at timestamptz default now() not null
);

alter table availability_slots enable row level security;

drop policy if exists "slots: business owner full access" on availability_slots;
drop policy if exists "slots: msw read available" on availability_slots;
create policy "slots: business owner full access" on availability_slots
  for all using (
    exists (
      select 1 from businesses b where b.id = business_id and b.user_id = auth.uid()
    )
  );
create policy "slots: msw read available" on availability_slots
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'msw')
  );
-- 注: かつての "slots: msw update for booking" は廃止。
-- MSWの予約取消は cancel_reservation_by_msw() RPC が行う。

-- =====================================================
-- reservations
-- =====================================================
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete restrict not null,
  hospital_id uuid references hospitals(id) on delete restrict, -- nullable: 電話予約は null
  slot_id uuid references availability_slots(id) on delete set null,
  source text not null default 'msw' check (source in ('msw', 'phone')),
  caller_name text,    -- 電話予約の連絡者名
  caller_phone text,   -- 電話予約の連絡先
  contact_name text not null,
  patient_name text not null,
  patient_address text not null,
  destination text not null,
  equipment text not null check (equipment in ('wheelchair', 'reclining_wheelchair', 'stretcher')),
  equipment_rental boolean not null default false,
  notes text,
  reservation_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'rejected')),
  reminder_sent boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Realtime の old レコードに全カラムを含める（承認通知に必要）
alter table reservations replica identity full;

-- updated_at 自動更新トリガー
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists reservations_set_updated_at on reservations;
create trigger reservations_set_updated_at
  before update on reservations
  for each row execute function set_updated_at();

alter table reservations enable row level security;

drop policy if exists "reservations: business read own" on reservations;
drop policy if exists "reservations: msw insert" on reservations;
drop policy if exists "reservations: msw read own" on reservations;
drop policy if exists "reservations: admin read all" on reservations;
drop policy if exists "reservations: admin update all" on reservations;
drop policy if exists "business can insert phone reservations" on reservations;
-- 注: 旧 "reservations: business update status" / "reservations: msw update own" は廃止。
-- 直接 UPDATE は禁止。すべての status 変更は RPC（approve/reject/complete/cancel）経由。

create policy "reservations: business read own" on reservations
  for select using (
    exists (select 1 from businesses b where b.id = business_id and b.user_id = auth.uid())
  );
-- MSW（仮予約申請）
create policy "reservations: msw insert" on reservations
  for insert with check (
    exists (select 1 from hospitals h where h.id = hospital_id and h.user_id = auth.uid())
  );
create policy "reservations: msw read own" on reservations
  for select using (
    exists (select 1 from hospitals h where h.id = hospital_id and h.user_id = auth.uid())
  );
-- 事業所による電話予約は create_phone_reservation() RPC で作成するが、
-- 念のため直接 INSERT も許可（旧 migration 互換）
create policy "business can insert phone reservations" on reservations
  for insert to authenticated with check (
    exists (select 1 from businesses where id = business_id and user_id = auth.uid())
  );
-- admin
create policy "reservations: admin read all" on reservations
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
create policy "reservations: admin update all" on reservations
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- 列ロック: business_id / hospital_id / source / slot_id / status は非adminから変更不可
create or replace function public.guard_reservation_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_is_admin boolean;
begin
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin') into v_is_admin;
  if v_is_admin then return new; end if;
  if old.business_id is distinct from new.business_id then raise exception 'reservation_business_id_immutable'; end if;
  if old.hospital_id is distinct from new.hospital_id then raise exception 'reservation_hospital_id_immutable'; end if;
  if old.source      is distinct from new.source      then raise exception 'reservation_source_immutable'; end if;
  if old.slot_id     is distinct from new.slot_id     then raise exception 'reservation_slot_id_immutable'; end if;
  if old.status      is distinct from new.status      then raise exception 'reservation_status_change_via_rpc_only'; end if;
  return new;
end $$;
drop trigger if exists guard_reservation_columns on reservations;
create trigger guard_reservation_columns before update on reservations
  for each row execute function public.guard_reservation_columns();

-- =====================================================
-- vehicles（事業所の車両）
-- =====================================================
create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  notes text,
  active boolean not null default true,
  sort_order integer not null default 0,
  has_wheelchair boolean not null default false,
  has_reclining_wheelchair boolean not null default false,
  has_stretcher boolean not null default false,
  rental_wheelchair boolean not null default false,
  rental_reclining_wheelchair boolean not null default false,
  rental_stretcher boolean not null default false,
  created_at timestamptz default now() not null
);

alter table vehicles enable row level security;

drop policy if exists "vehicles: business owner all" on vehicles;
drop policy if exists "vehicles: msw read approved" on vehicles;
create policy "vehicles: business owner all" on vehicles
  for all using (
    exists (select 1 from businesses b where b.id = business_id and b.user_id = auth.uid())
  );
create policy "vehicles: msw read approved" on vehicles
  for select using (
    exists (select 1 from businesses b where b.id = business_id and b.approved = true)
    and exists (select 1 from hospitals h where h.user_id = auth.uid())
  );

-- =====================================================
-- occupied_slots（車両の稼働ブロック）
-- ダブルブッキング防止: btree_gist + EXCLUDE 制約で重複時間帯を DB レベルで弾く
-- =====================================================
create extension if not exists "btree_gist" with schema extensions;

create table if not exists occupied_slots (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  reservation_id uuid references reservations(id) on delete set null,
  created_at timestamptz default now() not null,
  -- 同車両・同日に重複する時間帯のスロットを DB レベルで禁止
  constraint occupied_slots_no_overlap
    exclude using gist (
      vehicle_id with =,
      date with =,
      make_tsrange(
        (date::text || ' ' || start_time::text)::timestamptz,
        (date::text || ' ' || end_time::text)::timestamptz
      ) with &&
    )
);

-- IMMUTABLE ラッパー（EXCLUDE 制約で使うために必要）
create or replace function make_tsrange(a timestamptz, b timestamptz)
returns tstzrange language sql immutable as $$
  select tstzrange(a, b, '[)')
$$;

alter table occupied_slots enable row level security;

drop policy if exists "occupied_slots_owner_all" on occupied_slots;
drop policy if exists "occupied_slots_msw_read" on occupied_slots;
-- 事業所オーナーのみ直接操作可。MSW からの INSERT は trg_auto_create_occupied_slot で行う。
create policy "occupied_slots_owner_all" on occupied_slots
  for all using (
    exists (
      select 1 from vehicles v
      join businesses b on b.id = v.business_id
      where v.id = vehicle_id and b.user_id = auth.uid()
    )
  );
-- MSW は参照のみ（空き検索で利用）
create policy "occupied_slots_msw_read" on occupied_slots
  for select using (
    exists (select 1 from hospitals h where h.user_id = auth.uid())
  );

-- =====================================================
-- occupied_slots 自動管理トリガー（SECURITY DEFINER で RLS を迂回）
-- MSW が reservations に INSERT しても RLS で occupied_slots を直接触れないため、
-- DB トリガーで自動作成・削除する。
-- =====================================================

-- 予約作成時: pending/confirmed かつ vehicle_id あり → occupied_slot を自動作成
create or replace function auto_create_occupied_slot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.vehicle_id is not null and new.status in ('pending', 'confirmed') then
    insert into occupied_slots (vehicle_id, date, start_time, end_time, reservation_id)
    values (new.vehicle_id, new.reservation_date, new.start_time, new.end_time, new.id)
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_auto_create_occupied_slot on reservations;
create trigger trg_auto_create_occupied_slot
  after insert on reservations
  for each row execute function auto_create_occupied_slot();

-- 予約キャンセル/却下時: occupied_slot を自動削除して仮押さえを解放
create or replace function auto_delete_occupied_slot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('rejected', 'cancelled')
     and old.status not in ('rejected', 'cancelled') then
    delete from occupied_slots where reservation_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_auto_delete_occupied_slot on reservations;
create trigger trg_auto_delete_occupied_slot
  after update on reservations
  for each row execute function auto_delete_occupied_slot();

-- =====================================================
-- Realtime
-- =====================================================
alter publication supabase_realtime add table availability_slots;
alter publication supabase_realtime add table reservations;

-- =====================================================
-- Indexes
-- =====================================================
create index if not exists idx_availability_slots_business_date
  on availability_slots (business_id, date);

create index if not exists idx_availability_slots_available
  on availability_slots (date, is_available)
  where is_available = true;

create index if not exists idx_reservations_business
  on reservations (business_id, reservation_date);

create index if not exists idx_reservations_hospital
  on reservations (hospital_id, reservation_date);

create index if not exists idx_reservations_reminder
  on reservations (reservation_date, start_time, status, reminder_sent)
  where status = 'confirmed' and reminder_sent = false;

-- =====================================================
-- 登録トリガ：auth.users INSERT で原子的に profiles/businesses/hospitals を作成
-- クライアントは supabase.auth.signUp({ options: { data: { role, ... } } }) を呼ぶだけ。
-- 'admin' は signUp 経由では作成不可（手動で profiles に INSERT する）。
-- =====================================================
create or replace function public.handle_new_user_registration()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_hospital_id uuid;
begin
  v_role := new.raw_user_meta_data->>'role';

  -- Admin の Invite フローは role メタデータがないので skip（手動セットアップ）
  if v_role is null then
    return new;
  end if;

  if v_role not in ('business', 'msw') then
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

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user_registration();

-- =====================================================
-- Reservation RPCs (security definer + transactional)
-- 事業所/MSW のクライアントは status 変更時に必ずこれを呼ぶ。
-- =====================================================

-- 承認: pending → confirmed。slot.confirmed_count 加算、
--      満車になったら同 slot の他 pending を自動却下。
-- Returns: 自動却下した件数
create or replace function public.approve_reservation(p_reservation_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_res    public.reservations%rowtype;
  v_slot   public.availability_slots%rowtype;
  v_capacity int;
  v_new_count int;
  v_auto_rejected int := 0;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if v_res.status <> 'pending' then raise exception 'reservation_not_pending'; end if;
  if not exists (select 1 from public.businesses where id = v_res.business_id and user_id = v_caller) then
    raise exception 'reservation_approve_unauthorized';
  end if;

  if v_res.slot_id is not null then
    select * into v_slot from public.availability_slots where id = v_res.slot_id for update;
    if found then
      v_capacity  := coalesce(v_slot.capacity, 1);
      v_new_count := coalesce(v_slot.confirmed_count, 0) + 1;
      update public.availability_slots
        set confirmed_count = v_new_count,
            is_available    = (v_new_count < v_capacity)
        where id = v_slot.id;
      if v_new_count >= v_capacity then
        with rejected as (
          update public.reservations
            set status = 'rejected'
            where slot_id = v_res.slot_id
              and status = 'pending'
              and id <> p_reservation_id
            returning id
        )
        select count(*) into v_auto_rejected from rejected;
      end if;
    end if;
  end if;

  update public.reservations set status = 'confirmed' where id = p_reservation_id;
  return v_auto_rejected;
end $$;
grant execute on function public.approve_reservation(uuid) to authenticated;

-- 却下: pending → rejected
create or replace function public.reject_reservation(p_reservation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_res public.reservations%rowtype;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if v_res.status <> 'pending' then raise exception 'reservation_not_pending'; end if;
  if not exists (select 1 from public.businesses where id = v_res.business_id and user_id = v_caller) then
    raise exception 'reservation_reject_unauthorized';
  end if;
  update public.reservations set status = 'rejected' where id = p_reservation_id;
end $$;
grant execute on function public.reject_reservation(uuid) to authenticated;

-- 完了: confirmed → completed。slot.confirmed_count 減算、is_available=true。
create or replace function public.complete_reservation(p_reservation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
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
end $$;
grant execute on function public.complete_reservation(uuid) to authenticated;

-- MSW キャンセル: pending/confirmed → cancelled。confirmed の場合 slot 解放。
create or replace function public.cancel_reservation_by_msw(p_reservation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_res public.reservations%rowtype;
begin
  select * into v_res from public.reservations where id = p_reservation_id for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if v_res.status not in ('pending', 'confirmed') then raise exception 'reservation_not_cancellable'; end if;
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
end $$;
grant execute on function public.cancel_reservation_by_msw(uuid) to authenticated;

-- 電話予約: 事業所がスロット作成と confirmed 予約を1トランザクションで作成
create or replace function public.create_phone_reservation(
  p_date date,
  p_start_time time,
  p_end_time time,
  p_caller_name text,
  p_caller_phone text,
  p_patient_name text,
  p_patient_address text,
  p_destination text,
  p_equipment text,
  p_equipment_rental boolean,
  p_notes text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_business_id uuid;
  v_slot_id uuid;
  v_res_id uuid;
begin
  select id into v_business_id from public.businesses where user_id = v_caller;
  if v_business_id is null then raise exception 'phone_reservation_no_business'; end if;
  if p_start_time >= p_end_time then raise exception 'phone_reservation_invalid_time'; end if;
  if p_equipment not in ('wheelchair','reclining_wheelchair','stretcher') then
    raise exception 'phone_reservation_invalid_equipment';
  end if;

  insert into public.availability_slots(
    business_id, date, start_time, end_time, is_available, capacity, confirmed_count
  ) values (
    v_business_id, p_date, p_start_time, p_end_time, false, 1, 1
  ) returning id into v_slot_id;

  insert into public.reservations(
    business_id, hospital_id, slot_id, source, status,
    contact_name, caller_name, caller_phone,
    patient_name, patient_address, destination,
    equipment, equipment_rental, notes,
    reservation_date, start_time, end_time
  ) values (
    v_business_id, null, v_slot_id, 'phone', 'confirmed',
    coalesce(nullif(trim(p_caller_name), ''), '電話予約'),
    nullif(trim(p_caller_name), ''),
    nullif(trim(p_caller_phone), ''),
    trim(p_patient_name), trim(p_patient_address), trim(p_destination),
    p_equipment, coalesce(p_equipment_rental, false), nullif(trim(p_notes), ''),
    p_date, p_start_time, p_end_time
  ) returning id into v_res_id;

  return v_res_id;
end $$;
grant execute on function public.create_phone_reservation(date, time, time, text, text, text, text, text, text, boolean, text) to authenticated;

-- =====================================================
-- Storage: business-images bucket
-- 公開バケット（CDN URL でアクセス）。SELECT policy は意図的に持たない
-- （advisor: public_bucket_allows_listing 対応 — 一覧 API は無効化）。
-- INSERT/DELETE のみ owner に許可。UPDATE 不要（アップロードは upsert:false）。
-- =====================================================
-- Dashboard で bucket 作成後に以下を実行（新規環境のみ）:
-- insert into storage.buckets (id, name, public) values ('business-images', 'business-images', true);
--
-- create policy "business images: owner upload" on storage.objects
--   for insert with check (
--     bucket_id = 'business-images' and (storage.foldername(name))[1] = auth.uid()::text
--   );
-- create policy "business images: owner delete" on storage.objects
--   for delete using (
--     bucket_id = 'business-images' and (storage.foldername(name))[1] = auth.uid()::text
--   );
-- 注: SELECT policy は付けない（公開URLは /storage/v1/object/public/ 経由でアクセス可能）

-- =====================================================
-- Cron: send-reminder を毎時0分に実行
-- =====================================================
-- do $cronfix$
-- begin
--   if exists (select 1 from cron.job where jobname = 'send-reminder-hourly') then
--     perform cron.unschedule('send-reminder-hourly');
--   end if;
-- end $cronfix$;
--
-- select cron.schedule(
--   'send-reminder-hourly',
--   '0 * * * *',
--   $cmd$select net.http_post(url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminder', body := '{}'::jsonb);$cmd$
-- );

-- =====================================================
-- Admin user setup
-- Supabase Auth > Users > Invite で管理者メールを招待した後:
-- insert into profiles (id, role) values ('<admin-user-id>', 'admin');
-- =====================================================

-- =====================================================
-- Billing: 課金システム（事業所向けサブスク＋従量課金）
-- =====================================================

-- businesses テーブルに課金フィールドを追加
alter table businesses
  add column if not exists stripe_customer_id       text,
  add column if not exists subscription_status      text not null default 'none'
    check (subscription_status in ('none','trialing','active','past_due','canceled')),
  add column if not exists subscription_period_end  timestamptz,
  add column if not exists trial_ends_at            timestamptz;

-- オーナーが自分で課金ステータスを書き換えられないようガード更新
-- （サービスロールキーで動く Stripe Webhook のみが更新できる）
create or replace function public.guard_business_owner_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_is_owner boolean := (auth.uid() = old.user_id);
begin
  if v_is_owner then
    if old.user_id              is distinct from new.user_id              then raise exception 'business_user_id_immutable'; end if;
    if old.approved             is distinct from new.approved             then raise exception 'business_approved_owner_change_forbidden'; end if;
    if old.subscription_status  is distinct from new.subscription_status  then raise exception 'business_subscription_status_owner_change_forbidden'; end if;
    if old.stripe_customer_id   is distinct from new.stripe_customer_id   then raise exception 'business_stripe_customer_id_owner_change_forbidden'; end if;
    if old.subscription_period_end is distinct from new.subscription_period_end then raise exception 'business_subscription_period_end_owner_change_forbidden'; end if;
    if old.trial_ends_at        is distinct from new.trial_ends_at        then raise exception 'business_trial_ends_at_owner_change_forbidden'; end if;
  end if;
  return new;
end $$;

-- =====================================================
-- billing_events（予約ごとの従量課金記録）
-- =====================================================
create table if not exists billing_events (
  id                      uuid primary key default gen_random_uuid(),
  business_id             uuid references businesses(id) on delete cascade not null,
  reservation_id          uuid references reservations(id) on delete set null,
  event_type              text not null check (event_type in ('reservation_fee','subscription')),
  amount                  integer not null default 300, -- JPY（税込）
  stripe_invoice_id       text,
  stripe_payment_intent_id text,
  status                  text not null default 'pending'
    check (status in ('pending','paid','failed','waived')),
  created_at              timestamptz default now() not null
);

alter table billing_events enable row level security;

drop policy if exists "billing_events: business owner read" on billing_events;
drop policy if exists "billing_events: admin full access" on billing_events;
create policy "billing_events: business owner read" on billing_events
  for select using (
    exists (select 1 from businesses b where b.id = business_id and b.user_id = auth.uid())
  );
create policy "billing_events: admin full access" on billing_events
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create index if not exists idx_billing_events_business
  on billing_events (business_id, created_at desc);
create index if not exists idx_billing_events_reservation
  on billing_events (reservation_id);

-- pending → confirmed になったときに billing_event を自動作成（従量課金の記録）
create or replace function auto_create_billing_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'confirmed' and old.status = 'pending' then
    insert into billing_events (business_id, reservation_id, event_type, amount, status)
    values (new.business_id, new.id, 'reservation_fee', 300, 'pending');
  end if;
  return new;
end $$;

drop trigger if exists trg_auto_create_billing_event on reservations;
create trigger trg_auto_create_billing_event
  after update on reservations
  for each row execute function auto_create_billing_event();
