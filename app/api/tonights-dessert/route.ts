import { NextRequest, NextResponse } from 'next/server'
import { canUseModule } from '@/lib/access'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { ymdInHotelTz } from '@/lib/time'
import {normalizeDessertEntries,resolveDessertAssignments} from '@/lib/shift-desserts'

export const dynamic='force-dynamic'

function shiftDay(date:string,days:number){
  const d=new Date(date+'T12:00:00Z')
  d.setUTCDate(d.getUTCDate()+days)
  return d.toISOString().slice(0,10)
}

/** Read-only. Never expose the rest of the management shift report. */
export async function GET(req:NextRequest){
  const date=req.nextUrl.searchParams.get('serviceDate')||''
  if(!/^20\d\d-\d\d-\d\d$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z')))
    return NextResponse.json({error:'Invalid service date'},{status:400})
  const [frontDesk,dailyOverview]=await Promise.all([
    canUseModule('front_desk'),canUseModule('daily_overview')
  ])
  if(!frontDesk.access&&!dailyOverview.access)
    return NextResponse.json({error:'Unauthorized'},{status:401})
  if(!frontDesk.allowed&&!dailyOverview.allowed)
    return NextResponse.json({error:'Forbidden'},{status:403})

  // Front Desk/Daily Overview roll their breakfast date forward at 10:30.
  // Before rollover, show dessert for tonight; after rollover, the selected
  // breakfast date is tomorrow, so show the preceding evening's dessert.
  const today=ymdInHotelTz()
  const reportDate=date===today?today:shiftDay(date,-1)
  const breakfastDate=shiftDay(reportDate,1)
  const admin=createSupabaseAdmin()
  const [report,roomData,bookings,tags]=await Promise.all([
    admin.from('shift_reports').select('tonights_dessert,dessert_assignments')
      .eq('report_date',reportDate).eq('shift','Daily').maybeSingle(),
    admin.from('rooms').select('id,name').eq('active',true),
    admin.from('breakfast_bookings').select('room_id,status').eq('service_date',breakfastDate),
    admin.from('housekeeping_daily_rooms').select('room_id,breakfast_skipped')
      .eq('service_date',reportDate).eq('breakfast_tag',true)
  ])
  const error=report.error||roomData.error||bookings.error||tags.error
  if(error)return NextResponse.json({error:'Could not load tonight\'s dessert'},{status:500})
  const names=new Map((roomData.data||[]).map((r:any)=>[String(r.id),String(r.name)]))
  const eligible=new Set<string>()
  const booked=new Set<string>()
  for(const booking of bookings.data||[]){
    const id=String(booking.room_id||'')
    if(!id||!names.has(id))continue
    booked.add(id)
    if(booking.status==='scheduled')eligible.add(id)
  }
  for(const tag of tags.data||[]){
    const id=String(tag.room_id||'')
    if(id&&!booked.has(id)&&!tag.breakfast_skipped&&names.has(id))eligible.add(id)
  }
  const allRooms=[...eligible].map(id=>({roomId:id,roomName:names.get(id)||'Room'}))
    .sort((a,b)=>a.roomName.localeCompare(b.roomName))
  const entries=normalizeDessertEntries(report.data?.dessert_assignments,report.data?.tonights_dessert||'')
  const allocated=resolveDessertAssignments(entries,allRooms)
  const assigned=new Set(allocated.flatMap(entry=>entry.rooms.map(room=>room.roomId)))
  return NextResponse.json({
    reportDate,breakfastDate,
    dessert:entries.length===1?entries[0].name:'',
    desserts:allocated.map(entry=>({
      id:entry.id,name:entry.name,rooms:entry.rooms,allRooms:entry.allRooms
    })),
    unassignedRooms:allRooms.filter(room=>!assigned.has(room.roomId))
  },{headers:{'Cache-Control':'no-store'}})
}
