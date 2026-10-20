/**
 * Shared previous-day condition resolver used by the Housekeeping API and
 * the Ops calendar. The dated live condition remains authoritative for a
 * day on which it was actually saved. No new editable condition field.
 *
 * stop=true means a more distant record must not be allowed to leak through
 * a newer occupied stay or an explicit turnover event.
 */
export function priorConditionCandidate(prior:{
  reservation_status?:unknown
  service_type?:unknown
  room_condition?:unknown
  next_shift_condition?:unknown
}):{condition:string;stop:boolean}{
  const status=String(prior.reservation_status||'').trim().toLowerCase()
  if(!['vacant','dirty','blocked','checkout','out/in',''].includes(status))
    return {condition:'',stop:true}
  const isOut=/^OUT(?:-[A-Z]{2,4})?$/i.test(String(prior.service_type||'').trim())
  if(['checkout','out/in'].includes(status)&&!isOut)
    return {condition:'Occupied',stop:true}
  const value=String(prior.next_shift_condition||prior.room_condition||'').trim()
  if(!value)return {condition:'',stop:false}
  const lower=value.toLowerCase()
  const allowed=['vacant (clean)','vacant (dirty)','blocked','ready','ready for guest'].includes(lower)||
    (status==='vacant'&&lower==='occupied'&&!isOut)
  return {condition:allowed?value:'',stop:true}
}

/**
 * Read-only fallback for a reservation-free room with no condition recorded today.
 * A departing room still awaiting OUT may carry Occupied; ordinary guest
 * occupancy does not carry forward after the scheduled stay.
 * Staff-entered conditions on the target date always take precedence.
 */
export async function previousVacantConditions(admin:any, date:string, rows:any[]) {
  const targets=new Set<string>(rows.filter(row=>{
    const status=String(row.reservation_status||'').trim().toLowerCase()
    return ['vacant','dirty',''].includes(status)&&!String(row.room_condition||'').trim()
  }).map(row=>String(row.room_id)))
  const carried=new Map<string,string>()
  if(!targets.size)return carried
  const result=await admin.from('housekeeping_daily_rooms')
    .select('room_id,service_date,reservation_status,service_type,room_condition,next_shift_condition')
    .lt('service_date',date)
    .order('service_date',{ascending:false})
    .limit(3000)
  if(result.error)throw new Error(result.error.message)
  const settled=new Set<string>()
  for(const prior of result.data||[]){
    const id=String(prior.room_id)
    if(!targets.has(id)||settled.has(id))continue
    const result=priorConditionCandidate(prior)
    if(result.stop)settled.add(id)
    if(result.condition)carried.set(id,result.condition)
  }
  return carried
}
