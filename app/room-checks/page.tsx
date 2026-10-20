import { redirect } from 'next/navigation'
import { canUseModule } from '@/lib/access'

export const dynamic = 'force-dynamic'

export default async function RoomInspectionsPage() {
  const gate = await canUseModule('housekeeping')
  if (!gate.access) redirect('/login')
  if (!gate.allowed) redirect('/dashboard')
  // Preserve old bookmarks, but open the focused queue instead of all room cards.
  redirect('/housekeeping?view=inspections')
}
