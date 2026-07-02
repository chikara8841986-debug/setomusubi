-- ============================================================================
-- Hardening migration 2026-05-06
-- 1. source check constraint
-- 2. Immutability triggers (profiles.role / businesses.approved,user_id /
--    hospitals.user_id / reservations.business_id,hospital_id,source,slot_id,status)
-- 3. RLS split (drop FOR ALL on profiles/businesses/hospitals owner;
--    drop direct UPDATE on reservations for business/msw)
-- 4. Atomic registration via auth.users AFTER INSERT trigger
-- 5. Reservation transaction RPCs (approve/reject/complete/cancel/phone)
-- 6. Storage: drop broad public read on business-images
-- 7. Cron: replace extensions.http_post -> net.http_post
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. source check constraint
-- ----------------------------------------------------------------------------
alter table public.reservations drop constraint if exists reservations_source_check;
alter table public.reservations
  add constraint reservations_source_check check (source in ('msw', 'phone'));

-- ----------------------------------------------------------------------------
-- 2. Immutability triggers
-- ----------------------------------------------------------------------------

-- profiles.id, profiles.role immutable
create or replace function public.guard_profile_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.id is distinct from new.id then
    raise exception 'profile_id_immutable';
  end if;
  if old.role is distinct from new.role then
    raise exception 'profile_role_immutable';
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_columns on public.profiles;
create trigger guard_profile_columns
  before update on public.profiles
  for each row execute function public.guard_profile_immutable();

-- businesses: owner cannot change user_id or approved (admin can)
create or replace function public.guard_business_owner_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_owner boolean := (auth.uid() = old.user_id);
begin
  if v_is_owner then
    if old.user_id is distinct from new.user_id then
      raise exception 'business_user_id_immutable';
    end if;
    if old.approved is distinct from new.approved then
      raise exception 'business_approved_owner_change_forbidden';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_business_columns on public.businesses;
create trigger guard_business_columns
  before update on public.businesses
  for each row execute function public.guard_business_owner_immutable();

-- hospitals: owner cannot change user_id (admin can)
create or replace function public.guard_hospital_owner_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_owner boolean := (auth.uid() = old.user_id);
begin
  if v_is_owner then
    if old.user_id is distinct from new.user_id then
      raise exception 'hospital_user_id_immutable';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_hospital_columns on public.hospitals;
create trigger guard_hospital_columns
  before update on public.hospitals
  for each row execute function public.guard_hospital_owner_immutable();

-- reservations: critical columns locked for non-admin direct UPDATE
-- (RPCs are security definer; this enforces immutability if any direct UPDATE leaks)
create or replace function public.guard_reservation_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_admin boolean;
begin
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') into v_is_admin;
  if v_is_admin then
    return new;
  end if;
  if old.business_id is distinct from new.business_id then raise exception 'reservation_business_id_immutable'; end if;
  if old.hospital_id is distinct from new.hospital_id then raise exception 'reservation_hospital_id_immutable'; end if;
  if old.source      is distinct from new.source      then raise exception 'reservation_source_immutable'; end if;
  if old.slot_id     is distinct from new.slot_id     then raise exception 'reservation_slot_id_immutable'; end if;
  if old.status      is distinct from new.status      then raise exception 'reservation_status_change_via_rpc_only'; end if;
  return new;
end $$;
drop trigger if exists guard_reservation_columns on public.reservations;
create trigger guard_reservation_columns
  before update on public.reservations
  for each row execute function public.guard_reservation_columns();

-- ----------------------------------------------------------------------------
-- 3. RLS policy split
-- ----------------------------------------------------------------------------

-- profiles
drop policy if exists "profiles: own row" on public.profiles;
create policy "profiles self select" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles self insert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles self update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- businesses
drop policy if exists "businesses: owner full access" on public.businesses;
create policy "businesses owner select" on public.businesses
  for select using (user_id = auth.uid());
create policy "businesses owner insert" on public.businesses
  for insert with check (user_id = auth.uid());
create policy "businesses owner update" on public.businesses
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "businesses owner delete" on public.businesses
  for delete using (user_id = auth.uid());

-- hospitals
drop policy if exists "hospitals: owner full access" on public.hospitals;
create policy "hospitals owner select" on public.hospitals
  for select using (user_id = auth.uid());
create policy "hospitals owner insert" on public.hospitals
  for insert with check (user_id = auth.uid());
create policy "hospitals owner update" on public.hospitals
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "hospitals owner delete" on public.hospitals
  for delete using (user_id = auth.uid());

-- reservations: drop direct UPDATE for business/msw (force RPC)
drop policy if exists "reservations: business update status" on public.reservations;
drop policy if exists "reservations: msw update own"        on public.reservations;
-- admin update remains for fix-up scenarios
-- slots: msw direct UPDATE no longer needed after RPC
drop policy if exists "slots: msw update for booking" on public.availability_slots;

-- ----------------------------------------------------------------------------
-- 4. Atomic registration via auth.users AFTER INSERT trigger
-- ----------------------------------------------------------------------------
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

  -- Admin invite flow has no role metadata → skip; admin role assigned manually.
  if v_role is null then
    return new;
  end if;

  -- Whitelist signup roles. 'admin' must NEVER be self-assigned.
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

-- ----------------------------------------------------------------------------
-- 5. Reservation transaction RPCs
-- ----------------------------------------------------------------------------

-- approve_reservation: business owner approves a pending request.
-- Increments slot.confirmed_count, sets is_available=false if full,
-- auto-rejects other pending siblings on the same slot when full.
-- Returns: number of auto-rejected siblings.
create or replace function public.approve_reservation(p_reservation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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

-- reject_reservation: business owner rejects a pending request
create or replace function public.reject_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

-- complete_reservation: business owner marks a confirmed reservation as completed
create or replace function public.complete_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

-- cancel_reservation_by_msw: hospital owner cancels their pending or confirmed reservation
create or replace function public.cancel_reservation_by_msw(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
end $$;
grant execute on function public.cancel_reservation_by_msw(uuid) to authenticated;

-- create_phone_reservation: business records a phone-call reservation
-- (slot+reservation in one transaction, both confirmed)
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
language plpgsql
security definer
set search_path = public
as $$
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

-- ----------------------------------------------------------------------------
-- 6. Storage: drop broad public read (advisor: public_bucket_allows_listing)
--   Public URLs via /storage/v1/object/public/... still work without RLS.
-- ----------------------------------------------------------------------------
drop policy if exists "business images: public read" on storage.objects;

-- ----------------------------------------------------------------------------
-- 7. Cron: replace extensions.http_post -> net.http_post
-- ----------------------------------------------------------------------------
do $cronfix$
begin
  if exists (select 1 from cron.job where jobname = 'send-reminder-hourly') then
    perform cron.unschedule('send-reminder-hourly');
  end if;
end $cronfix$;

select cron.schedule(
  'send-reminder-hourly',
  '0 * * * *',
  $cronbody$select net.http_post(url := 'https://lcuoeekhnmbhomcdbedi.supabase.co/functions/v1/send-reminder', body := '{}'::jsonb);$cronbody$
);
