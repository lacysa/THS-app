create table if not exists public.staff_daily_schedule (
  id uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  schedule_date date not null,
  shift_start time null,
  shift_end time null,
  role_label text null,
  work_mode text not null default 'onsite'
    check (work_mode in ('onsite','remote','time_off','unavailable')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_member_id,schedule_date)
);

create index if not exists staff_daily_schedule_date_idx
  on public.staff_daily_schedule(schedule_date);

alter table public.staff_daily_schedule enable row level security;
