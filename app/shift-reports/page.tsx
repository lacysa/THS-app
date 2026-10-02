import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import ShiftReportBoard from '@/components/ShiftReportBoard'
import { canUseModule } from '@/lib/access'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const gate = await canUseModule('shift_reports')
  if (!gate.access) redirect('/login')
  if (!gate.allowed) redirect('/dashboard')
  return <StaffShell title="Shift Reports"><ShiftReportBoard /></StaffShell>
}
