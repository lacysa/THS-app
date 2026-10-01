import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { canUseModule } from '@/lib/access'

export const dynamic = 'force-dynamic'

function validDate(value:string|null) { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)) }
function previousDate(value:string) { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate()-1); return d.toISOString().slice(0,10) }

export async function GET(req:NextRequest) {
  const gate = await canUseModule('housekeeping')
  if (!gate.access) return NextResponse.json({error:'Unauthorized'},{status:401})
  if (!gate.allowed) return NextResponse.json({error:'Forbidden'},{status:403})

  const serviceDate = req.nextUrl.searchParams.get('date')
  if (!validDate(serviceDate)) return NextResponse.json({error:'Invalid date'},{status:400})

  const supabase = await createSupabaseServerClient()
  const [{data:rooms,error:roomsError},{data:rows,error:rowsError},{data:prior,error:priorError}] = await Promise.all([
    supabase.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
    supabase.from('housekeeping_daily_rooms').select('*').eq('service_date',serviceDate!),
    supabase.from('housekeeping_daily_rooms').select('room_id,next_shift_condition').eq('service_date',previousDate(serviceDate!))
  ])

  const error = roomsError || rowsError || priorError
  if (error) return NextResponse.json({error:error.message},{status:500})

  const byRoom = new Map((rows||[]).map((r:any)=>[r.room_id,r]))
  const priorByRoom = new Map((prior||[]).map((r:any)=>[r.room_id,r.next_shift_condition || '']))

  return NextResponse.json({rows:(rooms||[]).map((room:any)=>{
    const row:any = byRoom.get(room.id) || {}
    return {
      roomId:room.id, roomName:room.name, sortOrder:room.sort_order,
      reservationStatus:row.reservation_status || '',
      serviceType:row.service_type || '', stripHold:row.strip_hold || '', assignedTo:row.assigned_to || '',
      cleanOrder:row.clean_order ?? null, complete:Boolean(row.complete), readyForInspection:Boolean(row.ready_for_inspection),
      roomCondition:row.room_condition || priorByRoom.get(room.id) || '', nextShiftCondition:row.next_shift_condition || '', notes:row.notes || ''
    }
  })})
}

export async function POST(req:NextRequest) {
  const gate = await canUseModule('housekeeping')
  if (!gate.access) return NextResponse.json({error:'Unauthorized'},{status:401})
  if (!gate.allowed) return NextResponse.json({error:'Forbidden'},{status:403})

  const body = await req.json().catch(()=>({}))
  const serviceDate = String(body.serviceDate || '')
  if (!validDate(serviceDate) || !Array.isArray(body.rows)) return NextResponse.json({error:'Invalid payload'},{status:400})

  const payload = body.rows.map((r:any)=>({
    service_date:serviceDate, room_id:String(r.roomId), reservation_status:r.reservationStatus || null,
    service_type:r.serviceType || null, strip_hold:r.stripHold || null, assigned_to:r.assignedTo || null,
    clean_order:r.cleanOrder || null, complete:Boolean(r.complete), ready_for_inspection:Boolean(r.readyForInspection),
    room_condition:r.roomCondition || null, next_shift_condition:r.nextShiftCondition || null, notes:r.notes || null,
    updated_by:gate.access!.userId, updated_at:new Date().toISOString()
  }))

  const supabase = await createSupabaseServerClient()
  const {error} = await supabase.from('housekeeping_daily_rooms').upsert(payload,{onConflict:'service_date,room_id'})
  if (error) return NextResponse.json({error:error.message},{status:400})
  return NextResponse.json({ok:true})
}
