import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

function validDate(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function nextDate(value:string) {
  const d = new Date(`${value}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate()+1)
  return d.toISOString().slice(0,10)
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

    const managerSignoff =
      access.isAdmin ||
      ['manager','general_manager','operations_manager','owner','foh_manager'].some(cap=>caps.has(cap)) ||
      ['manager','owner'].some(label=>String(access.roleName||'').trim().toLowerCase().includes(label))

    const allowed = kind === 'ha'
      ? caps.has('ha_signoff') || caps.has('ha_signoff_override')
      : managerSignoff || caps.has('foh_signoff') || caps.has('foh_signoff_override')

    if (!allowed) {
      return NextResponse.json({ error: `You do not have ${kind.toUpperCase()} sign-off permission.` }, { status: 403 })
    }

    const { data: roomRow, error: roomError } = await admin
      .from('housekeeping_daily_rooms')
      .select('complete,check_issue_open,strip_hold,room_condition,reservation_status')
      .eq('service_date', serviceDate)
      .eq('room_id', roomId)
      .maybeSingle()

    if (roomError) throw new Error(roomError.message)
    if (!roomRow?.complete) {
      return NextResponse.json({ error: 'The room must be marked complete before sign-off.' }, { status: 400 })
    }

    if (kind === 'ha') {
      const { data:qualityPass, error:qualityError } = await admin
        .from('housekeeping_quality_checks')
        .select('id,submitted_at,status,stage')
        .eq('service_date',serviceDate)
        .eq('room_id',roomId)
        .in('stage',['inspection','recheck'])
        .eq('status','pass')
        .order('submitted_at',{ascending:false})
        .limit(1)
        .maybeSingle()

      if (qualityError) throw new Error(qualityError.message)
      if (!qualityPass) {
        return NextResponse.json(
          { error:'Complete and pass the independent room inspection checklist before HA sign-off.' },
          { status:400 }
        )
      }
    }

    const now = new Date().toISOString()

    let automaticEndOfShiftStatus:string | null = null
    if (kind === 'foh') {
      const { data:nextDayRow,error:nextDayError } = await admin
        .from('housekeeping_daily_rooms')
        .select('reservation_status')
        .eq('service_date',nextDate(serviceDate))
        .eq('room_id',roomId)
        .maybeSingle()
      if (nextDayError) throw new Error(nextDayError.message)

      const nextBlocked = String(nextDayRow?.reservation_status || '').trim().toLowerCase() === 'blocked'
      const stripOrHold = Boolean(String(roomRow?.strip_hold || '').trim())

      if (!nextBlocked && !stripOrHold) {
        const roomStatus=String(roomRow?.reservation_status || '').trim().toLowerCase()
        automaticEndOfShiftStatus =
          ['checkout','vacant','dirty'].includes(roomStatus)
            ? 'Vacant (Clean)'
            : 'Ready'
      }
    }

    const patch = kind === 'ha'
      ? {
          ha_signed_by: person.id,
          ha_signed_at: now,
          check_issue_open: false,
          ready_for_inspection: false,
          inspected: true,
          inspected_at: now,
          room_condition: 'Vacant (Clean)',
          updated_at: now
        }
      : {
          foh_signed_by: person.id,
          foh_signed_at: now,
          ...(automaticEndOfShiftStatus ? { room_condition:automaticEndOfShiftStatus } : {}),
          updated_at: now
        }

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
