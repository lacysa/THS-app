import {NextRequest,NextResponse} from 'next/server'
import {canUseModule} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'
import {conditionForDay,previousVacantConditions} from '@/lib/room-condition-carry'
import {roomCheckStage} from '@/lib/room-check-queue'
import {loadAssignmentStaff} from '@/lib/assignment-staff'

export const dynamic='force-dynamic'
const validDate=(value:string)=>/^20\d{2}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))
const validId=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export async function GET(req:NextRequest){
 const [opsGate,reservationGate]=await Promise.all([canUseModule('ops'),canUseModule('reservations')])
 const gate=opsGate.allowed?opsGate:reservationGate
 if(!gate.access)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(!opsGate.allowed&&!reservationGate.allowed)return NextResponse.json({error:'Forbidden'},{status:403})
 const date=req.nextUrl.searchParams.get('date')||''
 const roomId=req.nextUrl.searchParams.get('roomId')||''
 const reservationId=req.nextUrl.searchParams.get('reservationId')||''
 if(!validDate(date)||!validId(roomId)||(reservationId&&!validId(reservationId)))
   return NextResponse.json({error:'Invalid room or date'},{status:400})
 const admin=createSupabaseAdmin()
 const [roomResult,dailyResult,linkResult]=await Promise.all([
  admin.from('rooms').select('id,name').eq('id',roomId).eq('active',true).maybeSingle(),
  admin.from('housekeeping_daily_rooms').select('service_date,room_id,assigned_to,notes,reservation_status,service_type,room_condition,strip_hold,clean_order,complete,ready_for_inspection,inspected,inspected_at,check_issue_open,check_issue_note,breakfast_tag,late_arrival,housekeeper_attested_by,refresh_completed_initials,foh_signed_by,ha_signed_by,updated_by').eq('service_date',date).eq('room_id',roomId).maybeSingle(),
  admin.from('reservation_daily_links').select('reservation_status,primary_reservation_id,arriving_reservation_id,stay_reservation_id,departing_reservation_id').eq('service_date',date).eq('room_id',roomId).maybeSingle()
 ])
 if(roomResult.error||dailyResult.error||linkResult.error)
  return NextResponse.json({error:'Unable to load room operations'},{status:500})
 if(!roomResult.data)return NextResponse.json({error:'Room not found'},{status:404})
 const carry=await previousVacantConditions(admin,date,dailyResult.data?[dailyResult.data]:[])
 const daily=dailyResult.data?{...dailyResult.data,room_condition:conditionForDay(dailyResult.data,carry.get(roomId)||'')}:null
 const link=linkResult.data
 // A calendar empty-cell click is room-only, even on checkout days where
 // the daily link still points to a departing guest. Only an explicit click
 // on a reservation bar is allowed to load that guest.
 const availableIds=[link?.arriving_reservation_id,link?.stay_reservation_id,link?.primary_reservation_id,link?.departing_reservation_id].filter(Boolean).map(String)
 if(reservationId&&!availableIds.includes(reservationId))
  return NextResponse.json({error:'Selected reservation is not linked to this room on this date.'},{status:409})
 const chosen=reservationId||null
 let stay:any=null
 if(chosen){
  const result=await admin.from('reservation_stays').select('id,reservation_number,guest_name,accompanying_guest,guest_phone,arrival_date,checkout_date,occupancy,rate_plan,check_in_time,products_raw,dietary_restrictions,guest_comments,innkeeper_notes,reason_for_visit').eq('id',chosen).maybeSingle()
  if(result.error)return NextResponse.json({error:'Unable to load guest stay'},{status:500})
  stay=result.data
 }
 // Historical responsibility is informational only; never convert it into today's assignment.
 // Load one prior assignment only for an unassigned, non-occupied room.
 let lastAssigned:{name:string;date:string}|null=null
 const needsHistory=Boolean(daily)&&!String(daily?.assigned_to||'').trim()&&String(daily?.room_condition||'').trim().toLowerCase()!=='occupied'
 if(needsHistory){
  const previous=await admin.from('housekeeping_daily_rooms')
   .select('assigned_to,service_date')
   .eq('room_id',roomId)
   .lt('service_date',date)
   .not('assigned_to','is',null)
   .neq('assigned_to','')
   .order('service_date',{ascending:false})
   .limit(1)
   .maybeSingle()
  if(previous.error)return NextResponse.json({error:'Unable to load last housekeeper assignment'},{status:500})
  if(previous.data?.assigned_to)lastAssigned={name:String(previous.data.assigned_to).trim(),date:String(previous.data.service_date)}
 }
 // Stayovers show the latest VERIFIED completed clean, not merely an
 // assignment. The operational day is preserved separately from the actual
 // local completion date (a room may be cleaned the evening before arrival).
 let lastCleaned:{name:string;date:string;serviceDate:string}|null=null
 if(String(daily?.reservation_status||'').trim().toLowerCase()==='stayover'){
  const finished=await admin.from('housekeeping_daily_rooms')
   .select('assigned_to,service_date,completed_at,housekeeper_attested_by')
   .eq('room_id',roomId)
   .lte('service_date',date)
   .eq('complete',true)
   .order('service_date',{ascending:false})
   .limit(1)
   .maybeSingle()
  if(finished.error)return NextResponse.json({error:'Unable to load cleaning history'},{status:500})
  if(finished.data){
   let cleaner=String(finished.data.assigned_to||'').trim()
   if(!cleaner&&finished.data.housekeeper_attested_by){
    const person=await admin.from('staff_members').select('name')
     .eq('id',finished.data.housekeeper_attested_by).maybeSingle()
    if(person.error)return NextResponse.json({error:'Unable to identify last cleaner'},{status:500})
    cleaner=String(person.data?.name||'').trim()
   }
   let cleanedDate=String(finished.data.service_date)
   if(finished.data.completed_at){
    const finishedAt=new Date(finished.data.completed_at)
    if(!Number.isNaN(finishedAt.getTime())){
     const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(finishedAt)
     const part=(type:string)=>parts.find(item=>item.type===type)?.value||''
     cleanedDate=`${part('year')}-${part('month')}-${part('day')}`
    }
   }
   lastCleaned={name:cleaner,date:cleanedDate,serviceDate:String(finished.data.service_date)}
  }
 }
 const caps=gate.access.capabilities||[]
 const canManage=!gate.access.isPreviewMode&&(gate.access.isAdmin||caps.some((c:string)=>['manager','general_manager','operations_manager','owner'].includes(c)))
 const canInspect=!gate.access.isPreviewMode&&(gate.access.isAdmin||caps.some((c:string)=>['room_checks','ha_signoff','ha_signoff_override','manager','operations_manager','owner'].includes(c)))
 let staff:Awaited<ReturnType<typeof loadAssignmentStaff>>=[]
 try{if(canManage)staff=await loadAssignmentStaff(admin,date)}catch{
  return NextResponse.json({error:'Unable to load staff schedule'},{status:500})
 }
 const staffNames=[...new Set(staff.map(person=>person.name).filter(Boolean))]
 const mentionableStaff=staff.filter(person=>person.name).map(person=>({name:person.name,userId:person.authUserId}))
 // Keep the legacy OUT-XX envelope initial format used by Housekeeping.
 // Match the existing staff initials mapping so the same manager shows consistently.
 const managerText=[gate.access.name,gate.access.preferredName,gate.access.email].filter(Boolean).join(' ').toLowerCase()
 const ownName=String(staff.find(person=>person.authUserId===gate.access.userId)?.name||gate.access.name||'').trim()
 const nameParts=ownName.split(/\s+/).filter(Boolean)
 const managerInitials=!canManage?'':managerText.includes('sarah')||managerText.includes('lacysa')?'SL':
   managerText.includes('brittany')||managerText.includes('hollingshead')?'BH':
   managerText.includes('david')||managerText.includes('heiser')?'DH':
   nameParts.length>=2?(nameParts[0][0]+nameParts[nameParts.length-1][0]).toUpperCase():
   ownName.replace(/[^A-Za-z]/g,'').slice(0,2).toUpperCase()
 const [catalogResult,packageResult]=await Promise.all([
  admin.from('room_package_catalog').select('id,name,available').order('name'),
  admin.from('housekeeping_room_packages').select('package_id,source').eq('service_date',date).eq('room_id',roomId)
 ])
 if(catalogResult.error||packageResult.error)return NextResponse.json({error:'Unable to load room packages'},{status:500})
 const packageOptions=(catalogResult.data||[]).map((p:any)=>({id:String(p.id),name:String(p.name),available:Boolean(p.available)}))
 const manualPackageIds=(packageResult.data||[]).filter((p:any)=>p.source==='manual').map((p:any)=>String(p.package_id))
 const importedPackageIds=(packageResult.data||[]).filter((p:any)=>p.source!=='manual').map((p:any)=>String(p.package_id))
 // Keep service tracking separate from imported reservation dates and breakfast.
 const [detailResult,vacancyResult,tubHistoryResult]=await Promise.all([
  admin.from('room_ops_details').select('*').eq('room_id',roomId).eq('service_date',date).maybeSingle(),
  admin.from('housekeeping_daily_rooms').select('service_date,reservation_status,strip_hold,room_condition').eq('room_id',roomId).lte('service_date',date).order('service_date',{ascending:false}).limit(45),
  admin.from('room_ops_details').select('service_date').eq('room_id',roomId).not('tub_clean_completed_at','is',null).lte('service_date',date).order('service_date',{ascending:false}).limit(1)
 ])
 if(detailResult.error||vacancyResult.error||tubHistoryResult.error)return NextResponse.json({error:'Unable to load room service details'},{status:500})
 const history=vacancyResult.data||[]
 let vacancyDays=0
 let oldestVacancyDay=''
 let expectedDate=date
 for(const day of history){
  if(day.service_date!==expectedDate||String(day.reservation_status||'').toLowerCase()!=='vacant'||String(day.strip_hold||'').toLowerCase().includes('hold')||String(day.room_condition||'').toLowerCase()==='occupied')break
  vacancyDays++
  oldestVacancyDay=expectedDate
  const yesterday=new Date(expectedDate+'T12:00:00Z')
  yesterday.setUTCDate(yesterday.getUTCDate()-1)
  expectedDate=yesterday.toISOString().slice(0,10)
 }
 const todayLocal=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 const latestTubDate=String(tubHistoryResult.data?.[0]?.service_date||'')
 const autoTubDue=date<=todayLocal&&vacancyDays>=3&&(!latestTubDate||latestTubDate<oldestVacancyDay)
 const serviceDetails=detailResult.data||null
 const tubCleanDue=!serviceDetails?.tub_clean_completed_at&&(Boolean(serviceDetails?.tub_clean_requested_at)||autoTubDue)
 const status=String(daily?.reservation_status||'').toLowerCase()
 const blocked=status==='blocked'||String(daily?.strip_hold||'').toLowerCase().includes('hold')
 // Keep the popup in sync with the actual inspection API and queue.
 const checkState=daily?roomCheckStage({
   reservationStatus:daily.reservation_status,
   serviceType:daily.service_type,
   stripHold:daily.strip_hold,
   roomCondition:daily.room_condition,
   complete:daily.complete,
   readyForInspection:daily.ready_for_inspection,
   inspected:daily.inspected,
   checkIssueOpen:daily.check_issue_open,
   fohSignedBy:daily.foh_signed_by
 }):'not-required'
 const eligible=checkState!=='not-required'
 // Show all notes associated with a room inspection where people actually
 // work: daily HA/housekeeping notes, historical edits, formal issues/fixes,
 // and written checklist notes from past inspection attempts.
 const [correctionsResult,noteEventsResult,inspectionChecksResult,checkItemsResult]=await Promise.all([
  admin.from('housekeeping_correction_events').select('id,event_type,note,created_at').eq('service_date',date).eq('room_id',roomId).order('created_at',{ascending:false}).limit(40),
  admin.from('ops_activity_log').select('id,event_type,message,created_at,actor_user_id,actor_name')
   .eq('service_date',date).eq('room_id',roomId).in('event_type',['room_note','room_note_cleared'])
   .order('created_at',{ascending:false}).limit(40),
  admin.from('housekeeping_quality_checks').select('id,stage,submitted_at').eq('service_date',date).eq('room_id',roomId)
   .in('stage',['inspection','recheck']).order('submitted_at',{ascending:false}).limit(30),
  admin.from('room_check_items').select('id,label')
 ])
 if(correctionsResult.error||noteEventsResult.error||inspectionChecksResult.error||checkItemsResult.error)
  return NextResponse.json({error:'Unable to load room inspection notes'},{status:500})
 const correctionHistory=(correctionsResult.data||[]).map((item:any)=>({id:String(item.id),type:String(item.event_type),note:String(item.note||''),at:String(item.created_at)}))
 const nameByItem=new Map((checkItemsResult.data||[]).map((item:any)=>[String(item.id),String(item.label||'Checklist item')]))
 const inspectedCheckIds=(inspectionChecksResult.data||[]).map((check:any)=>String(check.id))
 const [snapshotResult,latestResult]=await Promise.all([
  inspectedCheckIds.length
   ? admin.from('housekeeping_quality_check_items').select('check_id,item_id,note,checked_at').in('check_id',inspectedCheckIds)
   : Promise.resolve({data:[],error:null}),
  admin.from('room_check_results').select('item_id,note,checked_at').eq('service_date',date).eq('room_id',roomId)
 ])
 if(snapshotResult.error||latestResult.error)return NextResponse.json({error:'Unable to load checklist notes'},{status:500})
 const byCheck=new Map((inspectionChecksResult.data||[]).map((check:any)=>[String(check.id),check]))
 const checklistNotes=(snapshotResult.data||[]).filter((item:any)=>String(item.note||'').trim())
  .map((item:any)=>{const check:any=byCheck.get(String(item.check_id));return {
   id:String(item.check_id)+':'+String(item.item_id),label:nameByItem.get(String(item.item_id))||'Checklist item',
   note:String(item.note),stage:String(check?.stage||'inspection'),
   at:String(item.checked_at||check?.submitted_at||'')}})
 // Older or incomplete checklist drafts may not yet have a submitted snapshot.
 for(const item of latestResult.data||[]){
  if(!String(item.note||'').trim())continue
  const duplicate=checklistNotes.some(note=>note.label===(nameByItem.get(String(item.item_id))||'Checklist item')&&note.note===String(item.note))
  if(!duplicate)checklistNotes.push({id:'draft:'+String(item.item_id),label:nameByItem.get(String(item.item_id))||'Checklist item',
   note:String(item.note),stage:'draft',at:String(item.checked_at||'')})
 }
 checklistNotes.sort((a,b)=>b.at.localeCompare(a.at))
 const authorIds=[...new Set((noteEventsResult.data||[]).map((event:any)=>String(event.actor_user_id||'')).filter(Boolean))]
 const noteAuthorsResult=authorIds.length
  ? await admin.from('staff_members').select('auth_user_id,name').in('auth_user_id',authorIds)
  : {data:[],error:null}
 if(noteAuthorsResult.error)return NextResponse.json({error:'Unable to identify room note authors'},{status:500})
 const nameByUser=new Map((noteAuthorsResult.data||[]).map((member:any)=>[String(member.auth_user_id),String(member.name)]))
 const roomNoteHistory=(noteEventsResult.data||[]).map((event:any)=>({
  id:String(event.id),note:String(event.message||''),type:String(event.event_type),
  at:String(event.created_at),author:String(nameByUser.get(String(event.actor_user_id))||event.actor_name||'Room team')
 }))
 return NextResponse.json({room:{id:roomResult.data.id,name:roomResult.data.name},date,daily,stay,
  permissions:{canManage,canInspect},staffNames,staff,mentionableStaff,lastAssigned,lastCleaned,packageOptions,manualPackageIds,importedPackageIds,managerInitials,pmsActivity:String(link?.reservation_status||'Vacant'),
  serviceDetails,autoTubDue,vacancyDays,tubCleanDue,correctionHistory,roomNoteHistory,checklistNotes,
  inspectionEligible:eligible,
  inspectionReady:checkState==='ready'||checkState==='recheck'
 },{headers:{'cache-control':'private, no-store'}})
}
