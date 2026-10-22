import { NextRequest,NextResponse } from 'next/server'
import { getStaffAccess } from '@/lib/access'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { SIDEWORK_TASKS } from '@/lib/sidework-tasks'
export const dynamic='force-dynamic'
const goodDate=(v:string)=>/^20\d{2}-\d{2}-\d{2}$/.test(v)
const manage=(a:any)=>a.isAdmin||(a.capabilities||[]).some((c:string)=>['manager','general_manager','operations_manager','owner'].includes(c))
function matches(role:string,group:string){
 const t=role.toLowerCase()
 if(group==='runner')return /runner|breakfast|kitchen/.test(t)
 if(group==='laundry')return /laundry/.test(t)
 if(group==='hospitality')return /hospitality assistant|hospitality_assistant|\bha\b/.test(t)
 return /housekeep|\bhsk\b/.test(t)
}
async function context(date:string){
 const admin=createSupabaseAdmin()
 const [{data:staff,error:staffError},{data:scheduled,error:scheduleError},{data:saved,error:savedError}]=await Promise.all([
  admin.from('staff_members').select('id,name,auth_user_id,job_title,active').eq('active',true).order('name'),
  admin.from('staff_daily_schedule').select('staff_member_id,role_label,work_mode').eq('schedule_date',date),
  admin.from('housekeeping_sidework_daily').select('*').eq('service_date',date)])
 if(staffError||scheduleError||savedError)throw new Error(staffError?.message||scheduleError?.message||savedError?.message)
 const people=staff||[],shifts=scheduled||[],existing=saved||[]
 return {admin,people,shifts,existing}
}
export async function GET(req:NextRequest){
 const access=await getStaffAccess();if(!access)return NextResponse.json({error:'Unauthorized'},{status:401})
 const date=req.nextUrl.searchParams.get('date')||'';if(!goodDate(date))return NextResponse.json({error:'Invalid date'},{status:400})
 try{
  const {people,shifts,existing}=await context(date);const isManager=manage(access)
  const self=people.find((p:any)=>p.auth_user_id===access.userId)
  const staff=shifts.map((s:any)=>{const person=people.find((p:any)=>p.id===s.staff_member_id);return person?{id:person.id,name:person.name,role:s.role_label||person.job_title||''}:null}).filter(Boolean) as {id:string;name:string;role:string}[]
  const assigned=(group:string)=>{
   const eligible=staff.filter(p=>matches(p.role,group))
   return eligible.length?eligible[0].id:null
  }
  const items=SIDEWORK_TASKS.map(task=>{
   const saved=existing.find((x:any)=>x.task_key===task.key)
   const assignedTo=saved?saved.assigned_to:assigned(task.group)
   return {...task,assignedTo,assignedName:staff.find(p=>p.id===assignedTo)?.name||people.find((p:any)=>p.id===assignedTo)?.name||'',completedAt:saved?.completed_at||null,notes:saved?.notes||''}
  }).filter(task=>isManager||!!self&&task.assignedTo===self.id)
  return NextResponse.json({items,staff: isManager?staff:[],manager:isManager,preview:Boolean(access.isPreviewMode),date})
 }catch(e:any){return NextResponse.json({error:e.message||'Could not load sidework'},{status:500})}
}
export async function PATCH(req:NextRequest){
 const access=await getStaffAccess();if(!access)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(access.isPreviewMode)return NextResponse.json({error:'Staff preview is read-only'},{status:403})
 const body=await req.json().catch(()=>null),date=String(body?.date||''),key=String(body?.taskKey||'')
 if(!goodDate(date)||!SIDEWORK_TASKS.some(t=>t.key===key))return NextResponse.json({error:'Invalid task'},{status:400})
 try{
  const {admin,people,shifts,existing}=await context(date),isManager=manage(access)
  const task=SIDEWORK_TASKS.find(t=>t.key===key)!
  const self=people.find((p:any)=>p.auth_user_id===access.userId)
  const saved=existing.find((x:any)=>x.task_key===key)
  const scheduled=shifts.map((s:any)=>{const p=people.find((x:any)=>x.id===s.staff_member_id);return p?{id:p.id,role:s.role_label||p.job_title||''}:null}).filter(Boolean) as {id:string;role:string}[]
  const auto=scheduled.find(p=>matches(p.role,task.group))?.id||null
  const assignedTo=saved?saved.assigned_to:auto
  if(!isManager&&(!self||assignedTo!==self.id))return NextResponse.json({error:'This sidework is not assigned to you'},{status:403})
  if(body.action==='assign'&&!isManager)return NextResponse.json({error:'Managers assign sidework'},{status:403})
  const nextAssignee=body.action==='assign'?(body.assignedTo===null?null:String(body.assignedTo||'')):assignedTo
  if(nextAssignee&&!people.some((p:any)=>p.id===nextAssignee))return NextResponse.json({error:'Choose an active staff member'},{status:400})
  if(!['assign','complete','note'].includes(body.action))return NextResponse.json({error:'Invalid action'},{status:400})
  const patch:any={service_date:date,task_key:key,assigned_to:nextAssignee,updated_at:new Date().toISOString(),completed_at:saved?.completed_at||null,completed_by:saved?.completed_by||null,notes:saved?.notes||''}
  if(body.action==='complete'){patch.completed_at=body.completed?new Date().toISOString():null;patch.completed_by=body.completed?self?.id||null:null}
  if(body.action==='note')patch.notes=String(body.note||'').slice(0,1000)
  if(body.action==='assign'){patch.completed_at=null;patch.completed_by=null}
  const {error}=await admin.from('housekeeping_sidework_daily').upsert(patch,{onConflict:'service_date,task_key'})
  if(error)throw new Error(error.message)
  return NextResponse.json({ok:true})
 }catch(e:any){return NextResponse.json({error:e.message||'Could not save sidework'},{status:500})}
}
