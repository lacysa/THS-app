import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export async function POST(req:NextRequest) {
  const access = await getStaffAccess()
  if (!access?.canManageModules) return NextResponse.json({error:'Forbidden'},{status:403})
  const body = await req.json()
  const moduleKey = String(body.module_key || '')
  if (!moduleKey) return NextResponse.json({error:'Missing module.'},{status:400})
  const patch:any = { updated_at:new Date().toISOString() }
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (typeof body.published === 'boolean') patch.published = body.published
  const admin = createSupabaseAdmin()
  const { error } = await admin.from('app_modules').update(patch).eq('module_key',moduleKey)
  if (error) return NextResponse.json({error:error.message},{status:400})
  return NextResponse.json({ok:true})
}
