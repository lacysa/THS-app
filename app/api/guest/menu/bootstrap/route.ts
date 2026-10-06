import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { formatTime24, prettyDate } from '@/lib/time'

export const dynamic = 'force-dynamic'

export async function GET(req:NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
    return NextResponse.json({ok:false,message:'This breakfast link is invalid.'},{status:400})
  }

  const supabase = createSupabaseAdmin()

  const { data:booking,error } = await supabase
    .from('breakfast_bookings')
    .select('id,service_date,last_name,time_slot,status,menu_submitted,guest_token,room_id,rooms(id,name)')
    .eq('guest_token',token)
    .eq('status','scheduled')
    .maybeSingle()

  if (error) return NextResponse.json({ok:false,message:error.message},{status:500})
  if (!booking) return NextResponse.json({ok:false,message:'We could not find this breakfast reservation.'},{status:404})

  const { data:options,error:optionsError } = await supabase
    .from('breakfast_menu_options')
    .select('id,category,label,description,sort_order,show_for_entree,blocked_by_dietary')
    .eq('active',true)
    .order('category')
    .order('sort_order')

  if (optionsError) return NextResponse.json({ok:false,message:'Breakfast menu is temporarily unavailable.'},{status:500})

  await supabase.from('breakfast_guest_activity').insert({
    booking_id:booking.id,
    room_id:booking.room_id || (booking.rooms as any)?.id || null,
    service_date:booking.service_date,
    event_type:'menu_opened',
    details:{
      menu_submitted:Boolean(booking.menu_submitted)
    }
  })

  const { data:existingOrders } = await supabase
    .from('breakfast_guest_orders')
    .select('*')
    .eq('booking_id',booking.id)
    .order('guest_number')

  return NextResponse.json({
    ok:true,
    booking:{
      id:booking.id,
      room:(booking.rooms as any)?.name || 'Room',
      lastName:booking.last_name,
      serviceDate:booking.service_date,
      serviceDateLabel:prettyDate(booking.service_date),
      timeSlot:String(booking.time_slot).slice(0,5),
      displayTime:formatTime24(String(booking.time_slot).slice(0,5)),
      menuSubmitted:Boolean(booking.menu_submitted)
    },
    options:options || [],
    existingOrders:existingOrders || []
  })
}
