import {createSupabaseAdmin} from '@/lib/supabase/admin'

/**
 * Derive the outstanding strip / stripped state from earlier room days.
 * A completed full clean closes the strip cycle; a blocked day or date change
 * does not. Explicit strip requests start a new cycle.
 */
export async function loadCarriedStripStates(
  admin:ReturnType<typeof createSupabaseAdmin>, date:string
){
  const {data,error}=await admin.from('housekeeping_daily_rooms')
    .select('room_id,service_date,reservation_status,service_type,complete,strip_status,strip_requested_at,stripped_at,stripped_by,assigned_to')
    .lte('service_date',date)
    .order('service_date',{ascending:false})
    .limit(3000)
  if(error)throw new Error(error.message)
  const states=new Map<string,{
    status:string;requestedAt:string|null;strippedAt:string|null;
    strippedBy:string|null;assignedTo:string
  }>()
  const settled=new Set<string>()
  for(const row of data||[]){
    const id=String(row.room_id)
    if(settled.has(id))continue
    const status=String(row.reservation_status||'').toLowerCase()
    const service=String(row.service_type||'').toUpperCase()
    // A full clean closes the cycle only if completed after the strip.
    // Ignore mere housekeeping dates, blocked-day marking, or stayover refresh.
    const fullClean=Boolean(row.complete)&&status!=='blocked'&&
      status!=='stayover'&&service!=='RF'
    if(fullClean){settled.add(id);continue}
    if(row.strip_status==='needed'||row.strip_status==='stripped'){
      states.set(id,{
        status:row.strip_status,
        requestedAt:row.strip_requested_at||null,
        strippedAt:row.stripped_at||null,
        strippedBy:row.stripped_by||null,
        assignedTo:String(row.assigned_to||'')
      })
      settled.add(id)
    }
  }
  return states
}
