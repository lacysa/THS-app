import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getStaffAccess, isModuleAllowedForAccess } from '@/lib/access'

export async function GET() {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error:'Unauthorized' },{status:401})
  const supabase = await createSupabaseServerClient()
  const { data:modules } = await supabase.from('app_modules').select('*').order('sort_order')
  const visibleModules = (modules || []).filter(module => isModuleAllowedForAccess(access,module))
  return NextResponse.json({ access, modules:visibleModules })
}
