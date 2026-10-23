-- Notify once per transition into the inspection queue, from every save path.
create or replace function public.notify_room_ready_for_inspection()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare room_name text;
begin
  if not new.ready_for_inspection then return new; end if;
  if TG_OP = 'UPDATE' then
    if old.ready_for_inspection then return new; end if;
  end if;
  select name into room_name from public.rooms where id = new.room_id;
  insert into public.notifications
    (recipient_user_id, notification_type, title, message, room_id, service_date, created_by)
  select p.user_id, 'room_ready_for_inspection',
    coalesce(room_name,'Room') || ' is ready for inspection',
    coalesce(room_name,'Room') || ' has been sent for inspection for ' ||
      to_char(new.service_date,'MM/DD/YYYY') || '. Open the room inspection to review it.',
    new.room_id, new.service_date, new.updated_by
  from public.staff_profiles p
  left join public.staff_roles r on r.id = p.role_id
  where p.active
    and not exists (
      select 1 from public.staff_members m
      where m.auth_user_id = p.user_id and not m.active
    )
    and (
      coalesce(r.is_admin,false)
      or lower(coalesce(r.name,'')) in ('manager','owner','hospitality assistant','hospitality asst')
      or exists (
        select 1 from public.staff_members m
        join public.staff_member_capabilities c on c.staff_member_id = m.id
        where m.auth_user_id = p.user_id and m.active
          and c.capability_key in
            ('manager','general_manager','operations_manager','owner','foh_manager','hospitality_assistant')
      )
    );
  return new;
end;
$$;
revoke all on function public.notify_room_ready_for_inspection() from public, anon, authenticated;
drop trigger if exists room_ready_for_inspection_notification on public.housekeeping_daily_rooms;
create trigger room_ready_for_inspection_notification
after insert or update of ready_for_inspection on public.housekeeping_daily_rooms
for each row execute function public.notify_room_ready_for_inspection();
