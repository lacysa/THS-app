import { NextRequest,NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic='force-dynamic'

async function session(){
 const db=await createSupabaseServerClient()
 const {data:{user}}=await db.auth.getUser()
 return {db,user}
}
const response=(data:any,status=200)=>NextResponse.json(data,{
 status,headers:{'Cache-Control':'private, no-store, max-age=0'}
})

// Inbox is read/unread history. Archive is a separate per-recipient dismissal
// and NEVER changes whether the referenced room correction is resolved.
export async function GET(req:NextRequest){
 const {db,user}=await session()
 if(!user)return response({error:'Unauthorized'},401)
 const focusedId=req.nextUrl.searchParams.get('id')
 if(focusedId){
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(focusedId))return response({error:'Invalid notification id'},400)
  const {data,error}=await db.from('notifications').select('id,notification_type,title,message,room_id,service_date,created_at,read_at,archived_at').eq('recipient_user_id',user.id).eq('id',focusedId).maybeSingle()
  if(error)return response({error:error.message},400)
  if(!data)return response({error:'Notification not found'},404)
  // Recipient ownership was verified above. Staff can read their own dated
  // correction trail without opening the manager-only room workspace.
  let corrections:{id:string;type:string;note:string;at:string}[]=[]
  if(data.room_id&&data.service_date){
   const result=await createSupabaseAdmin().from('housekeeping_correction_events')
    .select('id,event_type,note,created_at')
    .eq('room_id',data.room_id).eq('service_date',data.service_date)
    .in('event_type',['found','fixed']).order('created_at',{ascending:true})
   if(result.error)return response({error:'Unable to load inspection and fix notes'},500)
   corrections=(result.data||[]).filter(item=>String(item.note||'').trim()).map(item=>({
    id:String(item.id),type:String(item.event_type),note:String(item.note),at:String(item.created_at)
   }))
  }
  return response({notification:data,corrections})
 }
 const status=req.nextUrl.searchParams.get('view')||'inbox'
 if(!['inbox','unread','archived'].includes(status))return response({error:'Invalid filter'},400)
 const kind=req.nextUrl.searchParams.get('kind')||'all'
 const kinds:Record<string,string[]>={
  all:[],mentions:['room_mention'],inspections:['room_ready_for_inspection'],
  fixes:['housekeeping_correction','housekeeping_recheck_passed','housekeeping_fix_recorded']
 }
 if(!Object.prototype.hasOwnProperty.call(kinds,kind))return response({error:'Invalid notification type'},400)
 const limit=Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')||100)||100,1),200)
 let query=db.from('notifications').select('id,notification_type,title,message,room_id,service_date,created_at,read_at,archived_at')
  .eq('recipient_user_id',user.id).order('created_at',{ascending:false}).limit(limit)
 if(kind!=='all')query=query.in('notification_type',kinds[kind])
 if(status==='archived')query=query.not('archived_at','is',null)
 else{
  query=query.is('archived_at',null)
  if(status==='unread')query=query.is('read_at',null)
 }
 const [items,unread,inbox,archived]=await Promise.all([
  query,
  db.from('notifications').select('id',{count:'exact',head:true}).eq('recipient_user_id',user.id).is('archived_at',null).is('read_at',null),
  db.from('notifications').select('id',{count:'exact',head:true}).eq('recipient_user_id',user.id).is('archived_at',null),
  db.from('notifications').select('id',{count:'exact',head:true}).eq('recipient_user_id',user.id).not('archived_at','is',null)
 ])
 const err=items.error||unread.error||inbox.error||archived.error
 if(err)return response({error:err.message},400)
 return response({notifications:items.data||[],unread:unread.count||0,counts:{inbox:inbox.count||0,unread:unread.count||0,archived:archived.count||0},limit})
}

export async function PATCH(req:NextRequest){
 const {db,user}=await session()
 if(!user)return response({error:'Unauthorized'},401)
 const body=await req.json().catch(()=>({}))
 const action=body.markAllRead?'markAllRead':String(body.action||'read')
 const now=new Date().toISOString()
 if(action==='markAllRead'){
  const {error}=await db.from('notifications').update({read_at:now}).eq('recipient_user_id',user.id).is('read_at',null).is('archived_at',null)
  return error?response({error:error.message},400):response({ok:true})
 }
 if(!['read','archive','unarchive'].includes(action))return response({error:'Unknown notification action'},400)
 const id=String(body.id||'')
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))return response({error:'Invalid notification id'},400)
 const patch=action==='read'?{read_at:now}:action==='archive'?{archived_at:now,read_at:now}:{archived_at:null}
 const {data,error}=await db.from('notifications').update(patch).eq('recipient_user_id',user.id).eq('id',id).select('id').maybeSingle()
 if(error)return response({error:error.message},400)
 if(!data)return response({error:'Notification not found'},404)
 return response({ok:true})
}
