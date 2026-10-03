import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic='force-dynamic'

function validDate(value:string|null|undefined){
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

export async function POST(req:NextRequest){
  const access=await getStaffAccess()
  if(!access) return NextResponse.json({error:'Unauthorized'},{status:401})

  const body=await req.json().catch(()=>null)
  const serviceDate=String(body?.serviceDate||'')
  const roomId=String(body?.roomId||'')
  const action=body?.action==='clear'?'clear':body?.action==='flag'?'flag':null
  const note=String(body?.note||'').trim()

  if(!validDate(serviceDate)||!roomId||!action){
    return NextResponse.json({error:'Invalid room-check request.'},{status:400})
  }
  if(action==='flag'&&!note){
    return NextResponse.json({error:'Describe what needs to be corrected.'},{status:400})
  }

  const admin=createSupabaseAdmin()

  try{
    const {data:person,error:personError}=await admin
      .from('staff_members')
      .select('id,name,active')
      .eq('auth_user_id',access.userId)
      .eq('active',true)
      .maybeSingle()

    if(personError) throw new Error(personError.message)
    if(!person) return NextResponse.json({error:'Your login is not linked to an active staff member.'},{status:403})

    const {data:capRows,error:capError}=await admin
      .from('staff_member_capabilities')
      .select('capability_key')
      .eq('staff_member_id',person.id)

    if(capError) throw new Error(capError.message)
    const caps=new Set((capRows||[]).map((r:any)=>String(r.capability_key)))
    const allowed=caps.has('ha_signoff')||caps.has('ha_signoff_override')
    if(!allowed){
      return NextResponse.json({error:'You do not have room-check permission.'},{status:403})
    }

    const {data:roomRow,error:roomError}=await admin
      .from('housekeeping_daily_rooms')
      .select('*')
      .eq('service_date',serviceDate)
      .eq('room_id',roomId)
      .maybeSingle()

    if(roomError) throw new Error(roomError.message)
    if(!roomRow) return NextResponse.json({error:'Room is not on the housekeeping board for this date.'},{status:404})

    const now=new Date().toISOString()

    if(action==='flag'){
      const {error:updateError}=await admin
        .from('housekeeping_daily_rooms')
        .update({
          complete:false,
          ready_for_inspection:false,
          inspected:false,
          completed_at:null,
          room_condition:'Cleaning',
          housekeeper_attested_by:null,
          housekeeper_attested_at:null,
          check_issue_open:true,
          check_issue_note:note,
          check_issue_by:person.id,
          check_issue_at:now,
          ha_signed_by:null,
          ha_signed_at:null,
          foh_signed_by:null,
          foh_signed_at:null,
          updated_at:now
        })
        .eq('service_date',serviceDate)
        .eq('room_id',roomId)

      if(updateError) throw new Error(updateError.message)

      const assignedNames=String(roomRow.assigned_to||'')
        .split(',')
        .map((n:string)=>n.trim().toLowerCase())
        .filter(Boolean)

      if(assignedNames.length){
        const {data:members}=await admin
          .from('staff_members')
          .select('id,name,auth_user_id,active')
          .eq('active',true)

        const recipients=(members||[])
          .filter((m:any)=>assignedNames.includes(String(m.name||'').trim().toLowerCase())&&m.auth_user_id)
          .map((m:any)=>m.auth_user_id)

        if(recipients.length){
          await admin.from('notifications').insert(recipients.map((userId:string)=>({
            recipient_user_id:userId,
            notification_type:'housekeeping_correction',
            title:'Room correction required',
            message:`${person.name} found an issue that must be corrected before you continue: ${note}`,
            href:`/housekeeping#room-${roomId}`,
            created_by:access.userId
          })))
        }
      }

      return NextResponse.json({ok:true,action:'flag'})
    }

    const {error:updateError}=await admin
      .from('housekeeping_daily_rooms')
      .update({
        check_issue_open:false,
        ha_signed_by:person.id,
        ha_signed_at:now,
        ready_for_inspection:false,
        inspected:true,
        inspected_at:now,
        room_condition:'Vacant (Clean)',
        updated_at:now
      })
      .eq('service_date',serviceDate)
      .eq('room_id',roomId)

    if(updateError) throw new Error(updateError.message)

    const assignedNames=String(roomRow.assigned_to||'')
      .split(',')
      .map((n:string)=>n.trim().toLowerCase())
      .filter(Boolean)

    if(assignedNames.length){
      const {data:members}=await admin
        .from('staff_members')
        .select('id,name,auth_user_id,active')
        .eq('active',true)

      const recipients=(members||[])
        .filter((m:any)=>assignedNames.includes(String(m.name||'').trim().toLowerCase())&&m.auth_user_id)
        .map((m:any)=>m.auth_user_id)

      if(recipients.length){
        await admin.from('notifications').insert(recipients.map((userId:string)=>({
          recipient_user_id:userId,
          notification_type:'housekeeping_recheck_passed',
          title:'Room passed re-check',
          message:`${person.name} marked the room as meeting standards. You may continue to your next assigned clean.`,
          href:`/housekeeping#room-${roomId}`,
          created_by:access.userId
        })))
      }
    }

    return NextResponse.json({ok:true,action:'clear',signedBy:person.id,signedName:person.name,signedAt:now})
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Could not update room check.'},{status:500})
  }
}
