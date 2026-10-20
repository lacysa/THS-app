import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { canUseModule } from '@/lib/access'
import { staffAttribution } from '@/lib/staff-initials'

export const dynamic = 'force-dynamic'
const sections = ['guest','staff','supplies','tomorrow','general','maintenance','management']
async function context() {
  const gate=await canUseModule('shift_reports')
  if (!gate.access || !gate.allowed) return null
  const admin=createSupabaseAdmin()
  const {data:staff}=await admin.from('staff_members').select('id,name,username').eq('auth_user_id',gate.access.userId).eq('active',true).maybeSingle()
  if (!staff) return null
  const caps=gate.access.capabilities
  const manager=gate.access.isAdmin || ['manager','general_manager','operations_manager','owner','foh_manager'].some(x=>caps.includes(x))
  return {admin,staff,manager}
}
export async function GET(req:NextRequest) {
  const ctx=await context()
  if (!ctx) return NextResponse.json({error:'Not authorized'},{status:403})
  const date=req.nextUrl.searchParams.get('date')||''
  const shift=req.nextUrl.searchParams.get('shift')||'Daily'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({error:'Invalid date'},{status:400})
  const {data,error}=await ctx.admin.from('shift_report_notes').select('id,section,staff_member_id,content,updated_at').eq('report_date',date).eq('shift',shift).order('updated_at')
  if (error) return NextResponse.json({error:error.message},{status:500})
  const rows=(data||[]).filter((x:any)=>ctx.manager || x.section!=='management')
  const ids=[...new Set(rows.map((x:any)=>x.staff_member_id))]
  const {data:staff}=ids.length ? await ctx.admin.from('staff_members').select('id,name,username').in('id',ids) : {data:[]}
  const people=new Map((staff||[]).map((person:any)=>[String(person.id),person]))
  return NextResponse.json({
    entries:rows.map((entry:any)=>{
      const person:any=people.get(String(entry.staff_member_id))
      return {...entry,name:person?.name||'Staff',initials:staffAttribution(person?.username,person?.name)}
    }),
    currentStaffId:ctx.staff.id,
    currentStaffName:ctx.staff.name,
    currentStaffInitials:staffAttribution(ctx.staff.username,ctx.staff.name),
    canManage:ctx.manager
  })
}
export async function POST(req:NextRequest) {
  const ctx=await context()
  if (!ctx) return NextResponse.json({error:'Not authorized'},{status:403})
  const p=await req.json().catch(()=>null)
  if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.date||'')) || !sections.includes(p.section) || (p.section==='management'&&!ctx.manager))
    return NextResponse.json({error:'Invalid or unauthorized note'},{status:400})
  const date=String(p.date),shift=String(p.shift||'Daily'),section=String(p.section),content=String(p.content||'')
  if (content.length>20000) return NextResponse.json({error:'Note too long'},{status:400})
  const {data:report}=await ctx.admin.from('shift_reports').select('status').eq('report_date',date).eq('shift',shift).maybeSingle()
  if (report?.status==='finalized') return NextResponse.json({error:'Report is finalized'},{status:409})
  const {data,error}=await ctx.admin.from('shift_report_notes').upsert({report_date:date,shift,section,staff_member_id:ctx.staff.id,content,updated_at:new Date().toISOString()},{onConflict:'report_date,shift,section,staff_member_id'}).select('updated_at').single()
  if (error) return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({ok:true,updated_at:data.updated_at})
}
