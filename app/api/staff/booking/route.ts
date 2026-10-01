import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { generateTimeSlots } from '@/lib/time'
import { z } from 'zod'

const schema = z.object({
  id:z.string().uuid(),
  last_name:z.string().trim().min(1).max(80).optional(),
  time_slot:z.string().regex(/^\d{2}:\d{2}$/).optional(),
  status:z.enum(['scheduled','cancelled','declined']).optional()
})

export async function PATCH(req:NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data:{user} } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({message:'Unauthorized'},{status:401})

  const parsed = schema.safeParse(await req.json().catch(()=>null))
  if (!parsed.success) return NextResponse.json({message:'Invalid update'},{status:400})

  const { data:current,error:currentError } = await supabase
    .from('breakfast_bookings')
    .select('id,service_date,time_slot,status')
    .eq('id',parsed.data.id)
    .maybeSingle()

  if (currentError) return NextResponse.json({message:currentError.message},{status:500})
  if (!current) return NextResponse.json({message:'Breakfast booking not found.'},{status:404})

  const update:any = {}
  if (parsed.data.last_name !== undefined) update.last_name = parsed.data.last_name
  if (parsed.data.status !== undefined) update.status = parsed.data.status

  if (parsed.data.time_slot !== undefined) {
    if (!generateTimeSlots().includes(parsed.data.time_slot)) {
      return NextResponse.json({message:'Invalid breakfast time'},{status:400})
    }

    const capacity = Number(process.env.MAX_ROOMS_PER_SLOT || 2)
    const { count,error:countError } = await supabase
      .from('breakfast_bookings')
      .select('id',{count:'exact',head:true})
      .eq('service_date',current.service_date)
      .eq('time_slot',`${parsed.data.time_slot}:00`)
      .eq('status','scheduled')
      .neq('id',parsed.data.id)

    if (countError) return NextResponse.json({message:countError.message},{status:500})
    if ((count || 0) >= capacity) {
      return NextResponse.json({message:'That breakfast time is already full.'},{status:409})
    }

    update.time_slot = `${parsed.data.time_slot}:00`
  }

  update.updated_at = new Date().toISOString()

  const { error } = await supabase
    .from('breakfast_bookings')
    .update(update)
    .eq('id',parsed.data.id)

  if (error) return NextResponse.json({message:error.message},{status:500})

  await supabase.from('audit_log').insert({
    actor_user_id:user.id,
    action:'UPDATE_BOOKING',
    entity_type:'breakfast_booking',
    entity_id:parsed.data.id,
    details:update
  })

  return NextResponse.json({ok:true})
}
