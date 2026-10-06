import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

const guestSchema = z.object({
  guestNumber:z.union([z.literal(1),z.literal(2)]),
  dietary:z.string().max(200).optional().default(''),
  dietaryComments:z.string().max(500).optional().default(''),
  entree:z.string().max(200).optional().default(''),
  pancakes:z.string().max(200).optional().default(''),
  meat:z.string().max(200).optional().default(''),
  eggs:z.string().max(200).optional().default(''),
  coffee:z.string().max(200).optional().default(''),
  cream:z.string().max(200).optional().default(''),
  juice:z.string().max(200).optional().default(''),
  condiments:z.array(z.string().max(100)).optional().default([]),
  mealDeclined:z.boolean().optional().default(false)
})

const schema = z.object({
  token:z.string().uuid(),
  guests:z.array(guestSchema).length(2)
})

const COMMENT_DRS = ['Tree Nuts: Please specify below','Other: Please specify below']

export async function POST(req:NextRequest) {
  const rawPayload = await req.json().catch(()=>null)
  const parsed = schema.safeParse(rawPayload)
  if (!parsed.success) return NextResponse.json({ok:false,message:'Please complete Guest 1 and either complete or decline Guest 2.'},{status:400})

  const supabase = createSupabaseAdmin()

  const { data:booking,error:bookingError } = await supabase
    .from('breakfast_bookings')
    .select('id,status,service_date,last_name,room_id,rooms(id,name)')
    .eq('guest_token',parsed.data.token)
    .eq('status','scheduled')
    .maybeSingle()

  if (bookingError) return NextResponse.json({ok:false,message:bookingError.message},{status:500})
  if (!booking) return NextResponse.json({ok:false,message:'This breakfast reservation is no longer available.'},{status:404})

  const activeBooking = booking
  const roomName=(activeBooking.rooms as any)?.name || 'Room'

  async function logActivity(event_type:string,details:any={}) {
    await supabase.from('breakfast_guest_activity').insert({
      booking_id:activeBooking.id,
      room_id:activeBooking.room_id || (activeBooking.rooms as any)?.id || null,
      service_date:activeBooking.service_date,
      event_type,
      details
    })
  }

  await logActivity('submit_attempt')

  const guest1 = parsed.data.guests.find(g=>g.guestNumber===1)
  const guest2 = parsed.data.guests.find(g=>g.guestNumber===2)
  if (!guest1 || !guest2 || guest1.mealDeclined) {
    await logActivity('validation_failed',{message:'Guest 1 must have a breakfast menu, and Guest 2 must be completed or declined.'})
    return NextResponse.json({ok:false,message:'Guest 1 must have a breakfast menu, and Guest 2 must be completed or declined.'},{status:400})
  }

  const { data:options,error:optionsError } = await supabase
    .from('breakfast_menu_options')
    .select('category,label,show_for_entree,blocked_by_dietary')
    .eq('active',true)
  if (optionsError) {
    await logActivity('submit_error',{stage:'menu_options',message:optionsError.message})
    return NextResponse.json({ok:false,message:optionsError.message},{status:500})
  }

  function available(category:string,entree:string,dietary:string[]) {
    return (options || []).filter((o:any)=>{
      if (o.category!==category) return false
      const entreeRules = o.show_for_entree || []
      if (entreeRules.length && !entreeRules.includes(entree)) return false
      const blocked = o.blocked_by_dietary || []
      if (blocked.some((x:string)=>dietary.includes(x))) return false
      return true
    })
  }

  for (const guest of parsed.data.guests) {
    if (guest.mealDeclined) {
      if (guest.guestNumber!==2) {
        await logActivity('validation_failed',{guest_number:guest.guestNumber,message:'Only Guest 2 can decline breakfast.'})
        return NextResponse.json({ok:false,message:'Only Guest 2 can decline breakfast.'},{status:400})
      }
      continue
    }

    const restrictions = guest.dietary.split(',').map(x=>x.trim()).filter(Boolean)
    if (!restrictions.length) {
      const message=`Please choose dietary restrictions for Guest ${guest.guestNumber}.`
      await logActivity('validation_failed',{guest_number:guest.guestNumber,message})
      return NextResponse.json({ok:false,message},{status:400})
    }

    const commentsNeeded = COMMENT_DRS.some(x=>restrictions.includes(x))
    if (commentsNeeded && !guest.dietaryComments.trim()) {
      const message=`Please add dietary details for Guest ${guest.guestNumber}.`
      await logActivity('validation_failed',{guest_number:guest.guestNumber,message})
      return NextResponse.json({ok:false,message},{status:400})
    }

    const vegan = restrictions.includes('Vegan')
    if (vegan) continue

    if (!guest.entree.trim()) {
      const message=`Please choose an entrée for Guest ${guest.guestNumber}.`
      await logActivity('validation_failed',{guest_number:guest.guestNumber,message})
      return NextResponse.json({ok:false,message},{status:400})
    }
    if (available('meat',guest.entree,restrictions).length && !guest.meat.trim()) {
      const message=`Please choose a meat selection for Guest ${guest.guestNumber}.`
      await logActivity('validation_failed',{guest_number:guest.guestNumber,message})
      return NextResponse.json({ok:false,message},{status:400})
    }
    if (available('eggs',guest.entree,restrictions).length && !guest.eggs.trim()) {
      const message=`Please choose an egg style for Guest ${guest.guestNumber}.`
      await logActivity('validation_failed',{guest_number:guest.guestNumber,message})
      return NextResponse.json({ok:false,message},{status:400})
    }
    if (!guest.coffee.trim()) {
      const message=`Please choose a coffee option for Guest ${guest.guestNumber}.`
      await logActivity('validation_failed',{guest_number:guest.guestNumber,message})
      return NextResponse.json({ok:false,message},{status:400})
    }
    if (guest.coffee!=='None' && !guest.cream.trim()) {
      const message=`Please choose a cream option for Guest ${guest.guestNumber}.`
      await logActivity('validation_failed',{guest_number:guest.guestNumber,message})
      return NextResponse.json({ok:false,message},{status:400})
    }
    if (!guest.juice.trim()) {
      const message=`Please choose a juice option for Guest ${guest.guestNumber}.`
      await logActivity('validation_failed',{guest_number:guest.guestNumber,message})
      return NextResponse.json({ok:false,message},{status:400})
    }
  }

  const now = new Date().toISOString()

  const { data:submission,error:submissionError } = await supabase
    .from('breakfast_submissions')
    .insert({
      booking_id:activeBooking.id,
      service_date:activeBooking.service_date,
      room_name:roomName,
      last_name:activeBooking.last_name,
      submitted_at:now,
      raw_payload:rawPayload
    })
    .select('id')
    .single()

  if (submissionError) {
    await logActivity('submit_error',{stage:'submission_snapshot',message:submissionError.message})
    return NextResponse.json({ok:false,message:submissionError.message},{status:500})
  }

  for (const g of parsed.data.guests) {
    const declined = Boolean(g.mealDeclined)
    const row = {
      booking_id:activeBooking.id,
      submission_id:submission.id,
      guest_number:g.guestNumber,
      meal_declined:declined,
      dietary:declined ? null : (g.dietary || null),
      dietary_comments:declined ? null : (g.dietaryComments || null),
      entree:declined ? null : (g.entree || null),
      pancakes:declined ? null : (g.pancakes || null),
      meat:declined ? null : (g.meat || null),
      eggs:declined ? null : (g.eggs || null),
      coffee:declined ? null : (g.coffee || null),
      cream:declined ? null : (g.cream || null),
      juice:declined ? null : (g.juice || null),
      condiments:declined ? null : (g.condiments.length ? g.condiments.join(', ') : null),
      source:'native',
      status:'new',
      updated_at:now
    }

    const { error } = await supabase
      .from('breakfast_guest_orders')
      .upsert(row,{onConflict:'booking_id,guest_number'})

    if (error) {
      await logActivity('submit_error',{stage:'guest_order',guest_number:g.guestNumber,message:error.message,submission_id:submission.id})
      return NextResponse.json({ok:false,message:error.message},{status:500})
    }
  }

  const { error:updateError } = await supabase
    .from('breakfast_bookings')
    .update({
      menu_submitted:true,
      latest_submission_id:submission.id,
      updated_at:now
    })
    .eq('id',activeBooking.id)

  if (updateError) {
    await logActivity('submit_error',{stage:'booking_update',message:updateError.message,submission_id:submission.id})
    return NextResponse.json({ok:false,message:updateError.message},{status:500})
  }

  await logActivity('submit_success',{submission_id:submission.id})

  return NextResponse.json({ok:true,submissionId:submission.id})
}
