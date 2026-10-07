create table if not exists public.staff_module_access (
  user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  module_key text not null references public.app_modules(module_key) on delete cascade,
  allowed boolean not null,
  updated_by uuid null,
  updated_at timestamptz not null default now(),
  primary key (user_id,module_key)
);

create index if not exists staff_module_access_module_key_idx
  on public.staff_module_access(module_key);

alter table public.staff_module_access enable row level security;
