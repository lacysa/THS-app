import { NextRequest,NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic='force-dynamic'

function previousDate(value:string){
  const d=new Date(`${value}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate()-1)
  return d.toISOString().slice(0,10)
}

export async function PATCH(req:NextRequest){
  const supabase=await createSupabaseServerClient()
  const {data:{user}}=await supabase.auth.getUser()
  if(!user) return NextResponse.json({message:'Unauthorized'},{status:401})

  const body=await req.json().catch(()=>null)
  const serviceDate=String(body?.serviceDate||'')
  const roomId=String(body?.roomId||'')
  const skipped=body?.skipped===true

  if(!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)||!roomId){
    return NextResponse.json({message:'Invalid breakfast skip update.'},{status:400})
  }

  const admin=createSupabaseAdmin()
  const sourceDate=previousDate(serviceDate)
  const now=new Date().toISOString()

  const {data:row,error:findError}=await admin
    .from('housekeeping_daily_rooms')
    .select('id,breakfast_tag')
    .eq('service_date',sourceDate)
    .eq('room_id',roomId)
    .maybeSingle()

  if(findError) return NextResponse.json({message:findError.message},{status:500})
  if(!row||!row.breakfast_tag){
    return NextResponse.json({message:'This room is not tagged for breakfast.'},{status:404})
  }

  const {error:updateError}=await admin
    .from('housekeeping_daily_rooms')
    .update({
      breakfast_skipped:skipped,
      breakfast_skipped_by:skipped?user.id:null,
      breakfast_skipped_at:skipped?now:null,
      updated_at:now
    })
    .eq('id',row.id)

  if(updateError) return NextResponse.json({message:updateError.message},{status:500})

  await admin.from('audit_log').insert({
    actor_user_id:user.id,
    action:skipped?'SKIP_BREAKFAST_ROOM':'RESTORE_BREAKFAST_ROOM',
    entity_type:'housekeeping_daily_room',
    entity_id:row.id,
    details:{serviceDate,sourceDate,roomId,skipped}
  })

  return NextResponse.json({ok:true,skipped})
}
