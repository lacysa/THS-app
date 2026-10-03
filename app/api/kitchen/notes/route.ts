import { NextRequest, NextResponse } from 'next/server'
import { getStaffAccess } from '@/lib/access'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req:NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  const date = req.nextUrl.searchParams.get('date') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({error:'Invalid date'},{status:400})
  const admin = createSupabaseAdmin()
  const {data,error} = await admin.from('kitchen_daily_notes').select('note,updated_at').eq('service_date',date).maybeSingle()
  if (error) return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({note:data?.note || '',updatedAt:data?.updated_at || null})
}

export async function POST(req:NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  const payload = await req.json().catch(()=>null)
  const serviceDate = String(payload?.serviceDate || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return NextResponse.json({error:'Invalid date'},{status:400})
  const note = String(payload?.note || '')
  const admin = createSupabaseAdmin()
  const {error} = await admin.from('kitchen_daily_notes').upsert({service_date:serviceDate,note,updated_by:access.userId,updated_at:new Date().toISOString()},{onConflict:'service_date'})
  if (error) return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({ok:true})
}
