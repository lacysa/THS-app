import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { formatTime24, generateTimeSlots, guestServiceDate, prettyDate } from '@/lib/time'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cycle = guestServiceDate()

  if (!cycle.open) {
    return NextResponse.json({
      open:false,
      serviceDate:cycle.serviceDate,
      reason:cycle.reason
    })
  }

  const supabase = createSupabaseAdmin()

  const { data:blackout } = await supabase
    .from('blackout_dates')
    .select('*')
    .eq('active',true)
    .lte('start_date',cycle.serviceDate)
    .gte('end_date',cycle.serviceDate)
    .limit(1)
    .maybeSingle()

  if (blackout) {
    return NextResponse.json({
      open:false,
      serviceDate:cycle.serviceDate,
      reason:blackout.reason || 'Breakfast is not available for this date.'
    })
  }

  const [{ data:rooms,error:roomsError },{ data:bookings,error:bookingsError }] = await Promise.all([
    supabase.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
    supabase.from('breakfast_bookings').select('id,room_id,time_slot,menu_submitted,guest_token,rooms(id,name,sort_order)').eq('service_date',cycle.serviceDate).eq('status','scheduled').order('time_slot')
  ])

  if (roomsError || bookingsError) {
    return NextResponse.json({open:false,reason:'Breakfast scheduling is temporarily unavailable.'},{status:500})
  }

  const capacity = Number(process.env.MAX_ROOMS_PER_SLOT || 2)
  const used = new Map<string,number>()

  for (const b of bookings || []) {
    const key = String(b.time_slot).slice(0,5)
    used.set(key,(used.get(key)||0)+1)
  }

  const bookedRoomIds = new Set((bookings || []).map(b=>b.room_id))

  const slots = generateTimeSlots().map(value=>{
    const occupied = used.get(value) || 0
    return {
      value,
      label:formatTime24(value),
      available:Math.max(0,capacity-occupied),
      full:occupied>=capacity
    }
  })

  return NextResponse.json({
    open:true,
    serviceDate:cycle.serviceDate,
    serviceDateLabel:prettyDate(cycle.serviceDate),
    rooms:(rooms || []).filter(r=>!bookedRoomIds.has(r.id)),
    scheduled:(bookings || []).map((b:any)=>({
      id:b.id,
      roomId:b.room_id,
      room:(b.rooms as any)?.name || 'Room',
      timeSlot:String(b.time_slot).slice(0,5),
      displayTime:formatTime24(String(b.time_slot).slice(0,5)),
      menuSubmitted:Boolean(b.menu_submitted),
      menuUrl:!b.menu_submitted && b.guest_token ? `/breakfast/menu?token=${encodeURIComponent(b.guest_token)}` : null
    })),
    slots,
    maxRoomsPerSlot:capacity,
    slotMinutes:Number(process.env.SLOT_MINUTES || 15)
  })
}
