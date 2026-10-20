import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import RoomOperationsWorkspace from '@/components/RoomOperationsWorkspace'
import LiveDataRefresh from '@/components/LiveDataRefresh'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { canUseModule } from '@/lib/access'
import { ymdInHotelTz } from '@/lib/time'
import { conditionForDay,previousVacantConditions } from '@/lib/room-condition-carry'
import '../styles/reservations.css'

export const dynamic='force-dynamic'

function validDate(value:unknown):value is string{
  return typeof value==='string' && /^20\d{2}-\d{2}-\d{2}$/.test(value)
}

export default async function ReservationsPage({searchParams}:{searchParams:Promise<{date?:string}>}){
  const gate=await canUseModule('reservations')
  if(!gate.access) redirect('/login')
  if(!gate.allowed) redirect('/dashboard')

  const params=await searchParams
  const todayDate=ymdInHotelTz()
  const serviceDate=validDate(params?.date)?params.date:todayDate
  const admin=createSupabaseAdmin()

  const [roomsRes,linksRes,housekeepingRes,opsDetailsRes]=await Promise.all([
    admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
    admin.from('reservation_daily_links').select('*').eq('service_date',serviceDate),
    admin.from('housekeeping_daily_rooms').select('room_id,assigned_to,clean_order,reservation_status,late_arrival,strip_hold,service_type,room_condition,next_shift_condition,complete,inspected,housekeeper_attested_by,ha_signed_by,foh_signed_by,check_issue_open,notes,breakfast_tag,updated_by').eq('service_date',serviceDate),
     admin.from('room_ops_details').select('room_id,expected_arrival_time').eq('service_date',serviceDate)
  ])

  const rooms=roomsRes.data||[]
  const links=linksRes.data||[]
  const housekeeping=housekeepingRes.data||[]
  const carryConditions=await previousVacantConditions(admin,serviceDate,housekeeping)
   const expectedTimes=new Map<string,string>((opsDetailsRes.data||[]).map((item:any)=>[String(item.room_id),String(item.expected_arrival_time||'')]))
  const housekeepingByRoom=new Map<string,any>(
    housekeeping.map((row:any)=>[String(row.room_id||''),row])
  )
  const roomNameById=new Map<string,string>(rooms.map((room:any)=>[String(room.id),String(room.name)]))
  const sortById=new Map<string,number>(rooms.map((room:any)=>[String(room.id),Number(room.sort_order??9999)]))
  const ids=[...new Set(links.flatMap((row:any)=>[
    row.primary_reservation_id,row.arriving_reservation_id,row.stay_reservation_id,row.departing_reservation_id
  ]).filter(Boolean).map(String))]

  let stays:any[]=[]
  if(ids.length){
    const result=await admin.from('reservation_stays').select('*').in('id',ids)
    const overridesResult=await admin.from('reservation_staff_overrides').select('reservation_id,fields').in('reservation_id',ids)
     const editedCheckIns=new Set<string>((overridesResult.data||[]).filter((item:any)=>Object.prototype.hasOwnProperty.call(item.fields||{},'check_in_time')).map((item:any)=>String(item.reservation_id)))
     stays=(result.data||[]).map((stay:any)=>({...stay,checkInTimeManuallyEdited:editedCheckIns.has(String(stay.id))}))
  }
  const stayById=new Map<string,any>(stays.map((stay:any)=>[String(stay.id),stay]))

  const linksByRoom=new Map<string,any>(links.map((link:any)=>[String(link.room_id),link]))
  // Include all 17 operational rooms, even when there is no reservation link.
  const rows=rooms.map((room:any)=>{
    const roomId=String(room.id)
    const link=linksByRoom.get(roomId)||{}
    const current=housekeepingByRoom.get(roomId)||{}
    const currentCondition=conditionForDay(current,carryConditions.get(roomId)||'')
    return {
      roomId,
      expectedArrivalTime:expectedTimes.get(roomId)||'',
      roomName:roomNameById.get(roomId)||'Room',
      status:String(link.reservation_status||current.reservation_status||'Vacant'),
      primary:link.primary_reservation_id?stayById.get(String(link.primary_reservation_id))||null:null,
      arriving:link.arriving_reservation_id?stayById.get(String(link.arriving_reservation_id))||null:null,
      staying:link.stay_reservation_id?stayById.get(String(link.stay_reservation_id))||null:null,
      departing:link.departing_reservation_id?stayById.get(String(link.departing_reservation_id))||null:null,
      serviceType:String(current.service_type||''),
      operationalStatus:String(current.reservation_status||link.reservation_status||'Vacant'),
      stripHold:String(current.strip_hold||''),
      roomNotes:String(current.notes||''),
      assignedTo:String(current.assigned_to||''),
      cleanOrder:current.clean_order==null?null:Number(current.clean_order),
      breakfastTag:Boolean(current.breakfast_tag),
      lateArrival:Boolean(current.late_arrival),
      roomCondition:currentCondition,
      nextShiftCondition:String(current.next_shift_condition||''),
      complete:Boolean(current.complete),
      inspected:Boolean(current.inspected),
      fohChecked:Boolean(current.foh_signed_by),
      haChecked:Boolean(current.ha_signed_by),
      housekeeperAttested:Boolean(current.housekeeper_attested_by),
      checkIssueOpen:Boolean(current.check_issue_open)
    }
  }).sort((a:any,b:any)=>(sortById.get(a.roomId)??9999)-(sortById.get(b.roomId)??9999))

  const canEdit=!gate.access.isPreviewMode && Boolean(gate.access.isAdmin || gate.access.capabilities?.some((cap:string)=>['manager','general_manager','operations_manager','owner'].includes(cap)))
  const roomGate=await canUseModule('housekeeping')
  const canManageRooms=canEdit && Boolean(roomGate.allowed)
  return <StaffShell title="Room Operations"><LiveDataRefresh intervalMs={10000}/><RoomOperationsWorkspace serviceDate={serviceDate} todayDate={todayDate} rows={rows} canEdit={canEdit} canManageRooms={canManageRooms}/></StaffShell>
}
