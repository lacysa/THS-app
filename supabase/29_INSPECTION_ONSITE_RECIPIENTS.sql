-- Route room-ready inspection alerts only to on-site managers and
-- Hospitality Assistants on the room's service date.
-- The staff_daily_schedule table is the same schedule used by the app.
-- No fallback to off-duty management: an unscheduled person must not be notified.
create or replace function public.notify_room_ready_for_inspection()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  room_name text;
begin
  if not coalesce(new.ready_for_inspection,false) then
    return new;
  end if;
  if TG_OP = 'UPDATE' and coalesce(old.ready_for_inspection,false) then
    return new;
  end if;

  select name into room_name from public.rooms where id = new.room_id;

  insert into public.notifications
    (recipient_user_id, notification_type, title, message, room_id, service_date, created_by)
  select distinct
    profile.user_id,
    'room_ready_for_inspection',
    coalesce(room_name,'Room') || ' is ready for inspection',
    coalesce(room_name,'Room') || ' has been sent for inspection for ' ||
      to_char(new.service_date,'MM/DD/YYYY') || '. Open the room inspection to review it.',
    new.room_id, new.service_date, new.updated_by
  from public.staff_members staff
  join public.staff_daily_schedule shift
    on shift.staff_member_id = staff.id
    and shift.schedule_date = new.service_date
    and shift.work_mode = 'onsite'
  join public.staff_profiles profile
    on profile.user_id = staff.auth_user_id
    and profile.active
  left join public.staff_roles role
    on role.id = profile.role_id
  where staff.active
    and staff.auth_user_id is not null
    and (
      lower(coalesce(role.name,'')) in (
        'manager','general manager','operations manager','foh manager',
        'hospitality assistant','hospitality asst'
      )
      or exists (
        select 1
        from public.staff_member_capabilities capability
        where capability.staff_member_id = staff.id
          and capability.capability_key in (
            'manager','general_manager','operations_manager','foh_manager',
            'hospitality_assistant'
          )
      )
    );

  return new;
end;
$$;
-- This is a trigger-only function. Keep it inaccessible via the Data API.
revoke all on function public.notify_room_ready_for_inspection() from public, anon, authenticated;
