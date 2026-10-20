import { redirect } from 'next/navigation'
import { canUseModule } from '@/lib/access'

export const dynamic = 'force-dynamic'

// Old bookmarks remain usable; the assignment editor is now a view in Rooms.
export default async function HousekeepingAssignmentsPage({searchParams}:{searchParams:Promise<{date?:string}>}) {
  const gate=await canUseModule('housekeeping_assignments')
  if(!gate.access)redirect('/login')
  const manager=gate.access.isAdmin || (gate.access.capabilities||[]).some(cap=>
    ['manager','general_manager','operations_manager','owner'].includes(cap))
  if(!gate.allowed||!manager)redirect('/dashboard')
  const params=await searchParams
  const date=params?.date&&/^20\d{2}-\d{2}-\d{2}$/.test(params.date)?'&date='+encodeURIComponent(params.date):''
  redirect('/housekeeping?view=assignments'+date)
}
