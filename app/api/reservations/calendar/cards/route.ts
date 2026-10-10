import {NextRequest,NextResponse} from 'next/server'
import {canUseModule} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'

export const dynamic='force-dynamic'

function validDate(value:string){
  return /^20\d{2}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))
}
function previousDate(day:string){
  const date=new Date(day+'T12:00:00Z')
  date.setUTCDate(date.getUTCDate()-1)
  return date.toISOString().slice(0,10)
}

export async function GET(req:NextRequest){
  const [opsGate,reservationGate]=await Promise.all([canUseModule('ops'),canUseModule('reservations')])
  if(!opsGate.access&&!reservationGate.access)return NextResponse.json({error:'Unauthorized'},{status:401})
  if(!opsGate.allowed&&!reservationGate.allowed)return NextResponse.json({error:'Forbidden'},{status:403})

  const date=req.nextUrl.searchParams.get('date')||''
  if(!validDate(date))return NextResponse.json({error:'Invalid date'},{status:400})

  const admin=createSupabaseAdmin()
  const [roomsResult,linksResult,dailyResult,priorResult]=await Promise.all([
    admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
    admin.from('reservation_daily_links').select('room_id,reservation_status,primary_reservation_id,arriving_reservation_id,stay_reservation_id,departing_reservation_id').eq('service_date',date),
    admin.from('housekeeping_daily_rooms').select('room_id,reservation_status,late_arrival,strip_hold,service_type,room_condition,next_shift_condition,complete,inspected,housekeeper_attested_by,ha_signed_by,foh_signed_by,check_issue_open,notes,breakfast_tag').eq('service_date',date),
    admin.from('housekeeping_daily_rooms').select('room_id,room_condition,next_shift_condition').eq('service_date',previousDate(date))
  ])
  if(roomsResult.error||linksResult.error||dailyResult.error||priorResult.error){
    return NextResponse.json({error:'Could not load reservation cards'},{status:500})
  }

  const links=linksResult.data||[]
  const ids=[...new Set(links.flatMap((row:any)=>[
    row.primary_reservation_id,row.arriving_reservation_id,row.stay_reservation_id,row.departing_reservation_id
  ]).filter(Boolean).map(String))]
  const staysResult=ids.length?await admin.from('reservation_stays')
    .select('id,guest_name,guest_phone,door_code,rate_plan,occupancy,arrival_date,checkout_date,check_in_time,products_raw,dietary_restrictions,guest_comments,innkeeper_notes,reason_for_visit')
    .in('id',ids):null
  if(staysResult?.error)return NextResponse.json({error:'Could not load guest reservation details'},{status:500})

  const stays=new Map<string,any>((staysResult?.data||[]).map((stay:any)=>[String(stay.id),stay]))
  const current=new Map<string,any>((dailyResult.data||[]).map((room:any)=>[String(room.room_id),room]))
  const prior=new Map<string,any>((priorResult.data||[]).map((room:any)=>[String(room.room_id),room]))
  const linksByRoom=new Map<string,any>(links.map((link:any)=>[String(link.room_id),link]))

  const rows=(roomsResult.data||[]).flatMap((room:any)=>{
    const roomId=String(room.id)
    const link=linksByRoom.get(roomId)
    if(!link)return []
    const primary=link.primary_reservation_id?stays.get(String(link.primary_reservation_id))||null:null
    const arriving=link.arriving_reservation_id?stays.get(String(link.arriving_reservation_id))||null:null
    const staying=link.stay_reservation_id?stays.get(String(link.stay_reservation_id))||null:null
    const departing=link.departing_reservation_id?stays.get(String(link.departing_reservation_id))||null:null
    if(!primary&&!arriving&&!staying&&!departing)return []

    const now=current.get(roomId)||{}
    const before=prior.get(roomId)||{}
    const condition=String(now.room_condition||'').trim()
    const priorCondition=String(before.next_shift_condition||before.room_condition||'').trim()
    const inheritedReady=!condition&&priorCondition==='Vacant (Clean)'
    return [{
      roomId,roomName:String(room.name||'Room'),
      status:String(link.reservation_status||now.reservation_status||'Vacant'),
      primary,arriving,staying,departing,
      serviceType:String(now.service_type||''),
      operationalStatus:String(now.reservation_status||link.reservation_status||'Vacant'),
      stripHold:String(now.strip_hold||''),
      roomNotes:String(now.notes||''),
      breakfastTag:Boolean(now.breakfast_tag),
      lateArrival:Boolean(now.late_arrival),
      roomCondition:condition||(inheritedReady?'Ready':''),
      nextShiftCondition:String(now.next_shift_condition||''),
      complete:Boolean(now.complete),
      inspected:Boolean(now.inspected),
      fohChecked:Boolean(now.foh_signed_by),
      haChecked:Boolean(now.ha_signed_by),
      housekeeperAttested:Boolean(now.housekeeper_attested_by),
      checkIssueOpen:Boolean(now.check_issue_open)
    }]
  })

  return NextResponse.json({date,rows},{headers:{'cache-control':'private, no-store'}})
}
