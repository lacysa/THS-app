import {redirect} from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import TodaysArrivals from '@/components/TodaysArrivals'
import {getStaffAccess} from '@/lib/access'
export const dynamic='force-dynamic'
export default async function Page(){
 const access=await getStaffAccess()
 if(!access)redirect('/login')
 const eligible=access.isAdmin||(access.capabilities||[]).some(cap=>['manager','general_manager','operations_manager','owner','foh_manager','hospitality_assistant'].includes(cap))
 if(!eligible)redirect('/dashboard')
 return <StaffShell title="Today's Arrivals"><TodaysArrivals/></StaffShell>
}
