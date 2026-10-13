import {NextRequest,NextResponse} from 'next/server'
import {canUseModule} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'
import {ymdInHotelTz} from '@/lib/time'

export const dynamic='force-dynamic'
const isUuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const isDate=(value:string)=>/^20\d{2}-\d{2}-\d{2}$/.test(value)

export async function POST(req:NextRequest){
 const gate=await canUseModule('ops')
 if(!gate.access)return NextResponse.json({error:'Unauthorized'},{status:401})
 const access=gate.access
 const caps=access.capabilities||[]
 if(!gate.allowed||access.isPreviewMode||!(access.isAdmin||caps.some((cap:string)=>['manager','general_manager','operations_manager','owner'].includes(cap))))
  return NextResponse.json({error:'Forbidden'},{status:403})
 const body=await req.json().catch(()=>({}))
 const roomId=String(body.roomId||'')
 const date=String(body.date||'')
 const note=String(body.note||'')
 const everyone=body.everyone===true&&/(?:^|\s)@everyone\b/i.test(note)
 const today=body.today===true&&/(?:^|\s)@today\b/i.test(note)
 const userIds=Array.isArray(body.userIds)?[...new Set(body.userIds.filter((id:unknown)=>typeof id==='string'&&isUuid(id)))].slice(0,25):[]
 if(!isUuid(roomId)||!isDate(date)||!note||note.length>6000||(!userIds.length&&!everyone&&!today))
  return NextResponse.json({error:'Invalid mention request'},{status:400})
 const admin=createSupabaseAdmin()
 const {data:roomDay,error:roomError}=await admin.from('housekeeping_daily_rooms').select('notes').eq('service_date',date).eq('room_id',roomId).maybeSingle()
 if(roomError||!roomDay||String(roomDay.notes||'')!==note)
  return NextResponse.json({error:'Save the room note before notifying staff'},{status:409})
 const {data:scheduled,error:scheduleError}=today?await admin.from('staff_daily_schedule').select('staff_member_id').eq('schedule_date',ymdInHotelTz()).eq('work_mode','onsite'):{data:[],error:null}
 if(scheduleError)return NextResponse.json({error:'Unable to load today’s staff schedule'},{status:500})
 const scheduledIds=new Set((scheduled||[]).map((row:any)=>String(row.staff_member_id)))
 const staffQuery=admin.from('staff_members').select('id,auth_user_id,name').eq('active',true)
 const {data:staff,error:staffError}=await (everyone||today?staffQuery.not('auth_user_id','is',null):staffQuery.in('auth_user_id',userIds))
 if(staffError)return NextResponse.json({error:'Unable to validate mentions'},{status:500})
 const allowed=(staff||[]).filter((member:any)=>member.auth_user_id&&(everyone||(today&&scheduledIds.has(String(member.id)))||(userIds.includes(String(member.auth_user_id))&&note.toLocaleLowerCase().includes('@'+String(member.name||'').toLocaleLowerCase()))))
 const {data:room}=await admin.from('rooms').select('name').eq('id',roomId).maybeSingle()
 if(!room)return NextResponse.json({error:'Room not found'},{status:404})
 const recipients=[...new Map(allowed.map((member:any)=>[String(member.auth_user_id),member])).values()]
 const rows=recipients.filter((member:any)=>String(member.auth_user_id)!==access.userId).map((member:any)=>({
  recipient_user_id:member.auth_user_id,notification_type:'room_mention',
  title:'Mentioned in '+room.name+' room notes',message:note.slice(0,500),
  room_id:roomId,service_date:date,created_by:access.userId
 }))
 if(!rows.length)return NextResponse.json({ok:true,count:0})
 const {error}=await admin.from('notifications').insert(rows)
 if(error)return NextResponse.json({error:'Room note saved, but notification could not be delivered: '+error.message},{status:500})
 return NextResponse.json({ok:true,count:rows.length})
}
