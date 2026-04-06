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
-- availability_slots
-- =====================================================
create table if not exists availability_slots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  is_available boolean not null default true,
  created_at timestamptz default now() not null
);

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
  status text not null default 'confirmed' check (status in ('confirmed', 'completed', 'cancelled')),
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

-- Admin: read all (excluding patient PII is enforced in app layer)
create policy "reservations: admin read all" on reservations
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- =====================================================
-- Enable realtime for availability_slots and reservations
-- =====================================================
alter publication supabase_realtime add table availability_slots;
alter publication supabase_realtime add table reservations;

-- =====================================================
-- Admin user setup
-- After running this schema, create the admin user via
-- Supabase Auth > Users > Invite, then run:
-- insert into profiles (id, role) values ('<admin-user-id>', 'admin');
-- =====================================================
