import {
  NextRequest,
  NextResponse
} from 'next/server'

import {
  createSupabaseServerClient
} from '@/lib/supabase/server'

import {
  createSupabaseAdmin
} from '@/lib/supabase/admin'

import {
  canUseModule
} from '@/lib/access'

export const dynamic = 'force-dynamic'

function validDate(
  value: string | null
) {
  return Boolean(
    value &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      value
    )
  )
}

function previousDate(
  value: string
) {
  const d =
    new Date(
      `${value}T12:00:00Z`
    )

  d.setUTCDate(
    d.getUTCDate() - 1
  )

  return d
    .toISOString()
    .slice(0, 10)
}

function normalize(
  value: unknown
) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function hasPermission(
  access: any,
  permission: string
) {
  return Boolean(
    access?.isAdmin ||
    normalize(access?.roleName) ===
      'owner' ||
    access?.permissions?.includes(
      permission
    )
  )
}

function findRecipients(
  profiles: any[],
  names: string[]
) {
  const wanted =
    names.map(normalize)

  return profiles
    .filter(profile => {
      const name =
        normalize(profile.name)

      const preferred =
        normalize(
          profile.preferred_name
        )

      const email =
        normalize(profile.email)

      return wanted.some(target => {
        return (
          name === target ||
          preferred === target ||
          name.startsWith(
            `${target} `
          ) ||
          preferred.startsWith(
            `${target} `
          ) ||
          email.startsWith(
            `${target}@`
          )
        )
      })
    })
    .map(profile =>
      profile.user_id
    )
    .filter(Boolean)
}

export async function GET(
  req: NextRequest
) {
  const gate =
    await canUseModule(
      'housekeeping'
    )

  if (!gate.access) {
    return NextResponse.json(
      {
        error:
          'Unauthorized'
      },
      {
        status: 401
      }
    )
  }

  if (!gate.allowed) {
    return NextResponse.json(
      {
        error:
          'Forbidden'
      },
      {
        status: 403
      }
    )
  }

  const serviceDate =
    req.nextUrl.searchParams.get(
      'date'
    )

  if (
    !validDate(serviceDate)
  ) {
    return NextResponse.json(
      {
        error:
          'Invalid date'
      },
      {
        status: 400
      }
    )
  }

  const supabase =
    await createSupabaseServerClient()

  const [
    {
      data: rooms,
      error: roomsError
    },
    {
      data: rows,
      error: rowsError
    },
    {
      data: prior,
      error: priorError
    }
  ] =
    await Promise.all([
      supabase
        .from('rooms')
        .select(
          'id,name,sort_order'
        )
        .eq('active', true)
        .order('sort_order'),

      supabase
        .from(
          'housekeeping_daily_rooms'
        )
        .select('*')
        .eq(
          'service_date',
          serviceDate!
        ),

      supabase
        .from(
          'housekeeping_daily_rooms'
        )
        .select(
          'room_id,next_shift_condition'
        )
        .eq(
          'service_date',
          previousDate(
            serviceDate!
          )
        )
    ])

  const error =
    roomsError ||
    rowsError ||
    priorError

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message
      },
      {
        status: 500
      }
    )
  }

  const byRoom =
    new Map(
      (rows || []).map(
        (r: any) => [
          r.room_id,
          r
        ]
      )
    )

  const priorByRoom =
    new Map(
      (prior || []).map(
        (r: any) => [
          r.room_id,
          r.next_shift_condition ||
            ''
        ]
      )
    )

  return NextResponse.json({
    canInspect:
      hasPermission(
        gate.access,
        'room_checks.perform'
      ),

    rows:
      (rooms || []).map(
        (room: any) => {

          const row: any =
            byRoom.get(
              room.id
            ) || {}

          return {
            roomId:
              room.id,

            roomName:
              room.name,

            sortOrder:
              room.sort_order,

            reservationStatus:
              row.reservation_status ||
              '',

            serviceType:
              row.service_type ||
              '',

            stripHold:
              row.strip_hold ||
              '',

            assignedTo:
              row.assigned_to ||
              '',

            cleanOrder:
              row.clean_order ??
              null,

            complete:
              Boolean(
                row.complete
              ),

            readyForInspection:
              Boolean(
                row.ready_for_inspection
              ),

            inspected:
              Boolean(
                row.inspected
              ),

            completedAt:
              row.completed_at ||
              null,

            inspectedAt:
              row.inspected_at ||
              null,

            roomCondition:
              row.room_condition ||
              priorByRoom.get(
                room.id
              ) ||
              '',

            nextShiftCondition:
              row.next_shift_condition ||
              '',

            notes:
              row.notes ||
              ''
          }
        }
      )
  })
}

export async function POST(
  req: NextRequest
) {
  const gate =
    await canUseModule(
      'housekeeping'
    )

  if (!gate.access) {
    return NextResponse.json(
      {
        error:
          'Unauthorized'
      },
      {
        status: 401
      }
    )
  }

  if (!gate.allowed) {
    return NextResponse.json(
      {
        error:
          'Forbidden'
      },
      {
        status: 403
      }
    )
  }

  const body =
    await req
      .json()
      .catch(() => ({}))

  const serviceDate =
    String(
      body.serviceDate ||
      ''
    )

  if (
    !validDate(serviceDate) ||
    !Array.isArray(
      body.rows
    )
  ) {
    return NextResponse.json(
      {
        error:
          'Invalid payload'
      },
      {
        status: 400
      }
    )
  }

  const supabase =
    await createSupabaseServerClient()

  const admin =
    createSupabaseAdmin()

  /*
   * Load current state FIRST.
   * This is how we know whether
   * false -> true actually happened.
   */
  const {
    data: existingRows,
    error: existingError
  } =
    await supabase
      .from(
        'housekeeping_daily_rooms'
      )
      .select(
        [
          'room_id',
          'complete',
          'ready_for_inspection',
          'inspected',
          'completed_by',
          'completed_at',
          'inspected_by',
          'inspected_at'
        ].join(',')
      )
      .eq(
        'service_date',
        serviceDate
      )

  if (existingError) {
    return NextResponse.json(
      {
        error:
          existingError.message
      },
      {
        status: 400
      }
    )
  }

  const existingByRoom =
    new Map(
      (existingRows || []).map(
        (row: any) => [
          row.room_id,
          row
        ]
      )
    )

  const canInspect =
    hasPermission(
      gate.access,
      'room_checks.perform'
    )

  const now =
    new Date().toISOString()

  const completionEvents:
    {
      roomId: string
      roomName: string
    }[] = []

  const inspectionEvents:
    {
      roomId: string
      roomName: string
    }[] = []

  const payload =
    body.rows.map(
      (r: any) => {

        const roomId =
          String(
            r.roomId
          )

        const roomName =
          String(
            r.roomName ||
            'Room'
          )

        const existing: any =
          existingByRoom.get(
            roomId
          ) || {}

        const wasComplete =
          Boolean(
            existing.complete
          )

        const wantsComplete =
          Boolean(
            r.complete
          )

        const wasInspected =
          Boolean(
            existing.inspected
          )

        let wantsInspected =
          Boolean(
            r.inspected
          )

        /*
         * Someone without room-check
         * permission may not change
         * inspected state.
         */
        if (
          wantsInspected !==
            wasInspected &&
          !canInspect
        ) {
          wantsInspected =
            wasInspected
        }

        const justCompleted =
          !wasComplete &&
          wantsComplete

        const reopened =
          wasComplete &&
          !wantsComplete

        const justInspected =
          !wasInspected &&
          wantsInspected

        if (
          justCompleted
        ) {
          completionEvents.push({
            roomId,
            roomName
          })
        }

        if (
          justInspected
        ) {
          inspectionEvents.push({
            roomId,
            roomName
          })
        }

        /*
         * If room is reopened,
         * inspection is reset too.
         */
        if (reopened) {
          wantsInspected =
            false
        }

        const complete =
          wantsComplete

        const inspected =
          complete
            ? wantsInspected
            : false

        return {
          service_date:
            serviceDate,

          room_id:
            roomId,

          reservation_status:
            r.reservationStatus ||
            null,

          service_type:
            r.serviceType ||
            null,

          strip_hold:
            r.stripHold ||
            null,

          assigned_to:
            r.assignedTo ||
            null,

          clean_order:
            r.cleanOrder ||
            null,

          complete,

          /*
           * Complete means it now needs
           * inspection.
           *
           * Once inspected, it is no
           * longer "ready for inspection".
           */
          ready_for_inspection:
            complete &&
            !inspected,

          completed_by:
            justCompleted
              ? gate.access!.userId
              : reopened
              ? null
              : existing.completed_by ||
                null,

          completed_at:
            justCompleted
              ? now
              : reopened
              ? null
              : existing.completed_at ||
                null,

          inspected,

          inspected_by:
            justInspected
              ? gate.access!.userId
              : reopened
              ? null
              : existing.inspected_by ||
                null,

          inspected_at:
            justInspected
              ? now
              : reopened
              ? null
              : existing.inspected_at ||
                null,

          room_condition:
            inspected
              ? (
                  r.roomCondition ||
                  'Vacant (Clean)'
                )
              : (
                  r.roomCondition ||
                  null
                ),

          next_shift_condition:
            r.nextShiftCondition ||
            null,

          notes:
            r.notes ||
            null,

          updated_by:
            gate.access!.userId,

          updated_at:
            now
        }
      }
    )

  const {
    error
  } =
    await supabase
      .from(
        'housekeeping_daily_rooms'
      )
      .upsert(
        payload,
        {
          onConflict:
            'service_date,room_id'
        }
      )

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message
      },
      {
        status: 400
      }
    )
  }

  /*
   * Find notification recipients.
   *
   * We match actual staff profiles,
   * so no fake UUIDs are hard-coded.
   */
  const {
    data: profiles,
    error: profileError
  } =
    await admin
      .from(
        'staff_profiles'
      )
      .select(
        'user_id,name,preferred_name,email,active'
      )
      .eq(
        'active',
        true
      )

  const warnings: string[] =
    []

  if (profileError) {
    warnings.push(
      `Rooms saved, but staff notification profiles could not be loaded: ${profileError.message}`
    )
  } else {

    const inspectors =
      findRecipients(
        profiles || [],
        [
          'Kyree',
          'Ashley'
        ]
      )

    const managers =
      findRecipients(
        profiles || [],
        [
          'Sarah',
          'David'
        ]
      )

    if (
      completionEvents.length >
        0 &&
      inspectors.length === 0
    ) {
      warnings.push(
        'Room completion alerts could not be sent because Kyree and Ashley were not found in active staff profiles.'
      )
    }

    if (
      inspectionEvents.length >
        0 &&
      managers.length === 0
    ) {
      warnings.push(
        'Inspection alerts could not be sent because Sarah and David were not found in active staff profiles.'
      )
    }

    const notifications:
      any[] = []

    for (
      const event of
      completionEvents
    ) {
      for (
        const recipientId of
        inspectors
      ) {
        notifications.push({
          recipient_user_id:
            recipientId,

          notification_type:
            'room_ready_for_inspection',

          title:
            `${event.roomName} ready for inspection`,

          message:
            `${event.roomName} was marked complete by housekeeping and is ready to be inspected.`,

          room_id:
            event.roomId,

          service_date:
            serviceDate,

          created_by:
            gate.access!.userId
        })
      }
    }

    for (
      const event of
      inspectionEvents
    ) {
      const inspectorName =
        gate.access?.preferredName ||
        gate.access?.name ||
        'Staff'

      for (
        const recipientId of
        managers
      ) {
        notifications.push({
          recipient_user_id:
            recipientId,

          notification_type:
            'room_inspected',

          title:
            `${event.roomName} inspected`,

          message:
            `${event.roomName} was inspected by ${inspectorName}.`,

          room_id:
            event.roomId,

          service_date:
            serviceDate,

          created_by:
            gate.access!.userId
        })
      }
    }

    if (
      notifications.length > 0
    ) {
      const {
        error:
          notificationError
      } =
        await admin
          .from(
            'notifications'
          )
          .insert(
            notifications
          )

      if (
        notificationError
      ) {
        warnings.push(
          `Rooms saved, but notifications could not be created: ${notificationError.message}`
        )
      }
    }
  }

  return NextResponse.json({
    ok: true,
    completionAlerts:
      completionEvents.length,
    inspectionAlerts:
      inspectionEvents.length,
    warnings
  })
}
