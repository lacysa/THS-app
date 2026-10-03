-- ============================================================
-- MOBILE/KITCHEN/HOUSEKEEPING GUIDE UPDATE
-- Safe to run more than once.
-- Adds date-scoped kitchen notes and housekeeping training/resources.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.kitchen_daily_notes (
  service_date date primary key,
  note text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kitchen_daily_notes enable row level security;

create table if not exists public.housekeeping_guides (
  guide_key text primary key,
  title text not null,
  content text not null default '',
  sort_order integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint housekeeping_guides_key_check
    check (guide_key in ('manual','tote','checklist'))
);

insert into public.housekeeping_guides (guide_key,title,content,sort_order)
values
  ('manual','Housekeeping Manual',
'Housekeeping Manual

Use this page for The Hotel Saugatuck housekeeping standards, procedures, training notes, safety information, linen procedures, guest-room setup standards, and escalation instructions.

Managers can edit this content as the manual evolves.',10),
  ('tote','What to Have in Your Cleaning Tote',
'Before entering rooms, confirm your tote is stocked for the shift.

STARTER LIST
- Disposable gloves
- Microfiber cleaning cloths
- Glass/mirror cloth
- All-purpose cleaner
- Bathroom cleaner
- Disinfectant
- Glass cleaner
- Toilet cleaning supplies
- Trash bags / liners
- Spot-treatment supplies
- Guest amenity replacements used during cleaning

Edit this list to match the exact THS tote standard.',20),
  ('checklist','In-room Cleaning Checklist',
'IN-ROOM CLEANING CHECKLIST

1. Enter / assess room
- Confirm room status and assignment.
- Note damage, maintenance needs, lost & found, or unusual conditions before cleaning.

2. Strip / remove
- Remove trash and used service items.
- Strip linens as required for the service type.

3. Clean high to low
- Dust and wipe room surfaces.
- Clean mirrors/glass.
- Clean and sanitize bathroom.
- Clean guest-use equipment and touch points.

4. Reset room
- Make bed(s) to THS standard.
- Restock linens, towels, amenities, beverages, and guest supplies.
- Return furniture/decor to standard placement.

5. Floors / final pass
- Vacuum/sweep/mop as appropriate.
- Check under/behind movable items.
- Confirm odor, lighting, temperature, and presentation.

6. Final inspection
- Check the room from the guest entrance.
- Report maintenance or room-condition issues.
- Mark the room complete only when guest-ready.

Edit this checklist to match the exact THS cleaning sequence.',30)
on conflict (guide_key) do nothing;

create table if not exists public.housekeeping_zones (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'room'
    check (scope in ('room','property')),
  room_id uuid references public.rooms(id) on delete cascade,
  name text not null,
  details text not null default '',
  sort_order integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint housekeeping_zones_scope_check
    check ((scope='room' and room_id is not null) or (scope='property' and room_id is null))
);

create index if not exists housekeeping_zones_room_idx
on public.housekeeping_zones(room_id,sort_order);

create table if not exists public.housekeeping_zone_photos (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.housekeeping_zones(id) on delete cascade,
  storage_path text not null,
  caption text,
  sort_order integer not null default 0,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists housekeeping_zone_photos_zone_idx
on public.housekeeping_zone_photos(zone_id,sort_order);

alter table public.housekeeping_guides enable row level security;
alter table public.housekeeping_zones enable row level security;
alter table public.housekeeping_zone_photos enable row level security;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'housekeeping-photos',
  'housekeeping-photos',
  false,
  12582912,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
)
on conflict (id) do update set
  public=false,
  file_size_limit=12582912,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[];
