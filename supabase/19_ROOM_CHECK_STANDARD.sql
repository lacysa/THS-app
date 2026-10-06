update public.room_check_items
set active=false
where active=true;

insert into public.room_check_items (item_key,zone,label,sort_order,active) values
('staging_windows','Room Staging','Blinds/drapes, windows, and sills are clean and staged correctly for the room/view',10,true),
('staging_ambiance','Room Staging','Thermostat, fireplace, dehumidifier, lighting, ceiling fan, and exhaust fans are set appropriately',20,true),

('bed_staging','Bed & Sleeping Area','Bed and decorative bedding are clean and staged correctly; no hair, lint, stains, or visible dust',30,true),
('bed_floor_lost_items','Bed & Sleeping Area','Under bed, behind nightstands, drawers, and surrounding floor are clean and free of trash, debris, lost items, or guest belongings',40,true),

('kitchen_clean','Kitchenette','Counter, sink, microwave, fridge/freezer, Keurig, and surrounding surfaces are clean, dry, and free of leftover food or debris',50,true),
('kitchen_stocked','Kitchenette','Coffee station, dishware, glassware, silverware, paper towels, wine key, water bottles, and ice bucket are fully stocked and correctly placed',60,true),

('tub_clean','Tub & Shower','Jacuzzi tub is clean and free of grime, hair, and debris; towels and bathmat are staged correctly',70,true),
('shower_clean','Tub & Shower','Shower glass, fixtures, walls, floor, and niches are clean and free of water spots, soap scum, and hair; bathmat is placed correctly',80,true),

('vanity_clean_stocked','Vanity & Toilet','Vanity and sink are clean and dry; faucet/mirror are polished; guest bath amenities are fully stocked',90,true),
('under_vanity_stock','Vanity & Toilet','Under-vanity supplies and trash setup are complete and organized',100,true),
('toilet_standard','Vanity & Toilet','Toilet bowl, rim, seat, base, tank, and hinge area are spotless; toilet paper is stocked and presented correctly',110,true),

('living_dining','Living & Dining','Breakfast table, chairs, seating area, cushions, and surrounding floor are clean, crumb-free, and neatly arranged',120,true),

('closet_drawers','Closet & Exterior','Closet has 6 hangers and 2 robes neatly arranged; all drawers have been checked for forgotten items',130,true),
('patio_deck','Closet & Exterior','Patio/deck is swept, furniture is clean and arranged, and seasonal safety needs are addressed',140,true),

('final_guest_ready','Final Walkthrough','Room is guest-ready with no visible hair, crumbs, debris, forgotten items, housekeeping tools, or staging issues remaining',150,true);
