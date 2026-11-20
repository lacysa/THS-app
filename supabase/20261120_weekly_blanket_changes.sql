-- Weekly room blanket changes: history retained, Monday resets by week_start.
create table if not exists public.housekeeping_blanket_changes (
 room_id uuid not null references public.rooms(id) on delete cascade,
 week_start date not null,
 changed_at timestamptz not null default now(),
 changed_by uuid,
 primary key (room_id,week_start)
);
create index if not exists housekeeping_blanket_changes_week_idx on public.housekeeping_blanket_changes(week_start);
alter table public.housekeeping_blanket_changes enable row level security;
-- Server endpoints use the service-role client; there is no client-side table access.
