-- QS promotions are reservation-level metadata, independent of daily room rows
-- and package tags. The API uses a server-side authorized client.
create table if not exists public.reservation_quiet_season (
 reservation_id uuid primary key references public.reservation_stays(id) on delete cascade,
 active boolean not null default true,
 restaurant text,
 welcome_gift text,
 beer_preference text,
 nut_allergy text,
 scent_preference text,
 notes text,
 updated_by uuid,
 updated_at timestamptz not null default now()
);
alter table public.reservation_quiet_season enable row level security;
revoke all on public.reservation_quiet_season from anon, authenticated;
create index if not exists reservation_quiet_season_active_idx on public.reservation_quiet_season(active) where active=true;
