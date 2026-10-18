import {NextRequest,NextResponse} from 'next/server'
import {canUseModule} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'

export const dynamic='force-dynamic'
const validDate=(date:string)=>/^20\d{2}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date+'T12:00:00Z'))

// Room Operations uses the same saved correction events as room inspections.
// Return the issue and the recorded fix separately. Never infer a fix note from
// a room's current inspection status or the daily room-note text.
export async function GET(req:NextRequest){
 const [ops,reservations]=await Promise.all([canUseModule('ops'),canUseModule('reservations')])
 if(!ops.access&&!reservations.access)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(!ops.allowed&&!reservations.allowed)return NextResponse.json({error:'Forbidden'},{status:403})
 const date=req.nextUrl.searchParams.get('date')||''
 if(!validDate(date))return NextResponse.json({error:'Invalid date'},{status:400})
 const admin=createSupabaseAdmin()
 const {data,error}=await admin.from('housekeeping_correction_events')
  .select('id,room_id,event_type,note,created_at')
  .eq('service_date',date)
  .in('event_type',['found','fixed'])
  .order('created_at',{ascending:true})
 if(error)return NextResponse.json({error:'Could not load housekeeping correction notes'},{status:500})
 const notesByRoom:Record<string,{id:string;kind:'found'|'fixed';note:string;at:string}[]>={}
 for(const item of data||[]){
  const roomId=String(item.room_id)
  const note=String(item.note||'').trim()
  if(!note)continue
  if(!notesByRoom[roomId])notesByRoom[roomId]=[]
  notesByRoom[roomId].push({
   id:String(item.id),
   kind:item.event_type==='fixed'?'fixed':'found',
   note,
   at:String(item.created_at||'')
  })
 }
 return NextResponse.json({notesByRoom},{headers:{'cache-control':'private, no-store'}})
}
