-- =====================================================
-- せとむすび データベーススキーマ
-- Supabase SQL Editor で実行してください
-- =====================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =====================================================
-- profiles (auth.usersと1:1)
-- =====================================================
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  role text not null check (role in ('business', 'msw', 'admin')),
  created_at timestamptz default now() not null
);

alter table profiles enable row level security;

create policy "profiles: own row" on profiles
  for all using (auth.uid() = id);

create policy "profiles: admin read all" on profiles
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

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

-- Own business: full access
create policy "businesses: owner full access" on businesses
  for all using (user_id = auth.uid());

-- MSW: read approved businesses
create policy "businesses: msw read approved" on businesses
  for select using (
    approved = true and
    exists (select 1 from profiles where id = auth.uid() and role = 'msw')
  );

-- Admin: full access
create policy "businesses: admin full access" on businesses
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

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

create policy "hospitals: owner full access" on hospitals
  for all using (user_id = auth.uid());

create policy "hospitals: business read" on hospitals
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'business')
  );

create policy "hospitals: admin full access" on hospitals
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

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
  capacity integer not null default 1,          -- 対応可能な台数
  confirmed_count integer not null default 0,    -- 確定済み予約数
  created_at timestamptz default now() not null
);

-- ▼ 既存DBへのマイグレーション（初回のみ実行）
-- alter table availability_slots
--   add column if not exists capacity integer not null default 1,
--   add column if not exists confirmed_count integer not null default 0;

alter table availability_slots enable row level security;

-- Business: own slots full access
create policy "slots: business owner full access" on availability_slots
  for all using (
    exists (
      select 1 from businesses b where b.id = business_id and b.user_id = auth.uid()
    )
  );

-- MSW: read available slots of approved businesses
create policy "slots: msw read available" on availability_slots
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'msw')
  );

-- MSW: update slot availability (for booking)
create policy "slots: msw update for booking" on availability_slots
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role = 'msw')
  );

-- =====================================================
-- reservations
-- =====================================================
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete restrict not null,
  hospital_id uuid references hospitals(id) on delete restrict not null,
  slot_id uuid references availability_slots(id) on delete set null,
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
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'rejected')),
  reminder_sent boolean not null default false,
  created_at timestamptz default now() not null
);

alter table reservations enable row level security;

-- Business: read own reservations
create policy "reservations: business read own" on reservations
  for select using (
    exists (
      select 1 from businesses b where b.id = business_id and b.user_id = auth.uid()
    )
  );

-- Business: update status (complete)
create policy "reservations: business update status" on reservations
  for update using (
    exists (
      select 1 from businesses b where b.id = business_id and b.user_id = auth.uid()
    )
  );

-- MSW: insert reservations
create policy "reservations: msw insert" on reservations
  for insert with check (
    exists (
      select 1 from hospitals h where h.id = hospital_id and h.user_id = auth.uid()
    )
  );

-- MSW: read own hospital's reservations
create policy "reservations: msw read own" on reservations
  for select using (
    exists (
      select 1 from hospitals h where h.id = hospital_id and h.user_id = auth.uid()
    )
  );

-- MSW: cancel own reservations (update to cancelled)
create policy "reservations: msw update own" on reservations
  for update using (
    exists (
      select 1 from hospitals h where h.id = hospital_id and h.user_id = auth.uid()
    )
  );

-- Admin: read all (excluding patient PII is enforced in app layer)
create policy "reservations: admin read all" on reservations
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Admin: update any reservation status
create policy "reservations: admin update all" on reservations
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- =====================================================
-- Enable realtime for availability_slots and reservations
-- =====================================================
alter publication supabase_realtime add table availability_slots;
alter publication supabase_realtime add table reservations;

-- =====================================================
-- Performance indexes
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
-- Storage buckets for business images
-- Run in SQL Editor after creating the bucket in Dashboard
-- =====================================================
-- insert into storage.buckets (id, name, public) values ('business-images', 'business-images', true);
--
-- create policy "business images: owner upload" on storage.objects
--   for insert with check (
--     bucket_id = 'business-images' and
--     (storage.foldername(name))[1] = auth.uid()::text
--   );
--
-- create policy "business images: public read" on storage.objects
--   for select using (bucket_id = 'business-images');
--
-- create policy "business images: owner delete" on storage.objects
--   for delete using (
--     bucket_id = 'business-images' and
--     (storage.foldername(name))[1] = auth.uid()::text
--   );

-- =====================================================
-- Migration: add pending/rejected statuses (run if schema already applied)
-- =====================================================
-- alter table reservations drop constraint if exists reservations_status_check;
-- alter table reservations add constraint reservations_status_check
--   check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'rejected'));
-- alter table reservations alter column status set default 'pending';
-- create policy "reservations: msw update own" on reservations
--   for update using (
--     exists (select 1 from hospitals h where h.id = hospital_id and h.user_id = auth.uid())
--   );

-- =====================================================
-- pg_net + pg_cron: send-reminder を毎時0分に実行
-- =====================================================
-- CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
--
-- SELECT cron.schedule(
--   'send-reminder-hourly',
--   '0 * * * *',
--   $$
--   SELECT extensions.http_post(
--     'https://lcuoeekhnmbhomcdbedi.supabase.co/functions/v1/send-reminder',
--     '{}',
--     'application/json'
--   );
--   $$
-- );

-- =====================================================
-- Admin user setup
-- After running this schema, create the admin user via
-- Supabase Auth > Users > Invite, then run:
-- insert into profiles (id, role) values ('<admin-user-id>', 'admin');
-- =====================================================
