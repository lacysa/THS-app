import {redirect} from 'next/navigation'
import {canUseModule} from '@/lib/access'

export const dynamic='force-dynamic'

// Keep old bookmarks working while all assignment and inspection tabs live
// in the same Housekeeping workspace.
export default async function HousekeepingAssignmentsPage({searchParams}:{searchParams:Promise<{date?:string}>}){
 const gate=await canUseModule('housekeeping_assignments')
 if(!gate.access)redirect('/login')
 const manager=gate.access.isAdmin||(gate.access.capabilities||[]).some(cap=>['manager','general_manager','operations_manager','owner'].includes(cap))
 if(!gate.allowed||!manager)redirect('/dashboard')
 const params=await searchParams
 const date=/^20\d{2}-\d{2}-\d{2}$/.test(params?.date||'')?params.date:undefined
 redirect('/housekeeping?view=assignments'+(date?'&date='+encodeURIComponent(date):''))
}
