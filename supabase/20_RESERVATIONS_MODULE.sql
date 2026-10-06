-- Reservations module
begin;

insert into public.app_modules
(module_key,title,label,department,href,status,sort_order,active,enabled,published,description)
values
('reservations','Reservations','Reservations','operations','/reservations','live',24,true,true,true,'Daily reservation and stay details for front office operations.')
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
