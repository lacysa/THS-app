import {NextRequest,NextResponse} from 'next/server'
import {canUseModule} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'
import {ymdInHotelTz} from '@/lib/time'
import {priorConditionCandidate} from '@/lib/room-condition-carry'

export const dynamic='force-dynamic'
function addDay(day:string,days:number){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}

export async function GET(req:NextRequest){
  const [reservationGate,opsGate]=await Promise.all([canUseModule('reservations'),canUseModule('ops')])
  if(!reservationGate.access)return NextResponse.json({error:'Unauthorized'},{status:401})
  if(!reservationGate.allowed&&!opsGate.allowed)return NextResponse.json({error:'Forbidden'},{status:403})
  const access=reservationGate.access||opsGate.access
  const canRemove=Boolean(access&&!access.isPreviewMode&&(access.isAdmin||['foh_manager','manager','general_manager','operations_manager','owner'].some(cap=>access.capabilities?.includes(cap))))
  const start=req.nextUrl.searchParams.get('start')||''
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(start)||Number.isNaN(Date.parse(start+'T12:00:00Z')))return NextResponse.json({error:'Invalid start date'},{status:400})
  const end=addDay(start,6)
  const admin=createSupabaseAdmin()
  const [roomsRes,linksRes,housekeepingRes,historyRes]=await Promise.all([
    admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
    admin.from('reservation_daily_links').select('service_date,room_id,reservation_status,primary_reservation_id,arriving_reservation_id,stay_reservation_id,departing_reservation_id').gte('service_date',start).lte('service_date',end),
    admin.from('housekeeping_daily_rooms').select('service_date,room_id,reservation_status,strip_hold,room_condition,next_shift_condition,late_arrival,notes,updated_by').gte('service_date',start).lte('service_date',end),
    admin.from('housekeeping_daily_rooms').select('service_date,room_id,room_condition,next_shift_condition,reservation_status,service_type').lt('service_date',start).order('service_date',{ascending:false}).limit(3000)
  ])
  if(roomsRes.error||linksRes.error||housekeepingRes.error||historyRes.error)return NextResponse.json({error:'Could not load calendar'},{status:500})
  const links=linksRes.data||[]
  const ids=[...new Set(links.flatMap((l:any)=>[l.primary_reservation_id,l.arriving_reservation_id,l.stay_reservation_id,l.departing_reservation_id]).filter(Boolean).map(String))]
  const stays=ids.length?(await admin.from('reservation_stays').select('id,guest_name,arrival_date,checkout_date').in('id',ids)):null
  if(stays?.error)return NextResponse.json({error:'Could not load guest stays'},{status:500})
  // Link recorded OUT actions to departing reservation IDs, not just rooms.
  // This prevents a previous guest inheriting a later guest's condition.
  const checkoutDates=[...new Set((stays?.data||[]).map((s:any)=>String(s.checkout_date||'')).filter(Boolean))]
  const [departureLinks,checkoutDaily]=checkoutDates.length?await Promise.all([
    admin.from('reservation_daily_links').select('service_date,room_id,departing_reservation_id').in('service_date',checkoutDates),
    admin.from('housekeeping_daily_rooms').select('service_date,room_id,service_type').in('service_date',checkoutDates)
  ]):[{data:[],error:null},{data:[],error:null}]
  if(departureLinks.error||checkoutDaily.error)return NextResponse.json({error:'Could not load checkout statuses'},{status:500})
  const outDates=new Set((checkoutDaily.data||[]).filter((h:any)=>/^OUT(?:-[A-Z]{2,4})?$/i.test(String(h.service_type||'').trim())).map((h:any)=>String(h.service_date)+'|'+String(h.room_id)))
  const checkedOutIds=[...new Set((departureLinks.data||[]).filter((l:any)=>outDates.has(String(l.service_date)+'|'+String(l.room_id))&&l.departing_reservation_id).map((l:any)=>String(l.departing_reservation_id)))]
  const byId=new Map((stays?.data||[]).map((s:any)=>[String(s.id),s]))
  const conditions=new Map((housekeepingRes.data||[]).map((h:any)=>[String(h.service_date)+'|'+String(h.room_id),h]))
  // For blank calendar dates, carry the latest recorded condition forward.
  // A condition entered on the actual date always wins. Never manufacture
  // a clean/ready state from missing historical data.
  const statusByDate=new Map<string,any>()
  const lastByRoom=new Map<string,string>()
  // Resolve historical conditions once per room with exactly the same rules
  // as the Housekeeping API. Never derive a past guest's occupancy as Ready.
  const settledRooms=new Set<string>()
  for(const row of historyRes.data||[]){
    const id=String(row.room_id)
    if(settledRooms.has(id))continue
    const candidate=priorConditionCandidate(row)
    if(candidate.condition)lastByRoom.set(id,candidate.condition)
    if(candidate.stop)settledRooms.add(id)
  }
  const days=Array.from({length:7},(_,i)=>addDay(start,i))
  const today=ymdInHotelTz()
  const tomorrow=addDay(today,1)
  for(const day of days){
    for(const room of roomsRes.data||[]){
      const roomId=String((room as any).id)
      const recorded:any=conditions.get(day+'|'+roomId)
      const storedCondition=String(recorded?.room_condition||'').trim()
      const activity=String(recorded?.reservation_status||'').trim().toLowerCase()
      // Reservation sync previously prefilled future vacant and arrival rooms
      // with Occupied before anybody changed their physical condition. Those
      // unedited placeholders must not override today's saved manager condition.
      // Preserve manually saved Occupied and genuine stayovers/checkouts.
      const staleFutureOccupied=day>today &&
        !recorded?.updated_by &&
        storedCondition.toLowerCase()==='occupied' &&
        ['vacant','arrival',''].includes(activity)
      const direct=staleFutureOccupied?'':storedCondition
      if(direct)lastByRoom.set(roomId,String(recorded?.next_shift_condition||direct).trim())
      statusByDate.set(day+'|'+roomId,{
        date:day,roomId,condition:(day===today||day===tomorrow)?(direct||lastByRoom.get(roomId)||''):'',
        status:String(recorded?.reservation_status||''),
        blocked:String(recorded?.strip_hold||'').toLowerCase().includes('hold')||direct.toLowerCase()==='blocked',
        inherited:!direct
      })
    }
  }
  return NextResponse.json({
    start,
    canRemove,
    checkedOutIds,
    days,
    rooms:(roomsRes.data||[]).map((r:any)=>({id:String(r.id),name:String(r.name)})),
    cells:links.map((l:any)=>{
      const stayId=l.stay_reservation_id||l.arriving_reservation_id||l.primary_reservation_id||l.departing_reservation_id
      const stay:any=byId.get(String(stayId||''))||{}
      const h:any=conditions.get(String(l.service_date)+'|'+String(l.room_id))||{}
      return {reservationId:String(stayId||''),date:String(l.service_date),roomId:String(l.room_id),status:String(l.reservation_status||h.reservation_status||'Vacant'),guest:String(stay.guest_name||''),arrival:String(stay.arrival_date||''),departure:String(stay.checkout_date||''),blocked:String(h.strip_hold||'').toLowerCase().includes('hold')||String(h.room_condition||'').toLowerCase()==='blocked',condition:String(h.room_condition||''),lateArrival:Boolean(h.late_arrival)}
    }),
    roomStatuses:[...statusByDate.values()],
    notes:(housekeepingRes.data||[]).filter((h:any)=>String(h.notes||'').trim()).map((h:any)=>({date:String(h.service_date),roomId:String(h.room_id),text:String(h.notes).trim()})),
    holds:(housekeepingRes.data||[]).filter((h:any)=>String(h.strip_hold||'').toLowerCase().includes('hold')||String(h.room_condition||'').toLowerCase()==='blocked').map((h:any)=>({date:String(h.service_date),roomId:String(h.room_id)}))
  },{headers:{'cache-control':'private, no-store'}})
}
