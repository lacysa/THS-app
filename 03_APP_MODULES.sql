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
