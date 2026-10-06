-- ============================================================
-- 19_RESERVATION_SYNC.sql
-- Reservation/PMS import layer for daily operations.
-- Additive only: existing housekeeping operational data is preserved.
-- ============================================================

begin;

create table if not exists public.reservation_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  report_start_date date,
  report_end_date date,
  status text not null default 'previewed'
    check (status in ('previewed','committed','failed')),
  records_detected integer not null default 0,
  records_imported integer not null default 0,
  warning_count integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  imported_by uuid references auth.users(id) on delete set null,
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reservation_stays (
  id uuid primary key default gen_random_uuid(),
  reservation_key text not null unique,
  reservation_number text,
  guest_name text not null default '',
  guest_phone text,
  door_code text,
  arrival_date date not null,
  checkout_date date not null,
  room_id uuid references public.rooms(id) on delete set null,
  occupancy integer,
  rate_plan text,
  check_in_time text,
  products_raw text,
  dietary_restrictions text,
  referral_source text,
  reason_for_visit text,
  guest_comments text,
  innkeeper_notes text,
  source_page integer,
  raw_text text,
  parser_confidence numeric(5,2) not null default 0,
  needs_review boolean not null default false,
  active boolean not null default true,
  last_import_batch_id uuid references public.reservation_import_batches(id) on delete set null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (checkout_date >= arrival_date),
  check (occupancy is null or occupancy between 1 and 8)
);

create index if not exists reservation_stays_room_dates_idx
  on public.reservation_stays(room_id, arrival_date, checkout_date)
  where active = true;

create index if not exists reservation_stays_arrival_idx
  on public.reservation_stays(arrival_date)
  where active = true;

create table if not exists public.reservation_import_changes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.reservation_import_batches(id) on delete cascade,
  reservation_id uuid references public.reservation_stays(id) on delete cascade,
  reservation_key text not null,
  change_type text not null
    check (change_type in ('new','updated','unchanged','potential_missing')),
  changed_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists reservation_import_changes_batch_idx
  on public.reservation_import_changes(batch_id, change_type);

create table if not exists public.reservation_daily_links (
  service_date date not null,
  room_id uuid not null references public.rooms(id) on delete cascade,
  reservation_status text not null default 'Vacant'
    check (reservation_status in ('Vacant','Arrival','Stayover','Checkout','Out/In')),
  primary_reservation_id uuid references public.reservation_stays(id) on delete set null,
  arriving_reservation_id uuid references public.reservation_stays(id) on delete set null,
  stay_reservation_id uuid references public.reservation_stays(id) on delete set null,
  departing_reservation_id uuid references public.reservation_stays(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(service_date, room_id)
);

create table if not exists public.reservation_daily_verifications (
  service_date date primary key,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz not null default now(),
  note text
);

alter table public.housekeeping_room_packages
  add column if not exists source text not null default 'manual';

alter table public.housekeeping_room_packages
  add column if not exists reservation_id uuid references public.reservation_stays(id) on delete set null;

create index if not exists housekeeping_room_packages_reservation_idx
  on public.housekeeping_room_packages(reservation_id)
  where reservation_id is not null;

insert into public.app_modules
(module_key,title,label,department,href,status,sort_order,active,enabled,published,description)
values
('reservation_sync','Reservation Sync','Reservation Sync','front_desk','/reservation-sync','live',25,true,true,true,'Import PMS arrival reports, review reservation changes, and sync daily room operations.')
on conflict (module_key) do update set
  title=excluded.title,
  label=excluded.label,
  department=excluded.department,
  href=excluded.href,
  status=excluded.status,
  active=true,
  enabled=true,
  published=true,
  description=excluded.description;

alter table public.reservation_import_batches enable row level security;
alter table public.reservation_stays enable row level security;
alter table public.reservation_import_changes enable row level security;
alter table public.reservation_daily_links enable row level security;
alter table public.reservation_daily_verifications enable row level security;

commit;
