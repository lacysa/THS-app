import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

export async function POST(req:NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({error:'Unauthorized'},{status:401})

  const body = await req.json().catch(()=>null)
  const bookingId = String(body?.bookingId || '')
  const note = String(body?.note ?? '')

  if (!bookingId) return NextResponse.json({error:'Booking id is required.'},{status:400})

  const admin = createSupabaseAdmin()
  const {error} = await admin
    .from('breakfast_menu_notes')
    .upsert({
      booking_id:bookingId,
      note,
      updated_by:access.userId,
      updated_at:new Date().toISOString()
    },{onConflict:'booking_id'})

  if (error) return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({ok:true})
}
