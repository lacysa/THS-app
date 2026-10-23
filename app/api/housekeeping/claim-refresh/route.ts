import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

function validDate(value:string){ return /^\d{4}-\d{2}-\d{2}$/.test(value) }

export async function POST(req:NextRequest){
  const access=await getStaffAccess()
  if(!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  if(access.isPreviewMode) return NextResponse.json({error:'Owner staff preview is read-only.'},{status:403})
  const body=await req.json().catch(()=>({}))
  const serviceDate=String(body.serviceDate||'')
  const roomId=String(body.roomId||'')
  if(!validDate(serviceDate)||!roomId) return NextResponse.json({error:'Invalid refresh claim.'},{status:400})

  const admin=createSupabaseAdmin()
  const {data:person,error:personErr}=await admin.from('staff_members').select('id,name,active').eq('auth_user_id',access.userId).eq('active',true).maybeSingle()
  if(personErr) return NextResponse.json({error:personErr.message},{status:500})
  if(!person) return NextResponse.json({error:'Staff profile not linked.'},{status:403})

  const [{data:schedule,error:scheduleErr},{data:row,error:rowErr}]=await Promise.all([
    admin.from('staff_daily_schedule').select('work_mode').eq('staff_member_id',person.id).eq('schedule_date',serviceDate).maybeSingle(),
    admin.from('housekeeping_daily_rooms').select('room_id,reservation_status,service_type,assigned_to').eq('service_date',serviceDate).eq('room_id',roomId).maybeSingle()
  ])
  if(scheduleErr) return NextResponse.json({error:scheduleErr.message},{status:500})
  if(rowErr) return NextResponse.json({error:rowErr.message},{status:500})
  if(!row) return NextResponse.json({error:'Room is not on the Housekeeping board.'},{status:404})

  // Every authenticated active staff member may claim an available stayover refresh.
  if(schedule && String(schedule.work_mode)!=='onsite') return NextResponse.json({error:'Only on-site staff can claim a refresh.'},{status:403})

  const status=String(row.reservation_status||'').trim().toLowerCase()
  const service=String(row.service_type||'').trim().toUpperCase()
  const existing=String(row.assigned_to||'').trim()
  if(status!=='stayover'||!['','RF','REFRESH'].includes(service)) return NextResponse.json({error:'Only available Stayover rooms can be claimed.'},{status:400})
  if(existing) return NextResponse.json({error:'This refresh is already assigned to '+existing+'.',alreadyAssigned:true},{status:409})

  // Preserve atomic first-claim-wins behavior for both NULL and empty-string
  // representations of an unassigned housekeeper.
  const now=new Date().toISOString()
  const assignmentFilter='assigned_to.is.null,assigned_to.eq.'
  const {data:claimed,error:claimErr}=await admin.from('housekeeping_daily_rooms')
    .update({assigned_to:person.name,service_type:'RF',updated_at:now})
    .eq('service_date',serviceDate)
    .eq('room_id',roomId)
    .or(assignmentFilter)
    .eq('reservation_status',row.reservation_status)
    .select('room_id,assigned_to,service_type').maybeSingle()
  if(claimErr) return NextResponse.json({error:claimErr.message},{status:500})
  if(!claimed){
    const {data:latest}=await admin.from('housekeeping_daily_rooms')
      .select('assigned_to,reservation_status').eq('service_date',serviceDate).eq('room_id',roomId).maybeSingle()
    if(latest?.assigned_to) return NextResponse.json({error:'This refresh is already assigned to '+latest.assigned_to+'.',alreadyAssigned:true},{status:409})
    return NextResponse.json({error:'The room changed before the refresh could be claimed. Please refresh and try again.'},{status:409})
  }
  return NextResponse.json({ok:true,assignedTo:claimed.assigned_to,serviceType:claimed.service_type})
}