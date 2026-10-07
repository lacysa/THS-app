import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export type StaffAccess = {
  userId:string
  name:string
  preferredName:string|null
  email:string|null
  phone:string|null
  jobTitle:string|null
  theme:'light'|'blue'|'sage'|'violet'|'dark'
  active:boolean
  roleId:string|null
  roleName:string|null
  isAdmin:boolean
  canPreviewUnpublished:boolean
  canManageModules:boolean
  permissions:string[]
  capabilities:string[]
  moduleOverrides:Record<string,boolean>
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
  let capabilities:string[] = []
  let moduleOverrides:Record<string,boolean> = {}
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

  const { data:member } = await supabase
    .from('staff_members')
    .select('id')
    .eq('auth_user_id',user.id)
    .maybeSingle()

  if (member?.id) {
    const { data:capRows } = await supabase
      .from('staff_member_capabilities')
      .select('capability_key')
      .eq('staff_member_id',member.id)
    capabilities = (capRows || []).map((row:any)=>row.capability_key).filter(Boolean)
  }

  const admin = createSupabaseAdmin()
  const { data:overrideRows } = await admin
    .from('staff_module_access')
    .select('module_key,allowed')
    .eq('user_id',user.id)

  moduleOverrides = Object.fromEntries(
    (overrideRows || []).map((row:any)=>[String(row.module_key),Boolean(row.allowed)])
  )

  return {
    userId:user.id,
    name:(profile as any).name || user.email || 'Staff',
    preferredName:(profile as any).preferred_name || null,
    email:(profile as any).email || user.email || null,
    phone:(profile as any).phone || user.phone || null,
    jobTitle:(profile as any).job_title || null,
    theme:((profile as any).theme_preference || 'blue') as 'light'|'blue'|'sage'|'violet'|'dark',
    active:(profile as any).active !== false,
    roleId:(profile as any).role_id || null,
    roleName:roleRaw?.name || null,
    isAdmin:Boolean(roleRaw?.is_admin),
    canPreviewUnpublished:Boolean(roleRaw?.can_preview_unpublished),
    canManageModules:Boolean(roleRaw?.can_manage_modules),
    permissions,
    capabilities,
    moduleOverrides
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
  room_board:'housekeeping.dashboard.view',
  room_checks:'room_checks.view',
  projects:'projects.view',
  breakfast_guest:'breakfast.read_only.view'
}

function hasAnyCapability(access:StaffAccess, keys:string[]) {
  return keys.some(key => access.capabilities.includes(key))
}

export function isModuleAllowedForAccess(access:StaffAccess, module:any) {
  if (!module || module.active === false || module.enabled === false) return false

  const key = String(module.module_key || '')

  if (key === 'staff') {
    return access.roleName === 'Owner'
  }

  if (Object.prototype.hasOwnProperty.call(access.moduleOverrides,key)) {
    return access.moduleOverrides[key]
  }

  if (module.published === false && !access.canPreviewUnpublished) return false

  if (key === 'laundry' || key === 'laundry_inventory') {
    return access.isAdmin || hasAnyCapability(access,[
      'laundry','manager','general_manager','operations_manager','owner'
    ])
  }

  if (key === 'lobby' || key === 'lobby_inventory') {
    return access.isAdmin || hasAnyCapability(access,[
      'hospitality_assistant','runner','manager','general_manager','operations_manager','owner'
    ])
  }

  if (key === 'reservations') {
    return access.isAdmin || hasAnyCapability(access,[
      'foh_manager','manager','general_manager','operations_manager','owner'
    ])
  }

  if (key === 'reservation_sync') {
    return access.isAdmin || hasAnyCapability(access,[
      'foh_manager','manager','general_manager','operations_manager','owner'
    ])
  }

  if (key === 'housekeeping_quality') {
    return access.isAdmin || hasAnyCapability(access,[
      'manager','general_manager','operations_manager','owner'
    ])
  }

  if (key === 'housekeeping_setup') {
    return access.isAdmin || hasAnyCapability(access,[
      'foh_manager','manager','general_manager','operations_manager','owner'
    ])
  }

  if (key === 'room_checks') {
    return access.isAdmin || hasAnyCapability(access,[
      'room_checks','ha_signoff','ha_signoff_override','manager','general_manager','operations_manager','owner'
    ])
  }

  if (key === 'housekeeping_guide') {
    return access.isAdmin || hasAnyCapability(access,[
      'housekeeping','runner','hospitality_assistant','manager','general_manager','operations_manager','owner'
    ])
  }

  if (key === 'front_desk_inventory') {
    return access.isAdmin || hasAnyCapability(access,[
      'foh_manager','foh_signoff','hospitality_assistant','manager','general_manager','operations_manager','owner'
    ])
  }

  if (key === 'kitchen_inventory') {
    return access.isAdmin || hasAnyCapability(access,[
      'kitchen','manager','general_manager','operations_manager','owner'
    ])
  }

  if (key === 'housekeeping_inventory') {
    return access.isAdmin || hasAnyCapability(access,[
      'housekeeping','runner','manager','general_manager','operations_manager','owner'
    ])
  }

  if (key === 'maintenance') {
    return access.isAdmin || hasAnyCapability(access,[
      'maintenance','maintenance_manager','manager','general_manager','operations_manager','owner'
    ])
  }

  if (key === 'shift_reports') {
    return access.isAdmin || hasAnyCapability(access,[
      'manager','general_manager','operations_manager','owner'
    ])
  }

  const permission = MODULE_PERMISSION[key]
  if (permission && !access.isAdmin && !access.permissions.includes(permission)) return false
  return true
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

  return { allowed:isModuleAllowedForAccess(access,module), access, module }
}
