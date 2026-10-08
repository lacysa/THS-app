import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import StaffViewSwitcher from '@/components/StaffViewSwitcher'
import StaffAccessBoard from '@/components/StaffAccessBoard'
import DailyStaffSchedule from '@/components/DailyStaffSchedule'
import { getStaffAccess } from '@/lib/access'

export const dynamic='force-dynamic'

export default async function StaffPage(){
  const access=await getStaffAccess()
  if(!access) redirect('/login')
  if(access.roleName!=='Owner') redirect('/dashboard')
  return <StaffShell title="Staff"><StaffViewSwitcher staffing={<DailyStaffSchedule/>} access={<StaffAccessBoard/>}/></StaffShell>
}
