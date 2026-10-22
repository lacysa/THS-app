import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import { canUseModule } from '@/lib/access'
import TodaysCleans from '@/components/TodaysCleans'
export const dynamic='force-dynamic'
export default async function Page(){
 const gate=await canUseModule('housekeeping_today_refreshes')
 const access=gate.access
 if(!access)redirect('/login')
 if(!gate.allowed)redirect('/dashboard')
 const caps=access.capabilities||[]
 if(!access.isAdmin&&!caps.some(c=>['manager','general_manager','operations_manager','owner','housekeeping','hospitality_assistant'].includes(c)))redirect('/dashboard')
 return <StaffShell title="Today's Refreshes"><TodaysCleans mode="refreshes"/></StaffShell>
}