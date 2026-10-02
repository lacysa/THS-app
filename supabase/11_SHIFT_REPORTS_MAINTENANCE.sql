-- ============================================================
-- SHIFT REPORTS + ROOM-FIRST MAINTENANCE
-- Safe to run more than once.
-- Run after 10_HOUSEKEEPING_AUTOSAVE_STAFF_SIGNOFFS.sql
-- ============================================================

create extension if not exists pgcrypto;

-- Keep the current staff directory current.
insert into public.staff_members (name,job_title,active)
values ('Megan','Housekeeper',true)
on conflict (name) do update set
  job_title=excluded.job_title,
  active=true,
  updated_at=now();


-- Username login support used by the one-time provisioning route.
alter table public.staff_members add column if not exists username text;
create unique index if not exists staff_members_username_unique
on public.staff_members (lower(username)) where username is not null;

update public.staff_members
set username = case name
  when 'Ashley' then 'ashley.westmaas'
  when 'Betty' then 'betty.ramsey'
  when 'Bonne' then 'bonne.troutman'
  when 'Brittany' then 'brittany.hollingshead'
  when 'Brittany Hughes' then 'brittany.hughes'
  when 'Chloe' then 'chloe.carney'
  when 'David' then 'david.heiser'
  when 'Emma' then 'emma.denuyl'
  when 'Kiana' then 'kiana.haseman'
  when 'Kyree' then 'kyree.haseman'
  when 'Laura' then 'laura.martin'
  when 'Megan' then 'megan.vandenbeldt'
  when 'Michael' then 'michael.bone'
  when 'Sarah' then 'sarah.lacy'
  else username
end
where name <> 'Al';

insert into public.staff_member_capabilities (staff_member_id,capability_key)
select id,'housekeeping'
from public.staff_members
where name='Megan'
on conflict do nothing;

-- ------------------------------------------------------------
-- ROOM-FIRST MAINTENANCE
-- This is intentionally a new normalized work-order table so the
-- existing maintenance_requests / maintenance_tickets tables are
-- preserved untouched.
-- ------------------------------------------------------------
create table if not exists public.maintenance_work_orders (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete set null,
  area text,
  title text not null,
  description text,
  priority text not null default 'medium'
    check (priority in ('low','medium','high','urgent')),
  status text not null default 'open'
    check (status in ('open','in_progress','waiting','complete')),
  assigned_staff_id uuid references public.staff_members(id) on delete set null,
  created_by uuid references public.staff_members(id) on delete set null,
  completed_by uuid references public.staff_members(id) on delete set null,
  include_in_shift_report boolean not null default true,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_work_orders_location_check
    check (room_id is not null or nullif(trim(area),'') is not null)
);

create index if not exists maintenance_work_orders_room_idx
on public.maintenance_work_orders(room_id);

create index if not exists maintenance_work_orders_status_idx
on public.maintenance_work_orders(status);

create index if not exists maintenance_work_orders_created_idx
on public.maintenance_work_orders(created_at desc);

-- ------------------------------------------------------------
-- ROOM NOTES
-- Daily notes are date-scoped. Persistent notes stay visible until
-- resolved and can be used for recurring room/property concerns.
-- ------------------------------------------------------------
create table if not exists public.room_notes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  service_date date,
  note text not null,
  note_type text not null default 'daily'
    check (note_type in ('daily','persistent')),
  include_in_shift_report boolean not null default true,
  resolved boolean not null default false,
  created_by uuid references public.staff_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists room_notes_room_idx on public.room_notes(room_id);
create index if not exists room_notes_service_date_idx on public.room_notes(service_date);

-- ------------------------------------------------------------
-- SHIFT REPORTS
-- ------------------------------------------------------------
create table if not exists public.shift_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  shift text not null default 'Daily',
  prepared_by uuid references public.staff_members(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','finalized')),
  guest_notes text not null default '',
  staff_notes text not null default '',
  supplies_notes text not null default '',
  tomorrow_notes text not null default '',
  general_notes text not null default '',
  management_notes text not null default '',
  finalized_by uuid references public.staff_members(id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(report_date,shift)
);

create table if not exists public.shift_report_items (
  id uuid primary key default gen_random_uuid(),
  shift_report_id uuid not null references public.shift_reports(id) on delete cascade,
  category text not null,
  source_type text,
  source_id text,
  room_id uuid references public.rooms(id) on delete set null,
  note text not null,
  resolved boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.staff_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists shift_report_items_report_idx
on public.shift_report_items(shift_report_id,category,sort_order);

-- ------------------------------------------------------------
-- MODULE REGISTRY
-- ------------------------------------------------------------
insert into public.app_modules
(module_key,title,label,department,href,status,sort_order,active,enabled,published,description)
values
  ('shift_reports','Shift Reports','Shift Reports','operations','/shift-reports','live',125,true,true,true,'Daily shift report, handoff, room notes, and manager notes.'),
  ('maintenance','Maintenance','Maintenance','maintenance','/maintenance','live',130,true,true,true,'Room-first maintenance work orders and property-area issues.')
on conflict (module_key) do update set
  title=excluded.title,
  label=excluded.label,
  department=excluded.department,
  href=excluded.href,
  status=excluded.status,
  sort_order=excluded.sort_order,
  active=excluded.active,
  enabled=excluded.enabled,
  published=excluded.published,
  description=excluded.description,
  updated_at=now();

-- ------------------------------------------------------------
-- RLS: app access goes through authenticated server API routes.
-- Service-role API calls bypass these policies.
-- ------------------------------------------------------------
alter table public.maintenance_work_orders enable row level security;
alter table public.room_notes enable row level security;
alter table public.shift_reports enable row level security;
alter table public.shift_report_items enable row level security;

-- Verification
select module_key,title,status,published,href
from public.app_modules
where module_key in ('shift_reports','maintenance')
order by sort_order;
