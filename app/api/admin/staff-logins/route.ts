import {NextResponse} from 'next/server'
import {getStaffAccess} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'

export const dynamic='force-dynamic'
export const runtime='nodejs'

// Account sign-ins are sensitive personnel data. Only the actual Owner may
// read them; a preview session and the Manager role are not sufficient.
export async function GET(){
 const access=await getStaffAccess()
 if(!access)return NextResponse.json({error:'Not signed in'},{status:401})
 if(access.isPreviewMode||access.roleName!=='Owner'||!access.capabilities.includes('owner'))
  return NextResponse.json({error:'Owner access required'},{status:403})

 const admin=createSupabaseAdmin()
 const [profilesResult,eventsResult,usersResult]=await Promise.all([
  admin.from('staff_profiles').select('user_id,name,preferred_name,email,active,role_id,staff_roles(name)')
   .eq('active',true).order('name'),
  admin.from('staff_login_events').select('id,user_id,signed_in_at')
   .order('signed_in_at',{ascending:false}).limit(500),
  admin.auth.admin.listUsers({page:1,perPage:1000})
 ])
 const error=profilesResult.error||eventsResult.error||usersResult.error
 if(error)return NextResponse.json({error:'Could not retrieve login activity'},{status:500})
 // The hotel currently has far fewer than 1,000 users. Fail clearly if
 // that ever changes rather than showing a misleading partial staff summary.
 if((usersResult.data?.users||[]).length===1000)
  return NextResponse.json({error:'Login account listing exceeded its current limit'},{status:503})

 const authById=new Map((usersResult.data?.users||[]).map(user=>[user.id,user]))
 const staff=(profilesResult.data||[]).map((profile:any)=>{
  const authUser=authById.get(String(profile.user_id))
  const role=Array.isArray(profile.staff_roles)?profile.staff_roles[0]:profile.staff_roles
  return {
   userId:String(profile.user_id),
   name:String(profile.preferred_name||profile.name||profile.email||'Staff'),
   fullName:String(profile.name||''),
   email:String(profile.email||authUser?.email||''),
   role:String(role?.name||'Staff'),
   lastSignedInAt:authUser?.last_sign_in_at||null
  }
 })
 const byId=new Map(staff.map(item=>[item.userId,item]))
 const logins=(eventsResult.data||[])
  .filter(event=>byId.has(String(event.user_id)))
  .map(event=>({
   id:String(event.id),
   userId:String(event.user_id),
   name:String(byId.get(String(event.user_id))?.name||'Staff'),
   at:String(event.signed_in_at)
  }))
 return NextResponse.json({staff,logins,historyLimit:500},{
  headers:{'cache-control':'private, no-store, max-age=0'}
 })
}
