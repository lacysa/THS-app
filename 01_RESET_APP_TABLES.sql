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
