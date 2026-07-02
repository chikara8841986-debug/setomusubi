-- A1修正: 電話予約で車両を必須指定し、occupied_slots経由の占有を確実にする。
-- 旧シグネチャ(vehicle_idなし)を廃止し、新シグネチャに置き換える。
drop function if exists public.create_phone_reservation(
  date, time without time zone, time without time zone,
  text, text, text, text, text, text, boolean, text
);

create or replace function public.create_phone_reservation(
  p_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_caller_name text,
  p_caller_phone text,
  p_patient_name text,
  p_patient_address text,
  p_destination text,
  p_equipment text,
  p_equipment_rental boolean,
  p_notes text,
  p_vehicle_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller uuid := auth.uid();
  v_business_id uuid;
  v_res_id uuid;
begin
  select id into v_business_id from public.businesses where user_id = v_caller;
  if v_business_id is null then raise exception 'phone_reservation_no_business'; end if;
  if p_start_time >= p_end_time then raise exception 'phone_reservation_invalid_time'; end if;
  if p_equipment not in ('wheelchair','reclining_wheelchair','stretcher') then
    raise exception 'phone_reservation_invalid_equipment';
  end if;
  if p_vehicle_id is null then raise exception 'phone_reservation_no_vehicle'; end if;

  if not exists (
    select 1 from public.vehicles
    where id = p_vehicle_id and business_id = v_business_id and active
  ) then
    raise exception 'phone_reservation_invalid_vehicle';
  end if;

  -- 同一車両への同時登録をシリアライズしてTOCTOUを塞ぐ
  perform pg_advisory_xact_lock(hashtextextended(p_vehicle_id::text, 0));

  if exists (
    select 1 from public.occupied_slots
    where vehicle_id = p_vehicle_id
      and slot_tsrange(date, start_time, end_time)
          && slot_tsrange(p_date, p_start_time, p_end_time)
  ) then
    raise exception 'phone_reservation_slot_conflict';
  end if;

  insert into public.reservations(
    business_id, hospital_id, slot_id, vehicle_id, source, status,
    contact_name, caller_name, caller_phone,
    patient_name, patient_address, destination,
    equipment, equipment_rental, notes,
    reservation_date, start_time, end_time
  ) values (
    v_business_id, null, null, p_vehicle_id, 'phone', 'confirmed',
    coalesce(nullif(trim(p_caller_name), ''), '電話予約'),
    nullif(trim(p_caller_name), ''),
    nullif(trim(p_caller_phone), ''),
    trim(p_patient_name), trim(p_patient_address), trim(p_destination),
    p_equipment, coalesce(p_equipment_rental, false), nullif(trim(p_notes), ''),
    p_date, p_start_time, p_end_time
  ) returning id into v_res_id;

  return v_res_id;
exception
  when exclusion_violation then
    raise exception 'phone_reservation_slot_conflict';
end
$function$;
