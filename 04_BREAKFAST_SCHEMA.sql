-- ============================================================
-- 04_BREAKFAST_SCHEMA.sql
-- Complete Breakfast App schema matching the current Next.js app.
-- ============================================================

begin;

create extension if not exists pgcrypto;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.breakfast_bookings (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  room_id uuid not null references public.rooms(id),
  last_name text not null,
  time_slot time not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','cancelled','declined')),
  menu_submitted boolean not null default false,
  latest_submission_id text,
  guest_token uuid not null default gen_random_uuid(),
  source text not null default 'guest',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index breakfast_bookings_guest_token_uidx
on public.breakfast_bookings(guest_token);

create unique index breakfast_bookings_active_room_date_uidx
on public.breakfast_bookings(service_date,room_id)
where status='scheduled';

create index breakfast_bookings_service_date_idx
on public.breakfast_bookings(service_date);

create index breakfast_bookings_time_slot_idx
on public.breakfast_bookings(service_date,time_slot)
where status='scheduled';

create table public.breakfast_submissions (
  id uuid primary key default gen_random_uuid(),
  tally_submission_id text not null unique,
  booking_id uuid references public.breakfast_bookings(id) on delete set null,
  service_date date not null,
  room_name text not null,
  last_name text,
  submitted_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index breakfast_submissions_service_date_idx
on public.breakfast_submissions(service_date);

create index breakfast_submissions_booking_id_idx
on public.breakfast_submissions(booking_id);

create table public.breakfast_guest_orders (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.breakfast_submissions(id) on delete cascade,
  booking_id uuid references public.breakfast_bookings(id) on delete cascade,
  guest_number integer not null check (guest_number in (1,2)),
  dietary text,
  dietary_comments text,
  entree text,
  pancakes text,
  meat text,
  eggs text,
  coffee text,
  cream text,
  juice text,
  condiments text,
  meal_declined boolean not null default false,
  source text not null default 'tally'
    check (source in ('tally','native')),
  status text not null default 'new'
    check (status in ('new','prepping','ready','delivered','hold','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint breakfast_guest_orders_parent_check
    check (submission_id is not null or booking_id is not null)
);

create unique index breakfast_guest_orders_submission_guest_uidx
on public.breakfast_guest_orders(submission_id,guest_number)
where submission_id is not null;

alter table public.breakfast_guest_orders
add constraint breakfast_guest_orders_booking_guest_key
unique (booking_id,guest_number);

create index breakfast_guest_orders_booking_idx
on public.breakfast_guest_orders(booking_id);

create index breakfast_guest_orders_submission_idx
on public.breakfast_guest_orders(submission_id);

create table public.breakfast_menu_options (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  label text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  show_for_entree text[] not null default '{}'::text[],
  blocked_by_dietary text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(category,label)
);

create index breakfast_menu_options_category_sort_idx
on public.breakfast_menu_options(category,sort_order);

create table public.breakfast_notes (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  note text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index breakfast_notes_service_date_idx
on public.breakfast_notes(service_date);

create table public.blackout_dates (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  reason text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint blackout_date_order_check check (end_date >= start_date)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx
on public.audit_log(created_at desc);

create trigger breakfast_bookings_updated_at
before update on public.breakfast_bookings
for each row execute function public.set_updated_at();

create trigger breakfast_guest_orders_updated_at
before update on public.breakfast_guest_orders
for each row execute function public.set_updated_at();

create trigger breakfast_menu_options_updated_at
before update on public.breakfast_menu_options
for each row execute function public.set_updated_at();

commit;
