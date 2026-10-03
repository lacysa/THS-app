import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import HousekeepingSetupBoard from '@/components/HousekeepingSetupBoard'
import { canUseModule } from '@/lib/access'

export const dynamic='force-dynamic'

export default async function Page(){
  const gate=await canUseModule('housekeeping_setup')
  if(!gate.access) redirect('/login')
  if(!gate.allowed) redirect('/dashboard')
  return <StaffShell title="HSK Setup"><HousekeepingSetupBoard/></StaffShell>
}
