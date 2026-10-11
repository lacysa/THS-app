import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import UnifiedRoomsBoard from '@/components/UnifiedRoomsBoard'
import { canUseModule } from '@/lib/access'

export const dynamic = 'force-dynamic'

export default async function RoomInspectionsPage() {
  const gate = await canUseModule('room_checks')
  if (!gate.access) redirect('/login')
  if (!gate.allowed) redirect('/dashboard')
  return <StaffShell title="Room Inspections"><UnifiedRoomsBoard initialFilter="inspection"/></StaffShell>
}
