import {NextRequest,NextResponse} from 'next/server'
import {canUseModule} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'

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
 const userIds=Array.isArray(body.userIds)?[...new Set(body.userIds.filter((id:unknown)=>typeof id==='string'&&isUuid(id)))].slice(0,25):[]
 if(!isUuid(roomId)||!isDate(date)||!note||note.length>6000||!userIds.length)
  return NextResponse.json({error:'Invalid mention request'},{status:400})
 const admin=createSupabaseAdmin()
 const {data:roomDay,error:roomError}=await admin.from('housekeeping_daily_rooms').select('notes').eq('service_date',date).eq('room_id',roomId).maybeSingle()
 if(roomError||!roomDay||String(roomDay.notes||'')!==note)
  return NextResponse.json({error:'Save the room note before notifying staff'},{status:409})
 const {data:staff,error:staffError}=await admin.from('staff_members').select('auth_user_id,name').eq('active',true).in('auth_user_id',userIds)
 if(staffError)return NextResponse.json({error:'Unable to validate mentions'},{status:500})
 const allowed=(staff||[]).filter((member:any)=>member.auth_user_id&&note.toLocaleLowerCase().includes('@'+String(member.name||'').toLocaleLowerCase()))
 const {data:room}=await admin.from('rooms').select('name').eq('id',roomId).maybeSingle()
 if(!room)return NextResponse.json({error:'Room not found'},{status:404})
 const rows=allowed.filter((member:any)=>String(member.auth_user_id)!==access.userId).map((member:any)=>({
  recipient_user_id:member.auth_user_id,notification_type:'room_mention',
  title:'Mentioned in '+room.name+' room notes',message:note.slice(0,500),
  room_id:roomId,service_date:date,created_by:access.userId
 }))
 if(!rows.length)return NextResponse.json({ok:true,count:0})
 const {error}=await admin.from('notifications').insert(rows)
 if(error)return NextResponse.json({error:'Room note saved, but notification could not be delivered: '+error.message},{status:500})
 return NextResponse.json({ok:true,count:rows.length})
}
