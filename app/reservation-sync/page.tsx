import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import ReservationSyncBoard from '@/components/ReservationSyncBoard'
import { canUseModule } from '@/lib/access'
import '../styles/reservation-sync.css'

export const dynamic = 'force-dynamic'

export default async function Page(){
  const gate=await canUseModule('reservation_sync')
  if(!gate.access) redirect('/login')
  if(!gate.allowed) redirect('/dashboard')
  return <StaffShell title="Reservation Sync"><ReservationSyncBoard/></StaffShell>
}
