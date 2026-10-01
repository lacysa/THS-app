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


-- Breakfast unavailable October 19-29, 2026.
insert into public.blackout_dates(start_date,end_date,reason,active)
values(
  date '2026-10-19',
  date '2026-10-29',
  'Breakfast is not available October 19-29, 2026.',
  true
);

commit;
