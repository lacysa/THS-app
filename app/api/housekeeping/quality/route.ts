import { NextRequest,NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic='force-dynamic'

function todayHotel(){
  return new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Detroit',
    year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date())
}

function addDays(value:string,amount:number){
  const d=new Date(value+'T12:00:00Z')
  d.setUTCDate(d.getUTCDate()+amount)
  return d.toISOString().slice(0,10)
}

function weekStart(value:string){
  const d=new Date(value+'T12:00:00Z')
  const day=d.getUTCDay()
  const offset=day===0?-6:1-day
  d.setUTCDate(d.getUTCDate()+offset)
  return d.toISOString().slice(0,10)
}

function pct(n:number,d:number){
  return d?Math.round((n/d)*1000)/10:0
}


// Small, conservative rules: only classify clear words, and allow multiple findings in one note.
// Unrecognized text remains "Other / review" rather than fabricating a defect.
function correctionCategories(value:string){
  const text=value.toLowerCase()
  const found=new Set<string>()
  if(/(?:water\s*spot|spotty|streak|fingerprint|smudge|cloudy).{0,45}(?:glass|cup|mirror|window)|(?:glass|cup|mirror|window).{0,45}(?:water\s*spot|spotty|streak|fingerprint|smudge|cloudy)/i.test(text))found.add('Glassware & mirrors: spots / streaks')
  if(/(?:glass|glasses|cup|mirror|window).{0,50}(?:polish|buff)|(?:polish|buff).{0,50}(?:glass|glasses|cup|mirror|window)/i.test(text))found.add('Glassware & mirrors: polishing')
  if(/(?:missing|no|short|not enough|forgot).{0,40}(?:hanger|towel|robe|toiletr|amenit|supply)|(?:hanger|towel|robe).{0,25}missing/i.test(text))found.add('Missing amenities & supplies')
  if(/(?:water left|standing water|sink full|wet sink|water in the).{0,40}(?:sink|basin)|(?:sink|basin).{0,40}(?:water left|standing water)/i.test(text))found.add('Sink / kitchenette: water left')
  if(/(?:hair|dust|crumb|debris|dirt|dirty|trash|residue|stain|grease|sticky|not wiped|not cleaned)/i.test(text))found.add('Cleaning / surface debris')
  if(/(?:bed|sheet|pillow|linen|comforter|blanket).{0,25}(?:wrinkl|stain|dirty|missing|hair|incorrect)|(?:wrinkl|stain).{0,20}(?:bed|sheet|linen)/i.test(text))found.add('Bed & linens')
  if(/(?:toilet|shower|tub|bathroom).{0,35}(?:dirty|hair|stain|soap|residue|water|spot)/i.test(text))found.add('Bathroom cleaning')
  if(/(?:broken|damaged|not working|leak|clog)/i.test(text))found.add('Maintenance / damage')
  return [...found].length?[...found]:['Other / review']
}

export async function GET(req:NextRequest){
  const access=await getStaffAccess()
  if(!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  const manager=access.isAdmin||access.capabilities.some(c=>['manager','general_manager','operations_manager','owner'].includes(c))
  if(!manager) return NextResponse.json({error:'Manager access required.'},{status:403})

  const requested=Number(req.nextUrl.searchParams.get('days')||30)
  const days=[30,60,90].includes(requested)?requested:30
  const end=todayHotel()
  const start=addDays(end,-(days-1))
  const admin=createSupabaseAdmin()
  const historyId=req.nextUrl.searchParams.get('history')
  if(historyId){
    if(!/^[a-f0-9-]{36}$/i.test(historyId)) return NextResponse.json({error:'Invalid correction ID.'},{status:400})
    const {data:events,error:eventError}=await admin.from('housekeeping_correction_events').select('id').eq('id',historyId).eq('event_type','found').maybeSingle()
    if(eventError) return NextResponse.json({error:eventError.message},{status:500})
    if(!events) return NextResponse.json({error:'Correction not found.'},{status:404})
    const {data:history,error:historyError}=await admin.from('housekeeping_correction_review_history')
      .select('id,previous_categories,categories,previous_reviewed_at,reviewed_at,changed_by,changed_at')
      .eq('correction_event_id',historyId).order('changed_at',{ascending:false}).limit(30)
    if(historyError) return NextResponse.json({error:historyError.message},{status:500})
    const ids=[...new Set((history||[]).map((row:any)=>row.changed_by).filter(Boolean))]
    const {data:staff}=ids.length?await admin.from('staff_members').select('id,name').in('id',ids):{data:[]}
    const names=new Map((staff||[]).map((p:any)=>[String(p.id),String(p.name||'Staff')]))
    return NextResponse.json({history:(history||[]).map((row:any)=>({
      id:row.id,previousCategories:row.previous_categories||[],categories:row.categories||[],
      reviewedAt:row.reviewed_at,previousReviewedAt:row.previous_reviewed_at,
      changedAt:row.changed_at,changedBy:names.get(String(row.changed_by))||'Former staff'
    }))})
  }

  try{
    const [{data:checks,error:checkErr},{data:discrepancies,error:discErr},{data:people,error:peopleErr},{data:items,error:itemErr},{data:corrections,error:correctionErr},{data:dailyAssignments,error:assignErr},{data:roomNames,error:roomErr}]=await Promise.all([
      admin.from('housekeeping_quality_checks')
        .select('id,service_date,room_id,stage,housekeeper_id,actor_id,status,submitted_at')
        .gte('service_date',start)
        .lte('service_date',end)
        .in('stage',['inspection','recheck'])
        .order('service_date'),
      admin.from('housekeeping_quality_discrepancies')
        .select('id,service_date,room_id,housekeeper_id,inspector_id,item_id,inspection_check_id,detected_at,corrected_at')
        .gte('service_date',start)
        .lte('service_date',end),
      admin.from('staff_members').select('id,name,auth_user_id,job_title').eq('active',true),
      admin.from('room_check_items').select('id,zone,label').eq('active',true),
      admin.from('housekeeping_correction_events').select('id,service_date,room_id,event_type,note,created_at').gte('service_date',start).lte('service_date',end).order('created_at',{ascending:false}).limit(1000),
      admin.from('housekeeping_daily_rooms').select('service_date,room_id,assigned_to,notes,updated_by,created_at,completed_at,complete,reservation_status,service_type,room_condition,strip_hold').gte('service_date',start).lte('service_date',end),
      admin.from('rooms').select('id,name')
    ])
    const error=checkErr||discErr||peopleErr||itemErr||correctionErr||assignErr||roomErr
    if(error) throw new Error(error.message)

    // Daily room notes are where Hospitality Assistants and housekeepers
    // record observations; preserve them independently of formal correction
    // counts and never treat a note as a failed inspection by itself.
    const roomNameMap=new Map((roomNames||[]).map((room:any)=>[String(room.id),String(room.name)]))
    const staffByUser=new Map((people||[]).filter((person:any)=>person.auth_user_id)
      .map((person:any)=>[String(person.auth_user_id),String(person.name)]))
    const roomTeamNotes=(dailyAssignments||[]).filter((row:any)=>String(row.notes||'').trim())
      .map((row:any)=>({id:String(row.room_id)+':'+String(row.service_date),serviceDate:String(row.service_date),
       roomName:roomNameMap.get(String(row.room_id))||'Room',note:String(row.notes).trim(),
       recordUpdatedBy:staffByUser.get(String(row.updated_by||''))||''}))
      .sort((a,b)=>b.serviceDate.localeCompare(a.serviceDate)||a.roomName.localeCompare(b.roomName))
    const foundIds=(corrections||[]).filter((event:any)=>event.event_type==='found').map((event:any)=>String(event.id))
    const {data:reviews,error:reviewError}=foundIds.length
      ? await admin.from('housekeeping_correction_reviews')
        .select('correction_event_id,categories,reviewed_at,reviewed_by').in('correction_event_id',foundIds)
      : {data:[],error:null}
    if(reviewError) throw new Error(reviewError.message)
    const reviewById=new Map((reviews||[]).map((row:any)=>[String(row.correction_event_id),row]))
    const reviewerNames=new Map((people||[]).map((person:any)=>[String(person.id),String(person.name||'Staff')]))

    // Room Operations correction history is an independent source from formal checklist inspections.
    // Count each "found" once; its matching "fixed" event is resolution, not another miss.
    const assignmentByRoomDay=new Map((dailyAssignments||[]).map((row:any)=>[
      String(row.service_date)+'|'+String(row.room_id),String(row.assigned_to||'').trim()
    ]))
    const roomNameById=new Map((roomNames||[]).map((row:any)=>[String(row.id),String(row.name||'Room')]))
    const idsByName=new Map<string,string[]>()
    for(const person of people||[]){
      const key=String((person as any).name||'').trim().toLowerCase()
      idsByName.set(key,[...(idsByName.get(key)||[]),String((person as any).id)])
    }
    const resolvedCorrectionIds=new Set<string>()
    const pendingByRoomDay=new Map<string,string[]>()
    // A fix description is different from the original inspection complaint.
    // Resolve each most-recent outstanding correction by room and date, not
    // by matching the two note strings.
    for(const event of [...(corrections||[])].reverse()){
      const key=String(event.service_date)+'|'+String(event.room_id)
      const pending=pendingByRoomDay.get(key)||[]
      if(event.event_type==='found'){pending.push(String(event.id));pendingByRoomDay.set(key,pending)}
      else if(event.event_type==='fixed'&&pending.length){resolvedCorrectionIds.add(pending.pop()!)}
    }
    const documentedCorrections=(corrections||[])
      .filter((event:any)=>event.event_type==='found')
      .map((event:any)=>{
        const assignment=assignmentByRoomDay.get(String(event.service_date)+'|'+String(event.room_id))||''
        // Do not guess if there are multiple cleaners or ambiguous names.
        const matchedIds=idsByName.get(assignment.toLowerCase())||[]
        const housekeeperId=matchedIds.length===1?matchedIds[0]:null
        const review:any=reviewById.get(String(event.id))
        return {id:String(event.id),serviceDate:String(event.service_date),roomName:roomNameById.get(String(event.room_id))||'Room',
          housekeeperId,housekeeperName:housekeeperId?assignment:null,assignedTo:assignment||null,
          note:String(event.note||''),categories:review?.categories?.length?review.categories:correctionCategories(String(event.note||'')),
          reviewedAt:review?.reviewed_at||null,reviewedBy:review?.reviewed_by?reviewerNames.get(String(review.reviewed_by))||'Former staff':null,
          resolved:resolvedCorrectionIds.has(String(event.id)),createdAt:String(event.created_at)}
      })
    const categoryCounts=new Map<string,number>()
    for(const entry of documentedCorrections)for(const category of entry.categories)categoryCounts.set(category,(categoryCounts.get(category)||0)+1)
    const correctionCategoriesSummary=[...categoryCounts].map(([category,count])=>({category,count})).sort((a,b)=>b.count-a.count||a.category.localeCompare(b.category))
    const documentedByHousekeeper=new Map<string,typeof documentedCorrections>()
    for(const entry of documentedCorrections){
      if(!entry.housekeeperId)continue
      const previous=documentedByHousekeeper.get(entry.housekeeperId)||[]
      previous.push(entry)
      documentedByHousekeeper.set(entry.housekeeperId,previous)
    }

    const nameById=new Map((people||[]).map((p:any)=>[String(p.id),String(p.name||'Staff')]))
    const itemById=new Map((items||[]).map((i:any)=>[String(i.id),{label:String(i.label||'Checklist item'),zone:String(i.zone||'Other')}]))

    // Beginning 2026-10-22, report record-to-completion elapsed time, not
    // hands-on cleaning duration (the app does not store a clean-start event).
    // Exclude refreshes, shared assignments, and records made before service day.
    const turnaroundStart=start>'2026-10-22'?start:'2026-10-22'
    const turnaroundByPerson=new Map<string,number[]>()
    for(const room of dailyAssignments||[]){
      if(String(room.service_date)<turnaroundStart||!room.complete||!room.completed_at||!room.created_at)continue
      const activity=String(room.reservation_status||'').toLowerCase()
      const service=String(room.service_type||'').toUpperCase()
      const condition=String(room.room_condition||'').toLowerCase()
      if(activity==='stayover'||activity==='blocked'||String(room.strip_hold||'').toLowerCase().includes('hold'))continue
      const isFull=['checkout','out/in','dirty'].includes(activity)||/^OUT(?:-[A-Z]{2,4})?$/.test(service)||(activity==='arrival'||activity==='vacant')&&/dirty|cleaning/.test(condition)
      if(!isFull)continue
      const assignment=String(room.assigned_to||'').trim()
      if(!assignment||/[,&;/]|\s+\+\s+/.test(assignment))continue
      const ids=idsByName.get(assignment.toLowerCase())||[]
      if(ids.length!==1)continue
      const created=Date.parse(String(room.created_at)),finished=Date.parse(String(room.completed_at))
      if(!Number.isFinite(created)||!Number.isFinite(finished)||String(room.created_at).slice(0,10)<String(room.service_date))continue
      const minutes=(finished-created)/60000
      if(minutes<=0||minutes>1080)continue
      turnaroundByPerson.set(ids[0],[...(turnaroundByPerson.get(ids[0])||[]),minutes])
    }
    const turnaround=[...turnaroundByPerson.entries()].map(([housekeeperId,values])=>({
      housekeeperId,name:nameById.get(housekeeperId)||'Former staff member',
      rooms:values.length,averageMinutes:Math.round(values.reduce((a,b)=>a+b,0)/values.length),
      minMinutes:Math.round(Math.min(...values)),maxMinutes:Math.round(Math.max(...values))
    })).sort((a,b)=>a.averageMinutes-b.averageMinutes||a.name.localeCompare(b.name))

    const firstInspections=(checks||[]).filter((c:any)=>c.stage==='inspection')
    const rechecks=(checks||[]).filter((c:any)=>c.stage==='recheck')
    const firstPasses=firstInspections.filter((c:any)=>c.status==='pass').length
    const unresolved=(discrepancies||[]).filter((d:any)=>!d.corrected_at).length

    const correctionMinutes=(discrepancies||[])
      .filter((d:any)=>d.corrected_at&&d.detected_at)
      .map((d:any)=>(new Date(d.corrected_at).getTime()-new Date(d.detected_at).getTime())/60000)
      .filter((v:number)=>Number.isFinite(v)&&v>=0)

    const department={
      roomsInspected:firstInspections.length,
      firstPasses,
      firstPassRate:pct(firstPasses,firstInspections.length),
      discrepancies:(discrepancies||[]).length,
      missesPer100Rooms:firstInspections.length?Math.round(((discrepancies||[]).length/firstInspections.length)*1000)/10:0,
      rechecks:rechecks.length,
      unresolved,
      averageCorrectionMinutes:correctionMinutes.length?Math.round(correctionMinutes.reduce((a:number,b:number)=>a+b,0)/correctionMinutes.length):null
    }

    const weeklyMap=new Map<string,{week:string;inspections:number;passes:number;discrepancies:number}>()
    for(const check of firstInspections as any[]){
      const week=weekStart(String(check.service_date))
      const row=weeklyMap.get(week)||{week,inspections:0,passes:0,discrepancies:0}
      row.inspections+=1
      if(check.status==='pass') row.passes+=1
      weeklyMap.set(week,row)
    }
    for(const disc of discrepancies||[]){
      const week=weekStart(String((disc as any).service_date))
      const row=weeklyMap.get(week)||{week,inspections:0,passes:0,discrepancies:0}
      row.discrepancies+=1
      weeklyMap.set(week,row)
    }
    const weekly=[...weeklyMap.values()]
      .sort((a,b)=>a.week.localeCompare(b.week))
      .map(row=>({...row,firstPassRate:pct(row.passes,row.inspections)}))

    const housekeeperIds=new Set<string>()
    for(const check of firstInspections as any[]) if(check.housekeeper_id) housekeeperIds.add(String(check.housekeeper_id))
    for(const disc of discrepancies||[]) if((disc as any).housekeeper_id) housekeeperIds.add(String((disc as any).housekeeper_id))
    for(const id of documentedByHousekeeper.keys()) housekeeperIds.add(id)

    const individuals=[...housekeeperIds].map(id=>{
      const inspections=(firstInspections as any[]).filter(c=>String(c.housekeeper_id||'')===id)
      const passes=inspections.filter(c=>c.status==='pass').length
      const personDiscs=(discrepancies||[]).filter((d:any)=>String(d.housekeeper_id||'')===id)
      const missCounts=new Map<string,number>()
      for(const disc of personDiscs as any[]){
        const itemId=String(disc.item_id||'')
        missCounts.set(itemId,(missCounts.get(itemId)||0)+1)
      }
      const commonMisses=[...missCounts.entries()]
        .map(([itemId,count])=>({itemId,count,...(itemById.get(itemId)||{label:'Checklist item',zone:'Other'})}))
        .sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label))
        .slice(0,3)
      return {
        housekeeperId:id,
        name:nameById.get(id)||'Former staff member',
        roomsInspected:inspections.length,
        firstPasses:passes,
        firstPassRate:pct(passes,inspections.length),
        discrepancies:personDiscs.length,
        missesPer100Rooms:inspections.length?Math.round((personDiscs.length/inspections.length)*1000)/10:0,
        unresolved:personDiscs.filter((d:any)=>!d.corrected_at).length,
        commonMisses,
        documentedCorrections:documentedByHousekeeper.get(id)||[]
      }
    }).sort((a,b)=>b.roomsInspected-a.roomsInspected||a.name.localeCompare(b.name))

    const missCounts=new Map<string,number>()
    for(const disc of discrepancies||[]){
      const itemId=String((disc as any).item_id||'')
      missCounts.set(itemId,(missCounts.get(itemId)||0)+1)
    }
    const commonMisses=[...missCounts.entries()]
      .map(([itemId,count])=>({itemId,count,...(itemById.get(itemId)||{label:'Checklist item',zone:'Other'})}))
      .sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label))
      .slice(0,10)

    return NextResponse.json({
      range:{days,start,end},
      department,
      weekly,
      turnaround:{start:turnaroundStart,end,rows:turnaround},
      individuals,
      commonMisses,
      documentedCorrections,
      roomTeamNotes,
      correctionCategoriesSummary
    })
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Could not load housekeeping quality trends.'},{status:500})
  }
}

export async function PATCH(req:NextRequest){
  const access=await getStaffAccess()
  if(!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  const manager=access.isAdmin||access.capabilities.some(c=>['manager','general_manager','operations_manager','owner'].includes(c))
  if(!manager||access.isPreviewMode) return NextResponse.json({error:'Manager access required.'},{status:403})

  const body=await req.json().catch(()=>null)
  const id=String(body?.correctionId||'')
  const action=body?.action
  if(!/^[a-f0-9-]{36}$/i.test(id)||!['save','review'].includes(action)||!Array.isArray(body?.categories)){
    return NextResponse.json({error:'Invalid correction review.'},{status:400})
  }
  const categories=[...new Set((body.categories as unknown[]).filter((v):v is string=>typeof v==='string').map(v=>v.trim()))]
  if(categories.length<1||categories.length>8||categories.some(c=>c.length<2||c.length>80||/[\x00-\x1f<>]/.test(c))){
    return NextResponse.json({error:'Choose 1–8 categories of 2–80 characters each.'},{status:400})
  }

  const admin=createSupabaseAdmin()
  const [{data:correction,error:correctionError},{data:staff,error:staffError}]=await Promise.all([
    admin.from('housekeeping_correction_events').select('id').eq('id',id).eq('event_type','found').maybeSingle(),
    admin.from('staff_members').select('id,name').eq('auth_user_id',access.userId).eq('active',true).maybeSingle()
  ])
  if(correctionError||staffError) return NextResponse.json({error:correctionError?.message||staffError?.message},{status:500})
  if(!correction) return NextResponse.json({error:'Correction not found.'},{status:404})
  if(!staff) return NextResponse.json({error:'Your account is not linked to an active staff member.'},{status:403})

  const reviewedAt=action==='review'?new Date().toISOString():null
  const {data,error}=await admin.from('housekeeping_correction_reviews').upsert({
    correction_event_id:id,categories,reviewed_at:reviewedAt,
    reviewed_by:reviewedAt?staff.id:null,updated_by:staff.id,updated_at:new Date().toISOString()
  },{onConflict:'correction_event_id'})
    .select('correction_event_id,categories,reviewed_at').single()
  if(error) return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({ok:true,correctionId:id,categories:data.categories,reviewedAt:data.reviewed_at,reviewedBy:reviewedAt?staff.name:null})
}
