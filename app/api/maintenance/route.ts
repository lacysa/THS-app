import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

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
  return ['maintenance','maintenance_manager','manager','general_manager','operations_manager','owner']
    .some(key => caps.has(key))
}

export async function GET() {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createSupabaseAdmin()
  const me = await currentStaff(admin, access.userId)

  const [roomsRes, ticketsRes, staffRes, capRes] = await Promise.all([
    admin.from('rooms').select('id,name,sort_order,active').eq('active', true).order('sort_order'),
    admin.from('maintenance_work_orders').select('*').order('created_at', { ascending: false }),
    admin.from('staff_members').select('id,name,active').eq('active', true).order('name'),
    admin.from('staff_member_capabilities').select('staff_member_id,capability_key')
  ])

  const firstError = roomsRes.error || ticketsRes.error || staffRes.error || capRes.error
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 })

  const capsByStaff = new Map<string, Set<string>>()
  for (const row of capRes.data || []) {
    const id = String((row as any).staff_member_id || '')
    const set = capsByStaff.get(id) || new Set<string>()
    set.add(String((row as any).capability_key || ''))
    capsByStaff.set(id, set)
  }

  const maintenanceStaff = (staffRes.data || []).filter((person: any) => {
    const caps = capsByStaff.get(String(person.id)) || new Set<string>()
    return ['maintenance','maintenance_manager','manager','general_manager','operations_manager','owner']
      .some(key => caps.has(key))
  })

  const staffById = new Map((staffRes.data || []).map((s: any) => [String(s.id), s.name]))
  const roomById = new Map((roomsRes.data || []).map((r: any) => [String(r.id), r.name]))

  const tickets = (ticketsRes.data || []).map((ticket: any) => ({
    ...ticket,
    roomName: ticket.room_id ? roomById.get(String(ticket.room_id)) || 'Room' : null,
    assignedName: ticket.assigned_staff_id ? staffById.get(String(ticket.assigned_staff_id)) || null : null,
    completedByName: ticket.completed_by ? staffById.get(String(ticket.completed_by)) || null : null
  }))

  return NextResponse.json({
    rooms: roomsRes.data || [],
    tickets,
    maintenanceStaff,
    canManage: canManage(me.caps),
    currentStaffId: (me.member as any)?.id || null
  })
}

export async function POST(req: NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await req.json().catch(() => null)
  const title = String(payload?.title || '').trim()
  const roomId = String(payload?.roomId || '').trim() || null
  const area = String(payload?.area || '').trim() || null

  if (!title || (!roomId && !area)) {
    return NextResponse.json({ error: 'Location and title are required.' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const me = await currentStaff(admin, access.userId)

  const { data, error } = await admin
    .from('maintenance_work_orders')
    .insert({
      room_id: roomId,
      area,
      title,
      description: String(payload?.description || '').trim() || null,
      priority: ['low','medium','high','urgent'].includes(payload?.priority) ? payload.priority : 'medium',
      assigned_staff_id: String(payload?.assignedStaffId || '').trim() || null,
      created_by: (me.member as any)?.id || null,
      include_in_shift_report: payload?.includeInShiftReport !== false
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ticket: data })
}

export async function PATCH(req: NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await req.json().catch(() => null)
  const id = String(payload?.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Ticket id is required.' }, { status: 400 })

  const admin = createSupabaseAdmin()
  const me = await currentStaff(admin, access.userId)
  if (!canManage(me.caps)) {
    return NextResponse.json({ error: 'You do not have permission to manage maintenance tickets.' }, { status: 403 })
  }

  const update: any = { updated_at: new Date().toISOString() }
  if (payload?.status && ['open','in_progress','waiting','complete'].includes(payload.status)) update.status = payload.status
  if (payload?.priority && ['low','medium','high','urgent'].includes(payload.priority)) update.priority = payload.priority
  if ('assignedStaffId' in (payload || {})) update.assigned_staff_id = String(payload.assignedStaffId || '').trim() || null
  if ('includeInShiftReport' in (payload || {})) update.include_in_shift_report = Boolean(payload.includeInShiftReport)

  if (payload?.status === 'complete') {
    update.completed_at = new Date().toISOString()
    update.completed_by = (me.member as any)?.id || null
  } else if (payload?.status) {
    update.completed_at = null
    update.completed_by = null
  }

  const { error } = await admin.from('maintenance_work_orders').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
