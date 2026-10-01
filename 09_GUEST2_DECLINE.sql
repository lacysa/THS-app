-- THS Guest 2 decline support
begin;

alter table public.breakfast_guest_orders
add column if not exists meal_declined boolean not null default false;

alter table public.breakfast_guest_orders
drop constraint if exists breakfast_guest_orders_decline_consistency;

alter table public.breakfast_guest_orders
add constraint breakfast_guest_orders_decline_consistency
check (
  meal_declined = false
  or (
    dietary is null
    and dietary_comments is null
    and entree is null
    and pancakes is null
    and meat is null
    and eggs is null
    and coffee is null
    and cream is null
    and juice is null
    and condiments is null
  )
);

-- Keep native upsert compatible with ON CONFLICT (booking_id,guest_number).
drop index if exists public.breakfast_guest_orders_booking_guest_uidx;

alter table public.breakfast_guest_orders
drop constraint if exists breakfast_guest_orders_booking_guest_key;

alter table public.breakfast_guest_orders
add constraint breakfast_guest_orders_booking_guest_key
unique (booking_id,guest_number);

notify pgrst, 'reload schema';

commit;
