import { NextRequest, NextResponse } from 'next/server'
import { canUseModule } from '@/lib/access'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { ymdInHotelTz } from '@/lib/time'

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
  const {data,error}=await admin.from('shift_reports')
    .select('tonights_dessert').eq('report_date',reportDate).eq('shift','Daily').maybeSingle()
  if(error)return NextResponse.json({error:'Could not load tonight\'s dessert'},{status:500})
  return NextResponse.json({
    reportDate,
    breakfastDate,
    dessert:String(data?.tonights_dessert||'').trim()
  },{headers:{'Cache-Control':'no-store'}})
}
