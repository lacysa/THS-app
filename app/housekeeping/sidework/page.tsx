import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import { getStaffAccess } from '@/lib/access'
import SideworkBoard from '@/components/SideworkBoard'
export const dynamic='force-dynamic'
export default async function Page(){
 const access=await getStaffAccess();if(!access)redirect('/login')
 return <StaffShell title="Today's Sidework"><SideworkBoard/></StaffShell>
}
