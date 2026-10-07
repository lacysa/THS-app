import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import HousekeepingWorkspace from '@/components/HousekeepingWorkspace'
import { canUseModule } from '@/lib/access'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const gate = await canUseModule('housekeeping')
  if (!gate.access) redirect('/login')
  if (!gate.allowed) redirect('/dashboard')

  return (
    <StaffShell title="Housekeeping">
      <HousekeepingWorkspace />
    </StaffShell>
  )
}
