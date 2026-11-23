import {createSupabaseAdmin} from '@/lib/supabase/admin'

/**
 * Tub tasks retain their backlog independently of ordinary room cleaning.
 * Only serviceable days display a tub-only assignment. Cancelling is not a clean.
 */
export async function loadTubTaskStates(admin:ReturnType<typeof createSupabaseAdmin>,date:string){
 const begin=new Date(date+'T12:00:00Z');begin.setUTCDate(begin.getUTCDate()-44)
 const from=begin.toISOString().slice(0,10)
 const [daysResult,detailsResult]=await Promise.all([
  admin.from('housekeeping_daily_rooms').select('room_id,service_date,reservation_status,strip_hold,room_condition').gte('service_date',from).lte('service_date',date).order('service_date',{ascending:false}),
  admin.from('room_ops_details').select('room_id,service_date,tub_clean_requested_at,tub_clean_completed_at,tub_clean_cancelled_at,tub_clean_assigned_to').gte('service_date',from).lte('service_date',date).order('service_date',{ascending:false})
 ])
 if(daysResult.error||detailsResult.error)throw new Error(daysResult.error?.message||detailsResult.error?.message||'Tub clean data unavailable')
 const grouped=new Map<string,typeof daysResult.data>()
 for(const day of daysResult.data||[]){const id=String(day.room_id);grouped.set(id,[...(grouped.get(id)||[]),day])}
 const details=new Map<string,typeof detailsResult.data>()
 for(const item of detailsResult.data||[]){const id=String(item.room_id);details.set(id,[...(details.get(id)||[]),item])}
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 const result=new Map<string,{due:boolean;pending:boolean;completed:boolean;vacantDays:number;autoDue:boolean;assignedTo:string}>()
 for(const [id,rows] of grouped){
  let vacantDays=0,oldest='',expected=date
  for(const day of rows||[]){
   if(day.service_date!==expected||String(day.reservation_status||'').toLowerCase()!=='vacant'||String(day.strip_hold||'').toLowerCase().includes('hold')||String(day.room_condition||'').toLowerCase()==='occupied')break
   vacantDays++;oldest=expected
   const previous=new Date(expected+'T12:00:00Z');previous.setUTCDate(previous.getUTCDate()-1)
   expected=previous.toISOString().slice(0,10)
  }
  const records=details.get(id)||[]
  const current=records.find(v=>v.service_date===date)
  const lastDone=records.find(v=>Boolean(v.tub_clean_completed_at))
  const lastRequest=records.find(v=>Boolean(v.tub_clean_requested_at))
  const lastCancelled=records.find(v=>Boolean(v.tub_clean_cancelled_at))
  const lastResolution=[String(lastDone?.tub_clean_completed_at||''),String(lastCancelled?.tub_clean_cancelled_at||'')].sort().pop()||''
  const manuallyOutstanding=Boolean(lastRequest)&&String(lastRequest?.tub_clean_requested_at||'')>lastResolution
  // Do not regenerate an auto-task during the vacancy streak in which it was cancelled.
  const autoDue=date<=today&&vacantDays>=3&&(!lastDone||lastDone.service_date<oldest)&&(!lastCancelled||lastCancelled.service_date<oldest)
  const completed=Boolean(current?.tub_clean_completed_at)
  const pending=!completed&&(manuallyOutstanding||autoDue)
  const activeDay=(rows||[]).find(v=>v.service_date===date)
  const activity=String(activeDay?.reservation_status||'').trim().toLowerCase()
  const hold=String(activeDay?.strip_hold||'').toLowerCase().includes('hold')
  const condition=String(activeDay?.room_condition||'').trim().toLowerCase()
  const serviceable=Boolean(activeDay)&&!hold&&!['blocked','stayover'].includes(activity)&&!['blocked','occupied'].includes(condition)
  const carriedAssignment=manuallyOutstanding?records.find(v=>Boolean(v.tub_clean_assigned_to)&&String(v.service_date)>=String(lastRequest?.service_date||''))?.tub_clean_assigned_to:''
  result.set(id,{
   due:pending&&serviceable,pending,completed,vacantDays,autoDue,
   assignedTo:pending?String(current?.tub_clean_assigned_to||carriedAssignment||''):''
  })
 }
 return result
}
