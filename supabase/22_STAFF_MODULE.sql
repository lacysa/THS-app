insert into public.app_modules
  (module_key,title,label,department,href,status,sort_order,active,enabled,published,description)
values
  ('staff','Staff','Staff','operations','/staff','live',160,true,true,true,'Owner-only staff access management')
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
  description=excluded.description,
  updated_at=now();
