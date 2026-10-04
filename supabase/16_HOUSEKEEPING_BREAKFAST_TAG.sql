-- Per-room, per-day operational breakfast flag for Housekeeping Setup.
-- Safe to run on an existing THS database.

begin;

alter table public.housekeeping_daily_rooms
  add column if not exists breakfast_tag boolean not null default false;

comment on column public.housekeeping_daily_rooms.breakfast_tag is
  'Manual operational flag: this room is marked to receive breakfast for the housekeeping service date.';

commit;
