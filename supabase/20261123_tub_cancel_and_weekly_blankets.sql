-- Applied to THS operations database on 2026-11-23.
-- Housekeeping confirms an actual blanket replacement, one room per hotel week
-- (week begins Monday). FOH reads the same confirmation record.
create table if not exists public.housekeeping_blanket_changes (
  room_id uuid not null references public.rooms(id) on delete cascade,
  week_start date not null,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  primary key (room_id, week_start)
);
create index if not exists housekeeping_blanket_changes_week_idx
  on public.housekeeping_blanket_changes (week_start);
alter table public.housekeeping_blanket_changes enable row level security;

-- Cancelling a tub clean must not be represented as a completed cleaning.
-- The pending request remains auditable, and cancellation takes effect on
-- the selected service date and later dates only.
alter table public.room_ops_details
  add column if not exists tub_clean_cancelled_at timestamptz;
alter table public.room_ops_details
  add column if not exists tub_clean_cancelled_by uuid;
