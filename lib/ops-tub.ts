import {createSupabaseAdmin} from '@/lib/supabase/admin'
/** 3 consecutive Vacant days creates a tub-only task. A tub clean ends that task until the next occupancy. */
export async function loadTubTaskStates(admin:ReturnType<typeof createSupabaseAdmin>,date:string){
 const begin=new Date(date+'T12:00:00Z');begin.setUTCDate(begin.getUTCDate()-44)
 const from=begin.toISOString().slice(0,10)
 const [daysResult,detailsResult]=await Promise.all([
  admin.from('housekeeping_daily_rooms').select('room_id,service_date,reservation_status,strip_hold,room_condition').gte('service_date',from).lte('service_date',date).order('service_date',{ascending:false}),
  admin.from('room_ops_details').select('room_id,service_date,tub_clean_requested_at,tub_clean_completed_at').gte('service_date',from).lte('service_date',date).order('service_date',{ascending:false})
 ])
 if(daysResult.error||detailsResult.error)throw new Error(daysResult.error?.message||detailsResult.error?.message||'Tub clean data unavailable')
 const grouped=new Map<string,typeof daysResult.data>()
 for(const day of daysResult.data||[]){const id=String(day.room_id);grouped.set(id,[...(grouped.get(id)||[]),day])}
 const details=new Map<string,typeof detailsResult.data>()
 for(const item of detailsResult.data||[]){const id=String(item.room_id);details.set(id,[...(details.get(id)||[]),item])}
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 const result=new Map<string,{due:boolean;completed:boolean;vacantDays:number;autoDue:boolean}>()
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
  const autoDue=date<=today&&vacantDays>=3&&(!lastDone||lastDone.service_date<oldest)
  const completed=Boolean(current?.tub_clean_completed_at)
  result.set(id,{due:!completed&&(Boolean(current?.tub_clean_requested_at)||autoDue),completed,vacantDays,autoDue})
 }
 return result
}
