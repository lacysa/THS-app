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

  const body = await request.json().catch(() => ({}))
  const userId = String(body.userId || '')
  if (!/^[a-f0-9-]{36}$/i.test(userId) || userId === owner.userId) {
    return NextResponse.json({ error: 'Invalid staff member' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: staff } = await admin.from('staff_profiles')
    .select('user_id,active,staff_roles(name)').eq('user_id',userId).maybeSingle()
  const role: any = Array.isArray(staff?.staff_roles) ? staff?.staff_roles[0] : staff?.staff_roles
  if (!staff?.active || role?.name === 'Owner') {
    return NextResponse.json({ error: 'Staff account unavailable' }, { status: 403 })
  }
  const { data: auth } = await admin.auth.admin.getUserById(userId)
  if (!auth.user) return NextResponse.json({ error: 'Login account not found' }, { status: 404 })

  const password = randomBytes(24).toString('base64url')
  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return NextResponse.json({ error: 'Could not create temporary password' }, { status: 500 })

  return NextResponse.json({ password }, { headers: { 'Cache-Control': 'no-store' } })
}
