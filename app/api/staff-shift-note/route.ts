import { NextRequest,NextResponse } from 'next/server'
import { getStaffAccess } from '@/lib/access'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { ymdInHotelTz } from '@/lib/time'

export const dynamic='force-dynamic'
async function context(){
  const access=await getStaffAccess()
  if(!access || access.isPreviewMode)return null
  const db=createSupabaseAdmin()
  const {data:staff}=await db.from('staff_members').select('id,name').eq('auth_user_id',access.userId).eq('active',true).maybeSingle()
  if(!staff)return null
  return {db,staff}
}
export async function GET(){
  const ctx=await context()
  if(!ctx)return NextResponse.json({error:'Not authorized'},{status:403})
  const date=ymdInHotelTz()
  const {data,error}=await ctx.db.from('shift_report_notes').select('content,updated_at').eq('report_date',date).eq('shift','Daily').eq('section','general').eq('staff_member_id',ctx.staff.id).maybeSingle()
  if(error)return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({content:data?.content||'',updatedAt:data?.updated_at||null,date})
}
export async function POST(req:NextRequest){
  const ctx=await context()
  if(!ctx)return NextResponse.json({error:'Not authorized'},{status:403})
  const payload=await req.json().catch(()=>null)
  if(typeof payload?.content!=='string'||payload.content.length>4000)return NextResponse.json({error:'Shift note must be 4,000 characters or fewer.'},{status:400})
  const date=ymdInHotelTz()
  const {data:report}=await ctx.db.from('shift_reports').select('status').eq('report_date',date).eq('shift','Daily').maybeSingle()
  if(report?.status==='finalized')return NextResponse.json({error:'Today’s shift report has already been finalized.'},{status:409})
  const {error}=await ctx.db.from('shift_report_notes').upsert({
    report_date:date,shift:'Daily',section:'general',staff_member_id:ctx.staff.id,
    content:payload.content.trim(),updated_at:new Date().toISOString()
  },{onConflict:'report_date,shift,section,staff_member_id'})
  if(error)return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({ok:true,date})
}
