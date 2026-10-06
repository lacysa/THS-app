// @ts-nocheck
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

async function loadRooms(admin:any){
  const roomResult=await admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order')
  if(roomResult.error) throw new Error(roomResult.error.message)
  return roomResult.data||[]
}

async function loadPackages(admin:any){
  const packageResult=await admin.from('room_package_catalog').select('id,name,available').order('sort_order')
  if(packageResult.error) throw new Error(packageResult.error.message)
  return packageResult.data||[]
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

  const unique=[...new Map<string,any>(inserts.map((row:any)=>[String(row.service_date)+'|'+String(row.room_id)+'|'+String(row.package_id)+'|'+String(row.reservation_id),row] as [string,any])).values()]
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
    const [rooms,batchResult,verifyResult]=await Promise.all([
      loadRooms(admin),
      admin.from('reservation_import_batches').select('id,file_name,report_start_date,report_end_date,status,records_imported,created_at,committed_at').order('created_at',{ascending:false}).limit(8),
      admin.from('reservation_daily_verifications').select('*').eq('service_date',date).maybeSingle()
    ])

    if(batchResult.error) throw new Error(batchResult.error.message)
    if(verifyResult.error) throw new Error(verifyResult.error.message)

    return NextResponse.json({
      rooms,
      batches:batchResult.data||[],
      verification:verifyResult.data||null
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
    if(body?.action==='previewStructured'){
      const incoming=Array.isArray(body.reservations)?body.reservations:[]
      if(!incoming.length) return NextResponse.json({error:'No reservation rows were received from the PMS report.'},{status:400})
      const rooms=await loadRooms(admin)
      const roomIdByName=new Map<string,string>(rooms.map((room:any)=>[String(room.name),String(room.id)] as [string,string]))
      const reservations=incoming.map((row:any)=>({
        ...row,
        phone:null,
        reservationKey:String(row.reservationKey||''),
        reservationNumber:row.reservationNumber?String(row.reservationNumber):null,
        guestName:String(row.guestName||'').trim(),
        doorCode:String(row.doorCode||'').replace(/\D/g,'').slice(-4)||null,
        arrivalDate:validDate(row.arrivalDate)?row.arrivalDate:null,
        checkoutDate:validDate(row.checkoutDate)?row.checkoutDate:null,
        roomName:rooms.find((room:any)=>String(room.name)===String(row.roomName))?.name||row.roomName||null,
        occupancy:Number(row.occupancy)||null,
        ratePlan:row.ratePlan?String(row.ratePlan).trim():null,
        checkInTime:row.checkInTime?String(row.checkInTime).trim():null,
        productsRaw:row.productsRaw?String(row.productsRaw).trim():null,
        dietaryRestrictions:row.dietaryRestrictions?String(row.dietaryRestrictions).trim():null,
        referralSource:row.referralSource?String(row.referralSource).trim():null,
        reasonForVisit:row.reasonForVisit?String(row.reasonForVisit).trim():null,
        guestComments:row.guestComments?String(row.guestComments).trim():null,
        innkeeperNotes:row.innkeeperNotes?String(row.innkeeperNotes).trim():null,
        sourcePage:0,
        rawText:String(row.rawText||''),
        confidence:100,
        warnings:Array.isArray(row.warnings)?row.warnings:[],
        needsReview:Boolean(row.needsReview)
      }))

      const keys=reservations.map((row:any)=>row.reservationKey).filter(Boolean)
      let existing:any[]=[]
      if(keys.length){
        const existingResult=await admin.from('reservation_stays')
          .select('reservation_key,room_id,guest_name,door_code,arrival_date,checkout_date,occupancy,rate_plan,check_in_time,products_raw,dietary_restrictions,referral_source,reason_for_visit,guest_comments,innkeeper_notes')
          .in('reservation_key',keys)
        if(existingResult.error) throw new Error(existingResult.error.message)
        existing=existingResult.data||[]
      }

      const oldByKey=new Map<string,any>(existing.map((row:any)=>[String(row.reservation_key),row] as [string,any]))
      const tracked:any={guestName:'guest_name',doorCode:'door_code',arrivalDate:'arrival_date',checkoutDate:'checkout_date',occupancy:'occupancy',ratePlan:'rate_plan',checkInTime:'check_in_time',productsRaw:'products_raw',dietaryRestrictions:'dietary_restrictions',referralSource:'referral_source',reasonForVisit:'reason_for_visit',guestComments:'guest_comments',innkeeperNotes:'innkeeper_notes'}

      const compared=reservations.map((row:any)=>{
        const old:any=oldByKey.get(row.reservationKey)
        const changedFields:any={}
        if(old){
          for(const key of Object.keys(tracked)){
            const before=old[tracked[key]]??null
            const after=row[key]??null
            if(String(before??'')!==String(after??'')) changedFields[key]={before,after}
          }
          const beforeRoom=String(old.room_id||'')
          const afterRoom=row.roomName?String(roomIdByName.get(String(row.roomName))||''):''
          if(beforeRoom!==afterRoom) changedFields.roomName={before:beforeRoom,after:afterRoom}
        }
        return {...row,changeType:!old?'new':Object.keys(changedFields).length?'updated':'unchanged',changedFields,include:!row.needsReview}
      })

      const starts=compared.map((row:any)=>row.arrivalDate).filter(validDate).sort()
      const ends=compared.map((row:any)=>row.checkoutDate).filter(validDate).sort()
      const warnings=[]
      const reviewCount=compared.filter((row:any)=>row.needsReview).length
      if(reviewCount) warnings.push(String(reviewCount)+' reservation'+(reviewCount===1?'':'s')+' need review before import.')

      return NextResponse.json({reportStartDate:starts[0]||null,reportEndDate:ends[ends.length-1]||null,warnings,reservations:compared})
    }
    if(body?.action==='preview'){
      const pages=Array.isArray(body.pages)?body.pages.map(String):[]
      if(!pages.length) return NextResponse.json({error:'No report pages were received.'},{status:400})

      const rooms=await loadRooms(admin)
      const roomNames=rooms.map((room:any)=>String(room.name))
      const parsed=parseArrivalReportPages(pages,roomNames)
      const keys=parsed.reservations.map((row:any)=>row.reservationKey)
      let existing:any[]=[]

      if(keys.length){
        const existingResult=await admin.from('reservation_stays')
          .select('reservation_key,room_id,guest_name,door_code,arrival_date,checkout_date,occupancy,rate_plan,check_in_time,products_raw,dietary_restrictions,referral_source,reason_for_visit,guest_comments,innkeeper_notes')
          .in('reservation_key',keys)
        if(existingResult.error) throw new Error(existingResult.error.message)
        existing=existingResult.data||[]
      }

      const oldByKey=new Map<string,any>(existing.map((row:any)=>[String(row.reservation_key),row] as [string,any]))
      const roomIdByName=new Map<string,string>(rooms.map((room:any)=>[String(room.name),String(room.id)] as [string,string]))
      const tracked:any={
        guestName:'guest_name',doorCode:'door_code',arrivalDate:'arrival_date',checkoutDate:'checkout_date',
        occupancy:'occupancy',ratePlan:'rate_plan',checkInTime:'check_in_time',productsRaw:'products_raw',
        dietaryRestrictions:'dietary_restrictions',referralSource:'referral_source',reasonForVisit:'reason_for_visit',
        guestComments:'guest_comments',innkeeperNotes:'innkeeper_notes'
      }

      const reservations=parsed.reservations.map((row:any)=>{
        const old:any=oldByKey.get(row.reservationKey)
        const changedFields:any={}
        if(old){
          for(const key of Object.keys(tracked)){
            const before=old[tracked[key]]??null
            const after=row[key]??null
            if(String(before??'')!==String(after??'')) changedFields[key]={before,after}
          }
          const beforeRoom=String(old.room_id||'')
          const afterRoom=row.roomName?String(roomIdByName.get(row.roomName)||''):''
          if(beforeRoom!==afterRoom) changedFields.roomName={before:beforeRoom,after:afterRoom}
        }

        return {
          ...row,
          phone:null,
          changeType:!old?'new':Object.keys(changedFields).length?'updated':'unchanged',
          changedFields,
          include:!row.needsReview
        }
      })

      return NextResponse.json({
        reportStartDate:parsed.reportStartDate,
        reportEndDate:parsed.reportEndDate,
        warnings:parsed.warnings,
        reservations
      })
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
      const [rooms,packages]=await Promise.all([loadRooms(admin),loadPackages(admin)])
      const roomNames=rooms.map((room:any)=>String(room.name))
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

      const roomIdByName=new Map<string,string>(rooms.map((room:any)=>[String(room.name),String(room.id)] as [string,string]))
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

      await rebuildDaily(admin,start,end,rooms)
      const packageCount=await syncPackages(admin,saved,packages)

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
