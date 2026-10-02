import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

function validDate(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

async function currentMember(admin: ReturnType<typeof createSupabaseAdmin>, userId: string) {
  const { data } = await admin.from('staff_members').select('id,name').eq('auth_user_id', userId).maybeSingle()
  return data
}

export async function GET(req: NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date')
  if (!validDate(date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })

  const admin = createSupabaseAdmin()
  const [{ data: rooms, error: roomError }, { data: notes, error: noteError }, { data: staff }] = await Promise.all([
    admin.from('rooms').select('id,name,sort_order,active').eq('active', true).order('sort_order'),
    admin.from('room_notes').select('*').or(`service_date.eq.${date},note_type.eq.persistent`).order('created_at', { ascending: false }),
    admin.from('staff_members').select('id,name')
  ])

  const error = roomError || noteError
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const roomById = new Map((rooms || []).map((r: any) => [String(r.id), r.name]))
  const staffById = new Map((staff || []).map((s: any) => [String(s.id), s.name]))

  return NextResponse.json({
    rooms: rooms || [],
    notes: (notes || [])
      .filter((n: any) => n.note_type !== 'persistent' || !n.resolved)
      .map((n: any) => ({
        ...n,
        roomName: roomById.get(String(n.room_id)) || 'Room',
        createdByName: n.created_by ? staffById.get(String(n.created_by)) || 'Staff' : 'Staff'
      }))
  })
}

export async function POST(req: NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await req.json().catch(() => null)
  const roomId = String(payload?.roomId || '').trim()
  const note = String(payload?.note || '').trim()
  const noteType = payload?.noteType === 'persistent' ? 'persistent' : 'daily'
  const serviceDate = String(payload?.serviceDate || '').trim()

  if (!roomId || !note || !validDate(serviceDate)) {
    return NextResponse.json({ error: 'Room, date, and note are required.' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const member = await currentMember(admin, access.userId)

  const { error } = await admin.from('room_notes').insert({
    room_id: roomId,
    service_date: noteType === 'daily' ? serviceDate : null,
    note,
    note_type: noteType,
    include_in_shift_report: payload?.includeInShiftReport !== false,
    created_by: (member as any)?.id || null
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = await req.json().catch(() => null)
  const id = String(payload?.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Note id is required.' }, { status: 400 })

  const admin = createSupabaseAdmin()
  const update: any = { updated_at: new Date().toISOString() }
  if ('resolved' in (payload || {})) update.resolved = Boolean(payload.resolved)
  if ('includeInShiftReport' in (payload || {})) update.include_in_shift_report = Boolean(payload.includeInShiftReport)

  const { error } = await admin.from('room_notes').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
