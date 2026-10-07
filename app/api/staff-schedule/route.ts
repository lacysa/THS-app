import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

function validDate(value:string|null){ return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)) }

export async function GET(req:NextRequest){
  const access=await getStaffAccess()
  if(!access || access.roleName!=='Owner') return NextResponse.json({error:'Forbidden'},{status:403})
  const date=req.nextUrl.searchParams.get('date')
  if(!validDate(date)) return NextResponse.json({error:'Invalid date'},{status:400})

  const admin=createSupabaseAdmin()
  const [{data:staff,error:staffError},{data:schedule,error:scheduleError}]=await Promise.all([
    admin.from('staff_members').select('id,name,job_title,active').eq('active',true).order('name'),
    admin.from('staff_daily_schedule').select('*').eq('schedule_date',date)
  ])
  if(staffError) return NextResponse.json({error:staffError.message},{status:400})
  if(scheduleError) return NextResponse.json({error:scheduleError.message},{status:400})

  const byMember=new Map((schedule||[]).map((row:any)=>[String(row.staff_member_id),row]))
  return NextResponse.json({
    date,
    staff:(staff||[]).map((person:any)=>{
      const row=byMember.get(String(person.id))
      return {
        id:String(person.id),
        name:String(person.name||'Staff'),
        jobTitle:String(person.job_title||''),
        workMode:String(row?.work_mode||'unscheduled'),
        shiftStart:row?.shift_start ? String(row.shift_start).slice(0,5) : '',
        shiftEnd:row?.shift_end ? String(row.shift_end).slice(0,5) : '',
        roleLabel:String(row?.role_label||''),
        notes:String(row?.notes||'')
      }
    })
  })
}

export async function POST(req:NextRequest){
  const access=await getStaffAccess()
  if(!access || access.roleName!=='Owner') return NextResponse.json({error:'Forbidden'},{status:403})

  const body=await req.json().catch(()=>({}))
  const date=String(body.date||'')
  const staffMemberId=String(body.staff_member_id||'')
  const workMode=String(body.work_mode||'unscheduled')
  if(!validDate(date) || !staffMemberId) return NextResponse.json({error:'Invalid schedule entry'},{status:400})

  const admin=createSupabaseAdmin()
  if(workMode==='unscheduled'){
    const {error}=await admin.from('staff_daily_schedule').delete().eq('schedule_date',date).eq('staff_member_id',staffMemberId)
    if(error) return NextResponse.json({error:error.message},{status:400})
    return NextResponse.json({ok:true})
  }

  if(!['onsite','remote','time_off','unavailable'].includes(workMode)){
    return NextResponse.json({error:'Invalid work mode'},{status:400})
  }

  const {error}=await admin.from('staff_daily_schedule').upsert({
    staff_member_id:staffMemberId,
    schedule_date:date,
    shift_start:body.shift_start||null,
    shift_end:body.shift_end||null,
    role_label:String(body.role_label||'').trim()||null,
    work_mode:workMode,
    notes:String(body.notes||'').trim()||null,
    updated_at:new Date().toISOString()
  },{onConflict:'staff_member_id,schedule_date'})
  if(error) return NextResponse.json({error:error.message},{status:400})
  return NextResponse.json({ok:true})
}
