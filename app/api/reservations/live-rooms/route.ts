import { NextRequest,NextResponse } from 'next/server'
import { canUseModule } from '@/lib/access'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic='force-dynamic'
export async function GET(req:NextRequest){
 const gate=await canUseModule('reservations')
 if(!gate.access)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(!gate.allowed)return NextResponse.json({error:'Forbidden'},{status:403})
 const date=req.nextUrl.searchParams.get('date')
 if(!date||!/^20\d{2}-\d{2}-\d{2}$/.test(date))return NextResponse.json({error:'Invalid date'},{status:400})
 const result=await createSupabaseAdmin().from('housekeeping_daily_rooms')
  .select('room_id,reservation_status,late_arrival,strip_hold,service_type,room_condition,complete,inspected,housekeeper_attested_by,ha_signed_by,foh_signed_by,check_issue_open')
  .eq('service_date',date)
 if(result.error)return NextResponse.json({error:'Could not refresh live room status'},{status:500})
 return NextResponse.json({rooms:(result.data||[]).map((r:any)=>({
  roomId:String(r.room_id),operationalStatus:String(r.reservation_status||''),
  stripHold:String(r.strip_hold||''),lateArrival:Boolean(r.late_arrival),serviceType:String(r.service_type||''),
  roomCondition:String(r.room_condition||''),complete:Boolean(r.complete),
  inspected:Boolean(r.inspected),housekeeperAttested:Boolean(r.housekeeper_attested_by),
  haChecked:Boolean(r.ha_signed_by),fohChecked:Boolean(r.foh_signed_by),
  checkIssueOpen:Boolean(r.check_issue_open)
 }))},{headers:{'cache-control':'private, no-store'}})
}
