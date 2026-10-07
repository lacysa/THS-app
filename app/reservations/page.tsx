import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import ReservationsBoard from '@/components/ReservationsBoard'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { canUseModule } from '@/lib/access'
import { ymdInHotelTz } from '@/lib/time'
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
  const serviceDate=validDate(params?.date)?params.date:ymdInHotelTz()
  const admin=createSupabaseAdmin()

  const [roomsRes,linksRes,housekeepingRes]=await Promise.all([
    admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
    admin.from('reservation_daily_links').select('*').eq('service_date',serviceDate),
    admin.from('housekeeping_daily_rooms').select('room_id,service_type').eq('service_date',serviceDate)
  ])

  const rooms=roomsRes.data||[]
  const links=linksRes.data||[]
  const housekeeping=housekeepingRes.data||[]
  const serviceTypeByRoom=new Map<string,string>(
    housekeeping.map((row:any)=>[String(row.room_id||''),String(row.service_type||'')])
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
    .map((row:any)=>({
      roomId:String(row.room_id||''),
      roomName:roomNameById.get(String(row.room_id||''))||'Room',
      status:String(row.reservation_status||'Vacant'),
      primary:row.primary_reservation_id?stayById.get(String(row.primary_reservation_id))||null:null,
      arriving:row.arriving_reservation_id?stayById.get(String(row.arriving_reservation_id))||null:null,
      staying:row.stay_reservation_id?stayById.get(String(row.stay_reservation_id))||null:null,
      departing:row.departing_reservation_id?stayById.get(String(row.departing_reservation_id))||null:null,
      serviceType:serviceTypeByRoom.get(String(row.room_id||''))||''
    }))
    .filter((row:any)=>row.status!=='Vacant')
    .sort((a:any,b:any)=>(sortById.get(a.roomId)??9999)-(sortById.get(b.roomId)??9999))

  return <StaffShell title="Reservations"><ReservationsBoard serviceDate={serviceDate} rows={rows}/></StaffShell>
}
