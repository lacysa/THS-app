/**
 * Read-only fallback for a reservation-free room with no condition recorded today.
 * It intentionally never carries a previous guest's Occupied status forward.
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
    .select('room_id,service_date,reservation_status,room_condition,next_shift_condition')
    .lt('service_date',date)
    .order('service_date',{ascending:false})
    .limit(3000)
  if(result.error)throw new Error(result.error.message)
  const settled=new Set<string>()
  for(const prior of result.data||[]){
    const id=String(prior.room_id)
    if(!targets.has(id)||settled.has(id))continue
    const status=String(prior.reservation_status||'').trim().toLowerCase()
    // Never resurrect a pre-reservation condition from before an occupied stay.
    if(!['vacant','dirty','blocked','checkout',''].includes(status)){settled.add(id);continue}
    const value=String(prior.next_shift_condition||prior.room_condition||'').trim()
    const lower=value.toLowerCase()
    if(!value)continue
    settled.add(id)
    if(['vacant (clean)','vacant (dirty)','blocked','ready','ready for guest'].includes(lower))
      carried.set(id,value)
  }
  return carried
}
