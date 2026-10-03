-- Laundry, Lobby, Housekeeping Guide, and department inventory support.
-- This migration is safe to run more than once.

create table if not exists public.department_daily_notes (
  department text not null,
  service_date date not null,
  note text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (department, service_date)
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  category text not null default 'General',
  item_name text not null,
  supplier text,
  supplier_sku text,
  par_level text,
  order_url text,
  notes text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department, item_name)
);

create table if not exists public.inventory_requests (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  item_name text not null,
  requested_qty text,
  note text,
  status text not null default 'requested'
    check (status in ('requested','ordered','received','cancelled')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz
);

create index if not exists inventory_items_department_idx
on public.inventory_items(department,category,sort_order,item_name);

create index if not exists inventory_requests_department_idx
on public.inventory_requests(department,status,requested_at desc);

alter table public.department_daily_notes enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_requests enable row level security;

insert into public.app_modules
(module_key,title,label,department,href,status,sort_order,active,enabled,published,description)
values
 ('laundry','Laundry','Laundry','laundry','/laundry','live',140,true,true,true,'Laundry operations and inventory.'),
 ('lobby','Lobby','Lobby','lobby','/lobby','live',150,true,true,true,'Lobby and hospitality-assistant operations.'),
 ('housekeeping_guide','Housekeeping Guide','Housekeeping Guide','housekeeping','/housekeeping/resources','live',105,true,true,true,'Housekeeping standards, room details, photos, tote list, and cleaning checklist.'),
 ('front_desk_inventory','Front Desk Inventory','Inventory','front_desk','/inventory/front-desk','live',25,true,true,true,'Front Desk inventory and order requests.'),
 ('kitchen_inventory','Kitchen Inventory','Inventory','kitchen','/inventory/kitchen','live',35,true,true,true,'Kitchen inventory and order requests.'),
 ('housekeeping_inventory','Housekeeping Inventory','Inventory','housekeeping','/inventory/housekeeping','live',102,true,true,true,'Housekeeping inventory and order requests.'),
 ('laundry_inventory','Laundry Inventory','Inventory','laundry','/inventory/laundry','live',145,true,true,true,'Laundry inventory and order requests.'),
 ('lobby_inventory','Lobby Inventory','Inventory','lobby','/inventory/lobby','live',155,true,true,true,'Lobby inventory and order requests.')
on conflict (module_key) do update set
 title=excluded.title,label=excluded.label,department=excluded.department,href=excluded.href,
 status=excluded.status,sort_order=excluded.sort_order,active=true,enabled=true,published=true,
 description=excluded.description,updated_at=now();
