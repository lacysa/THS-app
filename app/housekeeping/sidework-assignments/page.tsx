import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import SideworkBoard from '@/components/SideworkBoard'
import { getStaffAccess } from '@/lib/access'
export const dynamic='force-dynamic'
export default async function Page(){
 const access=await getStaffAccess()
 if(!access)redirect('/login')
 const manager=access.isAdmin||(access.capabilities||[]).some(cap=>['manager','general_manager','operations_manager','owner'].includes(cap))
 if(!manager)redirect('/dashboard')
 return <StaffShell title="Sidework Assignments"><SideworkBoard assignments/></StaffShell>
}
