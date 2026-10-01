import { redirect } from 'next/navigation'
import { canUseModule } from '@/lib/access'
import StaffShell from '@/components/StaffShell'
import BreakfastOverview from '@/components/BreakfastOverview'
import { bohDefaultServiceDate } from '@/lib/time'

export default async function BreakfastOverviewPage() {
  const gate = await canUseModule('daily_overview')
  if (!gate.access) redirect('/login')
  if (!gate.allowed) redirect('/dashboard')
  return (
    <StaffShell title="Daily Breakfast Overview">
      <BreakfastOverview initialDate={bohDefaultServiceDate()} />
    </StaffShell>
  )
}
