import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

function validDate(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

export async function POST(req: NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const serviceDate = body?.serviceDate
  const roomId = body?.roomId
  const kind = body?.kind === 'ha' ? 'ha' : body?.kind === 'foh' ? 'foh' : null

  if (!validDate(serviceDate) || !roomId || !kind) {
    return NextResponse.json({ error: 'Invalid sign-off request.' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()

  try {
    const { data: person, error: personError } = await admin
      .from('staff_members')
      .select('id,name,active')
      .eq('auth_user_id', access.userId)
      .eq('active', true)
      .maybeSingle()

    if (personError) throw new Error(personError.message)
    if (!person) {
      return NextResponse.json({ error: 'Your login is not linked to an active staff member.' }, { status: 403 })
    }

    const { data: capRows, error: capError } = await admin
      .from('staff_member_capabilities')
      .select('capability_key')
      .eq('staff_member_id', person.id)

    if (capError) throw new Error(capError.message)
    const caps = new Set((capRows || []).map((row: any) => String(row.capability_key)))

    const allowed = kind === 'ha'
      ? caps.has('ha_signoff') || caps.has('ha_signoff_override')
      : caps.has('foh_signoff') || caps.has('foh_signoff_override')

    if (!allowed) {
      return NextResponse.json({ error: `You do not have ${kind.toUpperCase()} sign-off permission.` }, { status: 403 })
    }

    const { data: roomRow, error: roomError } = await admin
      .from('housekeeping_daily_rooms')
      .select('complete')
      .eq('service_date', serviceDate)
      .eq('room_id', roomId)
      .maybeSingle()

    if (roomError) throw new Error(roomError.message)
    if (!roomRow?.complete) {
      return NextResponse.json({ error: 'The room must be marked complete before sign-off.' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const patch = kind === 'ha'
      ? { ha_signed_by: person.id, ha_signed_at: now, updated_at: now }
      : { foh_signed_by: person.id, foh_signed_at: now, updated_at: now }

    const { error: updateError } = await admin
      .from('housekeeping_daily_rooms')
      .update(patch)
      .eq('service_date', serviceDate)
      .eq('room_id', roomId)

    if (updateError) throw new Error(updateError.message)

    return NextResponse.json({
      ok: true,
      kind,
      signedBy: person.id,
      signedName: person.name,
      signedAt: now
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Could not save room sign-off.' },
      { status: 500 }
    )
  }
}
