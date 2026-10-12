import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'
import { roomServiceTask } from '@/lib/room-state'

export const dynamic = 'force-dynamic'

function validDate(value: string | null) {
  return Boolean(value && /^20\d{2}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T12:00:00Z')))
}

export async function GET(req: NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canManage = access.isAdmin || (access.capabilities || []).some(cap =>
    ['manager', 'general_manager', 'operations_manager', 'owner'].includes(cap)
  )
  if (!canManage) return NextResponse.json({ error: 'Management access required.' }, { status: 403 })

  const date = req.nextUrl.searchParams.get('date')
  if (!validDate(date)) return NextResponse.json({ error: 'Invalid service date.' }, { status: 400 })
  const admin = createSupabaseAdmin()

  try {
    const [roomsResult, dailyResult, staffResult, scheduleResult, linksResult, capabilitiesResult] = await Promise.all([
      admin.from('rooms').select('id,name,sort_order').eq('active', true).order('sort_order'),
      admin.from('housekeeping_daily_rooms')
        .select('room_id,reservation_status,service_type,room_condition,strip_hold,assigned_to,clean_order,complete,ready_for_inspection,check_issue_open')
        .eq('service_date', date),
      admin.from('staff_members').select('id,name,job_title,active,full_room_clean_limit').eq('active', true).order('name'),
      admin.from('staff_daily_schedule').select('staff_member_id,shift_start,shift_end,role_label,work_mode').eq('schedule_date', date),
      admin.from('reservation_daily_links').select('room_id,reservation_status').eq('service_date', date),
      admin.from('staff_member_capabilities').select('staff_member_id,capability_key')
    ])
    for (const result of [roomsResult, dailyResult, staffResult, scheduleResult, linksResult, capabilitiesResult]) {
      if (result.error) throw new Error(result.error.message)
    }
    const dailyByRoom = new Map((dailyResult.data || []).map((row: any) => [String(row.room_id), row]))
    const linkedByRoom = new Map((linksResult.data || []).map((row: any) => [String(row.room_id), row]))
    const scheduleByStaff = new Map<string, any>()
    for (const item of scheduleResult.data || []) {
      const id = String(item.staff_member_id)
      const existing = scheduleByStaff.get(id)
      // An on-site entry takes precedence if a person has multiple shifts.
      if (!existing || (item.work_mode === 'onsite' && existing.work_mode !== 'onsite')) scheduleByStaff.set(id, item)
    }
    const capabilitiesByStaff = new Map<string, Set<string>>()
    for (const row of capabilitiesResult.data || []) {
      const id = String(row.staff_member_id)
      const caps = capabilitiesByStaff.get(id) || new Set<string>()
      caps.add(String(row.capability_key || ''))
      capabilitiesByStaff.set(id, caps)
    }
    const staff = (staffResult.data || []).map((person: any) => {
      const shift = scheduleByStaff.get(String(person.id))
      const roleLabel = String(shift?.role_label || person.job_title || '')
      const capabilities = capabilitiesByStaff.get(String(person.id)) || new Set<string>()
      const housekeepingEligible = ['housekeeping', 'runner', 'hospitality_assistant', 'laundry'].some(cap => capabilities.has(cap)) || /housekeep|hospitality|laundry|runner/i.test(roleLabel)
      return {
        id: String(person.id),
        name: String(person.name || ''),
        roleLabel, housekeepingEligible,
        onSite: shift?.work_mode === 'onsite',
        scheduleState: String(shift?.work_mode || 'not_scheduled'),
        shiftStart: shift?.shift_start || null,
        shiftEnd: shift?.shift_end || null,
        fullRoomCleanLimit: Number(person.full_room_clean_limit ?? 2)
      }
    }).sort((a, b) => Number(b.onSite) - Number(a.onSite) || Number(b.housekeepingEligible) - Number(a.housekeepingEligible) || a.name.localeCompare(b.name))
    const rooms = (roomsResult.data || []).map((room: any) => {
      const daily: any = dailyByRoom.get(String(room.id)) || {}
      const link: any = linkedByRoom.get(String(room.id)) || {}
      const activity = String(daily.reservation_status || link.reservation_status || 'Vacant')
      const serviceType = String(daily.service_type || '')
      const condition = String(daily.room_condition || '')
      const task = roomServiceTask({ reservationStatus: activity, serviceType, roomCondition: condition, stripHold: String(daily.strip_hold || '') })
      const assignedTo = String(daily.assigned_to || '').trim()
      return {
        roomId: String(room.id),
        roomName: String(room.name || ''),
        sortOrder: Number(room.sort_order ?? 999),
        activity, serviceType, condition,
        assignedTo,
        cleanOrder: daily.clean_order ?? null,
        complete: Boolean(daily.complete),
        checkIssueOpen: Boolean(daily.check_issue_open),
        task,
        needsAssignment: task !== 'none' && task !== 'blocked' && !assignedTo && !daily.complete,
        hasDailyRecord: dailyByRoom.has(String(room.id))
      }
    })
    return NextResponse.json({
      date, rooms, staff,
      staffing: {
        scheduledOnSite: staff.filter(s => s.onSite).length,
        hasSchedule: (scheduleResult.data || []).length > 0
      },
      readOnly: Boolean(access.isPreviewMode)
    }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load housekeeping assignments.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canManage = access.isAdmin || (access.capabilities || []).some(cap =>
    ['manager', 'general_manager', 'operations_manager', 'owner'].includes(cap))
  if (!canManage || access.isPreviewMode) return NextResponse.json({ error: 'Management access required.' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (!validDate(body?.date) || body?.action !== 'clearPending')
    return NextResponse.json({ error: 'Invalid date or action.' }, { status: 400 })
  const admin = createSupabaseAdmin()
  // Preserve completed rooms' cleaner attribution, inspection and sign-offs.
  const { data, error } = await admin.from('housekeeping_daily_rooms')
    .update({ assigned_to: '', clean_order: null, updated_by: access.userId, updated_at: new Date().toISOString() })
    .eq('service_date', body.date).eq('complete', false)
    .not('assigned_to', 'is', null).neq('assigned_to', '')
    .select('room_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, cleared: (data || []).length }, { headers: { 'cache-control': 'private, no-store' } })
}
