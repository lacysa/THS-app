import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

function canManage(access:any) {
  return Boolean(access?.canManageModules || access?.isAdmin)
}

export async function GET() {
  const access = await getStaffAccess()
  if (!access || !canManage(access)) {
    return NextResponse.json({error:'Forbidden'},{status:403})
  }

  const admin = createSupabaseAdmin()
  const [
    {data:staff,error:staffError},
    {data:modules,error:modulesError},
    {data:overrides,error:overridesError}
  ] = await Promise.all([
    admin
      .from('staff_members')
      .select('id,auth_user_id,name,username,job_title,active')
      .eq('active',true)
      .order('name'),
    admin
      .from('app_modules')
      .select('module_key,title,label,department,href,status,sort_order,active,enabled,published')
      .eq('active',true)
      .order('sort_order'),
    admin
      .from('staff_module_access')
      .select('staff_member_id,module_key,allowed')
  ])

  const error = staffError || modulesError || overridesError
  if (error) return NextResponse.json({error:error.message},{status:500})

  return NextResponse.json({
    staff:staff || [],
    modules:modules || [],
    overrides:overrides || []
  })
}

export async function POST(req:NextRequest) {
  const access = await getStaffAccess()
  if (!access || !canManage(access)) {
    return NextResponse.json({error:'Forbidden'},{status:403})
  }

  const body = await req.json().catch(()=>null)
  const staffMemberId = String(body?.staffMemberId || '')
  const moduleKey = String(body?.moduleKey || '')
  const mode = String(body?.mode || '')

  if (!staffMemberId || !moduleKey || !['allow','deny','default'].includes(mode)) {
    return NextResponse.json({error:'Invalid permission update.'},{status:400})
  }

  const admin = createSupabaseAdmin()

  if (mode === 'default') {
    const {error} = await admin
      .from('staff_module_access')
      .delete()
      .eq('staff_member_id',staffMemberId)
      .eq('module_key',moduleKey)

    if (error) return NextResponse.json({error:error.message},{status:500})
    return NextResponse.json({ok:true})
  }

  const {error} = await admin
    .from('staff_module_access')
    .upsert({
      staff_member_id:staffMemberId,
      module_key:moduleKey,
      allowed:mode === 'allow',
      updated_by:access.userId,
      updated_at:new Date().toISOString()
    },{onConflict:'staff_member_id,module_key'})

  if (error) return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({ok:true})
}
