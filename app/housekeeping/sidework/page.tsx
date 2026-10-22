import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import { canUseModule } from '@/lib/access'
import SideworkBoard from '@/components/SideworkBoard'
export const dynamic='force-dynamic'
export default async function Page(){
 const gate=await canUseModule('housekeeping_today_sidework')
 const access=gate.access;if(!access)redirect('/login')
 if(!gate.allowed)redirect('/dashboard')
 return <StaffShell title="Today's Sidework"><SideworkBoard/></StaffShell>
}
