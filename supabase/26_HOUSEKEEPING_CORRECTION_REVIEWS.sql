-- Manual categories and review status are separate from the immutable Room Operations correction events.
-- Mirrors deployed Supabase migration housekeeping_correction_review_workflow.
create table if not exists public.housekeeping_correction_reviews (
  correction_event_id uuid primary key references public.housekeeping_correction_events(id) on delete cascade,
  categories text[] not null default array[]::text[],
  reviewed_at timestamptz,
  reviewed_by uuid references public.staff_members(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff_members(id) on delete set null,
  constraint correction_categories_nonempty check (cardinality(categories) between 1 and 8)
);
create table if not exists public.housekeeping_correction_review_history (
  id uuid primary key default gen_random_uuid(),
  correction_event_id uuid not null references public.housekeeping_correction_events(id) on delete cascade,
  previous_categories text[],
  categories text[] not null,
  previous_reviewed_at timestamptz,
  reviewed_at timestamptz,
  changed_by uuid references public.staff_members(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists housekeeping_correction_review_history_event_idx
  on public.housekeeping_correction_review_history(correction_event_id,changed_at desc);
alter table public.housekeeping_correction_reviews enable row level security;
alter table public.housekeeping_correction_review_history enable row level security;
create or replace function public.record_housekeeping_correction_review_history()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.housekeeping_correction_review_history
      (correction_event_id,previous_categories,categories,previous_reviewed_at,reviewed_at,changed_by)
    values (new.correction_event_id,null,new.categories,null,new.reviewed_at,new.updated_by);
  elsif old.categories is distinct from new.categories or old.reviewed_at is distinct from new.reviewed_at then
    insert into public.housekeeping_correction_review_history
      (correction_event_id,previous_categories,categories,previous_reviewed_at,reviewed_at,changed_by)
    values (new.correction_event_id,old.categories,new.categories,old.reviewed_at,new.reviewed_at,new.updated_by);
  end if;
  return new;
end;
$$;
drop trigger if exists housekeeping_correction_review_audit on public.housekeeping_correction_reviews;
create trigger housekeeping_correction_review_audit
after insert or update on public.housekeeping_correction_reviews
for each row execute function public.record_housekeeping_correction_review_history();