import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import SettingsPanel from '@/components/SettingsPanel'
import { getStaffAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

export default async function SettingsPage(){
  const access = await getStaffAccess()
  if (!access) redirect('/login')
  return <StaffShell title="Settings"><SettingsPanel initial={access}/></StaffShell>
}
