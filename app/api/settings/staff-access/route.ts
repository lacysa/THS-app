import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess, isModuleAllowedForAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await getStaffAccess()
  if (!access?.canManageModules) return NextResponse.json({error:'Forbidden'},{status:403})

  const admin = createSupabaseAdmin()

  const [
    profilesRes,
    rolesRes,
    modulesRes,
    rolePermsRes,
    membersRes,
    capsRes,
    overridesRes
  ] = await Promise.all([
    admin.from('staff_profiles').select('user_id,name,preferred_name,email,job_title,role_id,active').eq('active',true).order('name'),
    admin.from('staff_roles').select('id,name,is_admin,can_preview_unpublished,can_manage_modules,active').eq('active',true),
    admin.from('app_modules').select('*').eq('active',true).order('sort_order'),
    admin.from('role_permissions').select('role_id,allowed,app_permissions(permission_key)').eq('allowed',true),
    admin.from('staff_members').select('id,auth_user_id').eq('active',true),
    admin.from('staff_member_capabilities').select('staff_member_id,capability_key'),
    admin.from('staff_module_access').select('user_id,module_key,allowed')
  ])

  const error =
    profilesRes.error || rolesRes.error || modulesRes.error || rolePermsRes.error ||
    membersRes.error || capsRes.error || overridesRes.error
  if (error) return NextResponse.json({error:error.message},{status:400})

  const roles = new Map((rolesRes.data||[]).map((r:any)=>[String(r.id),r]))
  const memberByUser = new Map((membersRes.data||[]).filter((m:any)=>m.auth_user_id).map((m:any)=>[String(m.auth_user_id),String(m.id)]))

  const permsByRole = new Map<string,string[]>()
  for (const row of rolePermsRes.data||[]) {
    const rp:any=row
    const ap=Array.isArray(rp.app_permissions)?rp.app_permissions[0]:rp.app_permissions
    const key=ap?.permission_key
    if(!key) continue
    const roleId=String(rp.role_id)
    const current=permsByRole.get(roleId)||[]
    current.push(String(key))
    permsByRole.set(roleId,current)
  }

  const capsByMember = new Map<string,string[]>()
  for (const row of capsRes.data||[]) {
    const cap:any=row
    const memberId=String(cap.staff_member_id)
    const current=capsByMember.get(memberId)||[]
    current.push(String(cap.capability_key))
    capsByMember.set(memberId,current)
  }

  const overridesByUser = new Map<string,Record<string,boolean>>()
  for (const row of overridesRes.data||[]) {
    const o:any=row
    const userId=String(o.user_id)
    const current=overridesByUser.get(userId)||{}
    current[String(o.module_key)]=Boolean(o.allowed)
    overridesByUser.set(userId,current)
  }

  const modules=modulesRes.data||[]

  const staff=(profilesRes.data||[]).map((profile:any)=>{
    const role=profile.role_id?roles.get(String(profile.role_id)):null
    const memberId=memberByUser.get(String(profile.user_id))
    const moduleOverrides=overridesByUser.get(String(profile.user_id))||{}
    const employeeAccess:any={
      userId:String(profile.user_id),
      name:profile.name||'Staff',
      preferredName:profile.preferred_name||null,
      email:profile.email||null,
      phone:null,
      jobTitle:profile.job_title||null,
      theme:'light',
      active:profile.active!==false,
      roleId:profile.role_id||null,
      roleName:role?.name||null,
      isAdmin:Boolean(role?.is_admin),
      canPreviewUnpublished:Boolean(role?.can_preview_unpublished),
      canManageModules:Boolean(role?.can_manage_modules),
      permissions:profile.role_id?(permsByRole.get(String(profile.role_id))||[]):[],
      capabilities:memberId?(capsByMember.get(memberId)||[]):[],
      moduleOverrides
    }

    return {
      userId:String(profile.user_id),
      name:profile.preferred_name||profile.name||profile.email||'Staff',
      fullName:profile.name||'',
      email:profile.email||'',
      jobTitle:profile.job_title||'',
      roleName:role?.name||'No role',
      modules:modules.map((module:any)=>({
        module_key:String(module.module_key),
        label:module.label||module.title||module.module_key,
        enabled:module.enabled!==false,
        published:module.published!==false,
        effective:isModuleAllowedForAccess(employeeAccess,module),
        override:Object.prototype.hasOwnProperty.call(moduleOverrides,String(module.module_key))
          ? moduleOverrides[String(module.module_key)]
          : null
      }))
    }
  })

  return NextResponse.json({staff})
}

export async function POST(req:NextRequest) {
  const access = await getStaffAccess()
  if (!access?.canManageModules) return NextResponse.json({error:'Forbidden'},{status:403})

  const body=await req.json().catch(()=>({}))
  const userId=String(body.user_id||'')
  const moduleKey=String(body.module_key||'')
  const allowed=body.allowed

  if(!userId || !moduleKey || !(typeof allowed==='boolean' || allowed===null)) {
    return NextResponse.json({error:'Invalid staff access update.'},{status:400})
  }

  const admin=createSupabaseAdmin()

  const { data:target } = await admin
    .from('staff_profiles')
    .select('user_id')
    .eq('user_id',userId)
    .eq('active',true)
    .maybeSingle()

  const { data:module } = await admin
    .from('app_modules')
    .select('module_key')
    .eq('module_key',moduleKey)
    .eq('active',true)
    .maybeSingle()

  if(!target || !module) return NextResponse.json({error:'Staff member or module not found.'},{status:404})

  if(allowed===null){
    const { error }=await admin
      .from('staff_module_access')
      .delete()
      .eq('user_id',userId)
      .eq('module_key',moduleKey)
    if(error) return NextResponse.json({error:error.message},{status:400})
  }else{
    const { error }=await admin
      .from('staff_module_access')
      .upsert({
        user_id:userId,
        module_key:moduleKey,
        allowed,
        updated_by:access.userId,
        updated_at:new Date().toISOString()
      },{onConflict:'user_id,module_key'})
    if(error) return NextResponse.json({error:error.message},{status:400})
  }

  return NextResponse.json({ok:true})
}
