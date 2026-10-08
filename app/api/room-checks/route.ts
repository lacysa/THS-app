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
    .filter((r:any)=>{
      const status=String(r.reservation_status||'').trim().toLowerCase()
      const stripHold=String(r.strip_hold||'').trim().toLowerCase()
      const service=String(r.service_type||'').trim().toUpperCase()
      return status!=='blocked' && status!=='stayover' && !stripHold.includes('hold') && service!=='RF'
    })
    .map((r:any)=>{
      const latest=latestQualityByRoom.get(String(r.room_id))
      const status=String(r.reservation_status||'').trim().toLowerCase()
      const service=String(r.service_type||'').trim().toUpperCase()
      const activeHskService=
        ['checkout','out/in'].includes(status) ||
        service.startsWith('OUT') ||
        Boolean(r.check_issue_open)
      return {
        roomId:String(r.room_id),
        roomName:roomMap.get(String(r.room_id))?.name||'Room',
        sortOrder:roomMap.get(String(r.room_id))?.sort_order??999,
        reservationStatus:r.reservation_status||'',
        serviceType:r.service_type||'',
        assignedTo:r.assigned_to||'',
        complete:Boolean(r.complete),
        readyForInspection:Boolean(r.ready_for_inspection) || !activeHskService,
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

  if(body?.decision==='pass'||body?.decision==='fail'){
    const date=String(body.date||''),roomId=String(body.roomId||''),note=String(body.note||'').trim()
    const failed=body.decision==='fail'
    if(!validDate(date)||!roomId)return NextResponse.json({error:'Invalid inspection request.'},{status:400})
    if(failed&&!note)return NextResponse.json({error:'A correction note is required for a failed inspection.'},{status:400})
    const admin=createSupabaseAdmin()
    try{
      const [{data:person,error:personError},{data:room,error:roomError}]=await Promise.all([
        admin.from('staff_members').select('id,name').eq('auth_user_id',ctx.access.userId).eq('active',true).maybeSingle(),
        admin.from('housekeeping_daily_rooms').select('*').eq('service_date',date).eq('room_id',roomId).maybeSingle()
      ])
      if(personError||roomError)throw new Error(personError?.message||roomError?.message)
      if(!person)return NextResponse.json({error:'Active staff profile required.'},{status:403})
      if(!room)return NextResponse.json({error:'Room not on the daily board.'},{status:404})
      const status=String(room.reservation_status||'').trim().toLowerCase()
      const service=String(room.service_type||'').trim().toUpperCase()
      if(status==='blocked'||status==='stayover'||String(room.strip_hold||'').toLowerCase().includes('hold')||service==='RF')return NextResponse.json({error:'Room is not eligible for inspection.'},{status:400})
      const needsClean=['checkout','out/in'].includes(status)||service.startsWith('OUT')||Boolean(room.check_issue_open)
      if(needsClean&&(!room.complete||!room.ready_for_inspection))return NextResponse.json({error:'Housekeeper must submit the room before inspection.'},{status:409})
      const now=new Date().toISOString()
      const stage:'inspection'|'recheck'=room.check_issue_open?'recheck':'inspection'
      const attempt_no=await nextAttempt(admin,date,roomId,stage)
      const {data:quality,error:qualityError}=await admin.from('housekeeping_quality_checks').insert({
        service_date:date,room_id:roomId,stage,attempt_no,actor_id:person.id,
        housekeeper_id:room.housekeeper_attested_by||null,status:failed?'fail':'pass',submitted_at:now
      }).select('id').single()
      if(qualityError)throw new Error(qualityError.message)
      const passedCondition=['checkout','vacant','dirty'].includes(status)?'Vacant (Clean)':status==='arrival'&&room.room_condition==='Occupied'?'Occupied':'Ready'
      const patch=failed?{
        complete:false,ready_for_inspection:false,inspected:false,completed_at:null,inspected_at:null,
        room_condition:'Cleaning',check_issue_open:true,check_issue_note:note,
        check_issue_by:person.id,check_issue_at:now,ha_signed_by:null,ha_signed_at:null,
        foh_signed_by:null,foh_signed_at:null,updated_at:now
      }:{
        check_issue_open:false,check_issue_note:null,inspected:true,inspected_by:person.id,
        inspected_at:now,ready_for_inspection:false,room_condition:passedCondition,
        ha_signed_by:person.id,ha_signed_at:now,updated_at:now
      }
      const {error:updateError}=await admin.from('housekeeping_daily_rooms').update(patch).eq('service_date',date).eq('room_id',roomId)
      if(updateError)throw new Error(updateError.message)
      if(failed){
        const assigned=names(String(room.assigned_to||''))
        if(assigned.length){
          const {data:members}=await admin.from('staff_members').select('name,auth_user_id').eq('active',true)
          const recipients=(members||[]).filter((m:any)=>assigned.includes(String(m.name||'').trim().toLowerCase())&&m.auth_user_id)
          if(recipients.length){
            const {error:notifyError}=await admin.from('notifications').insert(recipients.map((m:any)=>({
              recipient_user_id:m.auth_user_id,notification_type:'housekeeping_correction',
              title:'Room correction required',message:person.name+' found: '+note,
              room_id:roomId,service_date:date,created_by:ctx.access.userId
            })))
            if(notifyError)console.error('Correction notification failed:',notifyError.message)
          }
        }
      }else{
        await admin.from('housekeeping_quality_discrepancies').update({corrected_at:now,resolved_recheck_id:quality.id})
          .eq('service_date',date).eq('room_id',roomId).is('corrected_at',null)
      }
      return NextResponse.json({ok:true,decision:failed?'fail':'pass',issue:failed?note:'',checkedAt:now})
    }catch(error:any){return NextResponse.json({error:error?.message||'Could not save inspection.'},{status:500})}
  }
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
    const status=String(dailyRow.reservation_status||'').trim().toLowerCase()
    const stripHold=String(dailyRow.strip_hold||'').trim().toLowerCase()
    const service=String(dailyRow.service_type||'').trim().toUpperCase()
    if(status==='blocked' || status==='stayover' || stripHold.includes('hold') || service==='RF'){
      return NextResponse.json({error:'Blocked, held, stayover, and refresh rooms do not require room inspection.'},{status:400})
    }

    const activeHskService=
      ['checkout','out/in'].includes(status) ||
      String(dailyRow.service_type||'').trim().toUpperCase().startsWith('OUT') ||
      Boolean(dailyRow.check_issue_open)

    if(activeHskService && (!dailyRow.complete||!dailyRow.ready_for_inspection)){
      return NextResponse.json({error:'The room must be complete and ready for room check before inspection.'},{status:400})
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

    let selfCheck:any = null
    if(dailyRow.housekeeper_attested_by){
      const {data:selfCheckRow,error:selfErr}=await admin
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
      selfCheck=selfCheckRow
    }

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

      const currentCondition=String(dailyRow.room_condition||'')
      let passedCondition=currentCondition
      if(status==='checkout' || status==='vacant' || status==='dirty') passedCondition='Vacant (Clean)'
      else if(status==='out/in') passedCondition='Ready'
      else if(status==='arrival' && currentCondition!=='Occupied') passedCondition='Ready'

      const {error:updateErr}=await admin.from('housekeeping_daily_rooms').update({
        check_issue_open:false,
        check_issue_note:null,
        inspected:true,
        inspected_by:person.id,
        inspected_at:now,
        ready_for_inspection:false,
        room_condition:passedCondition,
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
      inspectionCheckId:qualityCheck.id,
      issue:failed.length?failed.map((i:any)=>{const res=resultByItem.get(String(i.id));return `${i.label}${res?.note?`: ${res.note}`:''}`}).join(' · '):''
    })
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Could not save room check.'},{status:500})
  }
}
