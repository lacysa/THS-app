import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'
import { normalizeEditedReservation, parseArrivalReportPages, ParsedReservation } from '@/lib/reservations/import'

export const dynamic = 'force-dynamic'

const MANAGER_CAPS = ['manager','general_manager','operations_manager','owner']
const SYNC_FIELDS = [
  'guest_name','guest_phone','door_code','arrival_date','checkout_date','room_id','occupancy',
  'rate_plan','check_in_time','products_raw','dietary_restrictions','referral_source',
  'reason_for_visit','guest_comments','innkeeper_notes'
]

function validDate(v:unknown):v is string { return typeof v==='string' && /^20\d{2}-\d{2}-\d{2}$/.test(v) }
function plusDays(value:string,days:number){ const d=new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10) }
function eachDate(start:string,end:string){ const out:string[]=[]; for(let d=start;d<=end;d=plusDays(d,1)){ out.push(d); if(out.length>90) break } return out }
function allowed(access:any){ return Boolean(access?.isAdmin || MANAGER_CAPS.some(c=>access?.capabilities?.includes(c))) }
function normalizeProduct(v:string){ return v.toLowerCase().replace(/^\s*\d+\s*x\s*/,'').replace(/[^a-z0-9]+/g,' ').trim() }

async function baseData(admin:ReturnType<typeof createSupabaseAdmin>){
  const [{data:rooms,error:roomError},{data:packages,error:pkgError}]=await Promise.all([
    admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
    admin.from('room_package_catalog').select('id,name,available').order('sort_order')
  ])
  if(roomError) throw new Error(roomError.message)
  if(pkgError) throw new Error(pkgError.message)
  return {rooms:rooms||[],packages:packages||[]}
}

function stayPayload(row:ParsedReservation, roomId:string, batchId:string){
  return {
    reservation_key:row.reservationKey,
    reservation_number:row.reservationNumber,
    guest_name:row.guestName,
    guest_phone:row.phone,
    door_code:row.doorCode,
    arrival_date:row.arrivalDate,
    checkout_date:row.checkoutDate,
    room_id:roomId,
    occupancy:row.occupancy,
    rate_plan:row.ratePlan,
    check_in_time:row.checkInTime,
    products_raw:row.productsRaw,
    dietary_restrictions:row.dietaryRestrictions,
    referral_source:row.referralSource,
    reason_for_visit:row.reasonForVisit,
    guest_comments:row.guestComments,
    innkeeper_notes:row.innkeeperNotes,
    source_page:row.sourcePage,
    raw_text:row.rawText,
    parser_confidence:row.confidence,
    needs_review:false,
    active:true,
    last_import_batch_id:batchId,
    last_seen_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  }
}

async function rebuildDaily(admin:ReturnType<typeof createSupabaseAdmin>, start:string, end:string, rooms:any[]){
  const {data:stays,error}=await admin
    .from('reservation_stays')
    .select('*')
    .eq('active',true)
    .lte('arrival_date',end)
    .gte('checkout_date',start)
  if(error) throw new Error(error.message)

  const stayRows=stays||[]
  const links:any[]=[]
  const hskExistingRes=await admin.from('housekeeping_daily_rooms').select('id,service_date,room_id').gte('service_date',start).lte('service_date',end)
  if(hskExistingRes.error) throw new Error(hskExistingRes.error.message)
  const hskByKey=new Map<string,any>((hskExistingRes.data||[]).map((r:any)=>[`${r.service_date}|${r.room_id}`,r]))
  const hskInserts:any[]=[]
  const hskUpdates:any[]=[]

  for(const date of eachDate(start,end)){
    for(const room of rooms){
      const roomStays=stayRows.filter((s:any)=>String(s.room_id)===String(room.id))
      const arriving=roomStays.find((s:any)=>s.arrival_date===date) || null
      const departing=roomStays.find((s:any)=>s.checkout_date===date) || null
      const staying=roomStays.find((s:any)=>s.arrival_date<date && s.checkout_date>date) || null
      const primary=arriving || staying || departing
      let status='Vacant'
      if(arriving && departing) status='Out/In'
      else if(arriving) status='Arrival'
      else if(departing) status='Checkout'
      else if(staying) status='Stayover'

      links.push({
        service_date:date,room_id:room.id,reservation_status:status,
        primary_reservation_id:primary?.id||null,
        arriving_reservation_id:arriving?.id||null,
        stay_reservation_id:staying?.id||null,
        departing_reservation_id:departing?.id||null,
        updated_at:new Date().toISOString()
      })

      const key=`${date}|${room.id}`
      const existing=hskByKey.get(key)
      if(existing) hskUpdates.push({id:existing.id,reservation_status:status})
      else hskInserts.push({service_date:date,room_id:room.id,reservation_status:status})
    }
  }

  const linkDelete=await admin.from('reservation_daily_links').delete().gte('service_date',start).lte('service_date',end)
  if(linkDelete.error) throw new Error(linkDelete.error.message)
  if(links.length){
    const {error:linkErr}=await admin.from('reservation_daily_links').insert(links)
    if(linkErr) throw new Error(linkErr.message)
  }
  if(hskInserts.length){
    const {error:insErr}=await admin.from('housekeeping_daily_rooms').insert(hskInserts)
    if(insErr) throw new Error(insErr.message)
  }
  for(const row of hskUpdates){
    const {error:updateErr}=await admin.from('housekeeping_daily_rooms').update({reservation_status:row.reservation_status,updated_at:new Date().toISOString()}).eq('id',row.id)
    if(updateErr) throw new Error(updateErr.message)
  }
}

async function syncPackages(admin:ReturnType<typeof createSupabaseAdmin>, stays:any[], packages:any[]){
  const ids=stays.map((s:any)=>s.id).filter(Boolean)
  if(!ids.length) return
  const {error:delErr}=await admin.from('housekeeping_room_packages').delete().eq('source','reservation_sync').in('reservation_id',ids)
  if(delErr) throw new Error(delErr.message)

  const catalog=(packages||[]).map((p:any)=>({id:p.id,name:p.name,norm:normalizeProduct(String(p.name||''))}))
  const rows:any[]=[]
  for(const stay of stays){
    const productText=String(stay.products_raw||'')
    if(!productText.trim()) continue
    const requested=productText.split(/;|\n/).map(normalizeProduct).filter(Boolean)
    for(const req of requested){
      let pkg=catalog.find((p:any)=>p.norm===req)
      if(!pkg) pkg=catalog.find((p:any)=>req.includes(p.norm)||p.norm.includes(req))
      if(!pkg) continue
      rows.push({
        service_date:stay.arrival_date,
        room_id:stay.room_id,
        package_id:pkg.id,
        source:'reservation_sync',
        reservation_id:stay.id
      })
    }
  }
  if(rows.length){
    const unique=[...new Map(rows.map((r:any)=>[`${r.service_date}|${r.room_id}|${r.package_id}|${r.reservation_id}`,r])).values()]
    const {error:insErr}=await admin.from('housekeeping_room_packages').insert(unique)
    if(insErr) throw new Error(insErr.message)
  }
}

export async function GET(req:NextRequest){
  const access=await getStaffAccess()
  if(!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  if(!allowed(access)) return NextResponse.json({error:'Forbidden'},{status:403})
  const date=req.nextUrl.searchParams.get('date')
  if(!validDate(date)) return NextResponse.json({error:'Invalid date'},{status:400})
  const admin=createSupabaseAdmin()

  try{
    const {rooms}=await baseData(admin)
    const [{data:batches,error:batchErr},{data:verification,error:verifyErr},{data:links,error:linkErr}]=await Promise.all([
      admin.from('reservation_import_batches').select('*').order('created_at',{ascending:false}).limit(8),
      admin.from('reservation_daily_verifications').select('*').eq('service_date',date).maybeSingle(),
      admin.from('reservation_daily_links').select('*').eq('service_date',date)
    ])
    if(batchErr) throw new Error(batchErr.message)
    if(verifyErr) throw new Error(verifyErr.message)
    if(linkErr) throw new Error(linkErr.message)

    const ids=[...new Set((links||[]).flatMap((l:any)=>[l.primary_reservation_id,l.arriving_reservation_id,l.stay_reservation_id,l.departing_reservation_id]).filter(Boolean))]
    let stays:any[]=[]
    if(ids.length){
      const {data,error}=await admin.from('reservation_stays').select('*').in('id',ids)
      if(error) throw new Error(error.message)
      stays=data||[]
    }
    const stayById=new Map(stays.map((s:any)=>[String(s.id),s]))
    const linkByRoom=new Map((links||[]).map((l:any)=>[String(l.room_id),l]))
    const daily=rooms.map((room:any)=>{
      const l:any=linkByRoom.get(String(room.id))
      return {
        roomId:room.id,roomName:room.name,
        status:l?.reservation_status||'Vacant',
        primary:l?.primary_reservation_id?stayById.get(String(l.primary_reservation_id)):null,
        arriving:l?.arriving_reservation_id?stayById.get(String(l.arriving_reservation_id)):null,
        departing:l?.departing_reservation_id?stayById.get(String(l.departing_reservation_id)):null,
        staying:l?.stay_reservation_id?stayById.get(String(l.stay_reservation_id)):null
      }
    })
    return NextResponse.json({rooms,batches:batches||[],verification:verification||null,daily})
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Could not load Reservation Sync.'},{status:500})
  }
}

export async function POST(req:NextRequest){
  const access=await getStaffAccess()
  if(!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  if(!allowed(access)) return NextResponse.json({error:'Forbidden'},{status:403})
  const body=await req.json().catch(()=>null)
  const admin=createSupabaseAdmin()

  try{
    const {rooms,packages}=await baseData(admin)
    const roomNames=rooms.map((r:any)=>String(r.name))

    if(body?.action==='preview'){
      const pages=Array.isArray(body.pages)?body.pages.map(String):[]
      if(!pages.length) return NextResponse.json({error:'No PDF pages were received.'},{status:400})
      const parsed=parseArrivalReportPages(pages,roomNames)
      const keys=parsed.reservations.map(r=>r.reservationKey)
      let existing:any[]=[]
      if(keys.length){
        const {data,error}=await admin.from('reservation_stays').select('*').in('reservation_key',keys)
        if(error) throw new Error(error.message)
        existing=data||[]
      }
      const existingByKey=new Map(existing.map((r:any)=>[String(r.reservation_key),r]))
      const roomIdByName=new Map(rooms.map((r:any)=>[String(r.name),String(r.id)]))

      const reservations=parsed.reservations.map(row=>{
        const old:any=existingByKey.get(row.reservationKey)
        const candidate:any={
          guest_name:row.guestName,guest_phone:row.phone,door_code:row.doorCode,
          arrival_date:row.arrivalDate,checkout_date:row.checkoutDate,room_id:row.roomName?roomIdByName.get(row.roomName):null,
          occupancy:row.occupancy,rate_plan:row.ratePlan,check_in_time:row.checkInTime,products_raw:row.productsRaw,
          dietary_restrictions:row.dietaryRestrictions,referral_source:row.referralSource,reason_for_visit:row.reasonForVisit,
          guest_comments:row.guestComments,innkeeper_notes:row.innkeeperNotes
        }
        const changedFields:Record<string,any>={}
        if(old){
          for(const field of SYNC_FIELDS){
            const before=(old as any)[field]??null
            const after=(candidate as any)[field]??null
            if(String(before??'')!==String(after??'')) changedFields[field]={before,after}
          }
        }
        const changeType=!old?'new':Object.keys(changedFields).length?'updated':'unchanged'
        return {...row,changeType,changedFields,include:!row.needsReview}
      })

      return NextResponse.json({...parsed,reservations})
    }

    if(body?.action==='verify'){
      const serviceDate=body.serviceDate
      if(!validDate(serviceDate)) return NextResponse.json({error:'Invalid date'},{status:400})
      const {error}=await admin.from('reservation_daily_verifications').upsert({
        service_date:serviceDate,verified_by:access.userId,verified_at:new Date().toISOString()
      },{onConflict:'service_date'})
      if(error) throw new Error(error.message)
      return NextResponse.json({ok:true})
    }

    if(body?.action==='commit'){
      const rawRows=Array.isArray(body.reservations)?body.reservations.filter((r:any)=>r.include):[]
      if(!rawRows.length) return NextResponse.json({error:'No reservations are selected.'},{status:400})
      const normalized=rawRows.map((r:any)=>normalizeEditedReservation(r,roomNames))
      const invalid=normalized.filter(r=>r.needsReview)
      if(invalid.length) return NextResponse.json({error:'Some selected rows still need correction.',invalid:invalid.map(r=>({reservationKey:r.reservationKey,warnings:r.warnings}))},{status:400})

      const arrivals=normalized.map(r=>r.arrivalDate as string)
      const checkouts=normalized.map(r=>r.checkoutDate as string)
      const start=(validDate(body.reportStartDate)?body.reportStartDate:[...arrivals].sort()[0])
      const maxCheckout=[...checkouts].sort().at(-1) as string
      const reportEnd=validDate(body.reportEndDate)?body.reportEndDate:maxCheckout
      const end=maxCheckout>reportEnd?maxCheckout:reportEnd

      const {data:batch,error:batchErr}=await admin.from('reservation_import_batches').insert({
        file_name:String(body.fileName||'Arrival Report.pdf'),
        report_start_date:start,report_end_date:reportEnd,status:'previewed',
        records_detected:Array.isArray(body.reservations)?body.reservations.length:normalized.length,
        records_imported:0,warning_count:Number(body.warningCount||0),warnings:Array.isArray(body.warnings)?body.warnings:[],
        imported_by:access.userId
      }).select('*').single()
      if(batchErr) throw new Error(batchErr.message)

      const roomIdByName=new Map(rooms.map((r:any)=>[String(r.name),String(r.id)]))
      const payloads=normalized.map(r=>stayPayload(r,roomIdByName.get(r.roomName as string) as string,batch.id))
      const keys=payloads.map((p:any)=>p.reservation_key)

      let beforeRows:any[]=[]
      if(keys.length){
        const {data,error}=await admin.from('reservation_stays').select('*').in('reservation_key',keys)
        if(error) throw new Error(error.message)
        beforeRows=data||[]
      }
      const beforeByKey=new Map(beforeRows.map((r:any)=>[String(r.reservation_key),r]))

      const {data:upserted,error:upsertErr}=await admin.from('reservation_stays').upsert(payloads,{onConflict:'reservation_key'}).select('*')
      if(upsertErr) throw new Error(upsertErr.message)

      const changes:any[]=[]
      for(const saved of upserted||[]){
        const old:any=beforeByKey.get(String(saved.reservation_key))
        const changedFields:Record<string,any>={}
        if(old){
          for(const field of SYNC_FIELDS){
            if(String(old[field]??'')!==String(saved[field]??'')) changedFields[field]={before:old[field]??null,after:saved[field]??null}
          }
        }
        changes.push({batch_id:batch.id,reservation_id:saved.id,reservation_key:saved.reservation_key,change_type:!old?'new':Object.keys(changedFields).length?'updated':'unchanged',changed_fields:changedFields})
      }

      const {data:possibleMissing,error:missingErr}=await admin.from('reservation_stays')
        .select('id,reservation_key')
        .eq('active',true)
        .lte('arrival_date',reportEnd)
        .gte('checkout_date',start)
        .not('reservation_key','in',`(${keys.map((k:any)=>`"${String(k).replace(/"/g,'')}"`).join(',')})`)
      if(!missingErr){
        for(const row of possibleMissing||[]) changes.push({batch_id:batch.id,reservation_id:row.id,reservation_key:row.reservation_key,change_type:'potential_missing',changed_fields:{note:'Not present in this report. Review before cancelling.'}})
      }

      if(changes.length){
        const {error:changeErr}=await admin.from('reservation_import_changes').insert(changes)
        if(changeErr) throw new Error(changeErr.message)
      }

      await rebuildDaily(admin,start,end,rooms)
      await syncPackages(admin,upserted||[],packages)

      const {error:finishErr}=await admin.from('reservation_import_batches').update({
        status:'committed',records_imported:(upserted||[]).length,committed_at:new Date().toISOString(),updated_at:new Date().toISOString()
      }).eq('id',batch.id)
      if(finishErr) throw new Error(finishErr.message)

      return NextResponse.json({ok:true,imported:(upserted||[]).length,start,end,batchId:batch.id})
    }

    return NextResponse.json({error:'Unknown action'},{status:400})
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Reservation Sync failed.'},{status:500})
  }
}
