-- Room Operations service details, separate from imported bookings and breakfast.
-- Access is server-only via the authenticated, authorized API.
create table if not exists public.room_ops_details (
  room_id uuid not null references public.rooms(id) on delete cascade,
  service_date date not null,
  expected_arrival_time time without time zone,
  actual_arrival_time time without time zone,
  late_checkout_time time without time zone,
  tray_returned_at timestamptz,
  tub_clean_requested_at timestamptz,
  tub_clean_completed_at timestamptz,
  tub_clean_completed_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (room_id,service_date)
);
alter table public.room_ops_details enable row level security;
revoke all on public.room_ops_details from anon, authenticated;
create index if not exists room_ops_details_tub_history_idx on public.room_ops_details (room_id,service_date desc) where tub_clean_completed_at is not null;
