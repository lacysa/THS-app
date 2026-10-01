import { redirect } from 'next/navigation'
import { canUseModule } from '@/lib/access'
import StaffShell from '@/components/StaffShell'
import FrontDeskBoard from '@/components/FrontDeskBoard'
import { bohDefaultServiceDate } from '@/lib/time'

export default async function FrontDeskPage() {
  const gate = await canUseModule('front_desk')
  if (!gate.access) redirect('/login')
  if (!gate.allowed) redirect('/dashboard')
  return (
    <StaffShell title="Front Desk Breakfast">
      <FrontDeskBoard initialDate={bohDefaultServiceDate()} />
    </StaffShell>
  )
}
