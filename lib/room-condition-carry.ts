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
    const status=String(prior.reservation_status||'').trim().toLowerCase()
    // A previous Checkout/Out-In with no OUT remains occupied. Stop looking
    // further back as soon as a newer explicit reservation status is found.
    if(!['vacant','dirty','blocked','checkout','out/in',''].includes(status)){settled.add(id);continue}
    const isOut=/^OUT(?:-[A-Z]{2,4})?$/i.test(String(prior.service_type||'').trim())
    if(['checkout','out/in'].includes(status)&&!isOut){
      settled.add(id)
      carried.set(id,'Occupied')
      continue
    }
    const value=String(prior.next_shift_condition||prior.room_condition||'').trim()
    const lower=value.toLowerCase()
    if(!value)continue
    settled.add(id)
    if(['vacant (clean)','vacant (dirty)','blocked','ready','ready for guest'].includes(lower)|| (status==='vacant'&&lower==='occupied'&&!isOut))
      carried.set(id,value)
  }
  return carried
}
