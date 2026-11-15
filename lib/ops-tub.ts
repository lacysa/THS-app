import {createSupabaseAdmin} from '@/lib/supabase/admin'

/**
 * Tub service becomes due after three consecutive vacant days.
 * Once due, carry it forward until an actual tub completion OR a subsequent
 * completed full room clean. Merely crossing a date or re-occupying a room
 * must not silently dismiss an outstanding task.
 */
export async function loadTubTaskStates(admin:ReturnType<typeof createSupabaseAdmin>,date:string){
 const begin=new Date(date+'T12:00:00Z');begin.setUTCDate(begin.getUTCDate()-365)
 const from=begin.toISOString().slice(0,10)
 const [daysResult,detailsResult]=await Promise.all([
  admin.from('housekeeping_daily_rooms')
   .select('room_id,service_date,reservation_status,strip_hold,room_condition,complete,service_type')
   .gte('service_date',from).lte('service_date',date).order('service_date',{ascending:false}),
  admin.from('room_ops_details')
   .select('room_id,service_date,tub_clean_requested_at,tub_clean_completed_at,tub_clean_assigned_to')
   .gte('service_date',from).lte('service_date',date).order('service_date',{ascending:false})
 ])
 if(daysResult.error||detailsResult.error)throw new Error(daysResult.error?.message||detailsResult.error?.message||'Tub clean data unavailable')
 type Day=(NonNullable<typeof daysResult.data>)[number]
 type Detail=(NonNullable<typeof detailsResult.data>)[number]
 const days=new Map<string,Day[]>()
 for(const item of daysResult.data||[]){const id=String(item.room_id);days.set(id,[...(days.get(id)||[]),item])}
 const details=new Map<string,Detail[]>()
 for(const item of detailsResult.data||[]){const id=String(item.room_id);details.set(id,[...(details.get(id)||[]),item])}
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 const result=new Map<string,{due:boolean;completed:boolean;vacantDays:number;autoDue:boolean;assignedTo:string}>()
 for(const id of new Set([...days.keys(),...details.keys()])){
  const rows=days.get(id)||[]
  const records=details.get(id)||[]
  const dayByDate=new Map(rows.map(item=>[item.service_date,item]))
  const dateSet=new Set([...rows.map(v=>v.service_date),...records.map(v=>v.service_date)])
  const chronological=[...dateSet].sort()
  let vacantDays=0
  let pending=false
  let autoTriggered=false
  let assignedTo=''
  let lastCompletion=''
  for(const serviceDate of chronological){
   const day=dayByDate.get(serviceDate)
   // Count only actual consecutive calendar days; a missing daily snapshot
   // cannot establish that the room remained vacant.
   const previous=new Date(serviceDate+'T12:00:00Z')
   previous.setUTCDate(previous.getUTCDate()-1)
   const adjacent=lastCompletion===previous.toISOString().slice(0,10)
   const vacant=Boolean(day&&String(day.reservation_status||'').toLowerCase()==='vacant'&&
    !String(day.strip_hold||'').toLowerCase().includes('hold')&&
    String(day.room_condition||'').toLowerCase()!=='occupied')
   vacantDays=vacant?(adjacent?vacantDays+1:1):0
   lastCompletion=serviceDate
   const detail=records.find(v=>v.service_date===serviceDate)
   // A completed full clean is an explicit reset, not a change in room status.
   const fullClean=Boolean(day?.complete)&&(
    ['checkout','out/in','dirty'].includes(String(day?.reservation_status||'').toLowerCase())||
    /^OUT(?:-[A-Z]{2,4})?$/i.test(String(day?.service_type||''))||
    /dirty|cleaning/i.test(String(day?.room_condition||'')))
   if(fullClean||detail?.tub_clean_completed_at){
    pending=false;autoTriggered=false;assignedTo=''
    vacantDays=0
   }
   if(detail?.tub_clean_requested_at&&!detail.tub_clean_completed_at){
    pending=true
    assignedTo=String(detail.tub_clean_assigned_to||assignedTo)
   }
   if(serviceDate<=today&&vacantDays>=3&&!pending){
    pending=true;autoTriggered=true
   }
   if(pending&&detail?.tub_clean_assigned_to)assignedTo=String(detail.tub_clean_assigned_to)
  }
  const current=records.find(v=>v.service_date===date)
  result.set(id,{
   due:pending,
   completed:Boolean(current?.tub_clean_completed_at),
   vacantDays,
   autoDue:autoTriggered,
   assignedTo
  })
 }
 return result
}
