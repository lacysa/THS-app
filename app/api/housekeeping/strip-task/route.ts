import { NextRequest,NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic='force-dynamic'

export async function PATCH(req:NextRequest){
  const access=await getStaffAccess()
  if(!access) return NextResponse.json({error:'Unauthorized'},{status:401})

  const body=await req.json().catch(()=>null)
  const serviceDate=String(body?.serviceDate||'')
  const roomId=String(body?.roomId||'')
  const action=String(body?.action||'')

  if(!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)||!roomId||!['request','complete','clear'].includes(action)){
    return NextResponse.json({error:'Invalid strip task update.'},{status:400})
  }

  const admin=createSupabaseAdmin()
  const now=new Date().toISOString()

  const {data:person}=await admin
    .from('staff_members')
    .select('id,name')
    .eq('auth_user_id',access.userId)
    .eq('active',true)
    .maybeSingle()

  if(!person) return NextResponse.json({error:'Active staff profile not found.'},{status:403})

  const update:any={updated_at:now}
  if(action==='request'){
    update.strip_status='needed'
    update.strip_requested_by=person.id
    update.strip_requested_at=now
    update.stripped_by=null
    update.stripped_at=null
  }else if(action==='complete'){
    update.strip_status='stripped'
    update.stripped_by=person.id
    update.stripped_at=now
  }else{
    update.strip_status=''
    update.strip_requested_by=null
    update.strip_requested_at=null
    update.stripped_by=null
    update.stripped_at=null
  }

  const {data,error}=await admin
    .from('housekeeping_daily_rooms')
    .update(update)
    .eq('service_date',serviceDate)
    .eq('room_id',roomId)
    .select('room_id,strip_status,stripped_at')
    .single()

  if(error) return NextResponse.json({error:error.message},{status:500})

  return NextResponse.json({
    ok:true,
    roomId,
    stripStatus:data.strip_status,
    strippedByName:action==='complete'?person.name:null,
    strippedAt:data.stripped_at||null
  })
}
