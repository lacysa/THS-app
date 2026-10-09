import {NextRequest,NextResponse} from 'next/server'
import {canUseModule} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'

export const dynamic='force-dynamic'
const datePattern=/^20\d{2}-\d{2}-\d{2}$/
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const categories=new Set(['guest_request','housekeeping_issue','team_note'])
const short=(v:unknown)=>String(v??'').trim()
type Item={id:string;roomId:string|null;roomName:string;serviceDate:string;eventType:string;message:string;status:string;at:string;actor:string;source:string}
async function gateOps(){
 const gate=await canUseModule('ops')
 return gate
}
function dateOk(value:string){return datePattern.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))}
async function getRooms(admin:ReturnType<typeof createSupabaseAdmin>){
 const result=await admin.from('rooms').select('id,name').eq('active',true)
 if(result.error)throw new Error(result.error.message)
 return result.data||[]
}
export async function GET(req:NextRequest){
 const gate=await gateOps()
 if(!gate.access)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(!gate.allowed)return NextResponse.json({error:'Forbidden'},{status:403})
 const start=req.nextUrl.searchParams.get('start')||''
 const end=req.nextUrl.searchParams.get('end')||''
 const roomId=req.nextUrl.searchParams.get('roomId')||''
 if(!dateOk(start)||!dateOk(end)||end<start||(roomId&&!uuidPattern.test(roomId)))return NextResponse.json({error:'Invalid log filter'},{status:400})
 const admin=createSupabaseAdmin()
 const eventBase=admin.from('ops_activity_log').select('id,room_id,service_date,event_type,message,status,source,actor_user_id,actor_name,created_at').gte('service_date',start).lte('service_date',end).order('created_at',{ascending:false}).limit(160)
 const dailyBase=admin.from('housekeeping_daily_rooms').select('service_date,room_id,reservation_status,assigned_to,complete,completed_at,inspected,inspected_at,service_type,notes').gte('service_date',start).lte('service_date',end)
 const correctionBase=admin.from('housekeeping_correction_events').select('id,service_date,room_id,event_type,note,actor_id,created_at').gte('service_date',start).lte('service_date',end).order('created_at',{ascending:false}).limit(60)
 const notesBase=admin.from('room_notes').select('id,room_id,service_date,note,note_type,resolved,created_by,created_at').gte('service_date',start).lte('service_date',end).order('created_at',{ascending:false}).limit(60)
 const openBase=admin.from('ops_activity_log').select('id,room_id,service_date,event_type,message,status,source,actor_user_id,actor_name,created_at').eq('status','open').order('created_at',{ascending:false}).limit(60)
 const [events,daily,corrections,notes,open,rooms,staff]=await Promise.all([
   roomId?eventBase.eq('room_id',roomId):eventBase,
   roomId?dailyBase.eq('room_id',roomId):dailyBase,
   roomId?correctionBase.eq('room_id',roomId):correctionBase,
   roomId?notesBase.eq('room_id',roomId):notesBase,
   roomId?openBase.eq('room_id',roomId):openBase,
   getRooms(admin),
   admin.from('staff_members').select('id,name,auth_user_id').limit(200)
 ])
 if(events.error||daily.error||corrections.error||notes.error||open.error||staff.error)
   return NextResponse.json({error:'Could not load Ops activity'},{status:500})
 const byRoom=new Map(rooms.map((r:any)=>[String(r.id),String(r.name)]))
 const byUser=new Map((staff.data||[]).filter((m:any)=>m.auth_user_id).map((m:any)=>[String(m.auth_user_id),String(m.name)]))
 const byStaffId=new Map((staff.data||[]).map((m:any)=>[String(m.id),String(m.name)]))
 const list:Item[]=[]
 const seen=new Set<string>()
 const sourceItems=[...(events.data||[]),...(open.data||[])]
 const eventKeys=new Set<string>()
 for(const r of sourceItems as any[]){
  if(seen.has(String(r.id)))continue
  seen.add(String(r.id))
  const rid=r.room_id?String(r.room_id):null
  const day=String(r.service_date)
  eventKeys.add([rid,day,String(r.event_type)].join('|'))
  list.push({id:String(r.id),roomId:rid,roomName:byRoom.get(rid||'')||'General',serviceDate:day,
    eventType:String(r.event_type),message:String(r.message),status:String(r.status||'recorded'),
    at:String(r.created_at),actor:String(r.actor_name||byUser.get(String(r.actor_user_id))||'Staff'),source:String(r.source||'manual')})
 }
 for(const row of (daily.data||[]) as any[]){
  const rid=String(row.room_id),day=String(row.service_date)
  const types=[
    {type:row.service_type?.toUpperCase()==='RF'?'refresh_completed':'clean_completed',when:row.complete&&row.completed_at?String(row.completed_at):null,text:row.service_type?.toUpperCase()==='RF'?'Refresh completed':'Room clean completed',actor:String(row.assigned_to||'Staff')},
    {type:'inspection_passed',when:row.inspected&&row.inspected_at?String(row.inspected_at):null,text:'Room inspection passed',actor:'Staff'}
  ]
  for(const e of types){
   if(!e.when||eventKeys.has([rid,day,e.type].join('|')))continue
   list.push({id:'historic:'+rid+':'+day+':'+e.type,roomId:rid,roomName:byRoom.get(rid)||'Room',serviceDate:day,eventType:e.type,
    message:e.text,status:'recorded',at:e.when,actor:e.actor,source:'existing_record'})
  }
  // Older staff assignments and refresh requests are daily snapshots, not claims
  // about when someone tapped a button.
  if(row.assigned_to&&!eventKeys.has([rid,day,'assignment_changed'].join('|'))){
   list.push({id:'assignment:'+rid+':'+day,roomId:rid,roomName:byRoom.get(rid)||'Room',serviceDate:day,eventType:'assignment_snapshot',
    message:'Assigned for '+day+': '+String(row.assigned_to),status:'recorded',at:day+'T12:00:00Z',actor:String(row.assigned_to),source:'daily_snapshot'})
  }
  if(String(row.service_type||'').toUpperCase()==='RF'&&!eventKeys.has([rid,day,'refresh_requested'].join('|'))){
   list.push({id:'refresh:'+rid+':'+day,roomId:rid,roomName:byRoom.get(rid)||'Room',serviceDate:day,eventType:'refresh_snapshot',
    message:'Refresh on daily schedule',status:'recorded',at:day+'T12:00:00Z',actor:String(row.assigned_to||'Unassigned'),source:'daily_snapshot'})
  }
 }
 for(const r of (corrections.data||[]) as any[]){
  list.push({id:'correction:'+r.id,roomId:String(r.room_id),roomName:byRoom.get(String(r.room_id))||'Room',
   serviceDate:String(r.service_date),eventType:'correction_'+String(r.event_type),message:String(r.note||'Housekeeping correction '+r.event_type),
   status:'recorded',at:String(r.created_at),actor:byStaffId.get(String(r.actor_id))||byUser.get(String(r.actor_id))||'Staff',source:'correction_history'})
 }
 for(const r of (notes.data||[]) as any[]){
  list.push({id:'roomnote:'+r.id,roomId:String(r.room_id),roomName:byRoom.get(String(r.room_id))||'Room',
   serviceDate:String(r.service_date),eventType:'room_note',message:String(r.note||'').slice(0,700),
   status:r.resolved?'done':'recorded',at:String(r.created_at),actor:byUser.get(String(r.created_by))||'Staff',source:'room_notes'})
 }
 list.sort((a,b)=>((a.status==='open'?1:0)!==(b.status==='open'?1:0)?(a.status==='open'?-1:1):b.at.localeCompare(a.at)))
 return NextResponse.json({items:list.slice(0,180),rooms:rooms.map((r:any)=>({id:String(r.id),name:String(r.name)}))},{headers:{'cache-control':'private, no-store'}})
}
export async function POST(req:NextRequest){
 const gate=await gateOps()
 if(!gate.access)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(!gate.allowed||gate.access.isPreviewMode)return NextResponse.json({error:'Forbidden'},{status:403})
 const body=await req.json().catch(()=>null)
 const serviceDate=short(body?.serviceDate),roomId=short(body?.roomId),eventType=short(body?.eventType),message=short(body?.message)
 if(!dateOk(serviceDate)||(roomId&&!uuidPattern.test(roomId))||!categories.has(eventType)||!message||message.length>800)
  return NextResponse.json({error:'Choose a date and category and enter a note (800 characters maximum).'},{status:400})
 if(!roomId&&eventType!=='team_note')return NextResponse.json({error:'Select a room for guest requests or issues.'},{status:400})
 const admin=createSupabaseAdmin()
 if(roomId){
  const valid=await admin.from('rooms').select('id').eq('id',roomId).eq('active',true).maybeSingle()
  if(valid.error||!valid.data)return NextResponse.json({error:'Invalid room'},{status:400})
 }
 const row=await admin.from('ops_activity_log').insert({
  room_id:roomId||null,service_date:serviceDate,event_type:eventType,message,source:'manual',
  status:eventType==='team_note'?'recorded':'open',actor_user_id:gate.access.userId
 }).select('id').single()
 if(row.error)return NextResponse.json({error:'Could not save log entry'},{status:500})
 return NextResponse.json({id:row.data.id},{status:201})
}
export async function PATCH(req:NextRequest){
 const gate=await gateOps()
 if(!gate.access)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(!gate.allowed||gate.access.isPreviewMode)return NextResponse.json({error:'Forbidden'},{status:403})
 const body=await req.json().catch(()=>null)
 const id=short(body?.id)
 if(!uuidPattern.test(id)||body?.status!=='done')return NextResponse.json({error:'Invalid action'},{status:400})
 const admin=createSupabaseAdmin()
 const result=await admin.from('ops_activity_log').update({status:'done',resolved_at:new Date().toISOString(),resolved_by:gate.access.userId})
   .eq('id',id).eq('source','manual').eq('status','open').select('id').maybeSingle()
 if(result.error)return NextResponse.json({error:'Could not resolve request'},{status:500})
 if(!result.data)return NextResponse.json({error:'Request already resolved or not found'},{status:409})
 return NextResponse.json({ok:true})
}
