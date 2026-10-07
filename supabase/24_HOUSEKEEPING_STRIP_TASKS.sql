begin;

alter table public.housekeeping_daily_rooms
  add column if not exists strip_status text not null default '',
  add column if not exists strip_requested_by uuid,
  add column if not exists strip_requested_at timestamptz,
  add column if not exists stripped_by uuid,
  add column if not exists stripped_at timestamptz;

alter table public.housekeeping_daily_rooms
  drop constraint if exists housekeeping_daily_rooms_strip_status_check;

alter table public.housekeeping_daily_rooms
  add constraint housekeeping_daily_rooms_strip_status_check
  check (strip_status in ('','needed','stripped'));

update public.housekeeping_daily_rooms
set
  strip_status='needed',
  strip_hold='',
  strip_requested_at=coalesce(strip_requested_at,updated_at,now())
where lower(coalesce(strip_hold,''))='strip'
  and coalesce(strip_status,'')='';

create index if not exists idx_hsk_daily_strip_status
  on public.housekeeping_daily_rooms(service_date,strip_status);

commit;
