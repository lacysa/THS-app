import { NextRequest, NextResponse } from 'next/server'
import { getStaffAccess } from '@/lib/access'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function canManage(access:any) {
  const role = String(access?.roleName || '').toLowerCase()
  return Boolean(access?.isAdmin || role === 'owner' || role === 'manager')
}

export async function POST(req:NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  if (!canManage(access)) return NextResponse.json({error:'Manager access required.'},{status:403})

  const form = await req.formData()
  const zoneId = String(form.get('zoneId') || '')
  const caption = String(form.get('caption') || '')
  const file = form.get('file') as File | null
  if (!zoneId || !file) return NextResponse.json({error:'Zone and photo are required.'},{status:400})
  if (!file.type.startsWith('image/')) return NextResponse.json({error:'Please choose an image file.'},{status:400})
  if (file.size > 12 * 1024 * 1024) return NextResponse.json({error:'Photo must be 12 MB or smaller.'},{status:400})

  const admin = createSupabaseAdmin()
  const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g,'').toLowerCase() || 'jpg'
  const path = `${zoneId}/${crypto.randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const {error:uploadError} = await admin.storage.from('housekeeping-photos').upload(path,buffer,{contentType:file.type,upsert:false})
  if (uploadError) return NextResponse.json({error:uploadError.message},{status:500})

  const {error} = await admin.from('housekeeping_zone_photos').insert({zone_id:zoneId,storage_path:path,caption,uploaded_by:access.userId})
  if (error) {
    await admin.storage.from('housekeeping-photos').remove([path])
    return NextResponse.json({error:error.message},{status:500})
  }
  return NextResponse.json({ok:true})
}
