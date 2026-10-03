import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { HOTEL_TIMEZONE, ymdInHotelTz } from '@/lib/time'

const RECIPIENT = process.env.SHIFT_REPORT_RECIPIENT || 'innkeeper@thehotelsaugatuck.com'

function nextDate(value:string) {
  const d = new Date(`${value}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate()+1)
  return d.toISOString().slice(0,10)
}

function pretty(value:string) {
  const [y,m,d] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US',{
    timeZone:'UTC',
    weekday:'long',
    month:'long',
    day:'numeric',
    year:'numeric'
  }).format(new Date(Date.UTC(y,m-1,d,12)))
}

function localHour(date=new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US',{
      timeZone:HOTEL_TIMEZONE,
      hour:'2-digit',
      minute:'2-digit',
      hourCycle:'h23'
    }).formatToParts(date)
      .filter(p=>p.type!=='literal')
      .map(p=>[p.type,p.value])
  )
  return {hour:Number(parts.hour),minute:Number(parts.minute)}
}

export function shouldSendNow(date=new Date()) {
  const {hour} = localHour(date)
  return hour === 20
}

export async function buildShiftReportData(reportDate:string) {
  const admin = createSupabaseAdmin()
  const breakfastDate = nextDate(reportDate)

  const [
    roomsRes,
    hkRes,
    breakfastRes,
    menuNotesRes,
    maintenanceRes,
    roomNotesRes,
    staffRes,
    reportRes,
    inventoryRes
  ] = await Promise.all([
    admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
    admin.from('housekeeping_daily_rooms').select('*').eq('service_date',reportDate),
    admin.from('breakfast_bookings').select('*').eq('service_date',breakfastDate),
    admin.from('breakfast_menu_notes').select('booking_id,note'),
    admin.from('maintenance_work_orders').select('*').order('created_at',{ascending:false}),
    admin.from('room_notes').select('*').or(`service_date.eq.${reportDate},note_type.eq.persistent`).order('created_at',{ascending:false}),
    admin.from('staff_members').select('id,name'),
    admin.from('shift_reports').select('*').eq('report_date',reportDate).eq('shift','Daily').maybeSingle(),
    admin.from('inventory_requests').select('*').not('status','in','("received","cancelled")').order('requested_at',{ascending:false})
  ])

  const errors=[roomsRes.error,hkRes.error,breakfastRes.error,menuNotesRes.error,maintenanceRes.error,roomNotesRes.error,staffRes.error,reportRes.error,inventoryRes.error].filter(Boolean)
  if (errors.length) throw new Error(errors[0]!.message)

  const rooms=roomsRes.data||[]
  const roomMap=new Map(rooms.map((r:any)=>[String(r.id),String(r.name)]))
  const staffMap=new Map((staffRes.data||[]).map((s:any)=>[String(s.id),String(s.name)]))
  const menuNoteMap=new Map((menuNotesRes.data||[]).map((n:any)=>[String(n.booking_id),String(n.note||'')]))

  const housekeeping=(hkRes.data||[]).map((r:any)=>({
    room:roomMap.get(String(r.room_id))||'Room',
    serviceType:r.service_type||'',
    assignedTo:r.assigned_to||'',
    complete:Boolean(r.complete),
    inspected:Boolean(r.inspected),
    notes:[r.room_condition,r.next_shift_condition,r.notes].filter(Boolean).join(' · ')
  }))

  const breakfast=(breakfastRes.data||[]).map((b:any)=>({
    id:String(b.id),
    room:roomMap.get(String(b.room_id))||'Room',
    lastName:b.last_name||'',
    time:b.time_slot||'',
    status:b.status||'',
    menuSubmitted:Boolean(b.menu_submitted),
    note:menuNoteMap.get(String(b.id))||''
  }))

  const maintenance=(maintenanceRes.data||[]).filter((m:any)=>{
    if(m.status!=='complete') return true
    if(!m.completed_at) return false
    return ymdInHotelTz(new Date(m.completed_at))===reportDate
  }).map((m:any)=>({
    room:m.room_id ? roomMap.get(String(m.room_id))||'Room' : (m.area||'Property'),
    title:m.title||'',
    priority:m.priority||'medium',
    status:m.status||'open',
    assignedTo:m.assigned_staff_id ? staffMap.get(String(m.assigned_staff_id))||'' : '',
    completedAt:m.completed_at||null
  }))

  const roomNotes=(roomNotesRes.data||[])
    .filter((n:any)=>n.include_in_shift_report && (n.note_type!=='persistent' || !n.resolved))
    .map((n:any)=>({
      room:roomMap.get(String(n.room_id))||'Room',
      type:n.note_type||'daily',
      note:n.note||''
    }))

  const inventory=(inventoryRes.data||[]).map((r:any)=>({
    department:r.department||'',
    item:r.item_name||'',
    qty:r.requested_qty||'',
    note:r.note||'',
    status:r.status||'requested'
  }))

  return {
    reportDate,
    breakfastDate,
    housekeeping,
    breakfast,
    maintenance,
    roomNotes,
    inventory,
    report:reportRes.data||null
  }
}

function splitText(text:string,max=94) {
  const words=String(text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean)
  const lines:string[]=[]
  let line=''
  for(const word of words){
    const next=line ? `${line} ${word}` : word
    if(next.length>max && line){ lines.push(line); line=word }
    else line=next
  }
  if(line) lines.push(line)
  return lines
}

export async function makeShiftReportPdf(data:Awaited<ReturnType<typeof buildShiftReportData>>) {
  const pdf=await PDFDocument.create()
  const regular=await pdf.embedFont(StandardFonts.Helvetica)
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold)
  const pageSize:[number,number]=[612,792]
  let page=pdf.addPage(pageSize)
  let y=752

  const addPage=()=>{ page=pdf.addPage(pageSize); y=752 }
  const ensure=(needed:number)=>{ if(y-needed<42) addPage() }
  const line=(text:string,size=9,indent=0,font=regular)=>{
    for(const piece of splitText(text,92-Math.floor(indent/5))){
      ensure(size+5)
      page.drawText(piece,{x:42+indent,y,size,font,color:rgb(.16,.16,.15)})
      y-=size+4
    }
  }
  const heading=(text:string)=>{
    ensure(28)
    y-=7
    page.drawText(text,{x:42,y,size:13,font:bold,color:rgb(.12,.12,.11)})
    y-=18
  }
  const bullet=(text:string)=>line(`• ${text}`,9,8)

  page.drawText('THE HOTEL SAUGATUCK',{x:42,y,size:10,font:bold,color:rgb(.4,.39,.36)})
  y-=24
  page.drawText('Daily Shift Report',{x:42,y,size:22,font:bold,color:rgb(.12,.12,.11)})
  y-=20
  page.drawText(pretty(data.reportDate),{x:42,y,size:11,font:regular,color:rgb(.35,.34,.31)})
  y-=24

  heading('Housekeeping')
  const completed=data.housekeeping.filter(r=>r.complete).length
  line(`${completed} of ${data.housekeeping.length} rooms complete.`)
  data.housekeeping.filter(r=>r.notes).forEach(r=>bullet(`${r.room}: ${r.notes}`))
  data.roomNotes.forEach(r=>bullet(`${r.room} (${r.type}): ${r.note}`))

  heading(`Breakfast · ${pretty(data.breakfastDate)}`)
  const scheduled=data.breakfast.filter(r=>r.status==='scheduled')
  line(`${scheduled.length} scheduled · ${scheduled.filter(r=>r.menuSubmitted).length} menus received · ${scheduled.filter(r=>!r.menuSubmitted).length} missing.`)
  data.breakfast.forEach(r=>{
    const bits=[r.status==='declined'?'Declined':r.menuSubmitted?'Menu received':'Menu needed']
    if(r.note) bits.push(`Note: ${r.note}`)
    bullet(`${r.room}${r.lastName?` · ${r.lastName}`:''}: ${bits.join(' · ')}`)
  })

  heading('Maintenance')
  const open=data.maintenance.filter(r=>r.status!=='complete')
  const done=data.maintenance.filter(r=>r.status==='complete')
  line(`${open.length} open/carryover · ${done.length} completed today.`)
  data.maintenance.forEach(r=>bullet(`${r.room}: ${r.title} · ${r.priority} · ${r.status}${r.assignedTo?` · ${r.assignedTo}`:''}`))

  heading('Inventory / Order Requests')
  if(!data.inventory.length) line('No open inventory requests.')
  data.inventory.forEach(r=>bullet(`${r.department.replace(/_/g,' ')}: ${r.item}${r.qty?` · Qty ${r.qty}`:''}${r.note?` · ${r.note}`:''} · ${r.status}`))

  const report:any=data.report||{}
  const narratives=[
    ['Guest Notes',report.guest_notes],
    ['Staff Notes',report.staff_notes],
    ['Supplies / Inventory Notes',report.supplies_notes],
    ['Tomorrow',report.tomorrow_notes],
    ['General Notes',report.general_notes],
    ['Management Notes',report.management_notes]
  ]
  for(const [label,value] of narratives){
    heading(String(label))
    line(String(value||'No notes entered.'))
  }

  return Buffer.from(await pdf.save())
}

export async function sendShiftReportEmail(reportDate:string) {
  const admin=createSupabaseAdmin()

  const {data:existing}=await admin
    .from('shift_report_email_log')
    .select('*')
    .eq('report_date',reportDate)
    .eq('shift','Daily')
    .eq('recipient',RECIPIENT)
    .maybeSingle()

  if(existing?.status==='sent') {
    return {ok:true,skipped:true,reason:'already_sent',messageId:existing.provider_message_id||null}
  }

  const apiKey=process.env.RESEND_API_KEY
  if(!apiKey) throw new Error('RESEND_API_KEY is not configured.')
  const from=process.env.SHIFT_REPORT_FROM_EMAIL || 'The Hotel Saugatuck <reports@thehotelsaugatuck.com>'

  const data=await buildShiftReportData(reportDate)
  const pdf=await makeShiftReportPdf(data)

  await admin.from('shift_report_email_log').upsert({
    report_date:reportDate,
    shift:'Daily',
    recipient:RECIPIENT,
    status:'pending',
    error_message:null,
    updated_at:new Date().toISOString()
  },{onConflict:'report_date,shift,recipient'})

  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{
      Authorization:`Bearer ${apiKey}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({
      from,
      to:[RECIPIENT],
      subject:`The Hotel Saugatuck Shift Report · ${pretty(reportDate)}`,
      html:`<p>The Hotel Saugatuck daily shift report for <strong>${pretty(reportDate)}</strong> is attached.</p><p>This report was generated automatically at 8:00 PM Eastern.</p>`,
      attachments:[{
        filename:`THS-Shift-Report-${reportDate}.pdf`,
        content:pdf.toString('base64')
      }]
    })
  })

  const body=await response.json().catch(()=>({}))
  if(!response.ok){
    const error=body?.message || `Email provider returned ${response.status}`
    await admin.from('shift_report_email_log').upsert({
      report_date:reportDate,
      shift:'Daily',
      recipient:RECIPIENT,
      status:'failed',
      error_message:error,
      updated_at:new Date().toISOString()
    },{onConflict:'report_date,shift,recipient'})
    throw new Error(error)
  }

  const messageId=String(body?.id||'')
  await admin.from('shift_report_email_log').upsert({
    report_date:reportDate,
    shift:'Daily',
    recipient:RECIPIENT,
    status:'sent',
    provider_message_id:messageId||null,
    error_message:null,
    sent_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  },{onConflict:'report_date,shift,recipient'})

  return {ok:true,skipped:false,messageId}
}

export { RECIPIENT }
