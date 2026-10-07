import { NextRequest,NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic='force-dynamic'

function validDate(v:string|null){return Boolean(v&&/^\d{4}-\d{2}-\d{2}$/.test(v))}
function names(v:string){return String(v||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)}

async function context(){
  const access=await getStaffAccess()
  if(!access) return {error:NextResponse.json({error:'Unauthorized'},{status:401})}
  const allowed=access.isAdmin||access.capabilities.some(c=>['room_checks','ha_signoff','ha_signoff_override','manager','operations_manager','owner'].includes(c))
  if(!allowed) return {error:NextResponse.json({error:'Room-check access required.'},{status:403})}
  return {access}
}

async function nextAttempt(admin:any,date:string,roomId:string,stage:'inspection'|'recheck'){
  const {data,error}=await admin.from('housekeeping_quality_checks')
    .select('attempt_no')
    .eq('service_date',date)
    .eq('room_id',roomId)
    .eq('stage',stage)
    .order('attempt_no',{ascending:false})
    .limit(1)
  if(error) throw new Error(error.message)
  return Number((data||[])[0]?.attempt_no||0)+1
}

export async function GET(req:NextRequest){
  const ctx=await context(); if('error' in ctx)return ctx.error
  const date=req.nextUrl.searchParams.get('date')
  if(!validDate(date))return NextResponse.json({error:'Invalid date'},{status:400})

  const admin=createSupabaseAdmin()
  const [{data:rooms,error:rErr},{data:daily,error:dErr},{data:items,error:iErr},{data:results,error:resErr},{data:people,error:pErr},{data:quality,error:qErr}]=await Promise.all([
    admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
    admin.from('housekeeping_daily_rooms').select('*').eq('service_date',date),
    admin.from('room_check_items').select('*').eq('active',true).order('sort_order'),
    admin.from('room_check_results').select('*').eq('service_date',date),
    admin.from('staff_members').select('id,name').eq('active',true),
    admin.from('housekeeping_quality_checks').select('id,room_id,stage,status,submitted_at,housekeeper_id,actor_id').eq('service_date',date).in('stage',['inspection','recheck']).order('submitted_at',{ascending:false})
  ])
  const error=rErr||dErr||iErr||resErr||pErr||qErr
  if(error)return NextResponse.json({error:error.message},{status:500})

  const roomMap=new Map((rooms||[]).map((r:any)=>[String(r.id),r]))
  const resultMap=new Map((results||[]).map((r:any)=>[`${r.room_id}:${r.item_id}`,r]))
  const personMap=new Map((people||[]).map((p:any)=>[String(p.id),String(p.name||'Staff')]))
  const latestQualityByRoom=new Map<string,any>()
  for(const check of quality||[]){
    const key=String((check as any).room_id||'')
    if(key&&!latestQualityByRoom.has(key)) latestQualityByRoom.set(key,check)
  }

  const checkRooms=(daily||[])
    .filter((r:any)=>['checkout','out/in'].includes(String(r.reservation_status||'').toLowerCase())||String(r.service_type||'').toUpperCase().startsWith('OUT'))
    .map((r:any)=>{
      const latest=latestQualityByRoom.get(String(r.room_id))
      return {
        roomId:String(r.room_id),
        roomName:roomMap.get(String(r.room_id))?.name||'Room',
        sortOrder:roomMap.get(String(r.room_id))?.sort_order??999,
        reservationStatus:r.reservation_status||'',
        serviceType:r.service_type||'',
        assignedTo:r.assigned_to||'',
        complete:Boolean(r.complete),
        readyForInspection:Boolean(r.ready_for_inspection),
        issueOpen:Boolean(r.check_issue_open),
        issueNote:r.check_issue_note||'',
        inspected:Boolean(r.inspected),
        housekeeperName:r.housekeeper_attested_by?personMap.get(String(r.housekeeper_attested_by))||'Housekeeper':null,
        latestInspection:latest?{
          stage:latest.stage,
          status:latest.status,
          submittedAt:latest.submitted_at,
          inspectorName:personMap.get(String(latest.actor_id))||'Staff'
        }:null,
        items:(items||[]).map((item:any)=>{
          const saved=resultMap.get(`${r.room_id}:${item.id}`)
          return {id:item.id,zone:item.zone,label:item.label,sortOrder:item.sort_order,passed:saved?.passed??null,note:saved?.note||'',checkedAt:saved?.checked_at||null}
        })
      }
    })
    .sort((a:any,b:any)=>a.sortOrder-b.sortOrder)

  return NextResponse.json({rooms:checkRooms})
}

export async function POST(req:NextRequest){
  const ctx=await context(); if('error' in ctx)return ctx.error
  const body=await req.json().catch(()=>null)
  const date=String(body?.date||''),roomId=String(body?.roomId||''),itemId=String(body?.itemId||'')
  const passed=body?.passed===true?true:body?.passed===false?false:null
  const note=String(body?.note||'').trim()
  if(!validDate(date)||!roomId||!itemId||passed===null)return NextResponse.json({error:'Invalid room-check update.'},{status:400})

  const admin=createSupabaseAdmin()
  try{
    const [{data:person,error:personErr},{data:dailyRow,error:dailyErr}]=await Promise.all([
      admin.from('staff_members').select('id,name').eq('auth_user_id',ctx.access.userId).maybeSingle(),
      admin.from('housekeeping_daily_rooms').select('*').eq('service_date',date).eq('room_id',roomId).maybeSingle()
    ])
    if(personErr) throw new Error(personErr.message)
    if(dailyErr) throw new Error(dailyErr.message)
    if(!person)return NextResponse.json({error:'Staff profile not linked.'},{status:403})
    if(!dailyRow)return NextResponse.json({error:'Room is not on the housekeeping board.'},{status:404})
    if(!dailyRow.complete||!dailyRow.ready_for_inspection){
      return NextResponse.json({error:'The housekeeper must complete the room checklist and mark the room Ready for Inspection before inspection.'},{status:400})
    }

    const now=new Date().toISOString()
    const {error:upErr}=await admin.from('room_check_results').upsert({
      service_date:date,room_id:roomId,item_id:itemId,passed,note,checked_by:person.id,checked_at:now,updated_at:now
    },{onConflict:'service_date,room_id,item_id'})
    if(upErr)throw new Error(upErr.message)

    const [{data:allItems,error:itemErr},{data:allResults,error:resultsErr}]=await Promise.all([
      admin.from('room_check_items').select('id,label').eq('active',true).order('sort_order'),
      admin.from('room_check_results').select('item_id,passed,note').eq('service_date',date).eq('room_id',roomId)
    ])
    if(itemErr) throw new Error(itemErr.message)
    if(resultsErr) throw new Error(resultsErr.message)

    const resultByItem=new Map((allResults||[]).map((r:any)=>[String(r.item_id),r]))
    const completeDraft=(allItems||[]).length>0&&(allItems||[]).every((i:any)=>resultByItem.has(String(i.id)))
    if(!completeDraft){
      return NextResponse.json({ok:true,failed:0,allPassed:false,complete:false})
    }

    const failed=(allItems||[]).filter((i:any)=>resultByItem.get(String(i.id))?.passed===false)
    const allPassed=failed.length===0
    const {count:firstInspectionCount,error:countErr}=await admin
      .from('housekeeping_quality_checks')
      .select('*',{count:'exact',head:true})
      .eq('service_date',date)
      .eq('room_id',roomId)
      .eq('stage','inspection')
    if(countErr) throw new Error(countErr.message)
    const qualityStage:'inspection'|'recheck'=Number(firstInspectionCount||0)===0?'inspection':'recheck'
    const attemptNo=await nextAttempt(admin,date,roomId,qualityStage)

    const {data:selfCheck,error:selfErr}=await admin
      .from('housekeeping_quality_checks')
      .select('id,submitted_at')
      .eq('service_date',date)
      .eq('room_id',roomId)
      .eq('stage','self_check')
      .eq('housekeeper_id',dailyRow.housekeeper_attested_by)
      .order('submitted_at',{ascending:false})
      .limit(1)
      .maybeSingle()
    if(selfErr) throw new Error(selfErr.message)

    const {data:qualityCheck,error:qualityErr}=await admin.from('housekeeping_quality_checks').insert({
      service_date:date,
      room_id:roomId,
      stage:qualityStage,
      attempt_no:attemptNo,
      actor_id:person.id,
      housekeeper_id:dailyRow.housekeeper_attested_by||null,
      status:allPassed?'pass':'fail',
      submitted_at:now
    }).select('id').single()
    if(qualityErr) throw new Error(qualityErr.message)

    const snapshotRows=(allItems||[]).map((item:any)=>{
      const saved=resultByItem.get(String(item.id))
      return {
        check_id:qualityCheck.id,
        item_id:item.id,
        passed:Boolean(saved?.passed),
        note:saved?.note||null,
        checked_at:now
      }
    })
    const {error:snapshotErr}=await admin.from('housekeeping_quality_check_items').insert(snapshotRows)
    if(snapshotErr) throw new Error(snapshotErr.message)

    if(failed.length){
      const discrepancies=failed.map((item:any)=>{
        const res=resultByItem.get(String(item.id))
        return {
          service_date:date,
          room_id:roomId,
          housekeeper_id:dailyRow.housekeeper_attested_by||null,
          inspector_id:person.id,
          item_id:item.id,
          self_check_id:selfCheck?.id||null,
          inspection_check_id:qualityCheck.id,
          note:res?.note||null,
          detected_at:now
        }
      })
      const {error:discErr}=await admin.from('housekeeping_quality_discrepancies').insert(discrepancies)
      if(discErr) throw new Error(discErr.message)

      const issue=failed.map((i:any)=>{
        const res=resultByItem.get(String(i.id))
        return `${i.label}${res?.note?`: ${res.note}`:''}`
      }).join(' · ')

      const {error:updateErr}=await admin.from('housekeeping_daily_rooms').update({
        complete:false,
        ready_for_inspection:false,
        inspected:false,
        completed_at:null,
        room_condition:'Cleaning',
        housekeeper_attested_by:null,
        housekeeper_attested_at:null,
        check_issue_open:true,
        check_issue_note:issue,
        check_issue_by:person.id,
        check_issue_at:now,
        ha_signed_by:null,
        ha_signed_at:null,
        foh_signed_by:null,
        foh_signed_at:null,
        updated_at:now
      }).eq('service_date',date).eq('room_id',roomId)
      if(updateErr) throw new Error(updateErr.message)

      const assigned=names(dailyRow.assigned_to||'')
      if(assigned.length){
        const {data:members}=await admin.from('staff_members').select('name,auth_user_id').eq('active',true)
        const recipients=(members||[]).filter((m:any)=>assigned.includes(String(m.name||'').trim().toLowerCase())&&m.auth_user_id)
        if(recipients.length){
          await admin.from('notifications').insert(recipients.map((m:any)=>({
            recipient_user_id:m.auth_user_id,
            notification_type:'housekeeping_correction',
            title:'Room correction required',
            message:`${person.name} found: ${issue}`,
            room_id:roomId,
            service_date:date,
            created_by:ctx.access.userId
          })))
        }
      }
    }else{
      const {error:resolveErr}=await admin.from('housekeeping_quality_discrepancies').update({
        corrected_at:now,
        resolved_recheck_id:qualityCheck.id
      }).eq('service_date',date).eq('room_id',roomId).is('corrected_at',null)
      if(resolveErr) throw new Error(resolveErr.message)

      const {error:updateErr}=await admin.from('housekeeping_daily_rooms').update({
        check_issue_open:false,
        check_issue_note:null,
        inspected:true,
        inspected_by:person.id,
        inspected_at:now,
        ready_for_inspection:false,
        room_condition:'Vacant (Clean)',
        ha_signed_by:person.id,
        ha_signed_at:now,
        updated_at:now
      }).eq('service_date',date).eq('room_id',roomId)
      if(updateErr) throw new Error(updateErr.message)
    }

    await admin.from('room_check_results').delete().eq('service_date',date).eq('room_id',roomId)

    return NextResponse.json({
      ok:true,
      failed:failed.length,
      allPassed,
      complete:true,
      stage:qualityStage,
      inspectionCheckId:qualityCheck.id
    })
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Could not save room check.'},{status:500})
  }
}
