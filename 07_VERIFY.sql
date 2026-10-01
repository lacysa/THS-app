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
