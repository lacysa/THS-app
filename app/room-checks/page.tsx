import { redirect } from 'next/navigation'
import { canUseModule } from '@/lib/access'

export const dynamic = 'force-dynamic'

export default async function RoomInspectionsPage() {
  const gate = await canUseModule('housekeeping')
  if (!gate.access) redirect('/login')
  if (!gate.allowed) redirect('/dashboard')
  // Inspections now live inside Rooms; preserve older dashboard/bookmarked links.
  redirect('/housekeeping?filter=inspection')
}
