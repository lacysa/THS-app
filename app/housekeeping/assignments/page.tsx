import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import HousekeepingAssignments from '@/components/HousekeepingAssignments'
import LiveDataRefresh from '@/components/LiveDataRefresh'
import { canUseModule } from '@/lib/access'

export const dynamic = 'force-dynamic'

export default async function HousekeepingAssignmentsPage({searchParams}:{searchParams:Promise<{date?:string}>}) {
  const params = await searchParams
  const initialDate = params?.date && /^20\d{2}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined
  const gate = await canUseModule('housekeeping_assignments')
  if (!gate.access) redirect('/login')
  const manager = gate.access.isAdmin || (gate.access.capabilities || []).some(cap =>
    ['manager', 'general_manager', 'operations_manager', 'owner'].includes(cap)
  )
  if (!gate.allowed || !manager) redirect('/dashboard')
  return <StaffShell title="Housekeeping Assignments">
    <LiveDataRefresh intervalMs={15000}/>
    <HousekeepingAssignments initialDate={initialDate}/>
  </StaffShell>
}
