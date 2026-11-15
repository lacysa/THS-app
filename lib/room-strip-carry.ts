/** Retain a requested or confirmed strip until a full clean or explicit clear. */
export type StripCarry={status:'needed'|'stripped';requestedAt:string|null;strippedAt:string|null;strippedBy:string|null;requestedBy:string|null}
export async function inheritedStripStatuses(admin:any,date:string){
 const {data,error}=await admin.from('housekeeping_daily_rooms')
  .select('room_id,service_date,strip_status,strip_requested_at,strip_requested_by,stripped_at,stripped_by,complete,reservation_status,strip_hold')
  .lt('service_date',date).order('service_date',{ascending:false}).limit(5000)
 if(error)throw new Error(error.message)
 const results=new Map<string,StripCarry>()
 const settled=new Set<string>()
 for(const row of data||[]){
  const id=String(row.room_id||'')
  if(!id||settled.has(id))continue
  const status=String(row.strip_status||'').trim().toLowerCase()
  const blocked=String(row.reservation_status||'').trim().toLowerCase()==='blocked'||String(row.strip_hold||'').toLowerCase().includes('hold')
  // The newest full clean ends the prior strip; a manual clear is a tombstone.
  if(status==='cleared'||(row.complete&&!blocked)){settled.add(id);continue}
  if(status==='needed'||status==='stripped'){
   results.set(id,{status:status as 'needed'|'stripped',requestedAt:row.strip_requested_at||null,requestedBy:row.strip_requested_by||null,strippedAt:row.stripped_at||null,strippedBy:row.stripped_by||null})
   settled.add(id)
  }
 }
 return results
}
