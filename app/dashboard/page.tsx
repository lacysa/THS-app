import { redirect } from 'next/navigation'
import DashboardGrid from '@/components/DashboardGrid'
import StaffShell from '@/components/StaffShell'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getStaffAccess, isModuleAllowedForAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const access = await getStaffAccess()
  if (!access) redirect('/login')
  const supabase = await createSupabaseServerClient()
  const { data:modules } = await supabase.from('app_modules').select('*').order('sort_order')
  const visibleModules = (modules || []).filter(module => isModuleAllowedForAccess(access,module))
  return <StaffShell title="Dashboard"><DashboardGrid modules={visibleModules} /></StaffShell>
}
