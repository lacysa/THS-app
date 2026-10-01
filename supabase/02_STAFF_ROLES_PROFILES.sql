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
