import {
  NextRequest,
  NextResponse
} from 'next/server'

import {
  createSupabaseServerClient
} from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase =
    await createSupabaseServerClient()

  const {
    data: auth
  } =
    await supabase.auth.getUser()

  const user =
    auth.user

  if (!user) {
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

  const {
    data,
    error
  } =
    await supabase
      .from(
        'notifications'
      )
      .select(
        '*'
      )
      .eq(
        'recipient_user_id',
        user.id
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      )
      .limit(50)

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

  return NextResponse.json({
    notifications:
      data || [],

    unread:
      (data || []).filter(
        (n: any) =>
          !n.read_at
      ).length
  })
}

export async function PATCH(
  req: NextRequest
) {
  const supabase =
    await createSupabaseServerClient()

  const {
    data: auth
  } =
    await supabase.auth.getUser()

  const user =
    auth.user

  if (!user) {
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

  const body =
    await req
      .json()
      .catch(() => ({}))

  if (
    body.markAllRead
  ) {
    const {
      error
    } =
      await supabase
        .from(
          'notifications'
        )
        .update({
          read_at:
            new Date()
              .toISOString()
        })
        .eq(
          'recipient_user_id',
          user.id
        )
        .is(
          'read_at',
          null
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

    return NextResponse.json({
      ok: true
    })
  }

  const id =
    String(
      body.id ||
      ''
    )

  if (!id) {
    return NextResponse.json(
      {
        error:
          'Missing notification id'
      },
      {
        status: 400
      }
    )
  }

  const {
    error
  } =
    await supabase
      .from(
        'notifications'
      )
      .update({
        read_at:
          new Date()
            .toISOString()
      })
      .eq(
        'id',
        id
      )
      .eq(
        'recipient_user_id',
        user.id
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

  return NextResponse.json({
    ok: true
  })
}
