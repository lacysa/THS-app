import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

function validDate(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function nextDate(value: string) {
  const d = new Date(`${value}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0,10)
}

async function currentStaff(admin: ReturnType<typeof createSupabaseAdmin>, authUserId: string) {
  const { data: member } = await admin
    .from('staff_members')
    .select('id,name,auth_user_id,active')
    .eq('auth_user_id', authUserId)
    .eq('active', true)
    .maybeSingle()

  if (!member) return { member: null as any, caps: new Set<string>() }

  const { data: rows } = await admin
    .from('staff_member_capabilities')
    .select('capability_key')
    .eq('staff_member_id', (member as any).id)

  return {
    member,
    caps: new Set<string>((rows || []).map((r: any) => String(r.capability_key || '')))
  }
}

function canManage(caps: Set<string>) {
  return ['manager','general_manager','operations_manager','owner','foh_manager'].some(key => caps.has(key))
}

async function autoData(admin: ReturnType<typeof createSupabaseAdmin>, date: string) {
  const breakfastDate = nextDate(date)

  const [roomsRes, housekeepingRes, breakfastRes, maintenanceRes, notesRes, staffRes] = await Promise.all([
    admin.from('rooms').select('id,name,sort_order,active').eq('active', true).order('sort_order'),
    admin.from('housekeeping_daily_rooms').select('*').eq('service_date', date),
    admin.from('breakfast_bookings').select('room_id,status,menu_submitted,time_slot').eq('service_date', breakfastDate),
    admin.from('maintenance_work_orders').select('*').order('created_at', { ascending: false }),
    admin.from('room_notes').select('*').or(`service_date.eq.${date},note_type.eq.persistent`).order('created_at', { ascending: false }),
    admin.from('staff_members').select('id,name')
  ])

  const error = roomsRes.error || housekeepingRes.error || breakfastRes.error || maintenanceRes.error || notesRes.error || staffRes.error
  if (error) throw new Error(error.message)

  const rooms = roomsRes.data || []
  const roomById = new Map(rooms.map((r: any) => [String(r.id), r.name]))
  const staffById = new Map((staffRes.data || []).map((s: any) => [String(s.id), s.name]))

  const housekeeping = (housekeepingRes.data || []).map((row: any) => ({
    roomId: row.room_id,
    roomName: roomById.get(String(row.room_id)) || 'Room',
    reservationStatus: row.reservation_status || '',
    serviceType: row.service_type || '',
    stripHold: row.strip_hold || '',
    assignedTo: row.assigned_to || '',
    complete: Boolean(row.complete),
    inspected: Boolean(row.inspected),
    roomCondition: row.room_condition || '',
    nextShiftCondition: row.next_shift_condition || '',
    notes: row.notes || ''
  }))

  const breakfast = (breakfastRes.data || []).map((row: any) => ({
    roomId: row.room_id,
    roomName: roomById.get(String(row.room_id)) || 'Room',
    status: row.status,
    menuSubmitted: Boolean(row.menu_submitted),
    timeSlot: row.time_slot || null
  }))

  const maintenance = (maintenanceRes.data || []).map((row: any) => ({
    ...row,
    roomName: row.room_id ? roomById.get(String(row.room_id)) || 'Room' : row.area || 'Property',
    assignedName: row.assigned_staff_id ? staffById.get(String(row.assigned_staff_id)) || null : null,
    completedByName: row.completed_by ? staffById.get(String(row.completed_by)) || null : null
  })).filter((row: any) => {
    if (row.status !== 'complete') return true
    if (!row.completed_at) return false
    const completedYmd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(row.completed_at))
    return completedYmd === date
  })

  const roomNotes = (notesRes.data || [])
    .filter((n: any) => n.note_type !== 'persistent' || !n.resolved)
    .map((n: any) => ({
      ...n,
      roomName: roomById.get(String(n.room_id)) || 'Room',
      createdByName: n.created_by ? staffById.get(String(n.created_by)) || 'Staff' : 'Staff'
    }))

  return { breakfastDate, housekeeping, breakfast, maintenance, roomNotes }
}

export async function GET(req: NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date')
  const shift = String(req.nextUrl.searchParams.get('shift') || 'Daily').trim() || 'Daily'
  if (!validDate(date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })

  const admin = createSupabaseAdmin()
  const me = await currentStaff(admin, access.userId)

  try {
    const [{ data: report, error: reportError }, auto] = await Promise.all([
      admin.from('shift_reports').select('*').eq('report_date', date).eq('shift', shift).maybeSingle(),
      autoData(admin, date as string)
    ])

    if (reportError) throw new Error(reportError.message)

    let items: any[] = []
    if (report?.id) {
      const { data, error } = await admin.from('shift_report_items').select('*').eq('shift_report_id', report.id).order('sort_order')
      if (error) throw new Error(error.message)
      items = data || []
    }

    const manager = canManage(me.caps)
    const safeReport = report ? {
      ...report,
      management_notes: manager ? report.management_notes : ''
    } : null

    return NextResponse.json({
      report: safeReport,
      items,
      auto,
      access: {
        canManageReport: manager,
        currentStaffId: (me.member as any)?.id || null,
        currentStaffName: (me.member as any)?.name || access.preferredName || access.name
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load shift report.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await req.json().catch(() => null)
  const date = String(payload?.reportDate || '').trim()
  const shift = String(payload?.shift || 'Daily').trim() || 'Daily'
  const action = String(payload?.action || 'save')

  if (!validDate(date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })

  const admin = createSupabaseAdmin()
  const me = await currentStaff(admin, access.userId)
  const manager = canManage(me.caps)
  if (!manager) return NextResponse.json({ error: 'Manager access is required to edit or finalize shift reports.' }, { status: 403 })

  const now = new Date().toISOString()

  const { data: existing, error: existingError } = await admin
    .from('shift_reports')
    .select('*')
    .eq('report_date', date)
    .eq('shift', shift)
    .maybeSingle()

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
  if (existing?.status === 'finalized' && action !== 'reopen') {
    return NextResponse.json({ error: 'This report is finalized. Reopen it before making changes.' }, { status: 409 })
  }

  const status = action === 'finalize' ? 'finalized' : action === 'reopen' ? 'draft' : 'draft'
  const row: any = {
    report_date: date,
    shift,
    prepared_by: existing?.prepared_by || (me.member as any)?.id || null,
    status,
    guest_notes: String(payload?.guestNotes || ''),
    staff_notes: String(payload?.staffNotes || ''),
    supplies_notes: String(payload?.suppliesNotes || ''),
    tomorrow_notes: String(payload?.tomorrowNotes || ''),
    general_notes: String(payload?.generalNotes || ''),
    management_notes: String(payload?.managementNotes || ''),
    updated_at: now,
    finalized_at: action === 'finalize' ? now : null,
    finalized_by: action === 'finalize' ? (me.member as any)?.id || null : null
  }

  const { data: saved, error } = await admin
    .from('shift_reports')
    .upsert(row, { onConflict: 'report_date,shift' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('audit_log').insert({
    actor_user_id: access.userId,
    action: action === 'finalize' ? 'shift_report.finalize' : action === 'reopen' ? 'shift_report.reopen' : 'shift_report.save',
    entity_type: 'shift_report',
    entity_id: saved.id,
    details: { report_date: date, shift, status }
  })

  return NextResponse.json({ ok: true, report: saved })
}
