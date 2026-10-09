import {redirect} from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import ReservationCalendar from '@/components/ReservationCalendar'
import {canUseModule} from '@/lib/access'
import {ymdInHotelTz} from '@/lib/time'
import '../styles/reservations.css'

export const dynamic='force-dynamic'

export default async function OpsPage(){
  const gate=await canUseModule('ops')
  if(!gate.access)redirect('/login')
  if(!gate.allowed)redirect('/dashboard')
  return <StaffShell title="Ops"><ReservationCalendar serviceDate={ymdInHotelTz()}/></StaffShell>
}
