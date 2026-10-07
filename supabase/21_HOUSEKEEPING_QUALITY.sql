-- Housekeeping quality accountability and manager analytics
begin;

create table if not exists public.housekeeping_quality_checks (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  room_id uuid not null references public.rooms(id) on delete cascade,
  stage text not null check (stage in ('self_check','inspection','recheck')),
  attempt_no integer not null default 1 check (attempt_no > 0),
  actor_id uuid not null references public.staff_members(id) on delete restrict,
  housekeeper_id uuid references public.staff_members(id) on delete set null,
  status text not null check (status in ('pass','fail')),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(service_date,room_id,stage,attempt_no)
);

create table if not exists public.housekeeping_quality_check_items (
  check_id uuid not null references public.housekeeping_quality_checks(id) on delete cascade,
  item_id uuid not null references public.room_check_items(id) on delete restrict,
  passed boolean not null,
  note text,
  checked_at timestamptz not null default now(),
  primary key(check_id,item_id)
);

create table if not exists public.housekeeping_quality_discrepancies (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  room_id uuid not null references public.rooms(id) on delete cascade,
  housekeeper_id uuid references public.staff_members(id) on delete set null,
  inspector_id uuid not null references public.staff_members(id) on delete restrict,
  item_id uuid not null references public.room_check_items(id) on delete restrict,
  self_check_id uuid references public.housekeeping_quality_checks(id) on delete set null,
  inspection_check_id uuid not null references public.housekeeping_quality_checks(id) on delete cascade,
  note text,
  detected_at timestamptz not null default now(),
  corrected_at timestamptz,
  resolved_recheck_id uuid references public.housekeeping_quality_checks(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(inspection_check_id,item_id)
);

create index if not exists idx_hq_checks_date_stage
  on public.housekeeping_quality_checks(service_date,stage);
create index if not exists idx_hq_checks_housekeeper_date
  on public.housekeeping_quality_checks(housekeeper_id,service_date);
create index if not exists idx_hq_checks_room_date
  on public.housekeeping_quality_checks(room_id,service_date);
create index if not exists idx_hq_discrepancies_housekeeper_date
  on public.housekeeping_quality_discrepancies(housekeeper_id,service_date);
create index if not exists idx_hq_discrepancies_item_date
  on public.housekeeping_quality_discrepancies(item_id,service_date);
create index if not exists idx_hq_discrepancies_open
  on public.housekeeping_quality_discrepancies(service_date,room_id)
  where corrected_at is null;

alter table public.housekeeping_quality_checks enable row level security;
alter table public.housekeeping_quality_check_items enable row level security;
alter table public.housekeeping_quality_discrepancies enable row level security;

insert into public.app_modules
(module_key,title,label,department,href,status,sort_order,active,enabled,published,description)
values
('housekeeping_quality','Housekeeping Quality','HSK Quality','housekeeping','/housekeeping/quality','live',115,true,true,true,'Manager-only housekeeping quality trends and checklist accountability.')
on conflict (module_key) do update set
  title=excluded.title,
  label=excluded.label,
  department=excluded.department,
  href=excluded.href,
  status=excluded.status,
  sort_order=excluded.sort_order,
  active=true,
  enabled=true,
  published=true,
  description=excluded.description;

commit;
