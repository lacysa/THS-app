import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import HousekeepingQualityDashboard from '@/components/HousekeepingQualityDashboard'
import { canUseModule } from '@/lib/access'
import '../../styles/housekeeping-quality.css'

export const dynamic='force-dynamic'

export default async function Page(){
  const gate=await canUseModule('housekeeping_quality')
  if(!gate.access) redirect('/login')
  if(!gate.allowed) redirect('/dashboard')
  return <StaffShell title="HSK Quality"><HousekeepingQualityDashboard/></StaffShell>
}
