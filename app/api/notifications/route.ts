import { NextRequest,NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

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
 const status=req.nextUrl.searchParams.get('view')||'inbox'
 if(!['inbox','unread','archived'].includes(status))return response({error:'Invalid filter'},400)
 const limit=Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit')||100)||100,1),200)
 let query=db.from('notifications').select('id,notification_type,title,message,room_id,service_date,created_at,read_at,archived_at')
  .eq('recipient_user_id',user.id).order('created_at',{ascending:false}).limit(limit)
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
