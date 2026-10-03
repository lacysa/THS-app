import { NextRequest, NextResponse } from 'next/server'
import { sendShiftReportEmail, shouldSendNow } from '@/lib/shift-report-email'
import { ymdInHotelTz } from '@/lib/time'

export const dynamic='force-dynamic'
export const maxDuration=60

function authorized(req:NextRequest) {
  const secret=process.env.CRON_SECRET
  if(!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req:NextRequest) {
  if(!authorized(req)) {
    return NextResponse.json({error:'Unauthorized'},{status:401})
  }

  const now=new Date()
  if(!shouldSendNow(now)) {
    return NextResponse.json({
      ok:true,
      skipped:true,
      reason:'not_8pm_eastern'
    })
  }

  const reportDate=ymdInHotelTz(now)

  try {
    const result=await sendShiftReportEmail(reportDate)
    return NextResponse.json({reportDate,...result})
  } catch(error:any) {
    console.error('shift-report-email failed',error)
    return NextResponse.json({
      ok:false,
      reportDate,
      error:error?.message || 'Shift report email failed.'
    },{status:500})
  }
}
