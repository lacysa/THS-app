import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { canUseModule } from '@/lib/access'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await canUseModule('maintenance')
  if (!gate.access) return NextResponse.json({error:'Unauthorized'},{status:401})
  if (!gate.allowed) return NextResponse.json({error:'Forbidden'},{status:403})
  const supabase = await createSupabaseServerClient()
  const [{data:rooms,error:roomsError},{data:tickets,error:ticketsError}] = await Promise.all([
    supabase.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
    supabase.from('maintenance_tickets').select('*,rooms(name)').order('created_at',{ascending:false})
  ])
  const error = roomsError || ticketsError
  if (error) return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({rooms:rooms||[],tickets:tickets||[]})
}

export async function POST(req:NextRequest) {
  const gate = await canUseModule('maintenance')
  if (!gate.access) return NextResponse.json({error:'Unauthorized'},{status:401})
  if (!gate.allowed) return NextResponse.json({error:'Forbidden'},{status:403})
  const body = await req.json().catch(()=>({}))
  const title = String(body.title || '').trim()
  if (!title) return NextResponse.json({error:'Issue/title is required.'},{status:400})
  const supabase = await createSupabaseServerClient()
  const {data,error} = await supabase.from('maintenance_tickets').insert({
    room_id:body.roomId || null, area:String(body.area || '').trim() || null, title,
    description:String(body.description || '').trim() || null,
    priority:['Normal','High','Urgent'].includes(body.priority) ? body.priority : 'Normal',
    status:'Open', assigned_to:String(body.assignedTo || '').trim() || null, reported_by:gate.access!.userId
  }).select('*,rooms(name)').single()
  if (error) return NextResponse.json({error:error.message},{status:400})
  return NextResponse.json({ok:true,ticket:data})
}

export async function PATCH(req:NextRequest) {
  const gate = await canUseModule('maintenance')
  if (!gate.access) return NextResponse.json({error:'Unauthorized'},{status:401})
  if (!gate.allowed) return NextResponse.json({error:'Forbidden'},{status:403})
  const body = await req.json().catch(()=>({}))
  const id = String(body.id || '')
  const status = String(body.status || '')
  if (!id || !['Open','In Progress','Waiting','Complete'].includes(status)) return NextResponse.json({error:'Invalid update'},{status:400})
  const supabase = await createSupabaseServerClient()
  const {error} = await supabase.from('maintenance_tickets').update({
    status, completed_at:status==='Complete'?new Date().toISOString():null,
    updated_at:new Date().toISOString()
  }).eq('id',id)
  if (error) return NextResponse.json({error:error.message},{status:400})
  return NextResponse.json({ok:true})
}
