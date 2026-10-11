-- Soft-remove a cancelled imported reservation without losing its audit/history.
-- Overrides protect the removal from later imports of the same PMS order.
create or replace function public.ops_remove_reservation(
  p_reservation_id uuid,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_stay public.reservation_stays%rowtype;
  v_day date;
  v_arriving uuid;
  v_staying uuid;
  v_departing uuid;
  v_primary uuid;
  v_status text;
  v_plan text;
  v_notes text;
  v_breakfast boolean;
begin
  select * into v_stay
  from public.reservation_stays
  where id = p_reservation_id
  for update;
  if not found then
    raise exception 'Reservation not found';
  end if;
  if not v_stay.active then
    return jsonb_build_object('ok',true,'alreadyRemoved',true);
  end if;

  update public.reservation_stays
     set active = false, updated_at = now()
   where id = p_reservation_id;

  insert into public.reservation_staff_overrides(reservation_id,fields,updated_by,updated_at)
  values (p_reservation_id,'{"active":false}'::jsonb,p_actor_user_id,now())
  on conflict (reservation_id) do update
     set fields = coalesce(reservation_staff_overrides.fields,'{}'::jsonb) || '{"active":false}'::jsonb,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at;

  -- Remove only package tags inherited from this particular imported stay.
  delete from public.housekeeping_room_packages
   where reservation_id = p_reservation_id
     and source = 'reservation_sync';

  if v_stay.room_id is not null then
    for v_day in
      select generate_series(v_stay.arrival_date,v_stay.checkout_date,'1 day'::interval)::date
    loop
      select id into v_arriving from public.reservation_stays
       where active and room_id=v_stay.room_id and arrival_date=v_day
       order by last_seen_at desc,id limit 1;
      select id into v_departing from public.reservation_stays
       where active and room_id=v_stay.room_id and checkout_date=v_day
       order by last_seen_at desc,id limit 1;
      select id into v_staying from public.reservation_stays
       where active and room_id=v_stay.room_id and arrival_date<v_day and checkout_date>v_day
       order by last_seen_at desc,id limit 1;

      v_primary := coalesce(v_arriving,v_staying,v_departing);
      v_status := case
        when v_arriving is not null and v_departing is not null and v_arriving<>v_departing then 'Out/In'
        when v_arriving is not null then 'Arrival'
        when v_departing is not null then 'Checkout'
        when v_staying is not null then 'Stayover'
        else 'Vacant'
      end;

      insert into public.reservation_daily_links
        (service_date,room_id,reservation_status,primary_reservation_id,arriving_reservation_id,stay_reservation_id,departing_reservation_id,updated_at)
      values (v_day,v_stay.room_id,v_status,v_primary,v_arriving,v_staying,v_departing,now())
      on conflict (service_date,room_id) do update set
        reservation_status=excluded.reservation_status,
        primary_reservation_id=excluded.primary_reservation_id,
        arriving_reservation_id=excluded.arriving_reservation_id,
        stay_reservation_id=excluded.stay_reservation_id,
        departing_reservation_id=excluded.departing_reservation_id,
        updated_at=excluded.updated_at;

      -- This updates only nightly operational eligibility; submitted menus/orders
      -- and all other breakfast modules are intentionally untouched.
      v_breakfast := false;
      if v_arriving is not null or v_staying is not null then
        select coalesce(rate_plan,''),coalesce(innkeeper_notes,'')
          into v_plan,v_notes
          from public.reservation_stays where id=coalesce(v_arriving,v_staying);
        v_breakfast :=
          v_plan ~* 'room[[:space:]]*\+[[:space:]]*breakfast|breakfast[[:space:]]+included'
          or v_notes ~* '(^|[[:space:],;|])\+(B|Breakfast)\y'
          or v_notes ~* ('(a la carte|à la carte)[[:space:]]+breakfast[[:space:]]+morning[[:space:]]*:[[:space:]]*' || to_char(v_day + 1,'YYYY-MM-DD'));
      end if;

      update public.housekeeping_daily_rooms
         set reservation_status=case
               when v_status='Vacant' and
                 (room_condition='Vacant (Dirty)' or service_type ~ '^OUT') then 'Dirty'
               else v_status end,
             breakfast_tag=case when breakfast_tag_override is null then v_breakfast else breakfast_tag end,
             updated_at=now()
       where room_id=v_stay.room_id
         and service_date=v_day
         and reservation_status<>'Blocked'
         and coalesce(strip_hold,'') not ilike '%hold%'
         and coalesce(room_condition,'')<>'Blocked';
    end loop;
  end if;

  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,details)
  values (p_actor_user_id,'soft_remove','reservation',p_reservation_id::text,
    jsonb_build_object('reservation_number',v_stay.reservation_number,'room_id',v_stay.room_id,
      'arrival_date',v_stay.arrival_date,'checkout_date',v_stay.checkout_date));

  return jsonb_build_object('ok',true,'reservationId',p_reservation_id);
end;
$$;
revoke all on function public.ops_remove_reservation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ops_remove_reservation(uuid,uuid) to service_role;
