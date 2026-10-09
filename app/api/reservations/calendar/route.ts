import {NextRequest,NextResponse} from 'next/server'
import {canUseModule} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'

export const dynamic='force-dynamic'
function addDay(day:string,days:number){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}

export async function GET(req:NextRequest){
  const gate=await canUseModule('reservations')
  if(!gate.access)return NextResponse.json({error:'Unauthorized'},{status:401})
  if(!gate.allowed)return NextResponse.json({error:'Forbidden'},{status:403})
  const start=req.nextUrl.searchParams.get('start')||''
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(start)||Number.isNaN(Date.parse(start+'T12:00:00Z')))return NextResponse.json({error:'Invalid start date'},{status:400})
  const end=addDay(start,6)
  const admin=createSupabaseAdmin()
  const [roomsRes,linksRes,housekeepingRes]=await Promise.all([
    admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
    admin.from('reservation_daily_links').select('service_date,room_id,reservation_status,primary_reservation_id,arriving_reservation_id,stay_reservation_id,departing_reservation_id').gte('service_date',start).lte('service_date',end),
    admin.from('housekeeping_daily_rooms').select('service_date,room_id,reservation_status,strip_hold,room_condition,late_arrival').gte('service_date',start).lte('service_date',end)
  ])
  if(roomsRes.error||linksRes.error||housekeepingRes.error)return NextResponse.json({error:'Could not load calendar'},{status:500})
  const links=linksRes.data||[]
  const ids=[...new Set(links.flatMap((l:any)=>[l.primary_reservation_id,l.arriving_reservation_id,l.stay_reservation_id,l.departing_reservation_id]).filter(Boolean).map(String))]
  const stays=ids.length?(await admin.from('reservation_stays').select('id,guest_name,arrival_date,checkout_date').in('id',ids)):null
  if(stays?.error)return NextResponse.json({error:'Could not load guest stays'},{status:500})
  const byId=new Map((stays?.data||[]).map((s:any)=>[String(s.id),s]))
  const conditions=new Map((housekeepingRes.data||[]).map((h:any)=>[String(h.service_date)+'|'+String(h.room_id),h]))
  return NextResponse.json({
    start,
    days:Array.from({length:7},(_,i)=>addDay(start,i)),
    rooms:(roomsRes.data||[]).map((r:any)=>({id:String(r.id),name:String(r.name)})),
    cells:links.map((l:any)=>{
      const stayId=l.stay_reservation_id||l.arriving_reservation_id||l.primary_reservation_id||l.departing_reservation_id
      const stay:any=byId.get(String(stayId||''))||{}
      const h:any=conditions.get(String(l.service_date)+'|'+String(l.room_id))||{}
      return {date:String(l.service_date),roomId:String(l.room_id),status:String(l.reservation_status||h.reservation_status||'Vacant'),guest:String(stay.guest_name||''),arrival:String(stay.arrival_date||''),departure:String(stay.checkout_date||''),blocked:String(h.strip_hold||'').toLowerCase().includes('hold')||String(h.room_condition||'').toLowerCase()==='blocked',condition:String(h.room_condition||''),lateArrival:Boolean(h.late_arrival)}
    }),
    holds:(housekeepingRes.data||[]).filter((h:any)=>String(h.strip_hold||'').toLowerCase().includes('hold')||String(h.room_condition||'').toLowerCase()==='blocked').map((h:any)=>({date:String(h.service_date),roomId:String(h.room_id)}))
  },{headers:{'cache-control':'private, no-store'}})
}
