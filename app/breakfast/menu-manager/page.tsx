import { redirect } from 'next/navigation'
import { canUseModule } from '@/lib/access'
import StaffShell from '@/components/StaffShell'
import MenuManager from '@/components/MenuManager'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function MenuManagerPage() {
  const gate = await canUseModule('menu_manager')
  if (!gate.access) redirect('/login')
  if (!gate.allowed) redirect('/dashboard')
  const supabase = await createSupabaseServerClient()
  const {data:{user}} = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <StaffShell title="Breakfast Menu Manager"><MenuManager/></StaffShell>
}
