import { NextRequest, NextResponse } from 'next/server'
import { getStaffAccess } from '@/lib/access'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const isManager=(a:any)=>a.isAdmin||(a.capabilities||[]).some((c:string)=>['manager','general_manager','operations_manager','owner'].includes(c))
const validDate=(s:string)=>/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))
const previousDay=(date:string)=>{
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)
}
const clean=(v:unknown)=>String(v||'').trim()
const blocked=(r:any)=>clean(r.strip_hold).toLowerCase().includes('hold')||
 clean(r.reservation_status).toLowerCase()==='blocked'||clean(r.room_condition).toLowerCase()==='blocked'
const isOut=(v:unknown)=>/^OUT(?:-[A-Z]{2,4})?$/i.test(clean(v))
const normalizeCondition=(r:any)=>{
 if(!r)return ''
 if(blocked(r))return 'Vacant (Dirty)' // A hold never constitutes a clean verification.
 const status=clean(r.reservation_status).toLowerCase()
 if(status==='stayover'||(['checkout','out/in'].includes(status)&&!isOut(r.service_type)))return 'Occupied'
 const value=clean(r.next_shift_condition||r.room_condition)
 if(['vacant (clean)','ready','ready for guest','room ready'].includes(value.toLowerCase()))return 'Vacant (Clean)'
 if(['vacant (dirty)','dirty','cleaning'].includes(value.toLowerCase()))return 'Vacant (Dirty)'
 // Ready-for-check is not a verified clean. Keep inspection due.
 if(value.toLowerCase()==='ready for room check')return 'Ready for Room Check'
 if(value.toLowerCase()==='occupied')return 'Occupied'
 return ''
}

export async function POST(req:NextRequest){
 const access=await getStaffAccess()
 if(!access)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(!isManager(access))return NextResponse.json({error:'Management access required'},{status:403})
 if(access.isPreviewMode)return NextResponse.json({error:'Preview is read-only'},{status:403})
 const body=await req.json().catch(()=>null)
 const date=clean(body?.date)
 if(!validDate(date))return NextResponse.json({error:'Invalid date'},{status:400})
 const action=clean(body?.action)
 if(!['reset_eod','clear_assignments'].includes(action))return NextResponse.json({error:'Unknown action'},{status:400})
 const admin=createSupabaseAdmin()
 try{
  const {data:current,error:currErr}=await admin.from('housekeeping_daily_rooms').select('*').eq('service_date',date)
  if(currErr)throw currErr
  if(!current?.length)return NextResponse.json({error:'No room records exist for the selected date. Import the room plan first.'},{status:409})
  const now=new Date().toISOString()
  if(action==='clear_assignments'){
   // Preserve cleaning order, inspection, room status, strip/tub/deep task assignees and all guest data.
   const assigned=current.filter((r:any)=>clean(r.assigned_to)||r.clean_order!=null)
   const results=await Promise.all(assigned.map((r:any)=>admin.from('housekeeping_daily_rooms')
    .update({assigned_to:'',clean_order:null,updated_at:now,updated_by:access.userId})
    .eq('service_date',date).eq('room_id',r.room_id)))
   const failure=results.find(r=>r.error)
   if(failure?.error)throw failure.error
   return NextResponse.json({ok:true,action,updated:assigned.length,date})
  }
  const priorDate=previousDay(date)
  const [{data:prior,error:priorErr},{data:links,error:linkErr}]=await Promise.all([
   admin.from('housekeeping_daily_rooms').select('*').eq('service_date',priorDate),
   admin.from('reservation_daily_links').select('room_id,reservation_status').eq('service_date',date)
  ])
  if(priorErr||linkErr)throw priorErr||linkErr
  if(!prior?.length)return NextResponse.json({error:'No previous-day EOD room records exist for '+priorDate+'. Nothing was changed.'},{status:409})
  const previous=new Map((prior||[]).map((r:any)=>[String(r.room_id),r]))
  const imported=new Map((links||[]).map((r:any)=>[String(r.room_id),clean(r.reservation_status)]))
  const changes:{roomId:string;patch:Record<string,unknown>}[]=[]
  let skipped=0
  for(const r of current){
   const before:any=previous.get(String(r.room_id))
   if(!before){skipped++;continue}
   // A currently blocked room must not be accidentally released by a housekeeping reset.
   if(blocked(r)){skipped++;continue}
   const priorCondition=normalizeCondition(before)
   if(!priorCondition){skipped++;continue}
   const pms=clean(imported.get(String(r.room_id))||r.reservation_status||'Vacant')
   const guestActivity=['arrival','checkout','out/in','stayover'].includes(pms.toLowerCase())
   const existingActivity=clean(r.reservation_status).toLowerCase()
   const activity=guestActivity?pms:(existingActivity==='blocked'?'Blocked':
     priorCondition==='Vacant (Dirty)'?'Dirty':'Vacant')
   // A current guest departure remains occupied until OUT is recorded.
   const pendingCheckout=['checkout','out/in'].includes(pms.toLowerCase())&&!isOut(r.service_type)
   const guestStillIn=pms.toLowerCase()==='stayover'||pendingCheckout
   const outToday=isOut(r.service_type)&&['checkout','out/in'].includes(pms.toLowerCase())
   const condition=guestStillIn?'Occupied':outToday?'Vacant (Dirty)':
      priorCondition==='Occupied'&&pms.toLowerCase()==='vacant'?'Vacant (Dirty)':priorCondition
   const patch:Record<string,unknown>={updated_at:now,updated_by:access.userId}
   if(clean(r.reservation_status)!==activity)patch.reservation_status=activity
   if(clean(r.room_condition)!==condition)patch.room_condition=condition
   // Reset operational completion state only for a physically dirty, unblocked
   // room. Never erase completed inspections, check issues, or sign-off audit.
   // Those are records of real work and must be reconciled manually.
   if(Object.keys(patch).length===2)continue
   changes.push({roomId:String(r.room_id),patch})
  }
  const results=await Promise.all(changes.map(({roomId,patch})=>
   admin.from('housekeeping_daily_rooms').update(patch).eq('service_date',date).eq('room_id',roomId)))
  const failure=results.find(r=>r.error)
  if(failure?.error)throw failure.error
  return NextResponse.json({ok:true,action,date,priorDate,updated:changes.length,skipped,
   message:'Service and live condition reset from prior EOD where safe. Guest activity, OUT/tips, holds, notes, and audit records were preserved.'})
 }catch(e:any){return NextResponse.json({error:e.message||'Could not reset room day'},{status:500})}
}
