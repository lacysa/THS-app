import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { guestServiceDate, generateTimeSlots } from '@/lib/time'

const schema = z.object({
  roomId:z.string().uuid(),
  lastName:z.string().trim().min(1).max(80),
  timeSlot:z.string().regex(/^\d{2}:\d{2}$/)
})

export async function POST(req:NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(()=>null))
  if (!parsed.success) return NextResponse.json({ok:false,message:'Please complete all required fields.'},{status:400})

  const cycle = guestServiceDate()
  if (!cycle.open) return NextResponse.json({ok:false,message:cycle.reason || 'Breakfast ordering is closed.'},{status:400})

  if (!generateTimeSlots().includes(parsed.data.timeSlot)) {
    return NextResponse.json({ok:false,message:'Please choose a valid breakfast time.'},{status:400})
  }

  const supabase = createSupabaseAdmin()
  const capacity = Number(process.env.MAX_ROOMS_PER_SLOT || 2)

  const { data:blackout } = await supabase
    .from('blackout_dates')
    .select('id')
    .eq('active',true)
    .lte('start_date',cycle.serviceDate)
    .gte('end_date',cycle.serviceDate)
    .limit(1)
    .maybeSingle()

  if (blackout) return NextResponse.json({ok:false,message:'Breakfast is not available for this date.'},{status:400})

  const { data:room } = await supabase.from('rooms').select('id,name').eq('id',parsed.data.roomId).eq('active',true).single()
  if (!room) return NextResponse.json({ok:false,message:'That room is not available.'},{status:400})

  const { data:existing } = await supabase
    .from('breakfast_bookings')
    .select('id,time_slot,last_name,guest_token,menu_submitted')
    .eq('service_date',cycle.serviceDate)
    .eq('room_id',room.id)
    .eq('status','scheduled')
    .maybeSingle()

  if (existing) {
    if (existing.menu_submitted) {
      return NextResponse.json({
        ok:false,
        message:'Your breakfast menu has already been received.'
      },{status:409})
    }

    return NextResponse.json({
      ok:true,
      existing:true,
      redirectUrl:`/breakfast/menu?token=${encodeURIComponent(existing.guest_token)}`
    })
  }

  const { count } = await supabase
    .from('breakfast_bookings')
    .select('id',{count:'exact',head:true})
    .eq('service_date',cycle.serviceDate)
    .eq('time_slot',`${parsed.data.timeSlot}:00`)
    .eq('status','scheduled')

  if ((count || 0) >= capacity) {
    return NextResponse.json({ok:false,message:'That time was just taken. Please choose another.'},{status:409})
  }

  const { data:booking,error } = await supabase
    .from('breakfast_bookings')
    .insert({
      service_date:cycle.serviceDate,
      room_id:room.id,
      last_name:parsed.data.lastName,
      time_slot:`${parsed.data.timeSlot}:00`,
      source:'guest'
    })
    .select('id,guest_token')
    .single()

  if (error || !booking) {
    // Database also enforces one active booking per room/date. If another
    // request won the race, reuse that existing booking instead of allowing
    // a second empty booking to supersede the original menu.
    if ((error as any)?.code === '23505') {
      const { data:raceExisting } = await supabase
        .from('breakfast_bookings')
        .select('id,guest_token,menu_submitted')
        .eq('service_date',cycle.serviceDate)
        .eq('room_id',room.id)
        .eq('status','scheduled')
        .maybeSingle()

      if (raceExisting?.menu_submitted) {
        return NextResponse.json({
          ok:false,
          message:'Your breakfast menu has already been received.'
        },{status:409})
      }

      if (raceExisting?.guest_token) {
        return NextResponse.json({
          ok:true,
          existing:true,
          redirectUrl:`/breakfast/menu?token=${encodeURIComponent(raceExisting.guest_token)}`
        })
      }
    }

    console.error('Breakfast reservation insert failed:', error)
    return NextResponse.json({ok:false,message:error?.message || 'We could not save that breakfast time. Please try again.'},{status:500})
  }

  return NextResponse.json({
    ok:true,
    redirectUrl:`/breakfast/menu?token=${encodeURIComponent(booking.guest_token)}`
  })
}
