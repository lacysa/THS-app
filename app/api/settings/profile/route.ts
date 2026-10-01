import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

function normalizePhone(value:string) {
  const raw = value.trim()
  if (!raw) return null
  const digits = raw.replace(/\D/g,'')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (raw.startsWith('+') && digits) return `+${digits}`
  return raw
}

export async function POST(req:NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({error:'Unauthorized'},{status:401})

  const body = await req.json().catch(()=>({}))
  const theme = ['light','blue','dark'].includes(body.theme_preference) ? body.theme_preference : access.theme
  const phone = normalizePhone(String(body.phone || ''))

  try {
    const admin = createSupabaseAdmin()
    const { error } = await admin.from('staff_profiles').update({
      name:String(body.name || access.name).trim(),
      preferred_name:String(body.preferred_name || '').trim() || null,
      email:String(body.email || '').trim() || null,
      phone,
      job_title:String(body.job_title || '').trim() || null,
      theme_preference:theme,
      updated_at:new Date().toISOString()
    }).eq('user_id',access.userId)

    if (error) return NextResponse.json({error:error.message},{status:400})

    // IMPORTANT: phone/email here are profile/login aliases. Do not rewrite auth.users.
    // The existing Supabase Auth password and canonical email remain untouched.
    return NextResponse.json({ok:true, phone, theme_preference:theme})
  } catch {
    return NextResponse.json({error:'Server admin key is not configured.'},{status:500})
  }
}
