-- ============================================================
-- HOUSEKEEPING AUTOSAVE + STAFF DIRECTORY + ROOM SIGN-OFFS
-- Safe to run more than once.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Staff directory: includes employees who do not have app logins.
-- ------------------------------------------------------------
create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null unique,
  job_title text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.capabilities (
  capability_key text primary key,
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_member_capabilities (
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  capability_key text not null references public.capabilities(capability_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_member_id, capability_key)
);

create index if not exists staff_member_capabilities_capability_idx
on public.staff_member_capabilities(capability_key);

insert into public.capabilities (capability_key,label,description)
values
  ('housekeeping','Housekeeping','Can be assigned to clean guest rooms'),
  ('runner','Runner','Can perform housekeeping runner duties'),
  ('laundry','Laundry','Can perform laundry duties'),
  ('hospitality_assistant','Hospitality Assistant','Can perform Hospitality Assistant duties'),
  ('ha_signoff','Hospitality Assistant Sign-Off','Can sign off completed rooms as Hospitality Assistant'),
  ('foh_manager','FOH Manager','Front of House management duties'),
  ('foh_signoff','FOH Manager Sign-Off','Can perform final FOH room sign-off'),
  ('kitchen','Kitchen','Can perform kitchen duties'),
  ('maintenance','Maintenance','Can perform maintenance duties'),
  ('maintenance_manager','Maintenance Manager','Can manage maintenance operations'),
  ('manager','Manager','General management duties'),
  ('general_manager','General Manager','General Manager duties'),
  ('operations_manager','Operations Manager','Operations Manager duties'),
  ('owner','Owner','Owner-level access'),
  ('ha_signoff_override','HA Sign-Off Override','Management may perform Hospitality Assistant sign-off'),
  ('foh_signoff_override','FOH Sign-Off Override','Management may perform FOH sign-off')
on conflict (capability_key) do update set
  label=excluded.label,
  description=excluded.description;

-- Current team. Existing login accounts are linked where available.
insert into public.staff_members (auth_user_id,name,job_title,active)
values
  ('316f638d-bd3a-4c6b-9ff3-47ff437a2390','Sarah','Owner / Operations Manager',true),
  ('029c729f-3df4-4b8a-b7f4-caebdf46dcb3','Brittany','General Manager / Kitchen',true),
  ('3958daa4-4b73-49e9-a974-13a274adac33','David','Manager / FOH Manager',true),
  ('8c3fbb71-ca1a-42d2-9bbd-29629bae0a96','Michael','Maintenance Manager / Kitchen',true),
  (null,'Kyree','Hospitality Assistant',true),
  (null,'Ashley','Hospitality Assistant / Runner / Housekeeper',true),
  (null,'Betty','Runner / Housekeeper / Laundry',true),
  (null,'Bonne','Laundry / Housekeeping',true),
  (null,'Chloe','Housekeeper / Laundry / Runner',true),
  (null,'Brittany Hughes','Housekeeper',true),
  (null,'Emma','Housekeeper',true),
  (null,'Kiana','Housekeeper',true),
  (null,'Laura','Housekeeper',true)
on conflict (name) do update set
  auth_user_id=coalesce(excluded.auth_user_id,staff_members.auth_user_id),
  job_title=excluded.job_title,
  active=excluded.active,
  updated_at=now();

-- Helper block for capability assignments.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('Sarah','owner'),('Sarah','operations_manager'),('Sarah','manager'),('Sarah','ha_signoff_override'),('Sarah','foh_signoff_override'),
      ('Brittany','general_manager'),('Brittany','manager'),('Brittany','kitchen'),('Brittany','ha_signoff_override'),('Brittany','foh_signoff_override'),
      ('David','manager'),('David','foh_manager'),('David','foh_signoff'),('David','ha_signoff_override'),
      ('Michael','kitchen'),('Michael','maintenance'),('Michael','maintenance_manager'),
      ('Kyree','hospitality_assistant'),('Kyree','ha_signoff'),
      ('Ashley','housekeeping'),('Ashley','runner'),('Ashley','hospitality_assistant'),('Ashley','ha_signoff'),
      ('Betty','housekeeping'),('Betty','runner'),('Betty','laundry'),
      ('Bonne','housekeeping'),('Bonne','laundry'),
      ('Chloe','housekeeping'),('Chloe','runner'),('Chloe','laundry'),
      ('Brittany Hughes','housekeeping'),
      ('Emma','housekeeping'),
      ('Kiana','housekeeping'),
      ('Laura','housekeeping')
    ) as x(staff_name,capability_key)
  loop
    insert into public.staff_member_capabilities(staff_member_id,capability_key)
    select sm.id,r.capability_key
    from public.staff_members sm
    where sm.name=r.staff_name
    on conflict do nothing;
  end loop;
end $$;

-- ------------------------------------------------------------
-- Daily Housekeeping rows.
-- Creates the table if missing and adds any newer columns if an
-- earlier version already exists.
-- ------------------------------------------------------------
create table if not exists public.housekeeping_daily_rooms (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  room_id uuid not null references public.rooms(id) on delete cascade,
  reservation_status text not null default '',
  service_type text not null default '',
  strip_hold text not null default '',
  assigned_to text not null default '',
  clean_order integer,
  complete boolean not null default false,
  ready_for_inspection boolean not null default false,
  inspected boolean not null default false,
  completed_at timestamptz,
  inspected_at timestamptz,
  room_condition text not null default '',
  next_shift_condition text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.housekeeping_daily_rooms add column if not exists reservation_status text not null default '';
alter table public.housekeeping_daily_rooms add column if not exists service_type text not null default '';
alter table public.housekeeping_daily_rooms add column if not exists strip_hold text not null default '';
alter table public.housekeeping_daily_rooms add column if not exists assigned_to text not null default '';
alter table public.housekeeping_daily_rooms add column if not exists clean_order integer;
alter table public.housekeeping_daily_rooms add column if not exists complete boolean not null default false;
alter table public.housekeeping_daily_rooms add column if not exists ready_for_inspection boolean not null default false;
alter table public.housekeeping_daily_rooms add column if not exists inspected boolean not null default false;
alter table public.housekeeping_daily_rooms add column if not exists completed_at timestamptz;
alter table public.housekeeping_daily_rooms add column if not exists inspected_at timestamptz;
alter table public.housekeeping_daily_rooms add column if not exists room_condition text not null default '';
alter table public.housekeeping_daily_rooms add column if not exists next_shift_condition text not null default '';
alter table public.housekeeping_daily_rooms add column if not exists notes text not null default '';
alter table public.housekeeping_daily_rooms add column if not exists created_at timestamptz not null default now();
alter table public.housekeeping_daily_rooms add column if not exists updated_at timestamptz not null default now();
alter table public.housekeeping_daily_rooms add column if not exists ha_signed_by uuid references public.staff_members(id) on delete set null;
alter table public.housekeeping_daily_rooms add column if not exists ha_signed_at timestamptz;
alter table public.housekeeping_daily_rooms add column if not exists foh_signed_by uuid references public.staff_members(id) on delete set null;
alter table public.housekeeping_daily_rooms add column if not exists foh_signed_at timestamptz;

create unique index if not exists housekeeping_daily_rooms_service_room_uidx
on public.housekeeping_daily_rooms(service_date,room_id);

create index if not exists housekeeping_daily_rooms_service_date_idx
on public.housekeeping_daily_rooms(service_date);

-- Verification
select
  sm.name,
  sm.job_title,
  sm.active,
  string_agg(c.label, ', ' order by c.label) as capabilities
from public.staff_members sm
left join public.staff_member_capabilities smc on smc.staff_member_id=sm.id
left join public.capabilities c on c.capability_key=smc.capability_key
group by sm.id,sm.name,sm.job_title,sm.active
order by sm.name;
