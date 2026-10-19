import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getStaffAccess } from '@/lib/access'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// This endpoint is restricted to the actual Owner, never Manager or preview.
export async function POST(request: Request) {
  const owner = await getStaffAccess()
  if (!owner || owner.isPreviewMode || owner.roleName !== 'Owner' || !owner.capabilities.includes('owner')) {
    return NextResponse.json({ error: 'Owner access required' }, { status: 403 })
  }

  const requestOrigin = request.headers.get('origin')
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const userId = String(body.userId || '')
  if (!/^[a-f0-9-]{36}$/i.test(userId) || userId === owner.userId) {
    return NextResponse.json({ error: 'Invalid staff member' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: linkedMember } = await admin.from('staff_members')
    .select('id').eq('auth_user_id',userId).eq('active',true).maybeSingle()
  if (!linkedMember) return NextResponse.json({ error: 'Active staff account not found' }, { status: 404 })

  const { data: ownerCapability } = await admin.from('staff_member_capabilities')
    .select('capability_key').eq('staff_member_id',linkedMember.id)
    .eq('capability_key','owner').maybeSingle()
  if (ownerCapability) return NextResponse.json({ error: 'Owner credentials cannot be changed here' }, { status: 403 })

  const { data: staff } = await admin.from('staff_profiles')
    .select('user_id,active,staff_roles(name)').eq('user_id',userId).maybeSingle()
  const role: any = Array.isArray(staff?.staff_roles) ? staff?.staff_roles[0] : staff?.staff_roles
  if (!staff?.active || !role?.name || role?.name === 'Owner') {
    return NextResponse.json({ error: 'Staff account unavailable' }, { status: 403 })
  }
  const { data: auth, error: authError } = await admin.auth.admin.getUserById(userId)
  if (authError || !auth.user) return NextResponse.json({ error: 'Login account not found' }, { status: 404 })

  const password = randomBytes(24).toString('base64url')
  // Owner-authorized staff onboarding: a mailbox is not required for username sign-in.
  // Do not alter the user's role or permission assignments.
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    user_metadata: { ...(auth.user.user_metadata || {}), ths_password_change_required: true }
  })
  if (error) return NextResponse.json({ error: 'Could not create temporary password' }, { status: 500 })

  return NextResponse.json({ password, accountEmail: auth.user.email }, { headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Pragma':'no-cache', 'X-Content-Type-Options':'nosniff' } })
}
