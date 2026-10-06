import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'
import { normalizeEditedReservation, parseArrivalReportPages } from '@/lib/reservations/import'

export const dynamic = 'force-dynamic'

const MANAGER_CAPS = ['foh_manager','manager','general_manager','operations_manager','owner']

function validDate(value:unknown):value is string {
  return typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value)
}

function canSync(access:any){
  return Boolean(access?.isAdmin || MANAGER_CAPS.some(cap => access?.capabilities?.includes(cap)))
}

function addDay(value:string){
  const date=new Date(value+'T12:00:00Z')
  date.setUTCDate(date.getUTCDate()+1)
  return date.toISOString().slice(0,10)
}

function eachDate(start:string,end:string){
  const out:string[]=[]
  let current=start
  while(current<=end && out.length<120){
    out.push(current)
    current=addDay(current)
  }
  return out
}

function normal(value:unknown){
  return String(value||'').toLowerCase().replace(/^\s*\d+\s*x\s*/,'').replace(/[^a-z0-9]+/g,' ').trim()
}

async function loadBase(admin:any){
  const roomResult=await admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order')
  if(roomResult.error) throw new Error(roomResult.error.message)
  const packageResult=await admin.from('room_package_catalog').select('id,name,available').order('sort_order')
  if(packageResult.error) throw new Error(packageResult.error.message)
  return {rooms:roomResult.data||[],packages:packageResult.data||[]}
}

async function rebuildDaily(admin:any,start:string,end:string,rooms:any[]){
  const stayResult=await admin.from('reservation_stays').select('*').eq('active',true).lte('arrival_date',end).gte('checkout_date',start)
  if(stayResult.error) throw new Error(stayResult.error.message)
  const stays=stayResult.data||[]
  const links:any[]=[]
  const hsk:any[]=[]

  const blockedResult=await admin.from('housekeeping_daily_rooms')
    .select('service_date,room_id,reservation_status')
    .gte('service_date',start).lte('service_date',end)
    .eq('reservation_status','Blocked')
  if(blockedResult.error) throw new Error(blockedResult.error.message)
  const blocked=new Set((blockedResult.data||[]).map((row:any)=>String(row.service_date)+'|'+String(row.room_id)))

  for(const date of eachDate(start,end)){
    for(const room of rooms){
      const roomStays=stays.filter((stay:any)=>String(stay.room_id)===String(room.id))
      const arriving=roomStays.find((stay:any)=>stay.arrival_date===date)||null
      const departing=roomStays.find((stay:any)=>stay.checkout_date===date)||null
      const staying=roomStays.find((stay:any)=>stay.arrival_date<date && stay.checkout_date>date)||null
      let status='Vacant'
      if(arriving && departing && String(arriving.id)!==String(departing.id)) status='Out/In'
      else if(arriving) status='Arrival'
      else if(departing) status='Checkout'
      else if(staying) status='Stayover'
      const primary=arriving||staying||departing||null

      links.push({
        service_date:date,
        room_id:room.id,
        reservation_status:status,
        primary_reservation_id:primary?.id||null,
        arriving_reservation_id:arriving?.id||null,
        stay_reservation_id:staying?.id||null,
        departing_reservation_id:departing?.id||null,
        updated_at:new Date().toISOString()
      })

      if(!blocked.has(date+'|'+room.id)){
        hsk.push({service_date:date,room_id:room.id,reservation_status:status,updated_at:new Date().toISOString()})
      }
    }
  }

  if(links.length){
    const result=await admin.from('reservation_daily_links').upsert(links,{onConflict:'service_date,room_id'})
    if(result.error) throw new Error(result.error.message)
  }
  if(hsk.length){
    const result=await admin.from('housekeeping_daily_rooms').upsert(hsk,{onConflict:'service_date,room_id'})
    if(result.error) throw new Error(result.error.message)
  }
}

async function syncPackages(admin:any,stays:any[],packages:any[]){
  const ids=stays.map(row=>row.id).filter(Boolean)
  if(!ids.length) return 0

  const clear=await admin.from('housekeeping_room_packages').delete().eq('source','reservation_sync').in('reservation_id',ids)
  if(clear.error) throw new Error(clear.error.message)

  const catalog=packages.map((pkg:any)=>({id:pkg.id,name:pkg.name,norm:normal(pkg.name)}))
  const inserts:any[]=[]

  for(const stay of stays){
    const raw=String(stay.products_raw||'')
    if(!raw.trim()) continue
    const requested=raw.split(/;|\n/).map(normal).filter(Boolean)
    for(const req of requested){
      let match=catalog.find((pkg:any)=>pkg.norm===req)
      if(!match) match=catalog.find((pkg:any)=>req.includes(pkg.norm)||pkg.norm.includes(req))
      if(!match) continue
      inserts.push({
        service_date:stay.arrival_date,
        room_id:stay.room_id,
        package_id:match.id,
        source:'reservation_sync',
        reservation_id:stay.id
      })
    }
  }

  const unique=[...new Map(inserts.map(row=>[String(row.service_date)+'|'+String(row.room_id)+'|'+String(row.package_id)+'|'+String(row.reservation_id),row])).values()]
  if(unique.length){
    const result=await admin.from('housekeeping_room_packages').insert(unique)
    if(result.error) throw new Error(result.error.message)
  }
  return unique.length
}

export async function GET(req:NextRequest){
  const access=await getStaffAccess()
  if(!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  if(!canSync(access)) return NextResponse.json({error:'Forbidden'},{status:403})

  const date=req.nextUrl.searchParams.get('date')
  if(!validDate(date)) return NextResponse.json({error:'Invalid date'},{status:400})

  const admin=createSupabaseAdmin()

  try{
    const base=await loadBase(admin)
    const batchResult=await admin.from('reservation_import_batches').select('*').order('created_at',{ascending:false}).limit(8)
    if(batchResult.error) throw new Error(batchResult.error.message)

    const verifyResult=await admin.from('reservation_daily_verifications').select('*').eq('service_date',date).maybeSingle()
    if(verifyResult.error) throw new Error(verifyResult.error.message)

    const linkResult=await admin.from('reservation_daily_links').select('*').eq('service_date',date)
    if(linkResult.error) throw new Error(linkResult.error.message)
    const links=linkResult.data||[]

    const ids=[...new Set(links.flatMap((row:any)=>[
      row.primary_reservation_id,row.arriving_reservation_id,row.stay_reservation_id,row.departing_reservation_id
    ]).filter(Boolean).map(String))]

    let stays:any[]=[]
    if(ids.length){
      const stayResult=await admin.from('reservation_stays').select('*').in('id',ids)
      if(stayResult.error) throw new Error(stayResult.error.message)
      stays=stayResult.data||[]
    }

    const stayById=new Map(stays.map((row:any)=>[String(row.id),row]))
    const linkByRoom=new Map(links.map((row:any)=>[String(row.room_id),row]))

    const daily=base.rooms.map((room:any)=>{
      const link:any=linkByRoom.get(String(room.id))
      return {
        roomId:room.id,
        roomName:room.name,
        status:link?.reservation_status||'Vacant',
        primary:link?.primary_reservation_id?stayById.get(String(link.primary_reservation_id))||null:null,
        arriving:link?.arriving_reservation_id?stayById.get(String(link.arriving_reservation_id))||null:null,
        staying:link?.stay_reservation_id?stayById.get(String(link.stay_reservation_id))||null:null,
        departing:link?.departing_reservation_id?stayById.get(String(link.departing_reservation_id))||null:null
      }
    })

    return NextResponse.json({
      rooms:base.rooms,
      batches:batchResult.data||[],
      verification:verifyResult.data||null,
      daily
    })
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Could not load Reservation Sync.'},{status:500})
  }
}

export async function POST(req:NextRequest){
  const access=await getStaffAccess()
  if(!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  if(!canSync(access)) return NextResponse.json({error:'Forbidden'},{status:403})

  const body=await req.json().catch(()=>null)
  const admin=createSupabaseAdmin()

  try{
    const base=await loadBase(admin)
    const roomNames=base.rooms.map((room:any)=>String(room.name))

    if(body?.action==='preview'){
      const pages=Array.isArray(body.pages)?body.pages.map(String):[]
      if(!pages.length) return NextResponse.json({error:'No PDF pages were received.'},{status:400})

      const parsed=parseArrivalReportPages(pages,roomNames)
      const keys=parsed.reservations.map(row=>row.reservationKey)
      let existing:any[]=[]

      if(keys.length){
        const existingResult=await admin.from('reservation_stays').select('*').in('reservation_key',keys)
        if(existingResult.error) throw new Error(existingResult.error.message)
        existing=existingResult.data||[]
      }

      const oldByKey=new Map(existing.map((row:any)=>[String(row.reservation_key),row]))
      const roomIdByName=new Map(base.rooms.map((room:any)=>[String(room.name),String(room.id)]))
      const tracked:any={
        guestName:'guest_name',phone:'guest_phone',doorCode:'door_code',arrivalDate:'arrival_date',checkoutDate:'checkout_date',
        occupancy:'occupancy',ratePlan:'rate_plan',checkInTime:'check_in_time',productsRaw:'products_raw',
        dietaryRestrictions:'dietary_restrictions',referralSource:'referral_source',reasonForVisit:'reason_for_visit',
        guestComments:'guest_comments',innkeeperNotes:'innkeeper_notes'
      }

      const reservations=parsed.reservations.map(row=>{
        const old:any=oldByKey.get(row.reservationKey)
        const changedFields:any={}
        if(old){
          for(const key of Object.keys(tracked)){
            const before=old[tracked[key]]??null
            const after=(row as any)[key]??null
            if(String(before??'')!==String(after??'')) changedFields[key]={before,after}
          }
          const beforeRoom=String(old.room_id||'')
          const afterRoom=row.roomName?String(roomIdByName.get(row.roomName)||''):''
          if(beforeRoom!==afterRoom) changedFields.roomName={before:beforeRoom,after:afterRoom}
        }

        return {
          ...row,
          changeType:!old?'new':Object.keys(changedFields).length?'updated':'unchanged',
          changedFields,
          include:!row.needsReview
        }
      })

      return NextResponse.json({...parsed,reservations})
    }

    if(body?.action==='verify'){
      if(!validDate(body.serviceDate)) return NextResponse.json({error:'Invalid date'},{status:400})
      const result=await admin.from('reservation_daily_verifications').upsert({
        service_date:body.serviceDate,
        verified_by:access.userId,
        verified_at:new Date().toISOString()
      },{onConflict:'service_date'})
      if(result.error) throw new Error(result.error.message)
      return NextResponse.json({ok:true})
    }

    if(body?.action==='commit'){
      const rawRows=Array.isArray(body.reservations)?body.reservations.filter((row:any)=>row.include):[]
      if(!rawRows.length) return NextResponse.json({error:'No reservations are selected.'},{status:400})

      const rows=rawRows.map((row:any)=>normalizeEditedReservation(row,roomNames))
      const invalid=rows.filter(row=>row.needsReview)
      if(invalid.length) return NextResponse.json({error:'Some selected rows still need correction.',invalid},{status:400})

      const starts=rows.map(row=>String(row.arrivalDate)).sort()
      const ends=rows.map(row=>String(row.checkoutDate)).sort()
      const start=validDate(body.reportStartDate)?body.reportStartDate:starts[0]
      const reportEnd=validDate(body.reportEndDate)?body.reportEndDate:ends[ends.length-1]
      const end=ends[ends.length-1]>reportEnd?ends[ends.length-1]:reportEnd
      const now=new Date().toISOString()

      const batchResult=await admin.from('reservation_import_batches').insert({
        file_name:String(body.fileName||'Arrival Report.pdf'),
        report_start_date:start,
        report_end_date:reportEnd,
        status:'previewed',
        records_detected:Array.isArray(body.reservations)?body.reservations.length:rows.length,
        records_imported:0,
        warning_count:Number(body.warningCount||0),
        warnings:Array.isArray(body.warnings)?body.warnings:[],
        imported_by:access.userId
      }).select('*').single()
      if(batchResult.error) throw new Error(batchResult.error.message)
      const batch=batchResult.data

      const roomIdByName=new Map(base.rooms.map((room:any)=>[String(room.name),String(room.id)]))
      const payloads=rows.map(row=>({
        reservation_key:row.reservationKey,
        reservation_number:row.reservationNumber,
        guest_name:row.guestName,
        guest_phone:row.phone,
        door_code:row.doorCode,
        arrival_date:row.arrivalDate,
        checkout_date:row.checkoutDate,
        room_id:roomIdByName.get(String(row.roomName))||null,
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
        last_import_batch_id:batch.id,
        last_seen_at:now,
        updated_at:now
      }))

      const saveResult=await admin.from('reservation_stays').upsert(payloads,{onConflict:'reservation_key'}).select('*')
      if(saveResult.error) throw new Error(saveResult.error.message)
      const saved=saveResult.data||[]

      await rebuildDaily(admin,start,end,base.rooms)
      const packageCount=await syncPackages(admin,saved,base.packages)

      const finishResult=await admin.from('reservation_import_batches').update({
        status:'committed',
        records_imported:saved.length,
        committed_at:now,
        updated_at:now
      }).eq('id',batch.id)
      if(finishResult.error) throw new Error(finishResult.error.message)

      return NextResponse.json({ok:true,imported:saved.length,start,end,packageCount,batchId:batch.id})
    }

    return NextResponse.json({error:'Unknown action'},{status:400})
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Reservation Sync failed.'},{status:500})
  }
}
