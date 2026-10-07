begin;

alter table public.staff_members
  add column if not exists full_room_clean_limit integer not null default 2;

alter table public.staff_members
  drop constraint if exists staff_members_full_room_clean_limit_check;

alter table public.staff_members
  add constraint staff_members_full_room_clean_limit_check
  check (full_room_clean_limit between 0 and 10);

update public.staff_members
set full_room_clean_limit=1, updated_at=now()
where lower(name) in ('kiana','chloe');

commit;
