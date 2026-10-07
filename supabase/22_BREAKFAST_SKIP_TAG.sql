-- Front Desk room-level breakfast skip state for tagged rooms
begin;

alter table public.housekeeping_daily_rooms
  add column if not exists breakfast_skipped boolean not null default false,
  add column if not exists breakfast_skipped_by uuid,
  add column if not exists breakfast_skipped_at timestamptz;

create index if not exists idx_hsk_daily_breakfast_skip
  on public.housekeeping_daily_rooms(service_date,breakfast_tag,breakfast_skipped);

commit;
