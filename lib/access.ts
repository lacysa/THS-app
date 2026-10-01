import { createSupabaseServerClient } from '@/lib/supabase/server'

export type StaffAccess = {
  userId:string
  name:string
  preferredName:string|null
  email:string|null
  phone:string|null
  jobTitle:string|null
  theme:'light'|'blue'|'dark'
  active:boolean
  roleId:string|null
  roleName:string|null
  isAdmin:boolean
  canPreviewUnpublished:boolean
  canManageModules:boolean
  permissions:string[]
}

export async function getStaffAccess():Promise<StaffAccess|null> {
  const supabase = await createSupabaseServerClient()
  const { data:{ user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data:profile } = await supabase
    .from('staff_profiles')
    .select('user_id,name,preferred_name,email,phone,job_title,theme_preference,active,role_id,staff_roles(name,is_admin,can_preview_unpublished,can_manage_modules)')
    .eq('user_id',user.id)
    .maybeSingle()

  if (!profile || profile.active === false) return null
  const roleRaw:any = Array.isArray((profile as any).staff_roles) ? (profile as any).staff_roles[0] : (profile as any).staff_roles

  let permissions:string[] = []
  if ((profile as any).role_id) {
    const { data:rows } = await supabase
      .from('role_permissions')
      .select('allowed,app_permissions(permission_key)')
      .eq('role_id',(profile as any).role_id)
      .eq('allowed',true)

    permissions = (rows || []).map((row:any)=>{
      const ap = Array.isArray(row.app_permissions) ? row.app_permissions[0] : row.app_permissions
      return ap?.permission_key
    }).filter(Boolean)
  }

  return {
    userId:user.id,
    name:(profile as any).name || user.email || 'Staff',
    preferredName:(profile as any).preferred_name || null,
    email:(profile as any).email || user.email || null,
    phone:(profile as any).phone || user.phone || null,
    jobTitle:(profile as any).job_title || null,
    theme:((profile as any).theme_preference || 'blue') as 'light'|'blue'|'dark',
    active:(profile as any).active !== false,
    roleId:(profile as any).role_id || null,
    roleName:roleRaw?.name || null,
    isAdmin:Boolean(roleRaw?.is_admin),
    canPreviewUnpublished:Boolean(roleRaw?.can_preview_unpublished),
    canManageModules:Boolean(roleRaw?.can_manage_modules),
    permissions
  }
}

const MODULE_PERMISSION:Record<string,string|undefined> = {
  dashboard:'dashboard.view',
  front_desk:'breakfast.front_desk.view',
  kitchen:'breakfast.kitchen.view',
  menu_manager:'breakfast.menu_manager.view',
  breakfast_menu_manager:'breakfast.menu_manager.view',
  daily_overview:'breakfast.read_only.view',
  housekeeping:'housekeeping.dashboard.view',
  room_checks:'room_checks.view',
  projects:'projects.view',
  maintenance:'projects.view'
}

export async function canUseModule(moduleKey:string) {
  const supabase = await createSupabaseServerClient()
  const access = await getStaffAccess()
  if (!access) return { allowed:false, access:null, module:null as any }

  const { data:module } = await supabase
    .from('app_modules')
    .select('*')
    .eq('module_key',moduleKey)
    .maybeSingle()

  if (!module || module.active === false || module.enabled === false) {
    return { allowed:false, access, module }
  }
  if (module.published === false && !access.canPreviewUnpublished) {
    return { allowed:false, access, module }
  }
  const permission = MODULE_PERMISSION[moduleKey]
  if (permission && !access.isAdmin && !access.permissions.includes(permission)) {
    return { allowed:false, access, module }
  }
  return { allowed:true, access, module }
}
