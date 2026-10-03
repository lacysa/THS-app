import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

const allowed = new Set(['laundry','lobby'])

export async function GET(req:NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  const department = String(req.nextUrl.searchParams.get('department') || '')
  const date = String(req.nextUrl.searchParams.get('date') || '')
  if (!allowed.has(department) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({error:'Invalid request'},{status:400})
  const caps = new Set(access.capabilities || [])
  const ok = access.isAdmin || ['owner','manager'].includes(String(access.roleName||'').toLowerCase()) ||
    (department==='laundry' ? caps.has('laundry') : (caps.has('hospitality_assistant') || caps.has('runner')))
  if (!ok) return NextResponse.json({error:'Access denied'},{status:403})
  const admin=createSupabaseAdmin()
  const {data,error}=await admin.from('department_daily_notes').select('note,updated_at').eq('department',department).eq('service_date',date).maybeSingle()
  if(error)return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({note:data?.note||'',updatedAt:data?.updated_at||null})
}

export async function POST(req:NextRequest) {
  const access=await getStaffAccess()
  if(!access)return NextResponse.json({error:'Unauthorized'},{status:401})
  const body=await req.json().catch(()=>null)
  const department=String(body?.department||'')
  const date=String(body?.date||'')
  if(!allowed.has(department)||!/^\d{4}-\d{2}-\d{2}$/.test(date))return NextResponse.json({error:'Invalid request'},{status:400})
  const caps=new Set(access.capabilities||[])
  const ok=access.isAdmin||['owner','manager'].includes(String(access.roleName||'').toLowerCase())||
    (department==='laundry'?caps.has('laundry'):(caps.has('hospitality_assistant')||caps.has('runner')))
  if(!ok)return NextResponse.json({error:'Access denied'},{status:403})
  const admin=createSupabaseAdmin()
  const {error}=await admin.from('department_daily_notes').upsert({
    department,service_date:date,note:String(body?.note||''),updated_by:access.userId,updated_at:new Date().toISOString()
  },{onConflict:'department,service_date'})
  if(error)return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({ok:true})
}
