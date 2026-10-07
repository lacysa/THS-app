import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { formatTime24, generateTimeSlots } from '@/lib/time'

export const dynamic = 'force-dynamic'

function previousDate(value:string) {
  const d = new Date(`${value}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate()-1)
  return d.toISOString().slice(0,10)
}

export async function GET(req:NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data:{user} } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({message:'Unauthorized'},{status:401})

  const date = req.nextUrl.searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({message:'Invalid date'},{status:400})

  const includeDeclined = req.nextUrl.searchParams.get('includeDeclined') === '1'

  let bookingQuery = supabase
    .from('breakfast_bookings')
    .select(`
      id,service_date,last_name,time_slot,status,menu_submitted,latest_submission_id,guest_token,
      rooms(id,name,sort_order)
    `)
    .eq('service_date',date)

  bookingQuery = includeDeclined
    ? bookingQuery.in('status',['scheduled','declined'])
    : bookingQuery.eq('status','scheduled')

  const { data:bookings,error:bookingError } = await bookingQuery.order('time_slot')

  if (bookingError) return NextResponse.json({message:bookingError.message},{status:500})

  const bookingIds = (bookings || []).map((b:any)=>b.id)

  // Rooms manually tagged for breakfast in Housekeeping Setup should appear in
  // breakfast operations even when a guest menu/booking has not been created yet.
  const admin = createSupabaseAdmin()
  const { data:taggedBreakfastRooms,error:taggedBreakfastError } = await admin
    .from('housekeeping_daily_rooms')
    .select('room_id,breakfast_skipped,breakfast_skipped_at,rooms(id,name,sort_order)')
    .eq('service_date',previousDate(date))
    .eq('breakfast_tag',true)

  if (taggedBreakfastError) return NextResponse.json({message:taggedBreakfastError.message},{status:500})

  let menuNotes:any[] = []
  if (bookingIds.length) {
    const {data,error} = await admin
      .from('breakfast_menu_notes')
      .select('booking_id,note,updated_at')
      .in('booking_id',bookingIds)
    if (error) return NextResponse.json({message:error.message},{status:500})
    menuNotes = data || []
  }
  const noteByBooking = new Map<string,string>((menuNotes || []).map((row:any)=>[row.booking_id,row.note || '']))

  // Native in-app orders link directly to breakfast_bookings.
  let nativeOrders:any[] = []
  if (bookingIds.length) {
    const {data,error} = await supabase
      .from('breakfast_guest_orders')
      .select('*')
      .in('booking_id',bookingIds)
      .order('guest_number')
    if (error) return NextResponse.json({message:error.message},{status:500})
    nativeOrders = data || []
  }

  const nativeByBooking = new Map<string,any[]>()
  for (const order of nativeOrders) {
    if (!order.booking_id) continue
    const current = nativeByBooking.get(order.booking_id) || []
    current.push(order)
    nativeByBooking.set(order.booking_id,current)
  }

  // Keep legacy Tally submissions readable so old breakfast history still works.
  const { data:submissions,error:submissionError } = await supabase
    .from('breakfast_submissions')
    .select('id,booking_id,tally_submission_id,room_name,last_name,submitted_at,created_at')
    .eq('service_date',date)
    .order('submitted_at',{ascending:false})
    .order('created_at',{ascending:false})

  if (submissionError) return NextResponse.json({message:submissionError.message},{status:500})

  const submissionIds = (submissions || []).map((s:any)=>s.id)
  let legacyOrders:any[] = []

  if (submissionIds.length) {
    const { data,error } = await supabase
      .from('breakfast_guest_orders')
      .select('*')
      .in('submission_id',submissionIds)
      .order('guest_number')
    if (error) return NextResponse.json({message:error.message},{status:500})
    legacyOrders = data || []
  }

  const ordersBySubmission = new Map<string,any[]>()
  for (const order of legacyOrders) {
    if (!order.submission_id) continue
    const existing = ordersBySubmission.get(order.submission_id) || []
    existing.push(order)
    ordersBySubmission.set(order.submission_id,existing)
  }

  const submissionsByBooking = new Map<string,any[]>()
  const unmatched:any[] = []
  for (const submission of submissions || []) {
    if (!submission.booking_id) { unmatched.push(submission); continue }
    const existing = submissionsByBooking.get(submission.booking_id) || []
    existing.push(submission)
    submissionsByBooking.set(submission.booking_id,existing)
  }

  const decorated:any[] = (bookings || []).map((b:any)=>({
    ...b,
    taggedOnly:false,
    breakfastSkipped:b.status==='declined',
    menu_submitted:Boolean((nativeByBooking.get(b.id)||[]).length || (submissionsByBooking.get(b.id)||[]).length || b.menu_submitted),
    note: noteByBooking.get(b.id) || '',
    displayTime:b.time_slot ? formatTime24(String(b.time_slot).slice(0,5)) : 'Unscheduled'
  }))

  const bookedRoomIds = new Set(decorated.map((b:any)=>String(b.rooms?.id || '')).filter(Boolean))
  const taggedOnly = (taggedBreakfastRooms || [])
    .filter((row:any)=>!bookedRoomIds.has(String(row.room_id || row.rooms?.id || '')))
    .map((row:any)=>({
      id:`breakfast-tag:${row.room_id || row.rooms?.id}`,
      service_date:date,
      last_name:'',
      time_slot:null,
      status:row.breakfast_skipped ? 'declined' : 'scheduled',
      menu_submitted:false,
      latest_submission_id:null,
      guest_token:null,
      rooms:row.rooms,
      taggedOnly:true,
      breakfastSkipped:Boolean(row.breakfast_skipped),
      breakfastSkippedAt:row.breakfast_skipped_at||null,
      note:'',
      displayTime:'Unscheduled'
    }))

  decorated.push(...taggedOnly)

  const groups:any[] = decorated.map((b:any)=>{
    const native = b.taggedOnly ? [] : (nativeByBooking.get(b.id) || [])
    const candidates = b.taggedOnly ? [] : (submissionsByBooking.get(b.id) || [])
    const latestLegacy = candidates.find((s:any)=>s.tally_submission_id === b.latest_submission_id) || candidates[0]
    const legacy = latestLegacy ? (ordersBySubmission.get(latestLegacy.id) || []) : []
    const orders = native.length ? native : legacy

    return {
      groupKey:`booking:${b.id}`,
      bookingId:b.id,
      submissionId:latestLegacy?.id || null,
      room:b.rooms?.name || 'Room',
      lastName:b.last_name,
      timeSlot:b.time_slot ? String(b.time_slot).slice(0,5) : null,
      displayTime:b.displayTime,
      status:b.status,
      breakfastSkipped:Boolean(b.breakfastSkipped || b.status==='declined'),
      menuSubmitted:Boolean(orders.length || b.menu_submitted),
      unmatched:false,
      taggedOnly:Boolean(b.taggedOnly),
      source:b.taggedOnly ? 'breakfast_tag' : (native.length ? 'native' : (legacy.length ? 'legacy' : null)),
      note: noteByBooking.get(b.id) || '',
      orders
    }
  })

  // Legacy unmatched submissions remain visible instead of disappearing.
  for (const s of unmatched) {
    groups.push({
      groupKey:`submission:${s.id}`,
      bookingId:null,
      submissionId:s.id,
      room:s.room_name || 'Unknown room',
      lastName:s.last_name || '',
      timeSlot:null,
      displayTime:'Unscheduled',
      menuSubmitted:true,
      unmatched:true,
      source:'legacy',
      orders:ordersBySubmission.get(s.id) || []
    })
  }

  return NextResponse.json({
    bookings:decorated,
    groups,
    unmatchedSubmissions:unmatched.map((s:any)=>({
      id:s.id, room:s.room_name, lastName:s.last_name, submittedAt:s.submitted_at || s.created_at
    })),
    slots:generateTimeSlots().map(value=>({value,label:formatTime24(value)}))
  })
}
