/**
 * A dated staff condition wins over an inherited condition. Legacy reservation
 * imports sometimes seeded "Occupied" on an otherwise untouched future
 * Vacant/Arrival day; those values were never confirmed by staff and must not
 * mask the last recorded physical condition.
 */
export type ConditionDay={
  reservation_status?:unknown
  service_type?:unknown
  room_condition?:unknown
  next_shift_condition?:unknown
  updated_by?:unknown
  complete?:unknown
  inspected?:unknown
  assigned_to?:unknown
}

export function isAutoOccupiedPlaceholder(row:ConditionDay):boolean{
  const status=String(row.reservation_status||'').trim().toLowerCase()
  return ['vacant','arrival',''].includes(status) &&
    String(row.room_condition||'').trim().toLowerCase()==='occupied' &&
    !String(row.updated_by||'').trim() &&
    !String(row.service_type||'').trim() &&
    !Boolean(row.complete) &&
    !Boolean(row.inspected) &&
    !String(row.assigned_to||'').trim()
}

/** The single read-only source for recorded vs inherited live room condition. */
export function conditionForDay(row:ConditionDay,carried=''):string{
  const recorded=String(row.room_condition||'').trim()
  return isAutoOccupiedPlaceholder(row)?carried:recorded||carried
}

/**
 * Walk backwards to the last trustworthy physical condition, stopping at a
 * genuine stay/turnover so a pre-stay clean cannot leak through occupancy.
 */
export function priorConditionCandidate(prior:ConditionDay):{condition:string;stop:boolean}{
  const status=String(prior.reservation_status||'').trim().toLowerCase()
  if(!['vacant','dirty','blocked','checkout','out/in',''].includes(status))
    return {condition:'',stop:true}
  const isOut=/^OUT(?:-[A-Z]{2,4})?$/i.test(String(prior.service_type||'').trim())
  if(['checkout','out/in'].includes(status)&&!isOut)
    return {condition:'Occupied',stop:true}
  if(isAutoOccupiedPlaceholder(prior))return {condition:'',stop:false}
  const value=String(prior.next_shift_condition||prior.room_condition||'').trim()
  if(!value)return {condition:'',stop:false}
  const lower=value.toLowerCase()
  const allowed=['vacant (clean)','vacant (dirty)','blocked','ready','ready for guest'].includes(lower)||
    (status==='vacant'&&lower==='occupied'&&!isOut)
  return {condition:allowed?value:'',stop:true}
}

/**
 * Inherit only where the selected date lacks a staff-confirmed condition.
 * Includes arrival days, which also begin with the last verified physical
 * state until a real occupant or manager changes it.
 */
export async function previousVacantConditions(admin:any,date:string,rows:any[]) {
  const targets=new Set<string>(rows.filter(row=>{
    const status=String(row.reservation_status||'').trim().toLowerCase()
    return ['vacant','dirty','arrival',''].includes(status)&&!conditionForDay(row)
  }).map(row=>String(row.room_id)))
  const carried=new Map<string,string>()
  if(!targets.size)return carried
  const result=await admin.from('housekeeping_daily_rooms')
    .select('room_id,service_date,reservation_status,service_type,room_condition,next_shift_condition,updated_by,complete,inspected,assigned_to')
    .lt('service_date',date)
    .order('service_date',{ascending:false})
    .limit(3000)
  if(result.error)throw new Error(result.error.message)
  const settled=new Set<string>()
  for(const prior of result.data||[]){
    const id=String(prior.room_id)
    if(!targets.has(id)||settled.has(id))continue
    const candidate=priorConditionCandidate(prior)
    if(candidate.stop)settled.add(id)
    if(candidate.condition)carried.set(id,candidate.condition)
  }
  return carried
}
