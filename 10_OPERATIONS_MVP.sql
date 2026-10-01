-- ============================================================
-- THS Operations MVP: Housekeeping + Maintenance
-- Safe to run after the existing rebuild scripts.
-- ============================================================

begin;

create table if not exists public.housekeeping_daily_rooms (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  room_id uuid not null references public.rooms(id) on delete cascade,
  reservation_status text,
  service_type text,
  strip_hold text,
  assigned_to text,
  clean_order integer,
  complete boolean not null default false,
  ready_for_inspection boolean not null default false,
  room_condition text,
  next_shift_condition text,
  notes text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(service_date, room_id)
);

create index if not exists housekeeping_daily_rooms_date_idx
  on public.housekeeping_daily_rooms(service_date);

create table if not exists public.maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete set null,
  area text,
  title text not null,
  description text,
  priority text not null default 'Normal'
    check (priority in ('Normal','High','Urgent')),
  status text not null default 'Open'
    check (status in ('Open','In Progress','Waiting','Complete')),
  assigned_to text,
  reported_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_tickets_status_idx
  on public.maintenance_tickets(status);
create index if not exists maintenance_tickets_room_idx
  on public.maintenance_tickets(room_id);

alter table public.housekeeping_daily_rooms enable row level security;
alter table public.maintenance_tickets enable row level security;

drop policy if exists "staff all housekeeping daily rooms" on public.housekeeping_daily_rooms;
create policy "staff all housekeeping daily rooms"
  on public.housekeeping_daily_rooms
  for all to authenticated
  using (true)
  with check (true);

drop policy if exists "staff all maintenance tickets" on public.maintenance_tickets;
create policy "staff all maintenance tickets"
  on public.maintenance_tickets
  for all to authenticated
  using (true)
  with check (true);

-- Make the two modules live. Existing role permissions still determine access.
update public.app_modules
set enabled=true,
    published=true,
    status='live',
    updated_at=now()
where module_key in ('housekeeping','maintenance');

notify pgrst, 'reload schema';
commit;
