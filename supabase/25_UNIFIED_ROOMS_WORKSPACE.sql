-- ============================================================
-- 25_UNIFIED_ROOMS_WORKSPACE.sql
-- Consolidate daily housekeeping + room checks into one Rooms module.
-- Existing quality/inspection history remains untouched.
-- ============================================================

begin;

update public.app_modules
set
  title='Rooms',
  label='Rooms',
  href='/housekeeping',
  status='live',
  active=true,
  enabled=true,
  published=true,
  description='Unified daily room workflow for housekeeping, inspections, HA and FOH checks.',
  updated_at=now()
where module_key='housekeeping';

update public.app_modules
set
  title='Room Checks (Integrated)',
  label='Room Checks',
  enabled=false,
  published=false,
  description='Legacy navigation entry. Room checks now run inside the Rooms workspace.',
  updated_at=now()
where module_key='room_checks';

commit;
