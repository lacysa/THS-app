import { NextRequest,NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic='force-dynamic'

function validDate(value:string|null|undefined){
  return Boolean(value&&/^\d{4}-\d{2}-\d{2}$/.test(value))
}

function assignedNames(value:string){
  return String(value||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean)
}

async function currentPerson(admin:ReturnType<typeof createSupabaseAdmin>,userId:string){
  const {data,error}=await admin.from('staff_members').select('id,name,active').eq('auth_user_id',userId).eq('active',true).maybeSingle()
  if(error) throw new Error(error.message)
  return data
}

async function latestSelfCheck(admin:ReturnType<typeof createSupabaseAdmin>,date:string,roomId:string,housekeeperId:string){
  const {data,error}=await admin
    .from('housekeeping_quality_checks')
    .select('id,attempt_no,submitted_at,status')
    .eq('service_date',date)
    .eq('room_id',roomId)
    .eq('stage','self_check')
    .eq('housekeeper_id',housekeeperId)
    .order('submitted_at',{ascending:false})
    .limit(1)
    .maybeSingle()
  if(error) throw new Error(error.message)
  return data
}

export async function GET(req:NextRequest){
  const access=await getStaffAccess()
  if(!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  const date=req.nextUrl.searchParams.get('date')
  const roomId=req.nextUrl.searchParams.get('roomId')
  if(!validDate(date)||!roomId) return NextResponse.json({error:'Invalid checklist request.'},{status:400})

  const admin=createSupabaseAdmin()
  try{
    const person=await currentPerson(admin,access.userId)
    if(!person) return NextResponse.json({error:'Your login is not linked to an active staff member.'},{status:403})

    const [{data:daily,error:dailyError},{data:items,error:itemError},latest]=await Promise.all([
      admin.from('housekeeping_daily_rooms').select('assigned_to,check_issue_open,check_issue_at,complete').eq('service_date',date).eq('room_id',roomId).maybeSingle(),
      admin.from('room_check_items').select('id,zone,label,sort_order').eq('active',true).order('sort_order'),
      latestSelfCheck(admin,date as string,roomId,person.id)
    ])

    if(dailyError) throw new Error(dailyError.message)
    if(itemError) throw new Error(itemError.message)
    if(!daily) return NextResponse.json({error:'Room is not on today\'s housekeeping board.'},{status:404})

    const assigned=assignedNames(daily.assigned_to)
    const manager=access.isAdmin||access.capabilities.some(c=>['manager','general_manager','operations_manager','owner'].includes(c))
    if(!manager && !assigned.includes(String(person.name||'').trim().toLowerCase())){
      return NextResponse.json({error:'This room is not assigned to you.'},{status:403})
    }

    let validSubmission=false
    if(latest?.submitted_at){
      const issueAt=daily.check_issue_at ? new Date(daily.check_issue_at).getTime() : 0
      validSubmission=new Date(latest.submitted_at).getTime() > issueAt
    }

    return NextResponse.json({
      items:items||[],
      submitted:Boolean(validSubmission),
      submittedAt:validSubmission?latest?.submitted_at:null,
      attemptNo:validSubmission?latest?.attempt_no:null,
      correctionOpen:Boolean(daily.check_issue_open)
    })
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Could not load room checklist.'},{status:500})
  }
}

export async function POST(req:NextRequest){
  const access=await getStaffAccess()
  if(!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  const body=await req.json().catch(()=>null)
  const date=String(body?.date||'')
  const roomId=String(body?.roomId||'')
  const checkedIds=Array.isArray(body?.checkedItemIds)?[...new Set(body.checkedItemIds.map(String))]:[]
  if(!validDate(date)||!roomId) return NextResponse.json({error:'Invalid checklist submission.'},{status:400})

  const admin=createSupabaseAdmin()
  try{
    const person=await currentPerson(admin,access.userId)
    if(!person) return NextResponse.json({error:'Your login is not linked to an active staff member.'},{status:403})

    const [{data:daily,error:dailyError},{data:items,error:itemError},{data:previous,error:previousError}]=await Promise.all([
      admin.from('housekeeping_daily_rooms').select('assigned_to,check_issue_at').eq('service_date',date).eq('room_id',roomId).maybeSingle(),
      admin.from('room_check_items').select('id,zone,label,sort_order').eq('active',true).order('sort_order'),
      admin.from('housekeeping_quality_checks').select('attempt_no').eq('service_date',date).eq('room_id',roomId).eq('stage','self_check').order('attempt_no',{ascending:false}).limit(1)
    ])

    if(dailyError) throw new Error(dailyError.message)
    if(itemError) throw new Error(itemError.message)
    if(previousError) throw new Error(previousError.message)
    if(!daily) return NextResponse.json({error:'Room is not on today\'s housekeeping board.'},{status:404})

    const assigned=assignedNames(daily.assigned_to)
    const manager=access.isAdmin||access.capabilities.some(c=>['manager','general_manager','operations_manager','owner'].includes(c))
    if(!manager && !assigned.includes(String(person.name||'').trim().toLowerCase())){
      return NextResponse.json({error:'This room is not assigned to you.'},{status:403})
    }

    const activeIds=(items||[]).map((item:any)=>String(item.id))
    if(!activeIds.length) return NextResponse.json({error:'No active room-check items are configured.'},{status:400})
    const checked=new Set(checkedIds)
    const missing=(items||[]).filter((item:any)=>!checked.has(String(item.id)))
    if(missing.length){
      return NextResponse.json({error:`Complete every checklist item before submitting. ${missing.length} item${missing.length===1?' is':'s are'} still unchecked.`},{status:400})
    }

    const now=new Date().toISOString()
    const attemptNo=Number((previous||[])[0]?.attempt_no||0)+1
    const {data:check,error:checkError}=await admin.from('housekeeping_quality_checks').insert({
      service_date:date,
      room_id:roomId,
      stage:'self_check',
      attempt_no:attemptNo,
      actor_id:person.id,
      housekeeper_id:person.id,
      status:'pass',
      submitted_at:now
    }).select('id,attempt_no,submitted_at').single()
    if(checkError) throw new Error(checkError.message)

    const itemRows=activeIds.map(itemId=>({
      check_id:check.id,
      item_id:itemId,
      passed:true,
      checked_at:now
    }))
    const {error:itemsInsertError}=await admin.from('housekeeping_quality_check_items').insert(itemRows)
    if(itemsInsertError) throw new Error(itemsInsertError.message)

    const {error:updateError}=await admin.from('housekeeping_daily_rooms').update({
      housekeeper_attested_by:person.id,
      housekeeper_attested_at:now,
      updated_at:now
    }).eq('service_date',date).eq('room_id',roomId)
    if(updateError) throw new Error(updateError.message)

    return NextResponse.json({
      ok:true,
      submittedAt:now,
      attemptNo,
      housekeeperId:person.id,
      housekeeperName:person.name
    })
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Could not submit room checklist.'},{status:500})
  }
}
