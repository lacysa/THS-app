create table if not exists public.breakfast_menu_notes (
  booking_id uuid primary key references public.breakfast_bookings(id) on delete cascade,
  note text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.breakfast_menu_notes enable row level security;
