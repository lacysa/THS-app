import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

type SaveRow = {
  roomId: string
  reservationStatus?: string
  serviceType?: string
  stripHold?: string
  assignedTo?: string
  cleanOrder?: number | null
  complete?: boolean
  readyForInspection?: boolean
  inspected?: boolean
  completedAt?: string | null
  inspectedAt?: string | null
  roomCondition?: string
  nextShiftCondition?: string
  notes?: string
}

function validDate(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function nextDate(value: string) {
  const d = new Date(`${value}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function getPeopleAndCapabilities(admin: ReturnType<typeof createSupabaseAdmin>) {
  const [{ data: people, error: peopleError }, { data: caps, error: capsError }] = await Promise.all([
    admin
      .from('staff_members')
      .select('id,auth_user_id,name,job_title,active')
      .eq('active', true)
      .order('name'),
    admin
      .from('staff_member_capabilities')
      .select('staff_member_id,capability_key')
  ])

  if (peopleError) throw new Error(peopleError.message)
  if (capsError) throw new Error(capsError.message)

  const byMember = new Map<string, Set<string>>()
  for (const row of caps || []) {
    const id = String((row as any).staff_member_id || '')
    if (!id) continue
    const current = byMember.get(id) || new Set<string>()
    current.add(String((row as any).capability_key || ''))
    byMember.set(id, current)
  }

  return { people: people || [], byMember }
}

export async function GET(req: NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date')
  if (!validDate(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  const serviceDate = date as string
  const admin = createSupabaseAdmin()

  try {
    const [{ data: rooms, error: roomError }, { data: saved, error: savedError }, peopleData] = await Promise.all([
      admin
        .from('rooms')
        .select('id,name,sort_order,active')
        .eq('active', true)
        .order('sort_order'),
      admin
        .from('housekeeping_daily_rooms')
        .select('*')
        .eq('service_date', serviceDate),
      getPeopleAndCapabilities(admin)
    ])

    if (roomError) throw new Error(roomError.message)
    if (savedError) throw new Error(savedError.message)

    const peopleById = new Map<string, any>()
    for (const person of peopleData.people) peopleById.set(String((person as any).id), person)

    const currentPerson = peopleData.people.find(
      (person: any) => person.auth_user_id === access.userId
    ) as any | undefined
    const currentCaps = currentPerson
      ? peopleData.byMember.get(String(currentPerson.id)) || new Set<string>()
      : new Set<string>()

    const staffOptions = peopleData.people
      .filter((person: any) => {
        const caps = peopleData.byMember.get(String(person.id)) || new Set<string>()
        return caps.has('housekeeping') || caps.has('runner')
      })
      .map((person: any) => ({ id: person.id, name: person.name }))

    const savedByRoom = new Map<string, any>()
    for (const row of saved || []) savedByRoom.set(String((row as any).room_id), row)

    const breakfastDate = nextDate(serviceDate)
    const { data: breakfastRows, error: breakfastError } = await admin
      .from('breakfast_bookings')
      .select('room_id,status,menu_submitted,time_slot')
      .eq('service_date', breakfastDate)
      .in('status', ['scheduled', 'declined'])

    if (breakfastError) throw new Error(breakfastError.message)

    const breakfastByRoom = new Map<string, any>()
    for (const booking of breakfastRows || []) {
      const roomId = String((booking as any).room_id || '')
      if (!roomId) continue
      breakfastByRoom.set(roomId, booking)
    }

    const rows = (rooms || []).map((room: any) => {
      const savedRow = savedByRoom.get(String(room.id)) || {}
      const breakfast = breakfastByRoom.get(String(room.id))

      let breakfastStatus: 'none' | 'needed' | 'received' | 'declined' = 'none'
      if (breakfast?.status === 'declined') breakfastStatus = 'declined'
      else if (breakfast?.status === 'scheduled' && breakfast?.menu_submitted) breakfastStatus = 'received'
      else if (breakfast?.status === 'scheduled') breakfastStatus = 'needed'

      return {
        roomId: room.id,
        roomName: room.name,
        sortOrder: room.sort_order,
        reservationStatus: savedRow.reservation_status || '',
        serviceType: savedRow.service_type || '',
        stripHold: savedRow.strip_hold || '',
        assignedTo: savedRow.assigned_to || '',
        cleanOrder: savedRow.clean_order ?? null,
        complete: Boolean(savedRow.complete),
        readyForInspection: Boolean(savedRow.ready_for_inspection),
        inspected: Boolean(savedRow.inspected),
        completedAt: savedRow.completed_at || null,
        inspectedAt: savedRow.inspected_at || null,
        roomCondition: savedRow.room_condition || '',
        nextShiftCondition: savedRow.next_shift_condition || '',
        notes: savedRow.notes || '',
        haSignedBy: savedRow.ha_signed_by || null,
        haSignedName: savedRow.ha_signed_by
          ? (peopleById.get(String(savedRow.ha_signed_by)) as any)?.name || 'Staff'
          : null,
        haSignedAt: savedRow.ha_signed_at || null,
        fohSignedBy: savedRow.foh_signed_by || null,
        fohSignedName: savedRow.foh_signed_by
          ? (peopleById.get(String(savedRow.foh_signed_by)) as any)?.name || 'Staff'
          : null,
        fohSignedAt: savedRow.foh_signed_at || null,
        breakfast: {
          serviceDate: breakfastDate,
          status: breakfastStatus,
          timeSlot: breakfast?.time_slot || null
        }
      }
    })

    const menuNeededRooms = rows
      .filter((row: any) => row.breakfast.status === 'needed')
      .map((row: any) => row.roomName)

    return NextResponse.json({
      rows,
      staffOptions,
      signoffAccess: {
        canHaSignoff: currentCaps.has('ha_signoff') || currentCaps.has('ha_signoff_override'),
        canFohSignoff: currentCaps.has('foh_signoff') || currentCaps.has('foh_signoff_override')
      },
      breakfast: {
        serviceDate: breakfastDate,
        menuNeededRooms
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Could not load housekeeping board.' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = await req.json().catch(() => null)
  const serviceDate = payload?.serviceDate
  const rows: SaveRow[] = Array.isArray(payload?.rows) ? payload.rows : []

  if (!validDate(serviceDate)) {
    return NextResponse.json({ error: 'Invalid service date' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const now = new Date().toISOString()

  try {
    const roomIds = rows.map(row => row.roomId).filter(Boolean)
    const { data: existingRows, error: existingError } = roomIds.length
      ? await admin
          .from('housekeeping_daily_rooms')
          .select('room_id,completed_at,inspected_at,ha_signed_by,ha_signed_at,foh_signed_by,foh_signed_at')
          .eq('service_date', serviceDate)
          .in('room_id', roomIds)
      : { data: [], error: null as any }

    if (existingError) throw new Error(existingError.message)
    const existingByRoom = new Map<string, any>()
    for (const row of existingRows || []) existingByRoom.set(String((row as any).room_id), row)

    const upserts = rows.map(row => {
      const existing = existingByRoom.get(String(row.roomId)) || {}
      const complete = Boolean(row.complete)
      const inspected = Boolean(row.inspected)

      return {
        service_date: serviceDate,
        room_id: row.roomId,
        reservation_status: cleanText(row.reservationStatus),
        service_type: cleanText(row.serviceType),
        strip_hold: cleanText(row.stripHold),
        assigned_to: cleanText(row.assignedTo),
        clean_order: Number.isFinite(row.cleanOrder as number) ? row.cleanOrder : null,
        complete,
        ready_for_inspection: complete && !inspected,
        inspected,
        completed_at: complete ? (existing.completed_at || row.completedAt || now) : null,
        inspected_at: inspected ? (existing.inspected_at || row.inspectedAt || now) : null,
        room_condition: cleanText(row.roomCondition),
        next_shift_condition: cleanText(row.nextShiftCondition),
        notes: cleanText(row.notes),
        ha_signed_by: complete ? existing.ha_signed_by || null : null,
        ha_signed_at: complete ? existing.ha_signed_at || null : null,
        foh_signed_by: complete ? existing.foh_signed_by || null : null,
        foh_signed_at: complete ? existing.foh_signed_at || null : null,
        updated_at: now
      }
    })

    if (upserts.length) {
      const { error } = await admin
        .from('housekeeping_daily_rooms')
        .upsert(upserts, { onConflict: 'service_date,room_id' })
      if (error) throw new Error(error.message)
    }

    return NextResponse.json({ ok: true, savedAt: now })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Could not save housekeeping board.' },
      { status: 500 }
    )
  }
}
