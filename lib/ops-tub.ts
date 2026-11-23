import {createSupabaseAdmin} from '@/lib/supabase/admin'
import {roomServiceTask} from '@/lib/room-state'

/** Auto-tub only after 3 consecutive PMS-vacant days without an intervening clean.
 * Full cleans include the tub. Manual tub-only requests remain valid during
 * the same unoccupied period until either a clean or a cancellation resolves them.
 */
export async function loadTubTaskStates(admin:ReturnType<typeof createSupabaseAdmin>,date:string){
 const fromDay=new Date(date+'T12:00:00Z')
 fromDay.setUTCDate(fromDay.getUTCDate()-44)
 const from=fromDay.toISOString().slice(0,10)
 const [dailyResponse,linksResponse,detailsResponse]=await Promise.all([
  admin.from('housekeeping_daily_rooms')
   .select('room_id,service_date,reservation_status,service_type,strip_hold,room_condition,complete,completed_at,inspected,assigned_to')
   .gte('service_date',from).lte('service_date',date).order('service_date',{ascending:false}),
  admin.from('reservation_daily_links')
   .select('room_id,service_date,reservation_status')
   .gte('service_date',from).lte('service_date',date),
  admin.from('room_ops_details')
   .select('room_id,service_date,tub_clean_requested_at,tub_clean_completed_at,tub_clean_cancelled_at,tub_clean_assigned_to')
   .gte('service_date',from).lte('service_date',date).order('service_date',{ascending:false})
 ])
 if(dailyResponse.error||linksResponse.error||detailsResponse.error)
  throw new Error(dailyResponse.error?.message||linksResponse.error?.message||detailsResponse.error?.message||'Tub clean history unavailable')
 const byRoom=new Map<string,NonNullable<typeof dailyResponse.data>>()
 for(const day of dailyResponse.data||[]){
  const id=String(day.room_id)
  byRoom.set(id,[...(byRoom.get(id)||[]),day])
 }
 const pms=new Map<string,string>()
 for(const day of linksResponse.data||[])
  pms.set(String(day.room_id)+':'+String(day.service_date),String(day.reservation_status||'').trim().toLowerCase())
 const details=new Map<string,NonNullable<typeof detailsResponse.data>>()
 for(const record of detailsResponse.data||[]){
  const id=String(record.room_id)
  details.set(id,[...(details.get(id)||[]),record])
 }
 const hotelDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'})
 const today=hotelDate.format(new Date())
 const localDay=(stamp:unknown)=>{
  const ms=Date.parse(String(stamp||''))
  return Number.isFinite(ms)?hotelDate.format(new Date(ms)):''
 }
 const timestamp=(stamp:unknown)=>{
  const ms=Date.parse(String(stamp||''))
  return Number.isFinite(ms)?ms:0
 }
 const results=new Map<string,{due:boolean;pending:boolean;completed:boolean;vacantDays:number;autoDue:boolean;assignedTo:string}>()
 for(const [id,history] of byRoom){
  const pmsStatus=(day:(typeof history)[number])=>
   pms.get(id+':'+String(day.service_date))||String(day.reservation_status||'').trim().toLowerCase()
  const current=history.find(day=>day.service_date===date)
  const taskHistory=details.get(id)||[]
  const currentTask=taskHistory.find(task=>task.service_date===date)
  const lastRequest=taskHistory.find(task=>Boolean(task.tub_clean_requested_at))
  const lastTubDone=taskHistory.find(task=>Boolean(task.tub_clean_completed_at))
  const lastCancelled=taskHistory.find(task=>Boolean(task.tub_clean_cancelled_at))
  // Use actual completion time, not "complete" flags copied forward by day reset.
  const lastFullAt=history.filter(day=>Boolean(day.completed_at)&&pmsStatus(day)!=='stayover')
   .map(day=>String(day.completed_at)).sort().pop()||''
  let vacantDays=0,oldest='',expected=date
  for(const day of history){
   if(String(day.service_date)!==expected||pmsStatus(day)!=='vacant')break
   vacantDays++;oldest=expected
   const previous=new Date(expected+'T12:00:00Z')
   previous.setUTCDate(previous.getUTCDate()-1)
   expected=previous.toISOString().slice(0,10)
  }
  const requestAt=String(lastRequest?.tub_clean_requested_at||'')
  const requestDate=String(lastRequest?.service_date||'')
  const requestOrigin=history.find(day=>day.service_date===requestDate)
  const originStatus=requestOrigin?pmsStatus(requestOrigin):''
  const originCondition=String(requestOrigin?.room_condition||'').trim().toLowerCase()
  const originFullClean=Boolean(requestOrigin&&roomServiceTask({
   reservationStatus:requestOrigin.reservation_status,
   serviceType:requestOrigin.service_type,
   stripHold:requestOrigin.strip_hold,
   roomCondition:requestOrigin.room_condition
  })==='full'&&!requestOrigin.complete)
  const validManualOrigin=Boolean(requestOrigin&&
   (originStatus==='vacant'||(originStatus==='arrival'&&['vacant (clean)','ready','room ready','ready for guest'].includes(originCondition)))&&
   !originFullClean)
  const guestSinceRequest=history.some(day=>String(day.service_date)>requestDate&&
   ['arrival','stayover','checkout','out/in'].includes(pmsStatus(day)))
  const manualPending=Boolean(requestAt&&validManualOrigin&&!guestSinceRequest&&
   timestamp(requestAt)>Math.max(timestamp(lastTubDone?.tub_clean_completed_at),timestamp(lastCancelled?.tub_clean_cancelled_at),timestamp(lastFullAt)))
  // A tub clean, full clean, or explicit removal during the same vacancy streak
  // satisfies the requirement until the next guest occupancy.
  const autoDue=date<=today&&vacantDays>=3&&
   (!lastFullAt||localDay(lastFullAt)<oldest)&&
   (!lastTubDone||localDay(lastTubDone.tub_clean_completed_at)<oldest)&&
   (!lastCancelled||localDay(lastCancelled.tub_clean_cancelled_at)<oldest)
  const status=String(current?.reservation_status||'').trim().toLowerCase()
  const condition=String(current?.room_condition||'').trim().toLowerCase()
  const hold=String(current?.strip_hold||'').toLowerCase().includes('hold')
  const fullCleanDue=Boolean(current&&roomServiceTask({
   reservationStatus:current.reservation_status,
   serviceType:current.service_type,
   roomCondition:current.room_condition,
   stripHold:current.strip_hold
  })==='full'&&(!current.complete||/dirty|cleaning/.test(condition)))
  const physicallyOccupied=Boolean(current&&['stayover','checkout','out/in'].includes(pmsStatus(current)))
  const serviceable=Boolean(current)&&!hold&&!physicallyOccupied&&
   !['blocked','stayover'].includes(status)&&
   !['blocked','occupied'].includes(condition)&&!fullCleanDue
  const completed=Boolean(currentTask?.tub_clean_completed_at)
  const pending=!completed&&(manualPending||autoDue)
  const carriedAssignee=manualPending?taskHistory.find(task=>
   Boolean(task.tub_clean_assigned_to)&&String(task.service_date)>=requestDate)?.tub_clean_assigned_to:''
  results.set(id,{due:pending&&serviceable,pending,completed,vacantDays,autoDue,
   assignedTo:pending?String(currentTask?.tub_clean_assigned_to||carriedAssignee||''):''})
 }
 return results
}
