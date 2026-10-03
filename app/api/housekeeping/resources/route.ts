import { NextRequest, NextResponse } from 'next/server'
import { getStaffAccess } from '@/lib/access'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function canManage(access:any) {
  const role = String(access?.roleName || '').toLowerCase()
  return Boolean(access?.isAdmin || role === 'owner' || role === 'manager')
}

export async function GET() {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  const admin = createSupabaseAdmin()

  const [{data:rooms,error:roomError},{data:guides,error:guideError},{data:zones,error:zoneError}] = await Promise.all([
    admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
    admin.from('housekeeping_guides').select('*').order('sort_order'),
    admin.from('housekeeping_zones').select('*,rooms(name,sort_order),housekeeping_zone_photos(*)').order('sort_order')
  ])
  const err = roomError || guideError || zoneError
  if (err) return NextResponse.json({error:err.message},{status:500})

  const decorated:any[] = []
  for (const zone of zones || []) {
    const photos:any[] = []
    for (const photo of (zone as any).housekeeping_zone_photos || []) {
      let url:string|null = null
      if (photo.storage_path) {
        const {data} = await admin.storage.from('housekeeping-photos').createSignedUrl(photo.storage_path,60*60)
        url = data?.signedUrl || null
      }
      photos.push({...photo,url})
    }
    decorated.push({...zone,photos,housekeeping_zone_photos:undefined})
  }

  return NextResponse.json({rooms:rooms || [],guides:guides || [],zones:decorated,canManage:canManage(access)})
}

export async function POST(req:NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  if (!canManage(access)) return NextResponse.json({error:'Manager access required.'},{status:403})
  const payload = await req.json().catch(()=>null)
  const admin = createSupabaseAdmin()
  const action = String(payload?.action || '')

  if (action === 'save_guide') {
    const guideKey = String(payload?.guideKey || '').trim()
    if (!['manual','tote','checklist'].includes(guideKey)) return NextResponse.json({error:'Invalid guide.'},{status:400})
    const {error} = await admin.from('housekeeping_guides').upsert({guide_key:guideKey,title:String(payload?.title || guideKey),content:String(payload?.content || ''),updated_by:access.userId,updated_at:new Date().toISOString()},{onConflict:'guide_key'})
    if (error) return NextResponse.json({error:error.message},{status:500})
    return NextResponse.json({ok:true})
  }

  if (action === 'create_zone') {
    const scope = payload?.scope === 'property' ? 'property' : 'room'
    const roomId = scope === 'room' ? String(payload?.roomId || '') || null : null
    const name = String(payload?.name || '').trim()
    if (!name || (scope === 'room' && !roomId)) return NextResponse.json({error:'Room/property zone and name are required.'},{status:400})
    const {data,error} = await admin.from('housekeeping_zones').insert({scope,room_id:roomId,name,details:String(payload?.details || ''),sort_order:Number(payload?.sortOrder || 0),updated_by:access.userId}).select('*').single()
    if (error) return NextResponse.json({error:error.message},{status:500})
    return NextResponse.json({ok:true,zone:data})
  }

  if (action === 'update_zone') {
    const id = String(payload?.id || '')
    if (!id) return NextResponse.json({error:'Zone id required.'},{status:400})
    const update:any = {updated_at:new Date().toISOString(),updated_by:access.userId}
    if ('name' in payload) update.name = String(payload.name || '').trim()
    if ('details' in payload) update.details = String(payload.details || '')
    if ('sortOrder' in payload) update.sort_order = Number(payload.sortOrder || 0)
    const {error} = await admin.from('housekeeping_zones').update(update).eq('id',id)
    if (error) return NextResponse.json({error:error.message},{status:500})
    return NextResponse.json({ok:true})
  }

  if (action === 'delete_zone') {
    const id = String(payload?.id || '')
    if (!id) return NextResponse.json({error:'Zone id required.'},{status:400})
    const {data:photos} = await admin.from('housekeeping_zone_photos').select('storage_path').eq('zone_id',id)
    const paths = (photos || []).map((p:any)=>p.storage_path).filter(Boolean)
    if (paths.length) await admin.storage.from('housekeeping-photos').remove(paths)
    const {error} = await admin.from('housekeeping_zones').delete().eq('id',id)
    if (error) return NextResponse.json({error:error.message},{status:500})
    return NextResponse.json({ok:true})
  }

  return NextResponse.json({error:'Unknown action.'},{status:400})
}
