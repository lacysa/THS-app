import { redirect } from 'next/navigation'
import { canUseModule } from '@/lib/access'
import StaffShell from '@/components/StaffShell'
import KitchenBoard from '@/components/KitchenBoard'
import { bohDefaultServiceDate } from '@/lib/time'

export default async function KitchenPage() {
  const gate = await canUseModule('kitchen')
  if (!gate.access) redirect('/login')
  if (!gate.allowed) redirect('/dashboard')
  return (
    <StaffShell title="Kitchen Breakfast">
      <KitchenBoard initialDate={bohDefaultServiceDate()} />
    </StaffShell>
  )
}
