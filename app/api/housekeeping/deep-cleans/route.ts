import { NextRequest, NextResponse } from 'next/server'
import { getStaffAccess } from '@/lib/access'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
export const dynamic = 'force-dynamic'
const validDate = (value: unknown) => typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+'T12:00:00Z'))
async function authorize() {
  const access = await getStaffAccess()
  if (!access) return { error: 'Unauthorized', status: 401 } as const
  if (!access.isAdmin && !(access.capabilities || []).some(cap => ['manager','general_manager','operations_manager','owner'].includes(cap))) return { error: 'Management access required.', status: 403 } as const
  return { access }
}
export async function GET(req: NextRequest) {
  const auth = await authorize()
  if ('error' in auth) return NextResponse.json({error:auth.error},{status:auth.status})
  const date=req.nextUrl.searchParams.get('date')
  if (!validDate(date)) return NextResponse.json({error:'Invalid date'},{status:400})
  const db=createSupabaseAdmin()
  const {data,error}=await db.from('housekeeping_deep_clean_tasks').select('room_id,assigned_to,instructions,completed_at').eq('service_date',date)
  if(error)return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({tasks:data||[]},{headers:{'cache-control':'private, no-store'}})
}
export async function PATCH(req: NextRequest) {
  const auth=await authorize()
  if ('error' in auth) return NextResponse.json({error:auth.error},{status:auth.status})
  if (auth.access.isPreviewMode) return NextResponse.json({error:'Staff preview is read-only.'},{status:403})
  const body=await req.json().catch(()=>null)
  const {date,roomId}=body||{}
  if (!validDate(date)||typeof roomId!=='string'||!roomId) return NextResponse.json({error:'Invalid date or room'},{status:400})
  const db=createSupabaseAdmin()
  if (body.action==='remove') {
    const {data:existing,error:readError}=await db.from('housekeeping_deep_clean_tasks').select('completed_at').eq('service_date',date).eq('room_id',roomId).maybeSingle()
    if(readError)return NextResponse.json({error:readError.message},{status:500})
    if(existing?.completed_at)return NextResponse.json({error:'Completed deep cleans cannot be removed.'},{status:409})
    const {error}=await db.from('housekeeping_deep_clean_tasks').delete().eq('service_date',date).eq('room_id',roomId)
    return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({ok:true})
  }
  if(body.action==='complete') {
    const {error}=await db.from('housekeeping_deep_clean_tasks').update({completed_at:body.completed===false?null:new Date().toISOString(),completed_by:body.completed===false?null:auth.access.userId,updated_at:new Date().toISOString()}).eq('service_date',date).eq('room_id',roomId)
    return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({ok:true})
  }
  if(body.action!=='save')return NextResponse.json({error:'Invalid action'},{status:400})
  const assignedTo=String(body.assignedTo||'').trim()
  const instructions=String(body.instructions||'').trim().slice(0,2000)
  if(assignedTo) {
    const {data:staff,error:staffError}=await db.from('staff_members').select('id').eq('active',true).ilike('name',assignedTo).limit(1)
    if(staffError)return NextResponse.json({error:staffError.message},{status:500})
    if(!staff?.length)return NextResponse.json({error:'Choose an active staff member.'},{status:400})
  }
  const {data:existing,error:readError}=await db.from('housekeeping_deep_clean_tasks').select('completed_at').eq('service_date',date).eq('room_id',roomId).maybeSingle()
  if(readError)return NextResponse.json({error:readError.message},{status:500})
  if(existing?.completed_at)return NextResponse.json({error:'Completed deep cleans cannot be edited.'},{status:409})
  const {error}=await db.from('housekeeping_deep_clean_tasks').upsert({service_date:date,room_id:roomId,assigned_to:assignedTo,instructions,updated_at:new Date().toISOString()},{onConflict:'service_date,room_id'})
  return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({ok:true})
}
