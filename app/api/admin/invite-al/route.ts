import { NextRequest,NextResponse } from 'next/server'
import {getStaffAccess} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'
import {rackspaceConfigured,sendHotelInvite} from '@/lib/staff-invitation'

export const dynamic='force-dynamic'
export const runtime='nodejs'

const EMAIL='alheminger1975@gmail.com'
const NAME='Al Heminger'
const USERNAME='al.heminger'

async function ownerGate(){
 const access=await getStaffAccess()
 if(!access)return {error:NextResponse.json({error:'Sign in required'},{status:401})}
 if(access.isPreviewMode||access.roleName!=='Owner')
  return {error:NextResponse.json({error:'Owner access required'},{status:403})}
 const admin=createSupabaseAdmin()
 const {data:operator,error}=await admin.from('staff_members').select('id').eq('auth_user_id',access.userId).maybeSingle()
 if(error||!operator)return {error:NextResponse.json({error:'Owner account not linked'},{status:403})}
 const {data:capability}=await admin.from('staff_member_capabilities').select('capability_key').eq('staff_member_id',operator.id).eq('capability_key','owner').maybeSingle()
 if(!capability)return {error:NextResponse.json({error:'Owner permission required'},{status:403})}
 return {admin}
}

export async function GET(){
 const gate=await ownerGate()
 if('error' in gate)return gate.error
 const {data:staff,error}=await gate.admin.from('staff_members').select('id,auth_user_id,active').eq('username',USERNAME).maybeSingle()
 if(error)return NextResponse.json({error:'Unable to check Al’s account'},{status:500})
 return NextResponse.json({name:NAME,email:EMAIL,role:'Manager',provisioned:Boolean(staff?.auth_user_id),staffReady:Boolean(staff?.active),needsInvitation:Boolean(staff?.active),smtpReady:rackspaceConfigured()},{headers:{'cache-control':'private, no-store'}})
}

export async function POST(req:NextRequest){
 const gate=await ownerGate()
 if('error' in gate)return gate.error
 const admin=gate.admin
 const {data:staff,error:staffError}=await admin.from('staff_members')
  .select('id,name,username,active,auth_user_id').eq('username',USERNAME).maybeSingle()
 if(staffError||!staff?.active||staff.name!==NAME)
  return NextResponse.json({error:'Al’s prepared staff record could not be verified'},{status:409})
 const {data:role,error:roleError}=await admin.from('staff_roles').select('id').eq('name','Manager').eq('active',true).maybeSingle()
 if(roleError||!role)return NextResponse.json({error:'Manager role unavailable'},{status:500})
 if(!rackspaceConfigured())return NextResponse.json({error:'Rackspace SMTP password has not been configured. Add THS_SMTP_PASSWORD securely in Vercel before inviting Al.'},{status:409})
 let userId=String(staff.auth_user_id||'')
 if(!userId){
  return NextResponse.json({error:'Al has no linked Auth account. Contact the app administrator before sending a secure invite.'},{status:409})
 }
 // Verify email of any previously linked user before assigning access.
 const {data:userResult,error:userError}=await admin.auth.admin.getUserById(userId)
 if(userError||userResult.user?.email?.toLowerCase()!==EMAIL)
  return NextResponse.json({error:'Account email could not be verified; no privileges were assigned'},{status:409})
 const {error:profileError}=await admin.from('staff_profiles').upsert({
  user_id:userId,name:NAME,preferred_name:'Al',email:EMAIL,
  job_title:'Manager',role:'manager',role_id:role.id,active:true,
  updated_at:new Date().toISOString()
 },{onConflict:'user_id'})
 if(profileError)return NextResponse.json({error:'Invitation exists but the Manager profile could not be linked. Contact the administrator.'},{status:500})
 const {error:linkError}=await admin.from('staff_members').update({auth_user_id:userId})
   .eq('id',staff.id).is('auth_user_id',null)
 if(linkError)return NextResponse.json({error:'Invitation exists but the staff record could not be linked.'},{status:500})
 try{
  const delivery=await sendHotelInvite({email:EMAIL,name:NAME,username:USERNAME,role:'Manager',origin:req.nextUrl.origin})
  return NextResponse.json({ok:true,email:EMAIL,role:'Manager',invited:true,from:delivery.from,message:'Hotel-branded account setup email sent. Al can open it to set his password.'})
 }catch(error:any){return NextResponse.json({error:String(error?.message||'Could not send invitation')},{status:502})}
}
