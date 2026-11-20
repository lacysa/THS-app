import {NextRequest,NextResponse} from 'next/server'
import {getStaffAccess} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'
export const dynamic='force-dynamic'
const validDate=(v:unknown)=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))
function weekStart(date:string){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10)}
const permitted=(caps:string[])=>caps.some(c=>['housekeeping','runner','hospitality_assistant','manager','general_manager','operations_manager','owner'].includes(c))
export async function GET(req:NextRequest){
 const access=await getStaffAccess()
 if(!access)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(!permitted(access.capabilities||[])&&!access.isAdmin)return NextResponse.json({error:'Forbidden'},{status:403})
 const date=req.nextUrl.searchParams.get('date')
 if(!validDate(date))return NextResponse.json({error:'Invalid date'},{status:400})
 const {data,error}=await createSupabaseAdmin().from('housekeeping_blanket_changes').select('room_id,changed_at,changed_by').eq('week_start',weekStart(date as string))
 if(error)return NextResponse.json({error:error.message},{status:500})
 const rooms:Record<string,{changedAt:string;changedBy:string}>={}
 for(const item of data||[])rooms[item.room_id]={changedAt:item.changed_at,changedBy:item.changed_by||''}
 return NextResponse.json({weekStart:weekStart(date as string),rooms},{headers:{'cache-control':'private, no-store'}})
}
export async function PATCH(req:NextRequest){
 const access=await getStaffAccess()
 if(!access)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(access.isPreviewMode)return NextResponse.json({error:'Preview is read-only'},{status:403})
 const caps=access.capabilities||[]
 if(!permitted(caps)&&!access.isAdmin)return NextResponse.json({error:'Forbidden'},{status:403})
 const body=await req.json().catch(()=>null)
 const date=body?.date,roomId=body?.roomId
 if(!validDate(date)||typeof roomId!=='string'||!/^[0-9a-f-]{36}$/i.test(roomId))return NextResponse.json({error:'Invalid room or date'},{status:400})
 const admin=createSupabaseAdmin()
 const {data:person}=await admin.from('staff_members').select('name').eq('auth_user_id',access.userId).eq('active',true).maybeSingle()
 if(!person)return NextResponse.json({error:'Staff profile not found'},{status:403})
 const {data:daily,error:dailyError}=await admin.from('housekeeping_daily_rooms').select('assigned_to').eq('service_date',date).eq('room_id',roomId).maybeSingle()
 if(dailyError)return NextResponse.json({error:dailyError.message},{status:500})
 if(!daily)return NextResponse.json({error:'Room not scheduled for this date'},{status:404})
 const manager=access.isAdmin||caps.some(c=>['manager','general_manager','operations_manager','owner'].includes(c))
 if(!manager&&!String(daily.assigned_to||'').split(',').some((v:string)=>v.trim().toLowerCase()===person.name.toLowerCase())){
  const {data:tub}=await admin.from('room_ops_details').select('tub_clean_assigned_to').eq('room_id',roomId).eq('service_date',date).maybeSingle()
  if(String(tub?.tub_clean_assigned_to||'').trim().toLowerCase()!==person.name.toLowerCase())return NextResponse.json({error:'This room is not assigned to you'},{status:403})
 }
 const now=new Date().toISOString()
 const {error}=await admin.from('housekeeping_blanket_changes').upsert({room_id:roomId,week_start:weekStart(date),changed_at:now,changed_by:access.userId},{onConflict:'room_id,week_start'})
 if(error)return NextResponse.json({error:error.message},{status:500})
 return NextResponse.json({ok:true,weekStart:weekStart(date),changedAt:now})
}
