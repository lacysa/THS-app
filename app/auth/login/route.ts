import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

function normalizePhone(value:string) {
  const raw = value.trim()
  const digits = raw.replace(/\D/g,'')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (raw.startsWith('+') && digits) return `+${digits}`
  return raw
}

function loginRedirect(req:NextRequest, code?:string) {
  const url = new URL('/login', req.url)
  if (code) url.searchParams.set('error', code)
  return NextResponse.redirect(url, 303)
}

function hasAdminKey() {
  return Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
}

async function resolveAuthEmailFromStaffProfile(identifier:string) {
  if (!hasAdminKey()) throw new Error('PHONE_LOGIN_ADMIN_KEY_MISSING')
  const admin = createSupabaseAdmin()

  if (identifier.includes('@')) {
    const { data:profile, error } = await admin
      .from('staff_profiles')
      .select('user_id,active')
      .ilike('email', identifier.trim())
      .eq('active', true)
      .maybeSingle()

    if (error || !profile?.user_id) return null
    const { data, error:userError } = await admin.auth.admin.getUserById(profile.user_id)
    if (userError) return null
    return data.user?.email || null
  }

  const wanted = normalizePhone(identifier)
  const { data:profiles, error } = await admin
    .from('staff_profiles')
    .select('user_id,phone,active')
    .eq('active', true)
    .not('phone', 'is', null)

  if (error) return null

  const profile = (profiles || []).find((row:any) =>
    row.phone && normalizePhone(String(row.phone)) === wanted
  )

  if (!profile?.user_id) return null

  const { data, error:userError } = await admin.auth.admin.getUserById(profile.user_id)
  if (userError) return null
  return data.user?.email || null
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const identifier = String(form.get('identifier') || '').trim()
  const password = String(form.get('password') || '')

  if (!identifier || !password) return loginRedirect(req, 'missing_fields')

  const supabase = await createSupabaseServerClient()

  // Preserve canonical Supabase email/password login exactly as before.
  if (identifier.includes('@')) {
    const direct = await supabase.auth.signInWithPassword({ email:identifier, password })
    if (!direct.error) return NextResponse.redirect(new URL('/dashboard', req.url), 303)

    // staff_profiles.email may be a contact/login alias that differs from auth.users.email.
    try {
      const authEmail = await resolveAuthEmailFromStaffProfile(identifier)
      if (authEmail && authEmail.toLowerCase() !== identifier.toLowerCase()) {
        const alias = await supabase.auth.signInWithPassword({ email:authEmail, password })
        if (!alias.error) return NextResponse.redirect(new URL('/dashboard', req.url), 303)
      }
    } catch {
      // Direct email login remains usable even if the server admin key is missing.
    }

    return loginRedirect(req, 'invalid_credentials')
  }

  // Phone login intentionally uses staff_profiles.phone as an alias to the existing
  // Supabase Auth account. It does NOT modify auth.users.phone and does NOT require SMS.
  if (!hasAdminKey()) return loginRedirect(req, 'phone_config')

  try {
    const authEmail = await resolveAuthEmailFromStaffProfile(identifier)
    if (!authEmail) return loginRedirect(req, 'phone_not_found')

    const alias = await supabase.auth.signInWithPassword({ email:authEmail, password })
    if (alias.error) return loginRedirect(req, 'invalid_credentials')

    return NextResponse.redirect(new URL('/dashboard', req.url), 303)
  } catch {
    return loginRedirect(req, 'phone_config')
  }
}
