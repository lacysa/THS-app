import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { generateTimeSlots, guestServiceDate } from '@/lib/time'
import {
  getField,
  getSubmissionId,
  getSubmittedAt,
  normalizeGuest,
  hasMealContent,
  guest2Declined
} from '@/lib/tally'

function validYmd(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function normalizeTime(value: string) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return ''
  return `${match[1].padStart(2,'0')}:${match[2]}`
}

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null)
  if (!payload) return NextResponse.json({ok:false,message:'Invalid payload'},{status:400})

  const submissionId = getSubmissionId(payload)
  if (!submissionId) {
    return NextResponse.json({ok:false,message:'Missing Tally submission ID'},{status:400})
  }

  const room = getField(payload,['Room','Room Name']).trim()
  const lastName = getField(payload,['Last Name:','Last Name','lastName']).trim()
  const bookingId = getField(payload,['bookingId','Booking ID']).trim()
  const serviceDateHidden = getField(payload,['serviceDate','Service Date']).trim()
  const timeSlot = normalizeTime(getField(payload,[
    'timeSlot','Time Slot','Delivery Time','Delivery Time:','Breakfast Time','Breakfast Delivery Time'
  ]))

  const submittedAt = getSubmittedAt(payload)
  const inferred = guestServiceDate(new Date(submittedAt))
  const serviceDate = validYmd(serviceDateHidden) ? serviceDateHidden : inferred.serviceDate

  const supabase = createSupabaseAdmin()
  let booking:any = null
  let roomRow:any = null

  if (bookingId) {
    const { data } = await supabase
      .from('breakfast_bookings')
      .select('id,room_id,service_date,last_name,time_slot,status')
      .eq('id',bookingId)
      .maybeSingle()
    if (data?.status === 'scheduled') booking = data
  }

  if (room) {
    const { data } = await supabase
      .from('rooms')
      .select('id,name')
      .ilike('name',room)
      .maybeSingle()
    roomRow = data
  }

  if (!booking && roomRow) {
    const { data } = await supabase
      .from('breakfast_bookings')
      .select('id,room_id,service_date,last_name,time_slot,status')
      .eq('service_date',serviceDate)
      .eq('room_id',roomRow.id)
      .eq('status','scheduled')
      .maybeSingle()
    booking = data
  }

  // Safety net for guests who reach Tally without first creating a booking.
  // If Tally gives us room, last name, and a valid time, create the schedule row
  // so the menu cannot silently disappear from Front Desk/Kitchen.
  if (!booking && roomRow && lastName && generateTimeSlots().includes(timeSlot)) {
    const { data, error } = await supabase
      .from('breakfast_bookings')
      .insert({
        service_date:serviceDate,
        room_id:roomRow.id,
        last_name:lastName,
        time_slot:`${timeSlot}:00`,
        status:'scheduled',
        source:'tally_webhook'
      })
      .select('id,room_id,service_date,last_name,time_slot,status')
      .single()

    if (error) {
      // A concurrent request may have created the room/date booking first.
      const { data:existing } = await supabase
        .from('breakfast_bookings')
        .select('id,room_id,service_date,last_name,time_slot,status')
        .eq('service_date',serviceDate)
        .eq('room_id',roomRow.id)
        .eq('status','scheduled')
        .maybeSingle()
      booking = existing
    } else {
      booking = data
    }
  }

  const { data:submission,error:submissionError } = await supabase
    .from('breakfast_submissions')
    .upsert({
      tally_submission_id:submissionId,
      booking_id:booking?.id || null,
      service_date:serviceDate,
      room_name:room || roomRow?.name || 'Unknown',
      last_name:lastName || booking?.last_name || null,
      submitted_at:submittedAt,
      raw_payload:payload
    },{onConflict:'tally_submission_id'})
    .select('id')
    .single()

  if (submissionError || !submission) {
    return NextResponse.json({
      ok:false,
      message:submissionError?.message || 'Could not save submission'
    },{status:500})
  }

  // Rebuild the guest rows for this submission so a corrected/re-submitted menu
  // cannot leave stale Guest 2 selections behind.
  const { error:deleteError } = await supabase
    .from('breakfast_guest_orders')
    .delete()
    .eq('submission_id',submission.id)

  if (deleteError) {
    return NextResponse.json({ok:false,message:deleteError.message},{status:500})
  }

  const guests = [normalizeGuest(payload,1)]
  if (!guest2Declined(payload)) {
    const g2 = normalizeGuest(payload,2)
    if (hasMealContent(g2)) guests.push(g2)
  }

  for (const g of guests) {
    if (!hasMealContent(g)) continue

    const { error } = await supabase.from('breakfast_guest_orders').insert({
      submission_id:submission.id,
      guest_number:g.guestNumber,
      dietary:g.dietary || null,
      dietary_comments:g.dietaryComments || null,
      entree:g.entree || null,
      pancakes:g.pancakes || null,
      meat:g.meat || null,
      eggs:g.eggs || null,
      coffee:g.coffee || null,
      cream:g.cream || null,
      juice:g.juice || null,
      condiments:g.condiments || null,
      status:'new'
    })

    if (error) return NextResponse.json({ok:false,message:error.message},{status:500})
  }

  if (booking?.id) {
    const { error } = await supabase
      .from('breakfast_bookings')
      .update({
        menu_submitted:true,
        latest_submission_id:submissionId,
        updated_at:new Date().toISOString()
      })
      .eq('id',booking.id)

    if (error) return NextResponse.json({ok:false,message:error.message},{status:500})
  }

  return NextResponse.json({
    ok:true,
    submissionId,
    serviceDate,
    bookingMatched:Boolean(booking?.id),
    bookingId:booking?.id || null,
    room:room || roomRow?.name || null,
    timeSlot:timeSlot || null
  })
}
