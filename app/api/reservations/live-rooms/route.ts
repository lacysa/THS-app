import { NextRequest,NextResponse } from 'next/server'
import { canUseModule } from '@/lib/access'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { loadTubTaskStates } from '@/lib/ops-tub'
import { previousVacantConditions } from '@/lib/room-condition-carry'
import { isCheckoutAwaitingOut, isStayoverRoom } from '@/lib/room-state'

export const dynamic='force-dynamic'
export async function GET(req:NextRequest){
 const gate=await canUseModule('reservations')
 if(!gate.access)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(!gate.allowed)return NextResponse.json({error:'Forbidden'},{status:403})
 const date=req.nextUrl.searchParams.get('date')
 if(!date||!/^20\d{2}-\d{2}-\d{2}$/.test(date))return NextResponse.json({error:'Invalid date'},{status:400})
 const admin=createSupabaseAdmin()
 const result=await admin.from('housekeeping_daily_rooms')
  .select('room_id,assigned_to,clean_order,reservation_status,late_arrival,strip_hold,service_type,room_condition,complete,inspected,housekeeper_attested_by,ha_signed_by,foh_signed_by,check_issue_open,notes,breakfast_tag')
  .eq('service_date',date)
 if(result.error)return NextResponse.json({error:'Could not refresh live room status'},{status:500})
 let carryConditions:Map<string,string>
 try{carryConditions=await previousVacantConditions(admin,date,result.data||[])}catch{return NextResponse.json({error:'Could not load room condition history'},{status:500})}
 let tubStates:Awaited<ReturnType<typeof loadTubTaskStates>>
 try{tubStates=await loadTubTaskStates(admin,date)}catch{return NextResponse.json({error:'Could not refresh tub service tasks'},{status:500})}
 // Match the arrival times saved from the Room Ops popup without changing the reservation data.
 const arrivalTimesResult=await admin.from('room_ops_details').select('room_id,expected_arrival_time').eq('service_date',date)
 if(arrivalTimesResult.error)return NextResponse.json({error:'Could not load expected arrival times'},{status:500})
 const expectedTimes=new Map<string,string>((arrivalTimesResult.data||[]).map((item:any)=>[String(item.room_id),String(item.expected_arrival_time||'')]))
  // Refresh the linked reservations as well as the daily housekeeping values.
  const linksResult=await admin.from('reservation_daily_links').select('arriving_reservation_id,stay_reservation_id,primary_reservation_id,departing_reservation_id').eq('service_date',date)
  if(linksResult.error)return NextResponse.json({error:'Could not refresh linked reservations'},{status:500})
  const stayIds=[...new Set((linksResult.data||[]).flatMap((link:any)=>[
   link.arriving_reservation_id,link.stay_reservation_id,link.primary_reservation_id,link.departing_reservation_id
  ]).filter(Boolean).map(String))]
  let stays:any[]=[]
  if(stayIds.length){
   const [staysResult,overridesResult]=await Promise.all([
    admin.from('reservation_stays').select('id,guest_name,arrival_date,checkout_date,check_in_time,innkeeper_notes,guest_comments').in('id',stayIds),
    admin.from('reservation_staff_overrides').select('reservation_id,fields').in('reservation_id',stayIds)
   ])
   if(staysResult.error||overridesResult.error)return NextResponse.json({error:'Could not refresh arrival information'},{status:500})
   const editedIds=new Set<string>((overridesResult.data||[]).filter((item:any)=>Object.prototype.hasOwnProperty.call(item.fields||{},'check_in_time')).map((item:any)=>String(item.reservation_id)))
   stays=(staysResult.data||[]).map((stay:any)=>({...stay,checkInTimeManuallyEdited:editedIds.has(String(stay.id))}))
  }
 return NextResponse.json({rooms:(result.data||[]).map((r:any)=>({
  roomId:String(r.room_id),expectedArrivalTime:expectedTimes.get(String(r.room_id))||'',assignedTo:String(r.assigned_to||''),cleanOrder:r.clean_order==null?null:Number(r.clean_order),roomNotes:String(r.notes||''),breakfastTag:Boolean(r.breakfast_tag),operationalStatus:String(r.reservation_status||''),
  stripHold:String(r.strip_hold||''),lateArrival:Boolean(r.late_arrival),serviceType:String(r.service_type||''),
  roomCondition:(isStayoverRoom({reservationStatus:r.reservation_status})||isCheckoutAwaitingOut({reservationStatus:r.reservation_status,serviceType:r.service_type}))&&!String(r.strip_hold||'').toLowerCase().includes('hold')?'Occupied':String(r.room_condition||carryConditions.get(String(r.room_id))||''),complete:Boolean(r.complete),
  inspected:Boolean(r.inspected),housekeeperAttested:Boolean(r.housekeeper_attested_by),
  haChecked:Boolean(r.ha_signed_by),fohChecked:Boolean(r.foh_signed_by),
  checkIssueOpen:Boolean(r.check_issue_open),tubCleanDue:Boolean(tubStates.get(String(r.room_id))?.due),tubAssignedTo:String(tubStates.get(String(r.room_id))?.assignedTo||''),tubCleanCompleted:Boolean(tubStates.get(String(r.room_id))?.completed)
 })),stays},{headers:{'cache-control':'private, no-store'}})
}
