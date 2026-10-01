-- THS COMPLETE REBUILD - RUN AS ONE QUERY


-- ============================================================
-- 01_RESET_APP_TABLES.sql
-- DESTRUCTIVE FOR PUBLIC APP DATA.
-- DOES NOT DROP auth.users.
-- Preserves existing staff_profiles in a temporary persistent backup table.
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- Preserve current staff profile values before rebuilding.
create table if not exists public._ths_staff_profiles_backup (
  user_id uuid primary key,
  row_data jsonb not null,
  backed_up_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.staff_profiles') is not null then
    execute $sql$
      insert into public._ths_staff_profiles_backup(user_id,row_data,backed_up_at)
      select user_id, to_jsonb(sp), now()
      from public.staff_profiles sp
      where user_id is not null
      on conflict (user_id) do update
      set row_data = excluded.row_data,
          backed_up_at = excluded.backed_up_at
    $sql$;
  end if;
end $$;

-- Remove Auth trigger that points at public.staff_profiles before dropping it.
drop trigger if exists on_auth_user_created_staff_profile on auth.users;

drop view if exists public.role_permission_matrix cascade;

drop function if exists public.has_permission(text) cascade;
drop function if exists public.handle_new_staff_user() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.normalize_staff_phone(text) cascade;
drop function if exists public.staff_profiles_normalize_phone_trigger() cascade;

-- Breakfast / operations tables.
drop table if exists public.breakfast_guest_orders cascade;
drop table if exists public.breakfast_submissions cascade;
drop table if exists public.breakfast_menu_options cascade;
drop table if exists public.breakfast_notes cascade;
drop table if exists public.blackout_dates cascade;
drop table if exists public.audit_log cascade;
drop table if exists public.breakfast_bookings cascade;
drop table if exists public.rooms cascade;

-- Access / app registry tables.
drop table if exists public.role_permissions cascade;
drop table if exists public.app_permissions cascade;
drop table if exists public.staff_profiles cascade;
drop table if exists public.staff_roles cascade;
drop table if exists public.app_modules cascade;

commit;

-- ============================================================
-- 02_STAFF_ROLES_PROFILES.sql
-- Staff profiles, roles, permissions and phone-login aliases.
-- ============================================================

begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.normalize_staff_phone(value text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
  raw text;
begin
  raw := trim(coalesce(value,''));
  if raw = '' then return null; end if;

  digits := regexp_replace(raw, '\D', '', 'g');

  if length(digits) = 10 then
    return '+1' || digits;
  elsif length(digits) = 11 and left(digits,1) = '1' then
    return '+' || digits;
  elsif left(raw,1) = '+' and digits <> '' then
    return '+' || digits;
  end if;

  return raw;
end;
$$;

create table public.staff_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_admin boolean not null default false,
  can_preview_unpublished boolean not null default false,
  can_manage_modules boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  label text not null,
  module text not null,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.staff_roles(id) on delete cascade,
  permission_id uuid not null references public.app_permissions(id) on delete cascade,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(role_id,permission_id)
);

create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  preferred_name text,
  email text,
  phone text,
  job_title text,
  role text not null default 'staff'
    check (role in ('owner','manager','front_desk','kitchen','housekeeping','maintenance','laundry','staff')),
  role_id uuid references public.staff_roles(id) on delete set null,
  theme_preference text not null default 'blue'
    check (theme_preference in ('light','blue','dark')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index staff_profiles_email_uidx
on public.staff_profiles(lower(email))
where email is not null and btrim(email) <> '';

create unique index staff_profiles_phone_uidx
on public.staff_profiles(phone)
where phone is not null and btrim(phone) <> '';

create index staff_profiles_role_id_idx
on public.staff_profiles(role_id);

create index role_permissions_role_id_idx
on public.role_permissions(role_id);

create index role_permissions_permission_id_idx
on public.role_permissions(permission_id);

create or replace function public.staff_profiles_normalize_phone_trigger()
returns trigger
language plpgsql
as $$
begin
  new.phone := public.normalize_staff_phone(new.phone);
  return new;
end;
$$;

create trigger staff_profiles_normalize_phone
before insert or update of phone on public.staff_profiles
for each row execute function public.staff_profiles_normalize_phone_trigger();

create trigger staff_roles_updated_at
before update on public.staff_roles
for each row execute function public.set_updated_at();

create trigger app_permissions_updated_at
before update on public.app_permissions
for each row execute function public.set_updated_at();

create trigger role_permissions_updated_at
before update on public.role_permissions
for each row execute function public.set_updated_at();

create trigger staff_profiles_updated_at
before update on public.staff_profiles
for each row execute function public.set_updated_at();

-- Roles
insert into public.staff_roles
(name,description,is_admin,can_preview_unpublished,can_manage_modules,sort_order)
values
('Owner','Full platform access including unpublished modules and module controls.',true,true,true,1),
('Manager','Full management access to published Operations Hub tools.',true,false,false,10),
('Front Desk','Front desk and guest operations.',false,false,false,20),
('Kitchen','Breakfast kitchen operations.',false,false,false,30),
('Housekeeping','Housekeeping and room-cleaning operations.',false,false,false,40),
('Maintenance','Maintenance and property operations.',false,false,false,50),
('Laundry','Laundry and housekeeping support.',false,false,false,60);

-- Permissions
insert into public.app_permissions(permission_key,label,module,description,sort_order)
values
('dashboard.view','View Dashboard','Dashboard','Can open the main staff dashboard.',10),

('breakfast.front_desk.view','View Front Desk Breakfast','Breakfast','Can view and use the Front Desk breakfast timeline.',100),
('breakfast.kitchen.view','View Kitchen Board','Breakfast','Can view and use the kitchen breakfast board.',110),
('breakfast.read_only.view','View Daily Breakfast Overview','Breakfast','Can view the read-only breakfast overview.',120),
('breakfast.menu_manager.view','View Menu Manager','Breakfast','Can open breakfast menu management.',130),
('breakfast.menu_manager.edit','Edit Breakfast Menu','Breakfast','Can create or modify breakfast menu options.',140),

('housekeeping.dashboard.view','View Housekeeping Dashboard','Housekeeping','Can open the housekeeping dashboard.',200),
('housekeeping.rooms.view','View Room Tasks','Housekeeping','Can view room cleaning tasks and room status.',210),
('housekeeping.rooms.clean','Clean / Update Rooms','Housekeeping','Can start, update and complete assigned room cleaning tasks.',220),
('housekeeping.rooms.assign','Assign Housekeeping Rooms','Housekeeping','Can assign room cleaning tasks.',230),

('room_checks.view','View Room Checks','Room Checks','Can view room checks and inspection status.',300),
('room_checks.perform','Perform Room Checks','Room Checks','Can complete room inspection checklists.',310),
('room_checks.approve','Approve Rooms','Room Checks','Can approve a room as ready.',320),
('room_checks.reopen','Reopen Room Checks','Room Checks','Can reopen a room check or send a room back for reclean.',330),

('projects.view','View Projects','Projects','Can view projects.',400),
('projects.create','Create Projects','Projects','Can create projects.',410),
('projects.edit','Edit Projects','Projects','Can edit projects.',420),
('projects.assign','Assign Projects','Projects','Can assign projects.',430),
('projects.complete','Complete Projects','Projects','Can mark projects complete.',440),

('staff.view','View Staff','Staff','Can view the employee directory.',500),
('staff.manage','Manage Staff','Staff','Can manage employee records.',510),
('settings.manage','Manage Application Settings','Settings','Can manage administrative settings.',600);

-- Owner + Manager get every permission.
insert into public.role_permissions(role_id,permission_id,allowed)
select r.id,p.id,true
from public.staff_roles r
cross join public.app_permissions p
where r.name in ('Owner','Manager');

-- Front Desk
insert into public.role_permissions(role_id,permission_id,allowed)
select r.id,p.id,true
from public.staff_roles r
join public.app_permissions p on p.permission_key in (
  'dashboard.view',
  'breakfast.front_desk.view',
  'breakfast.read_only.view',
  'housekeeping.dashboard.view',
  'housekeeping.rooms.view',
  'room_checks.view',
  'room_checks.perform',
  'room_checks.approve',
  'projects.view',
  'projects.create',
  'staff.view'
)
where r.name='Front Desk';

-- Kitchen
insert into public.role_permissions(role_id,permission_id,allowed)
select r.id,p.id,true
from public.staff_roles r
join public.app_permissions p on p.permission_key in (
  'dashboard.view',
  'breakfast.kitchen.view',
  'breakfast.read_only.view'
)
where r.name='Kitchen';

-- Housekeeping
insert into public.role_permissions(role_id,permission_id,allowed)
select r.id,p.id,true
from public.staff_roles r
join public.app_permissions p on p.permission_key in (
  'dashboard.view',
  'housekeeping.dashboard.view',
  'housekeeping.rooms.view',
  'housekeeping.rooms.clean',
  'room_checks.view',
  'projects.view',
  'projects.create',
  'projects.complete'
)
where r.name='Housekeeping';

-- Maintenance
insert into public.role_permissions(role_id,permission_id,allowed)
select r.id,p.id,true
from public.staff_roles r
join public.app_permissions p on p.permission_key in (
  'dashboard.view',
  'projects.view',
  'projects.create',
  'projects.edit',
  'projects.complete'
)
where r.name='Maintenance';

-- Laundry
insert into public.role_permissions(role_id,permission_id,allowed)
select r.id,p.id,true
from public.staff_roles r
join public.app_permissions p on p.permission_key in (
  'dashboard.view',
  'housekeeping.dashboard.view',
  'housekeeping.rooms.view',
  'projects.view'
)
where r.name='Laundry';

-- Restore existing staff profile values from backup where available.
insert into public.staff_profiles
(user_id,name,preferred_name,email,phone,job_title,role,theme_preference,active,created_at,updated_at)
select
  b.user_id,
  coalesce(
    nullif(b.row_data->>'name',''),
    nullif(b.row_data->>'display_name',''),
    nullif(u.raw_user_meta_data->>'name',''),
    nullif(u.raw_user_meta_data->>'display_name',''),
    nullif(u.raw_user_meta_data->>'full_name',''),
    split_part(coalesce(u.email,''),'@',1),
    'Staff'
  ),
  nullif(b.row_data->>'preferred_name',''),
  coalesce(nullif(b.row_data->>'email',''),u.email),
  public.normalize_staff_phone(coalesce(nullif(b.row_data->>'phone',''),u.phone)),
  nullif(b.row_data->>'job_title',''),
  case lower(coalesce(nullif(b.row_data->>'role',''),'staff'))
    when 'manager' then 'manager'
    when 'front_desk' then 'front_desk'
    when 'front desk' then 'front_desk'
    when 'kitchen' then 'kitchen'
    when 'housekeeping' then 'housekeeping'
    when 'maintenance' then 'maintenance'
    when 'laundry' then 'laundry'
    when 'owner' then 'owner'
    else 'staff'
  end,
  case
    when b.row_data->>'theme_preference' in ('light','blue','dark')
      then b.row_data->>'theme_preference'
    else 'blue'
  end,
  coalesce(
    nullif(b.row_data->>'active','')::boolean,
    nullif(b.row_data->>'is_active','')::boolean,
    true
  ),
  coalesce(nullif(b.row_data->>'created_at','')::timestamptz,now()),
  now()
from public._ths_staff_profiles_backup b
join auth.users u on u.id=b.user_id
on conflict(user_id) do nothing;

-- Add Auth users that did not have an old staff profile.
insert into public.staff_profiles
(user_id,name,email,phone,role,theme_preference,active)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data->>'name',''),
    nullif(u.raw_user_meta_data->>'display_name',''),
    nullif(u.raw_user_meta_data->>'full_name',''),
    split_part(coalesce(u.email,''),'@',1),
    'Staff'
  ),
  u.email,
  public.normalize_staff_phone(u.phone),
  case lower(coalesce(nullif(u.raw_user_meta_data->>'role',''),'staff'))
    when 'manager' then 'manager'
    when 'front_desk' then 'front_desk'
    when 'front desk' then 'front_desk'
    when 'kitchen' then 'kitchen'
    when 'housekeeping' then 'housekeeping'
    when 'maintenance' then 'maintenance'
    when 'laundry' then 'laundry'
    when 'owner' then 'owner'
    else 'staff'
  end,
  'blue',
  true
from auth.users u
where u.deleted_at is null
on conflict(user_id) do nothing;

-- Ensure profile aliases are populated from Auth when missing.
update public.staff_profiles sp
set email = coalesce(sp.email,u.email),
    phone = coalesce(sp.phone,public.normalize_staff_phone(u.phone))
from auth.users u
where u.id=sp.user_id;

-- Sarah gets Owner. Keep the legacy role as manager for compatibility with old code.
update public.staff_profiles sp
set role='manager',
    role_id=(select id from public.staff_roles where name='Owner')
where lower(sp.name)='sarah'
   or lower(coalesce(sp.email,''))='lacysa@mail.gvsu.edu'
   or sp.user_id in (
       select id from auth.users where lower(coalesce(email,''))='lacysa@mail.gvsu.edu'
   );

-- Map everybody else from legacy role.
update public.staff_profiles sp
set role_id = case sp.role
  when 'manager' then (select id from public.staff_roles where name='Manager')
  when 'front_desk' then (select id from public.staff_roles where name='Front Desk')
  when 'kitchen' then (select id from public.staff_roles where name='Kitchen')
  when 'housekeeping' then (select id from public.staff_roles where name='Housekeeping')
  when 'maintenance' then (select id from public.staff_roles where name='Maintenance')
  when 'laundry' then (select id from public.staff_roles where name='Laundry')
  when 'owner' then (select id from public.staff_roles where name='Owner')
  else null
end
where sp.role_id is null;

-- New Auth users automatically receive a staff profile.
create or replace function public.handle_new_staff_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.staff_profiles(user_id,name,email,phone,role,theme_preference,active)
  values(
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'name',''),
      nullif(new.raw_user_meta_data->>'display_name',''),
      nullif(new.raw_user_meta_data->>'full_name',''),
      split_part(coalesce(new.email,''),'@',1),
      'Staff'
    ),
    new.email,
    public.normalize_staff_phone(new.phone),
    'staff',
    'blue',
    true
  )
  on conflict(user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_staff_profile on auth.users;
create trigger on_auth_user_created_staff_profile
after insert on auth.users
for each row execute procedure public.handle_new_staff_user();

create or replace function public.has_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
select coalesce((
  select
    case when sr.is_admin then true else coalesce(rp.allowed,false) end
  from public.staff_profiles sp
  join public.staff_roles sr on sr.id=sp.role_id and sr.active=true
  left join public.app_permissions ap
    on ap.permission_key=requested_permission and ap.active=true
  left join public.role_permissions rp
    on rp.role_id=sr.id and rp.permission_id=ap.id
  where sp.user_id=auth.uid() and sp.active=true
  limit 1
),false);
$$;

create or replace view public.role_permission_matrix as
select
  sr.id role_id,
  sr.name role_name,
  sr.is_admin,
  ap.id permission_id,
  ap.permission_key,
  ap.label permission_label,
  ap.module,
  case when sr.is_admin then true else coalesce(rp.allowed,false) end allowed
from public.staff_roles sr
cross join public.app_permissions ap
left join public.role_permissions rp
  on rp.role_id=sr.id and rp.permission_id=ap.id
where sr.active=true and ap.active=true
order by sr.sort_order,ap.module,ap.sort_order,ap.permission_key;

-- Profile data is now safely restored.
drop table if exists public._ths_staff_profiles_backup;

commit;

-- ============================================================
-- 03_APP_MODULES.sql
-- Module registry, publishing and Owner preview controls.
-- ============================================================

begin;

create table public.app_modules (
  id uuid primary key default gen_random_uuid(),
  module_key text not null unique,
  title text not null,
  label text,
  department text not null,
  href text,
  status text not null default 'coming_soon'
    check (status in ('live','beta','coming_soon')),
  sort_order integer not null default 0,
  active boolean not null default true,
  enabled boolean not null default true,
  published boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger app_modules_updated_at
before update on public.app_modules
for each row execute function public.set_updated_at();

insert into public.app_modules
(module_key,title,label,department,href,status,sort_order,active,enabled,published,description)
values
('dashboard','Dashboard','Dashboard','general','/dashboard','live',10,true,true,true,'Main staff services dashboard.'),
('front_desk','Front Desk','Front Desk','front_desk','/front-desk','live',20,true,true,true,'Breakfast reservations and delivery timeline.'),
('kitchen','Kitchen','Kitchen','kitchen','/kitchen','live',30,true,true,true,'Kitchen breakfast ticket board.'),
('menu_manager','Menu Manager','Menu Manager','breakfast','/breakfast/menu-manager','live',40,true,true,true,'Breakfast menu editor.'),
('daily_overview','Daily Overview','Daily Overview','breakfast','/breakfast/overview','live',50,true,true,true,'Read-only breakfast overview.'),
('breakfast_guest','Guest Breakfast','Guest Breakfast','guest_tools','/breakfast','live',60,true,true,true,'Open the guest-facing breakfast scheduler.'),
('housekeeping','Housekeeping','Housekeeping','housekeeping','/housekeeping','coming_soon',100,true,true,false,'Housekeeping operations preview.'),
('room_checks','Room Checks','Room Checks','housekeeping','/room-checks','coming_soon',110,true,true,false,'Room inspection workflow preview.'),
('projects','Projects','Projects','operations','/projects','coming_soon',120,true,true,false,'Operational projects preview.'),
('maintenance','Maintenance','Maintenance','maintenance','/maintenance','coming_soon',130,true,true,false,'Maintenance workflow preview.');

commit;

-- ============================================================
-- 04_BREAKFAST_SCHEMA.sql
-- Complete Breakfast App schema matching the current Next.js app.
-- ============================================================

begin;

create extension if not exists pgcrypto;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.breakfast_bookings (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  room_id uuid not null references public.rooms(id),
  last_name text not null,
  time_slot time not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','cancelled','declined')),
  menu_submitted boolean not null default false,
  latest_submission_id text,
  guest_token uuid not null default gen_random_uuid(),
  source text not null default 'guest',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index breakfast_bookings_guest_token_uidx
on public.breakfast_bookings(guest_token);

create unique index breakfast_bookings_active_room_date_uidx
on public.breakfast_bookings(service_date,room_id)
where status='scheduled';

create index breakfast_bookings_service_date_idx
on public.breakfast_bookings(service_date);

create index breakfast_bookings_time_slot_idx
on public.breakfast_bookings(service_date,time_slot)
where status='scheduled';

create table public.breakfast_submissions (
  id uuid primary key default gen_random_uuid(),
  tally_submission_id text not null unique,
  booking_id uuid references public.breakfast_bookings(id) on delete set null,
  service_date date not null,
  room_name text not null,
  last_name text,
  submitted_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index breakfast_submissions_service_date_idx
on public.breakfast_submissions(service_date);

create index breakfast_submissions_booking_id_idx
on public.breakfast_submissions(booking_id);

create table public.breakfast_guest_orders (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.breakfast_submissions(id) on delete cascade,
  booking_id uuid references public.breakfast_bookings(id) on delete cascade,
  guest_number integer not null check (guest_number in (1,2)),
  dietary text,
  dietary_comments text,
  entree text,
  pancakes text,
  meat text,
  eggs text,
  coffee text,
  cream text,
  juice text,
  condiments text,
  source text not null default 'tally'
    check (source in ('tally','native')),
  status text not null default 'new'
    check (status in ('new','prepping','ready','delivered','hold','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint breakfast_guest_orders_parent_check
    check (submission_id is not null or booking_id is not null)
);

create unique index breakfast_guest_orders_submission_guest_uidx
on public.breakfast_guest_orders(submission_id,guest_number)
where submission_id is not null;

create unique index breakfast_guest_orders_booking_guest_uidx
on public.breakfast_guest_orders(booking_id,guest_number)
where booking_id is not null;

create index breakfast_guest_orders_booking_idx
on public.breakfast_guest_orders(booking_id);

create index breakfast_guest_orders_submission_idx
on public.breakfast_guest_orders(submission_id);

create table public.breakfast_menu_options (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  label text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  show_for_entree text[] not null default '{}'::text[],
  blocked_by_dietary text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(category,label)
);

create index breakfast_menu_options_category_sort_idx
on public.breakfast_menu_options(category,sort_order);

create table public.breakfast_notes (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  note text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index breakfast_notes_service_date_idx
on public.breakfast_notes(service_date);

create table public.blackout_dates (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  reason text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint blackout_date_order_check check (end_date >= start_date)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx
on public.audit_log(created_at desc);

create trigger breakfast_bookings_updated_at
before update on public.breakfast_bookings
for each row execute function public.set_updated_at();

create trigger breakfast_guest_orders_updated_at
before update on public.breakfast_guest_orders
for each row execute function public.set_updated_at();

create trigger breakfast_menu_options_updated_at
before update on public.breakfast_menu_options
for each row execute function public.set_updated_at();

commit;

-- ============================================================
-- 05_BREAKFAST_SEED.sql
-- Rooms, Fall breakfast menu and known 2026 breakfast blackout.
-- ============================================================

begin;

insert into public.rooms(name,sort_order,active)
values
('Saugatuck',1,true),
('Douglas',2,true),
('Oxbow',3,true),
('Fenn Valley',4,true),
('Pier Cove',5,true),
('Sweet Gale',6,true),
('Lakeshore',7,true),
('Oval Beach',8,true),
('Sandpiper',9,true),
('Coral Gables',10,true),
('Singapore',11,true),
('Twin Gables',12,true),
('Harbor',13,true),
('Coastal Dunes',14,true),
('Blue Star',15,true),
('Butler',16,true),
('Clipson',17,true);

insert into public.breakfast_menu_options
(category,label,description,active,sort_order,show_for_entree,blocked_by_dietary)
values
('dietary','No Dietary Restrictions',null,true,10,'{}','{}'),
('dietary','Vegan',null,true,20,'{}','{}'),
('dietary','Vegetarian',null,true,30,'{}','{}'),
('dietary','Pescatarian',null,true,40,'{}','{}'),
('dietary','Dairy Free',null,true,50,'{}','{}'),
('dietary','Gluten Free',null,true,60,'{}','{}'),
('dietary','Shellfish',null,true,70,'{}','{}'),
('dietary','Seafood',null,true,80,'{}','{}'),
('dietary','Tree Nuts: Please specify below',null,true,90,'{}','{}'),
('dietary','Other: Please specify below',null,true,100,'{}','{}'),

('entree','Bacon & Boursin Omelet',
 'Fluffy three egg omelet filled with bacon and herby Boursin cheese. Served with toasted Michigan multigrain and a yogurt parfait.',
 true,10,'{}',ARRAY['Vegetarian','Pescatarian']),
('entree','Eggs Benedict',null,true,20,'{}','{}'),
('entree','Classic Breakfast',null,true,30,'{}','{}'),
('entree','Caramel Croissant',
 'A warm, flaky croissant topped with house-made caramel sauce and toasted almonds. Served with your choice of breakfast meat.',
 true,40,'{}',ARRAY['Gluten Free']),
('entree','Pain Perdu',null,true,50,'{}','{}'),
('entree','Pumpkin Spice Pancakes',null,true,60,'{}','{}'),
('entree','Smoked Salmon Plate',
 'Locally smoked salmon, hard boiled egg, herbed cream cheese, pickled things, multigrain.',
 true,70,'{}',ARRAY['Vegetarian','Seafood']),
('entree','Avocado Toast',null,true,80,'{}','{}'),
('entree','Cinnamon Apple Granola Bowl',null,true,90,'{}','{}'),

('meat','Pork Bacon',null,true,10,ARRAY['Classic Breakfast','Caramel Croissant','Pain Perdu','Pumpkin Spice Pancakes'],ARRAY['Vegetarian','Pescatarian']),
('meat','Turkey Bacon',null,true,20,ARRAY['Classic Breakfast','Caramel Croissant','Pain Perdu','Pumpkin Spice Pancakes'],ARRAY['Vegetarian','Pescatarian']),
('meat','Pork Sausage',null,true,30,ARRAY['Classic Breakfast','Caramel Croissant','Pain Perdu','Pumpkin Spice Pancakes'],ARRAY['Vegetarian','Pescatarian']),
('meat','None',null,true,40,ARRAY['Classic Breakfast','Caramel Croissant','Pain Perdu','Pumpkin Spice Pancakes'],ARRAY['Vegetarian','Pescatarian']),

('eggs','Fried',null,true,10,ARRAY['Classic Breakfast'],'{}'),
('eggs','Scrambled',null,true,20,ARRAY['Classic Breakfast'],'{}'),

('coffee','Regular',null,true,10,'{}','{}'),
('coffee','Decaf',null,true,20,'{}','{}'),
('coffee','None',null,true,30,'{}','{}'),

('cream','Milk',null,true,10,'{}','{}'),
('cream','Almond Milk',null,true,20,'{}','{}'),
('cream','Cream',null,true,30,'{}','{}'),
('cream','None',null,true,40,'{}','{}'),

('juice','Orange',null,true,10,'{}','{}'),
('juice','Cranberry',null,true,20,'{}','{}'),
('juice','Apple',null,true,30,'{}','{}'),
('juice','V8',null,true,40,'{}','{}'),
('juice','None',null,true,50,'{}','{}'),

('condiments','Jam',null,true,10,'{}','{}'),
('condiments','Hot Sauce',null,true,20,'{}','{}'),
('condiments','Ketchup',null,true,30,'{}','{}');

-- Breakfast unavailable October 19-29, 2026.
insert into public.blackout_dates(start_date,end_date,reason,active)
values(
  date '2026-10-19',
  date '2026-10-29',
  'Breakfast is not available October 19-29, 2026.',
  true
);

commit;

-- ============================================================
-- 06_RLS_AND_HELPERS.sql
-- Row-level security for the current server/client architecture.
-- Public guest writes use the server-side admin/service-role client.
-- ============================================================

begin;

alter table public.staff_profiles enable row level security;
alter table public.staff_roles enable row level security;
alter table public.app_permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.app_modules enable row level security;

alter table public.rooms enable row level security;
alter table public.breakfast_bookings enable row level security;
alter table public.breakfast_submissions enable row level security;
alter table public.breakfast_guest_orders enable row level security;
alter table public.breakfast_menu_options enable row level security;
alter table public.breakfast_notes enable row level security;
alter table public.blackout_dates enable row level security;
alter table public.audit_log enable row level security;

-- Profile/access metadata
create policy "staff read own profile"
on public.staff_profiles
for select to authenticated
using (auth.uid()=user_id);

create policy "staff read roles"
on public.staff_roles
for select to authenticated
using (active=true);

create policy "staff read permissions"
on public.app_permissions
for select to authenticated
using (active=true);

create policy "staff read role permissions"
on public.role_permissions
for select to authenticated
using (true);

create policy "staff read modules"
on public.app_modules
for select to authenticated
using (active=true);

-- Breakfast staff access
create policy "staff read rooms"
on public.rooms
for select to authenticated
using (true);

create policy "staff all breakfast bookings"
on public.breakfast_bookings
for all to authenticated
using (true)
with check (true);

create policy "staff all breakfast submissions"
on public.breakfast_submissions
for all to authenticated
using (true)
with check (true);

create policy "staff all breakfast guest orders"
on public.breakfast_guest_orders
for all to authenticated
using (true)
with check (true);

create policy "staff manage breakfast menu"
on public.breakfast_menu_options
for all to authenticated
using (true)
with check (true);

create policy "staff all breakfast notes"
on public.breakfast_notes
for all to authenticated
using (true)
with check (true);

create policy "staff read blackout dates"
on public.blackout_dates
for select to authenticated
using (true);

create policy "staff read audit"
on public.audit_log
for select to authenticated
using (true);

create policy "staff write audit"
on public.audit_log
for insert to authenticated
with check (actor_user_id is null or actor_user_id=auth.uid());

grant execute on function public.has_permission(text) to authenticated;

notify pgrst, 'reload schema';

commit;


-- VERIFICATION RESULTS FOLLOW


-- ============================================================
-- 07_VERIFY.sql
-- Run after the rebuild. This changes nothing.
-- ============================================================

-- Staff + role assignment
select
  sp.name,
  sp.email,
  sp.phone,
  sp.role as legacy_role,
  sr.name as assigned_role,
  sr.is_admin,
  sr.can_preview_unpublished,
  sr.can_manage_modules,
  sp.theme_preference,
  sp.active
from public.staff_profiles sp
left join public.staff_roles sr on sr.id=sp.role_id
order by sp.name;

-- Phone-login health
select
  sp.name,
  sp.phone as profile_phone,
  u.email as auth_email,
  u.phone as auth_phone,
  case
    when sp.phone is not null and u.email is not null then 'PHONE ALIAS READY'
    when sp.phone is null then 'ADD PHONE TO PROFILE'
    else 'CHECK AUTH USER'
  end as phone_login_status
from public.staff_profiles sp
join auth.users u on u.id=sp.user_id
order by sp.name;

-- App modules
select
  module_key,title,department,status,active,enabled,published,href
from public.app_modules
order by sort_order;

-- Breakfast schema row counts
select 'rooms' as table_name,count(*) from public.rooms
union all select 'breakfast_menu_options',count(*) from public.breakfast_menu_options
union all select 'blackout_dates',count(*) from public.blackout_dates
union all select 'breakfast_bookings',count(*) from public.breakfast_bookings
union all select 'breakfast_submissions',count(*) from public.breakfast_submissions
union all select 'breakfast_guest_orders',count(*) from public.breakfast_guest_orders;

-- Exact columns the app expects
select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema='public'
  and table_name in (
    'staff_profiles','staff_roles','app_permissions','role_permissions','app_modules',
    'rooms','breakfast_bookings','breakfast_submissions','breakfast_guest_orders',
    'breakfast_menu_options','breakfast_notes','blackout_dates','audit_log'
  )
order by table_name,ordinal_position;
