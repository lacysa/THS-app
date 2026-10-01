-- THS Operations Hub
-- Accurate Fall breakfast menu seed + dietary filtering support
-- Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.breakfast_menu_options (
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

alter table public.breakfast_menu_options
  add column if not exists blocked_by_dietary text[] not null default '{}'::text[];

alter table public.breakfast_menu_options enable row level security;

drop policy if exists "staff manage breakfast menu" on public.breakfast_menu_options;
create policy "staff manage breakfast menu"
on public.breakfast_menu_options
for all
to authenticated
using (true)
with check (true);

-- Deactivate any old/incomplete seed choices first. The upserts below reactivate
-- the choices that belong to the current Fall menu.
update public.breakfast_menu_options
set active = false,
    updated_at = now()
where category in ('dietary','entree','meat','eggs','coffee','cream','juice','condiments');

insert into public.breakfast_menu_options
  (category,label,description,active,sort_order,show_for_entree,blocked_by_dietary)
values
  -- Dietary restrictions shown in the Tally logic
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

  -- Fall entrees from the current Tally form
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

  -- Meat is only needed for the entrees that offer a meat choice.
  ('meat','Pork Bacon',null,true,10,ARRAY['Classic Breakfast','Caramel Croissant','Pain Perdu','Pumpkin Spice Pancakes'],ARRAY['Vegetarian','Pescatarian']),
  ('meat','Turkey Bacon',null,true,20,ARRAY['Classic Breakfast','Caramel Croissant','Pain Perdu','Pumpkin Spice Pancakes'],ARRAY['Vegetarian','Pescatarian']),
  ('meat','Pork Sausage',null,true,30,ARRAY['Classic Breakfast','Caramel Croissant','Pain Perdu','Pumpkin Spice Pancakes'],ARRAY['Vegetarian','Pescatarian']),
  ('meat','None',null,true,40,ARRAY['Classic Breakfast','Caramel Croissant','Pain Perdu','Pumpkin Spice Pancakes'],ARRAY['Vegetarian','Pescatarian']),

  -- Egg style is used for the Classic Breakfast.
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
  ('condiments','Ketchup',null,true,30,'{}','{}')
on conflict (category,label) do update set
  description = excluded.description,
  active = true,
  sort_order = excluded.sort_order,
  show_for_entree = excluded.show_for_entree,
  blocked_by_dietary = excluded.blocked_by_dietary,
  updated_at = now();

notify pgrst, 'reload schema';

-- Verify active Fall menu after restore.
select
  category,
  label,
  description,
  sort_order,
  show_for_entree,
  blocked_by_dietary
from public.breakfast_menu_options
where active = true
order by
  case category
    when 'dietary' then 1
    when 'entree' then 2
    when 'meat' then 3
    when 'eggs' then 4
    when 'coffee' then 5
    when 'cream' then 6
    when 'juice' then 7
    when 'condiments' then 8
    else 99
  end,
  sort_order,
  label;
