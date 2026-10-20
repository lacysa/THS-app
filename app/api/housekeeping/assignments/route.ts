import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { canUseModule } from '@/lib/access'
import { roomServiceTask } from '@/lib/room-state'
import { conditionForDay, previousVacantConditions } from '@/lib/room-condition-carry'
import { loadTubTaskStates } from '@/lib/ops-tub'
import { loadAssignmentStaff } from '@/lib/assignment-staff'

export const dynamic = 'force-dynamic'

function validDate(value: string | null) {
  return Boolean(value && /^20\d{2}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T12:00:00Z')))
}

export async function GET(req: NextRequest) {
  const gate = await canUseModule('housekeeping_assignments')
  const access = gate.access
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!gate.allowed) return NextResponse.json({ error: 'Assignments module access is disabled for your account.' }, { status: 403 })
  const canManage = access.isAdmin || (access.capabilities || []).some(cap =>
    ['manager', 'general_manager', 'operations_manager', 'owner'].includes(cap)
  )
  if (!canManage) return NextResponse.json({ error: 'Management access required.' }, { status: 403 })

  const date = req.nextUrl.searchParams.get('date')
  if (!validDate(date)) return NextResponse.json({ error: 'Invalid service date.' }, { status: 400 })
  const admin = createSupabaseAdmin()

  try {
    const [roomsResult, dailyResult, linksResult, staff] = await Promise.all([
      admin.from('rooms').select('id,name,sort_order').eq('active', true).order('sort_order'),
      admin.from('housekeeping_daily_rooms')
        .select('room_id,reservation_status,service_type,room_condition,next_shift_condition,strip_hold,assigned_to,clean_order,complete,ready_for_inspection,inspected,check_issue_open,updated_by')
        .eq('service_date', date),
      admin.from('reservation_daily_links').select('room_id,reservation_status').eq('service_date', date),
      loadAssignmentStaff(admin, date as string)
    ])
    for (const result of [roomsResult, dailyResult, linksResult]) {
      if (result.error) throw new Error(result.error.message)
    }
    const carriedConditions = await previousVacantConditions(admin, date as string, dailyResult.data || [])
    const dailyByRoom = new Map((dailyResult.data || []).map((row: any) => [String(row.room_id), row]))
    const linkedByRoom = new Map((linksResult.data || []).map((row: any) => [String(row.room_id), row]))
    const tubStates = await loadTubTaskStates(admin,date as string)
    const rooms = (roomsResult.data || []).map((room: any) => {
      const daily: any = dailyByRoom.get(String(room.id)) || {}
      const link: any = linkedByRoom.get(String(room.id)) || {}
      const activity = String(daily.reservation_status || link.reservation_status || 'Vacant')
      const serviceType = String(daily.service_type || '')
      const condition = conditionForDay(daily, carriedConditions.get(String(room.id)) || '')
      const baseTask = roomServiceTask({ reservationStatus: activity, serviceType, roomCondition: condition, stripHold: String(daily.strip_hold || '') })
      const task = baseTask // Tub-only work is tracked independently, even when full cleaning is also required.
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
    const tubTasks=(roomsResult.data||[]).filter((room:any)=>tubStates.get(String(room.id))?.due).map((room:any)=>({roomId:String(room.id),roomName:String(room.name||''),assignedTo:String(tubStates.get(String(room.id))?.assignedTo||''),due:true}))
    return NextResponse.json({
      date, rooms, staff, tubTasks,
      staffing: {
        scheduledOnSite: staff.filter(s => s.onSite).length,
        hasSchedule: staff.some(person => person.scheduleState !== 'not_scheduled')
      },
      readOnly: Boolean(access.isPreviewMode)
    }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load housekeeping assignments.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await canUseModule('housekeeping_assignments')
  const access = gate.access
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!gate.allowed) return NextResponse.json({ error: 'Assignments module access is disabled for your account.' }, { status: 403 })
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
