import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess, isModuleAllowedForAccess, type StaffAccess } from '@/lib/access'

function ownerOnly(access:StaffAccess|null) {
  return Boolean(access && access.roleName === 'Owner')
}

export async function GET() {
  const access = await getStaffAccess()
  if (!ownerOnly(access)) return NextResponse.json({error:'Forbidden'},{status:403})

  const admin=createSupabaseAdmin()

  const [
    {data:profiles,error:profilesError},
    {data:modules,error:modulesError},
    {data:members},
    {data:capabilities},
    {data:rolePermissionRows},
    {data:overrides}
  ] = await Promise.all([
    admin.from('staff_profiles')
      .select('user_id,name,preferred_name,email,job_title,active,role_id,staff_roles(name,is_admin,can_preview_unpublished,can_manage_modules)')
      .eq('active',true)
      .order('name'),
    admin.from('app_modules').select('*').eq('active',true).order('sort_order'),
    admin.from('staff_members').select('id,auth_user_id'),
    admin.from('staff_member_capabilities').select('staff_member_id,capability_key'),
    admin.from('role_permissions').select('role_id,allowed,app_permissions(permission_key)').eq('allowed',true),
    admin.from('staff_module_access').select('user_id,module_key,allowed')
  ])

  if(profilesError) return NextResponse.json({error:profilesError.message},{status:400})
  if(modulesError) return NextResponse.json({error:modulesError.message},{status:400})

  const memberIdByUser=new Map<string,string>()
  for(const row of members||[]) if(row.auth_user_id) memberIdByUser.set(String(row.auth_user_id),String(row.id))

  const capsByMember=new Map<string,string[]>()
  for(const row of capabilities||[]){
    const id=String(row.staff_member_id)
    const list=capsByMember.get(id)||[]
    list.push(String(row.capability_key))
    capsByMember.set(id,list)
  }

  const permissionsByRole=new Map<string,string[]>()
  for(const row of rolePermissionRows||[]){
    const ap:any=Array.isArray((row as any).app_permissions)?(row as any).app_permissions[0]:(row as any).app_permissions
    if(!ap?.permission_key) continue
    const id=String((row as any).role_id)
    const list=permissionsByRole.get(id)||[]
    list.push(String(ap.permission_key))
    permissionsByRole.set(id,list)
  }

  const overrideByUser=new Map<string,Record<string,boolean>>()
  for(const row of overrides||[]){
    const userId=String(row.user_id)
    const map=overrideByUser.get(userId)||{}
    map[String(row.module_key)]=Boolean(row.allowed)
    overrideByUser.set(userId,map)
  }

  const staff=(profiles||[]).map((profile:any)=>{
    const roleRaw=Array.isArray(profile.staff_roles)?profile.staff_roles[0]:profile.staff_roles
    const userId=String(profile.user_id)
    const memberId=memberIdByUser.get(userId)
    const staffAccess:StaffAccess={
      userId,
      name:profile.name||'Staff',
      preferredName:profile.preferred_name||null,
      email:profile.email||null,
      phone:null,
      jobTitle:profile.job_title||null,
      theme:'light',
      active:profile.active!==false,
      roleId:profile.role_id||null,
      roleName:roleRaw?.name||null,
      isAdmin:Boolean(roleRaw?.is_admin),
      canPreviewUnpublished:Boolean(roleRaw?.can_preview_unpublished),
      canManageModules:Boolean(roleRaw?.can_manage_modules),
      permissions:profile.role_id ? (permissionsByRole.get(String(profile.role_id))||[]) : [],
      capabilities:memberId ? (capsByMember.get(memberId)||[]) : [],
      moduleOverrides:overrideByUser.get(userId)||{}
    }

    const moduleAccess=(modules||[]).map((module:any)=>{
      const hasOverride=Object.prototype.hasOwnProperty.call(staffAccess.moduleOverrides,module.module_key)
      const defaultAccess=isModuleAllowedForAccess({...staffAccess,moduleOverrides:{}},module)
      const effectiveAccess=isModuleAllowedForAccess(staffAccess,module)
      return {
        module_key:module.module_key,
        label:module.label||module.title,
        department:module.department,
        enabled:module.enabled!==false,
        published:module.published!==false,
        defaultAccess,
        effectiveAccess,
        override:hasOverride ? staffAccess.moduleOverrides[module.module_key] : null
      }
    })

    return {
      userId,
      name:profile.preferred_name||profile.name||'Staff',
      fullName:profile.name||'Staff',
      email:profile.email||null,
      jobTitle:profile.job_title||null,
      roleName:roleRaw?.name||null,
      isOwner:roleRaw?.name==='Owner',
      modules:moduleAccess
    }
  })

  return NextResponse.json({staff})
}

export async function POST(req:NextRequest) {
  const access=await getStaffAccess()
  if(!ownerOnly(access)) return NextResponse.json({error:'Forbidden'},{status:403})

  const body=await req.json()
  const userId=String(body.user_id||'')
  const moduleKey=String(body.module_key||'')
  const allowed=body.allowed

  if(!userId || !moduleKey) return NextResponse.json({error:'Missing staff member or module.'},{status:400})
  if(allowed!==null && typeof allowed!=='boolean') return NextResponse.json({error:'Invalid access value.'},{status:400})
  if(userId===access!.userId) return NextResponse.json({error:'Owner access cannot be changed here.'},{status:400})
  if(moduleKey==='staff') return NextResponse.json({error:'Staff management is Owner-only.'},{status:400})

  const admin=createSupabaseAdmin()

  if(allowed===null){
    const {error}=await admin.from('staff_module_access').delete().eq('user_id',userId).eq('module_key',moduleKey)
    if(error) return NextResponse.json({error:error.message},{status:400})
  }else{
    const {error}=await admin.from('staff_module_access').upsert({
      user_id:userId,
      module_key:moduleKey,
      allowed,
      updated_by:access!.userId,
      updated_at:new Date().toISOString()
    },{onConflict:'user_id,module_key'})
    if(error) return NextResponse.json({error:error.message},{status:400})
  }

  return NextResponse.json({ok:true})
}
