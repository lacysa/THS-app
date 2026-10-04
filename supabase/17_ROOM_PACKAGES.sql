-- Room package catalog and per-room/day package assignments.
-- Seeded from the currently listed Hotel Saugatuck add-ons on 2026-10-04.
-- Availability mirrors the Yes/No state shown in the hotel add-on admin.

begin;

create table if not exists public.room_package_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price numeric(10,2),
  available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.housekeeping_room_packages (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  room_id uuid not null references public.rooms(id) on delete cascade,
  package_id uuid not null references public.room_package_catalog(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(service_date,room_id,package_id)
);

create index if not exists housekeeping_room_packages_service_date_room_idx
  on public.housekeeping_room_packages(service_date,room_id);

alter table public.room_package_catalog enable row level security;
alter table public.housekeeping_room_packages enable row level security;

commit;
