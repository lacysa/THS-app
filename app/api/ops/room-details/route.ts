import {NextRequest,NextResponse} from 'next/server'
import {canUseModule} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'

export const dynamic='force-dynamic'
const validId=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const validDate=(value:unknown)=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))
const validTime=(value:unknown)=>value===null||(typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value))

export async function PATCH(req:NextRequest){
 const [opsGate,reservationGate]=await Promise.all([canUseModule('ops'),canUseModule('reservations')])
 const access=opsGate.access||reservationGate.access
 if(!access)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(!opsGate.allowed&&!reservationGate.allowed)return NextResponse.json({error:'Forbidden'},{status:403})
 const caps=access.capabilities||[]
 if(access.isPreviewMode||!(access.isAdmin||caps.some((c:string)=>['manager','general_manager','operations_manager','owner'].includes(c))))
  return NextResponse.json({error:'Management access required'},{status:403})
 const body=await req.json().catch(()=>null)
 const {roomId,date,action}=body||{}
 if(!validId(roomId)||!validDate(date)||typeof action!=='string')
  return NextResponse.json({error:'Invalid room, date or action'},{status:400})
 const admin=createSupabaseAdmin()
 const {data:room,error:roomError}=await admin.from('rooms').select('id').eq('id',roomId).eq('active',true).maybeSingle()
 if(roomError||!room)return NextResponse.json({error:'Room not found'},{status:404})
 const {data:daily,error:dayError}=await admin.from('housekeeping_daily_rooms').select('room_id,strip_hold,reservation_status').eq('room_id',roomId).eq('service_date',date).maybeSingle()
 if(dayError||!daily)return NextResponse.json({error:'Room date not scheduled'},{status:404})
 const now=new Date().toISOString()
 const patch:Record<string,unknown>={room_id:roomId,service_date:date,updated_by:access.userId,updated_at:now}
 if(action==='times'){
  if(![body.expectedArrivalTime,body.actualArrivalTime,body.lateCheckoutTime].every(validTime))
   return NextResponse.json({error:'Times must be HH:MM in 24-hour format'},{status:400})
  patch.expected_arrival_time=body.expectedArrivalTime
  patch.actual_arrival_time=body.actualArrivalTime
  patch.late_checkout_time=body.lateCheckoutTime
 }else if(action==='trayReturned'){
  patch.tray_returned_at=now
 }else if(action==='trayReset'){
  patch.tray_returned_at=null
 }else if(action==='tubRequest'){
  if(String(daily.strip_hold||'').toLowerCase().includes('hold')||String(daily.reservation_status||'').toLowerCase()==='blocked')
   return NextResponse.json({error:'A blocked room cannot be assigned a tub-clean task'},{status:400})
  patch.tub_clean_requested_at=now
  patch.tub_clean_completed_at=null
  patch.tub_clean_completed_by=null
 }else if(action==='tubComplete'){
  patch.tub_clean_completed_at=now
  patch.tub_clean_completed_by=access.userId
 }else if(action==='tubReopen'){
  patch.tub_clean_requested_at=now
  patch.tub_clean_completed_at=null
  patch.tub_clean_completed_by=null
 }else{
  return NextResponse.json({error:'Unknown room task'},{status:400})
 }
 const {data:result,error}=await admin.from('room_ops_details').upsert(patch,{onConflict:'room_id,service_date'}).select('*').single()
 if(error)return NextResponse.json({error:error.message},{status:500})
 return NextResponse.json({ok:true,details:result},{headers:{'cache-control':'private, no-store'}})
}
