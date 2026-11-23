import {NextRequest,NextResponse} from 'next/server'
import {getStaffAccess,canUseModule} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'
export const dynamic='force-dynamic'
const validDate=(v:unknown)=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))
function weekStart(date:string){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10)}
const permitted=(caps:string[])=>caps.some(c=>['housekeeping','runner','hospitality_assistant','foh_manager','foh_signoff','foh_signoff_override','manager','general_manager','operations_manager','owner'].includes(c))
export async function GET(req:NextRequest){
 const access=await getStaffAccess()
 if(!access)return NextResponse.json({error:'Unauthorized'},{status:401})
 const reservations=await canUseModule('reservations')
 if(!permitted(access.capabilities||[])&&!access.isAdmin&&!reservations.allowed)return NextResponse.json({error:'Forbidden'},{status:403})
 const date=req.nextUrl.searchParams.get('date')
 if(!validDate(date))return NextResponse.json({error:'Invalid date'},{status:400})
 const {data,error}=await createSupabaseAdmin().from('housekeeping_blanket_changes').select('room_id,changed_at,changed_by').eq('week_start',weekStart(date as string))
 if(error)return NextResponse.json({error:error.message},{status:500})
 const ids=[...new Set((data||[]).map(item=>String(item.changed_by||'')).filter(Boolean))]
 const staff=ids.length?await createSupabaseAdmin().from('staff_members').select('auth_user_id,name').in('auth_user_id',ids):null
 if(staff?.error)return NextResponse.json({error:'Could not resolve blanket change staff'},{status:500})
 const names=new Map((staff?.data||[]).map(item=>[String(item.auth_user_id),String(item.name||'')]))
 const rooms:Record<string,{changedAt:string;changedBy:string;changedByName:string}>={}
 for(const item of data||[])rooms[item.room_id]={changedAt:item.changed_at,changedBy:item.changed_by||'',changedByName:names.get(String(item.changed_by||''))||''}
 return NextResponse.json({weekStart:weekStart(date as string),rooms},{headers:{'cache-control':'private, no-store'}})
}
export async function PATCH(req:NextRequest){
 const access=await getStaffAccess()
 if(!access)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(access.isPreviewMode)return NextResponse.json({error:'Preview is read-only'},{status:403})
 const caps=access.capabilities||[]
 if(!permitted(caps)&&!access.isAdmin)return NextResponse.json({error:'Forbidden'},{status:403})
 const body=await req.json().catch(()=>null)
 const date=body?.date,roomId=body?.roomId,action=body?.action??'confirm'
 if(!['confirm','undo'].includes(action))return NextResponse.json({error:'Unknown blanket action'},{status:400})
 if(!validDate(date)||typeof roomId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomId))
  return NextResponse.json({error:'Invalid room or date'},{status:400})
 const hotelToday=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 if(action==='confirm'&&date>hotelToday)return NextResponse.json({error:'Cannot confirm a future blanket change.'},{status:400})
 const admin=createSupabaseAdmin()
 const {data:person,error:personError}=await admin.from('staff_members').select('name').eq('auth_user_id',access.userId).eq('active',true).maybeSingle()
 if(personError||!person)return NextResponse.json({error:'Staff profile not found'},{status:403})
 const {data:daily,error:dailyError}=await admin.from('housekeeping_daily_rooms').select('assigned_to').eq('service_date',date).eq('room_id',roomId).maybeSingle()
 if(dailyError)return NextResponse.json({error:dailyError.message},{status:500})
 if(!daily)return NextResponse.json({error:'Room not scheduled for this date'},{status:404})
 const foH=access.isAdmin||caps.some(c=>['manager','general_manager','operations_manager','owner','foh_manager','foh_signoff','foh_signoff_override','hospitality_assistant'].includes(c))
 const week=weekStart(date)
 const {data:existing,error:existingError}=await admin.from('housekeeping_blanket_changes')
  .select('changed_at,changed_by').eq('room_id',roomId).eq('week_start',week).maybeSingle()
 if(existingError)return NextResponse.json({error:existingError.message},{status:500})
 if(action==='undo'){
  if(!foH&&String(existing?.changed_by||'')!==access.userId)
   return NextResponse.json({error:'Only FOH, management, or the original confirmer can undo this entry'},{status:403})
  if(!existing)return NextResponse.json({error:'No blanket confirmation exists for this week. Refresh to see the latest status.'},{status:409})
  const {data:removed,error:deleteError}=await admin.from('housekeeping_blanket_changes').delete()
   .eq('room_id',roomId).eq('week_start',week).eq('changed_at',existing.changed_at).select('room_id')
  if(deleteError)return NextResponse.json({error:deleteError.message},{status:500})
  if(!removed?.length)return NextResponse.json({error:'This confirmation changed while editing. Refresh and try again.'},{status:409})
 }else{
  if(existing)return NextResponse.json({error:'Already confirmed this week. Undo the confirmation before recording a new replacement.'},{status:409})
  if(!foH&&!String(daily.assigned_to||'').split(',').some((name:string)=>name.trim().toLowerCase()===person.name.toLowerCase())){
   const {data:tub,error:tubError}=await admin.from('room_ops_details').select('tub_clean_assigned_to')
    .eq('room_id',roomId).eq('service_date',date).maybeSingle()
   if(tubError)return NextResponse.json({error:tubError.message},{status:500})
   if(String(tub?.tub_clean_assigned_to||'').trim().toLowerCase()!==person.name.toLowerCase())
    return NextResponse.json({error:'This room is not assigned to you'},{status:403})
  }
  const {error:saveError}=await admin.from('housekeeping_blanket_changes').insert({
   room_id:roomId,week_start:week,changed_at:new Date().toISOString(),changed_by:access.userId
  })
  if(saveError){
   if(saveError.code==='23505')return NextResponse.json({error:'Another team member already confirmed this room. Refresh to see their update.'},{status:409})
   return NextResponse.json({error:saveError.message},{status:500})
  }
 }
 const {error:auditError}=await admin.from('audit_log').insert({
  actor_user_id:access.userId,
  action:action==='undo'?'blankets.confirmation_undone':'blankets.confirmed',
  entity_type:'housekeeping_blanket_changes',entity_id:roomId,
  details:{week_start:week,service_date:date,actor_name:person.name,
   previous_confirmation_at:existing?.changed_at||null,previous_confirmed_by:existing?.changed_by||null}
 })
 if(auditError)console.error('Blanket confirmation audit failed:',auditError.message)
 return NextResponse.json({ok:true,weekStart:week,confirmed:action==='confirm',auditRecorded:!auditError},{headers:{'cache-control':'private, no-store'}})
}
