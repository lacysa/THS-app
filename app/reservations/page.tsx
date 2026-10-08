import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import ReservationsBoard from '@/components/ReservationsBoard'
import LiveDataRefresh from '@/components/LiveDataRefresh'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { canUseModule } from '@/lib/access'
import { ymdInHotelTz } from '@/lib/time'
import '../styles/reservations.css'

export const dynamic='force-dynamic'

function validDate(value:unknown):value is string{
  return typeof value==='string' && /^20\d{2}-\d{2}-\d{2}$/.test(value)
}

function previousDate(value:string){
  const d=new Date(`${value}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate()-1)
  return d.toISOString().slice(0,10)
}

export default async function ReservationsPage({searchParams}:{searchParams:Promise<{date?:string}>}){
  const gate=await canUseModule('reservations')
  if(!gate.access) redirect('/login')
  if(!gate.allowed) redirect('/dashboard')

  const params=await searchParams
  const serviceDate=validDate(params?.date)?params.date:ymdInHotelTz()
  const admin=createSupabaseAdmin()

  const priorDate=previousDate(serviceDate)
  const [roomsRes,linksRes,housekeepingRes,priorHousekeepingRes]=await Promise.all([
    admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
    admin.from('reservation_daily_links').select('*').eq('service_date',serviceDate),
    admin.from('housekeeping_daily_rooms').select('room_id,reservation_status,late_arrival,strip_hold,service_type,room_condition,next_shift_condition,complete,inspected,housekeeper_attested_by,ha_signed_by,foh_signed_by,check_issue_open').eq('service_date',serviceDate),
    admin.from('housekeeping_daily_rooms').select('room_id,room_condition,next_shift_condition').eq('service_date',priorDate)
  ])

  const rooms=roomsRes.data||[]
  const links=linksRes.data||[]
  const housekeeping=housekeepingRes.data||[]
  const housekeepingByRoom=new Map<string,any>(
    housekeeping.map((row:any)=>[String(row.room_id||''),row])
  )
  const priorHousekeepingByRoom=new Map<string,any>(
    (priorHousekeepingRes.data||[]).map((row:any)=>[String(row.room_id||''),row])
  )
  const roomNameById=new Map<string,string>(rooms.map((room:any)=>[String(room.id),String(room.name)]))
  const sortById=new Map<string,number>(rooms.map((room:any)=>[String(room.id),Number(room.sort_order??9999)]))
  const ids=[...new Set(links.flatMap((row:any)=>[
    row.primary_reservation_id,row.arriving_reservation_id,row.stay_reservation_id,row.departing_reservation_id
  ]).filter(Boolean).map(String))]

  let stays:any[]=[]
  if(ids.length){
    const result=await admin.from('reservation_stays').select('*').in('id',ids)
    stays=result.data||[]
  }
  const stayById=new Map<string,any>(stays.map((stay:any)=>[String(stay.id),stay]))

  const rows=links
    .map((row:any)=>{
      const roomId=String(row.room_id||'')
      const current=housekeepingByRoom.get(roomId)||{}
      const prior=priorHousekeepingByRoom.get(roomId)||{}
      const currentCondition=String(current.room_condition||'').trim()
      const priorEos=String(prior.next_shift_condition||prior.room_condition||'').trim()
      const inheritedReady=!currentCondition && priorEos==='Vacant (Clean)'
      return {
        roomId,
        roomName:roomNameById.get(roomId)||'Room',
        status:String(row.reservation_status||'Vacant'),
        primary:row.primary_reservation_id?stayById.get(String(row.primary_reservation_id))||null:null,
        arriving:row.arriving_reservation_id?stayById.get(String(row.arriving_reservation_id))||null:null,
        staying:row.stay_reservation_id?stayById.get(String(row.stay_reservation_id))||null:null,
        departing:row.departing_reservation_id?stayById.get(String(row.departing_reservation_id))||null:null,
        serviceType:String(current.service_type||''),
        operationalStatus:String(current.reservation_status||row.reservation_status||''),
        stripHold:String(current.strip_hold||''),
        lateArrival:Boolean(current.late_arrival),
        roomCondition:currentCondition||(inheritedReady?'Ready':''),
        nextShiftCondition:String(current.next_shift_condition||''),
        complete:Boolean(current.complete),
        inspected:Boolean(current.inspected),
        fohChecked:Boolean(current.foh_signed_by),
        haChecked:Boolean(current.ha_signed_by),
        housekeeperAttested:Boolean(current.housekeeper_attested_by),
        checkIssueOpen:Boolean(current.check_issue_open)
      }
    })
    .filter((row:any)=>row.status!=='Vacant')
    .sort((a:any,b:any)=>(sortById.get(a.roomId)??9999)-(sortById.get(b.roomId)??9999))

  return <StaffShell title="Reservations"><LiveDataRefresh intervalMs={10000}/><ReservationsBoard serviceDate={serviceDate} rows={rows} canEdit={!gate.access.isPreviewMode && Boolean(gate.access.isAdmin || gate.access.capabilities?.some((cap:string)=>['manager','general_manager','operations_manager','owner'].includes(cap)))}/></StaffShell>
}
