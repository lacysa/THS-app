import {NextRequest,NextResponse} from 'next/server'
import {canUseModule} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'

export const dynamic='force-dynamic'
const validDate=(value:string)=>/^20\d{2}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))
const validId=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export async function GET(req:NextRequest){
 const gate=await canUseModule('ops')
 if(!gate.access)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(!gate.allowed)return NextResponse.json({error:'Forbidden'},{status:403})
 const date=req.nextUrl.searchParams.get('date')||''
 const roomId=req.nextUrl.searchParams.get('roomId')||''
 const reservationId=req.nextUrl.searchParams.get('reservationId')||''
 if(!validDate(date)||!validId(roomId)||(reservationId&&!validId(reservationId)))
   return NextResponse.json({error:'Invalid room or date'},{status:400})
 const admin=createSupabaseAdmin()
 const [roomResult,dailyResult,linkResult]=await Promise.all([
  admin.from('rooms').select('id,name').eq('id',roomId).eq('active',true).maybeSingle(),
  admin.from('housekeeping_daily_rooms').select('service_date,room_id,assigned_to,notes,reservation_status,service_type,room_condition,strip_hold,complete,ready_for_inspection,inspected,inspected_at,check_issue_open,check_issue_note,breakfast_tag,late_arrival,housekeeper_attested_by').eq('service_date',date).eq('room_id',roomId).maybeSingle(),
  admin.from('reservation_daily_links').select('primary_reservation_id,arriving_reservation_id,stay_reservation_id,departing_reservation_id').eq('service_date',date).eq('room_id',roomId).maybeSingle()
 ])
 if(roomResult.error||dailyResult.error||linkResult.error)
  return NextResponse.json({error:'Unable to load room operations'},{status:500})
 if(!roomResult.data)return NextResponse.json({error:'Room not found'},{status:404})
 const daily=dailyResult.data
 const link=linkResult.data
 // A calendar empty-cell click is room-only, even on checkout days where
 // the daily link still points to a departing guest. Only an explicit click
 // on a reservation bar is allowed to load that guest.
 const availableIds=[link?.arriving_reservation_id,link?.stay_reservation_id,link?.primary_reservation_id,link?.departing_reservation_id].filter(Boolean).map(String)
 if(reservationId&&!availableIds.includes(reservationId))
  return NextResponse.json({error:'Selected reservation is not linked to this room on this date.'},{status:409})
 const chosen=reservationId||null
 let stay:any=null
 if(chosen){
  const result=await admin.from('reservation_stays').select('id,reservation_number,guest_name,guest_phone,arrival_date,checkout_date,occupancy,rate_plan,check_in_time,products_raw,dietary_restrictions,guest_comments,innkeeper_notes,reason_for_visit').eq('id',chosen).maybeSingle()
  if(result.error)return NextResponse.json({error:'Unable to load guest stay'},{status:500})
  stay=result.data
 }
 // Historical responsibility is informational only; never convert it into today's assignment.
 // Load one prior assignment only for an unassigned, non-occupied room.
 let lastAssigned:{name:string;date:string}|null=null
 const needsHistory=Boolean(daily)&&!String(daily?.assigned_to||'').trim()&&String(daily?.room_condition||'').trim().toLowerCase()!=='occupied'
 if(needsHistory){
  const previous=await admin.from('housekeeping_daily_rooms')
   .select('assigned_to,service_date')
   .eq('room_id',roomId)
   .lt('service_date',date)
   .not('assigned_to','is',null)
   .neq('assigned_to','')
   .order('service_date',{ascending:false})
   .limit(1)
   .maybeSingle()
  if(previous.error)return NextResponse.json({error:'Unable to load last housekeeper assignment'},{status:500})
  if(previous.data?.assigned_to)lastAssigned={name:String(previous.data.assigned_to).trim(),date:String(previous.data.service_date)}
 }
 const caps=gate.access.capabilities||[]
 const canManage=!gate.access.isPreviewMode&&(gate.access.isAdmin||caps.some((c:string)=>['manager','general_manager','operations_manager','owner'].includes(c)))
 const canInspect=!gate.access.isPreviewMode&&(gate.access.isAdmin||caps.some((c:string)=>['room_checks','ha_signoff','ha_signoff_override','manager','operations_manager','owner'].includes(c)))
 const staffResult=canManage?await admin.from('staff_members').select('name').eq('active',true).order('name'):null
 if(staffResult?.error)return NextResponse.json({error:'Unable to load active staff'},{status:500})
 const staffNames=[...new Set((staffResult?.data||[]).map((m:any)=>String(m.name||'').trim()).filter(Boolean))]
 const status=String(daily?.reservation_status||'').toLowerCase()
 const blocked=status==='blocked'||String(daily?.strip_hold||'').toLowerCase().includes('hold')
 const eligible=Boolean(daily)&&!blocked&&status!=='stayover'&&String(daily?.service_type||'').toUpperCase()!=='RF'
 return NextResponse.json({room:{id:roomResult.data.id,name:roomResult.data.name},date,daily,stay,
  permissions:{canManage,canInspect},staffNames,lastAssigned,
  inspectionEligible:eligible,
  inspectionReady:eligible&&(!daily?.check_issue_open||Boolean(daily?.ready_for_inspection))
 },{headers:{'cache-control':'private, no-store'}})
}
