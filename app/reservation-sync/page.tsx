import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import ReservationSyncBoard from '@/components/ReservationSyncBoard'
import { getStaffAccess } from '@/lib/access'
import '../styles/reservation-sync.css'

export const dynamic = 'force-dynamic'

export default async function Page(){
  const access=await getStaffAccess()
  if(!access) redirect('/login')
  const allowed=access.isAdmin || ['foh_manager','manager','general_manager','operations_manager','owner'].some(cap=>access.capabilities.includes(cap))
  if(!allowed) redirect('/dashboard')
  return <StaffShell title="Reservation Sync"><ReservationSyncBoard/></StaffShell>
}
