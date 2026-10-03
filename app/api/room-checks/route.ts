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

export async function GET(req:NextRequest){
  const ctx=await context(); if('error' in ctx)return ctx.error
  const date=req.nextUrl.searchParams.get('date')
  if(!validDate(date))return NextResponse.json({error:'Invalid date'},{status:400})
  const admin=createSupabaseAdmin()
  const [{data:rooms,error:rErr},{data:daily,error:dErr},{data:items,error:iErr},{data:results,error:resErr}]=await Promise.all([
    admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
    admin.from('housekeeping_daily_rooms').select('*').eq('service_date',date),
    admin.from('room_check_items').select('*').eq('active',true).order('sort_order'),
    admin.from('room_check_results').select('*').eq('service_date',date)
  ])
  const error=rErr||dErr||iErr||resErr
  if(error)return NextResponse.json({error:error.message},{status:500})
  const roomMap=new Map((rooms||[]).map((r:any)=>[String(r.id),r]))
  const resultMap=new Map((results||[]).map((r:any)=>[`${r.room_id}:${r.item_id}`,r]))
  const checkRooms=(daily||[])
    .filter((r:any)=>['checkout','out/in'].includes(String(r.reservation_status||'').toLowerCase())||String(r.service_type||'').toUpperCase().startsWith('OUT'))
    .map((r:any)=>({
      roomId:String(r.room_id),
      roomName:roomMap.get(String(r.room_id))?.name||'Room',
      sortOrder:roomMap.get(String(r.room_id))?.sort_order??999,
      reservationStatus:r.reservation_status||'',
      serviceType:r.service_type||'',
      assignedTo:r.assigned_to||'',
      complete:Boolean(r.complete),
      issueOpen:Boolean(r.check_issue_open),
      issueNote:r.check_issue_note||'',
      inspected:Boolean(r.inspected),
      items:(items||[]).map((item:any)=>{
        const saved=resultMap.get(`${r.room_id}:${item.id}`)
        return {id:item.id,zone:item.zone,label:item.label,sortOrder:item.sort_order,passed:saved?.passed??null,note:saved?.note||'',checkedAt:saved?.checked_at||null}
      })
    }))
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
  const {data:person}=await admin.from('staff_members').select('id,name').eq('auth_user_id',ctx.access.userId).maybeSingle()
  if(!person)return NextResponse.json({error:'Staff profile not linked.'},{status:403})
  const now=new Date().toISOString()

  const {error:upErr}=await admin.from('room_check_results').upsert({
    service_date:date,room_id:roomId,item_id:itemId,passed,note,checked_by:person.id,checked_at:now,updated_at:now
  },{onConflict:'service_date,room_id,item_id'})
  if(upErr)return NextResponse.json({error:upErr.message},{status:500})

  const [{data:allItems},{data:allResults},{data:dailyRow}]=await Promise.all([
    admin.from('room_check_items').select('id,label').eq('active',true),
    admin.from('room_check_results').select('item_id,passed,note').eq('service_date',date).eq('room_id',roomId),
    admin.from('housekeeping_daily_rooms').select('*').eq('service_date',date).eq('room_id',roomId).maybeSingle()
  ])

  const resultByItem=new Map((allResults||[]).map((r:any)=>[String(r.item_id),r]))
  const failed=(allItems||[]).filter((i:any)=>resultByItem.get(String(i.id))?.passed===false)
  const allPassed=(allItems||[]).length>0&&(allItems||[]).every((i:any)=>resultByItem.get(String(i.id))?.passed===true)

  if(failed.length){
    const issue=failed.map((i:any)=>{
      const res=resultByItem.get(String(i.id))
      return `${i.label}${res?.note?`: ${res.note}`:''}`
    }).join(' · ')
    await admin.from('housekeeping_daily_rooms').update({
      complete:false,ready_for_inspection:false,inspected:false,completed_at:null,
      room_condition:'Cleaning',housekeeper_attested_by:null,housekeeper_attested_at:null,
      check_issue_open:true,check_issue_note:issue,check_issue_by:person.id,check_issue_at:now,
      ha_signed_by:null,ha_signed_at:null,foh_signed_by:null,foh_signed_at:null,updated_at:now
    }).eq('service_date',date).eq('room_id',roomId)

    const assigned=names(dailyRow?.assigned_to||'')
    if(assigned.length){
      const {data:members}=await admin.from('staff_members').select('name,auth_user_id').eq('active',true)
      const recipients=(members||[]).filter((m:any)=>assigned.includes(String(m.name||'').trim().toLowerCase())&&m.auth_user_id)
      if(recipients.length)await admin.from('notifications').insert(recipients.map((m:any)=>({
        recipient_user_id:m.auth_user_id,notification_type:'housekeeping_correction',title:'Room correction required',
        message:`${person.name} found: ${issue}`,room_id:roomId,service_date:date,created_by:ctx.access.userId
      })))
    }
  } else if(allPassed){
    await admin.from('housekeeping_daily_rooms').update({
      check_issue_open:false,check_issue_note:null,inspected:true,inspected_at:now,ready_for_inspection:false,
      room_condition:'Vacant (Clean)',ha_signed_by:person.id,ha_signed_at:now,updated_at:now
    }).eq('service_date',date).eq('room_id',roomId)
  }

  return NextResponse.json({ok:true,failed:failed.length,allPassed})
}
