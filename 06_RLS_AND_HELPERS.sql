-- ============================================================
-- 06_RLS_AND_HELPERS.sql
-- Row-level security for the current server/client architecture.
-- Public guest writes use the server-side admin/service-role client.
-- ============================================================

begin;

alter table public.staff_profiles enable row level security;
alter table public.staff_roles enable row level security;
alter table public.app_permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.app_modules enable row level security;

alter table public.rooms enable row level security;
alter table public.breakfast_bookings enable row level security;
alter table public.breakfast_submissions enable row level security;
alter table public.breakfast_guest_orders enable row level security;
alter table public.breakfast_menu_options enable row level security;
alter table public.breakfast_notes enable row level security;
alter table public.blackout_dates enable row level security;
alter table public.audit_log enable row level security;

-- Profile/access metadata
create policy "staff read own profile"
on public.staff_profiles
for select to authenticated
using (auth.uid()=user_id);

create policy "staff read roles"
on public.staff_roles
for select to authenticated
using (active=true);

create policy "staff read permissions"
on public.app_permissions
for select to authenticated
using (active=true);

create policy "staff read role permissions"
on public.role_permissions
for select to authenticated
using (true);

create policy "staff read modules"
on public.app_modules
for select to authenticated
using (active=true);

-- Breakfast staff access
create policy "staff read rooms"
on public.rooms
for select to authenticated
using (true);

create policy "staff all breakfast bookings"
on public.breakfast_bookings
for all to authenticated
using (true)
with check (true);

create policy "staff all breakfast submissions"
on public.breakfast_submissions
for all to authenticated
using (true)
with check (true);

create policy "staff all breakfast guest orders"
on public.breakfast_guest_orders
for all to authenticated
using (true)
with check (true);

create policy "staff manage breakfast menu"
on public.breakfast_menu_options
for all to authenticated
using (true)
with check (true);

create policy "staff all breakfast notes"
on public.breakfast_notes
for all to authenticated
using (true)
with check (true);

create policy "staff read blackout dates"
on public.blackout_dates
for select to authenticated
using (true);

create policy "staff read audit"
on public.audit_log
for select to authenticated
using (true);

create policy "staff write audit"
on public.audit_log
for insert to authenticated
with check (actor_user_id is null or actor_user_id=auth.uid());

grant execute on function public.has_permission(text) to authenticated;

notify pgrst, 'reload schema';

commit;
