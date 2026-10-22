import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import { getStaffAccess } from '@/lib/access'
import TodaysCleans from '@/components/TodaysCleans'
export const dynamic='force-dynamic'
export default async function Page(){
  const access=await getStaffAccess()
  if(!access)redirect('/login')
  const caps=access.capabilities||[]
  if(!access.isAdmin&&!caps.some(c=>['manager','general_manager','operations_manager','owner','housekeeping','hospitality_assistant'].includes(c)))redirect('/dashboard')
  return <StaffShell title="Today's Cleans"><TodaysCleans/></StaffShell>
}
