import { NextRequest,NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic='force-dynamic'

function todayHotel(){
  return new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Detroit',
    year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date())
}

function addDays(value:string,amount:number){
  const d=new Date(value+'T12:00:00Z')
  d.setUTCDate(d.getUTCDate()+amount)
  return d.toISOString().slice(0,10)
}

function weekStart(value:string){
  const d=new Date(value+'T12:00:00Z')
  const day=d.getUTCDay()
  const offset=day===0?-6:1-day
  d.setUTCDate(d.getUTCDate()+offset)
  return d.toISOString().slice(0,10)
}

function pct(n:number,d:number){
  return d?Math.round((n/d)*1000)/10:0
}

export async function GET(req:NextRequest){
  const access=await getStaffAccess()
  if(!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  const manager=access.isAdmin||access.capabilities.some(c=>['manager','general_manager','operations_manager','owner'].includes(c))
  if(!manager) return NextResponse.json({error:'Manager access required.'},{status:403})

  const requested=Number(req.nextUrl.searchParams.get('days')||30)
  const days=[30,60,90].includes(requested)?requested:30
  const end=todayHotel()
  const start=addDays(end,-(days-1))
  const admin=createSupabaseAdmin()

  try{
    const [{data:checks,error:checkErr},{data:discrepancies,error:discErr},{data:people,error:peopleErr},{data:items,error:itemErr},{data:corrections,error:correctionErr},{data:dailyAssignments,error:assignErr},{data:roomNames,error:roomErr}]=await Promise.all([
      admin.from('housekeeping_quality_checks')
        .select('id,service_date,room_id,stage,housekeeper_id,actor_id,status,submitted_at')
        .gte('service_date',start)
        .lte('service_date',end)
        .in('stage',['inspection','recheck'])
        .order('service_date'),
      admin.from('housekeeping_quality_discrepancies')
        .select('id,service_date,room_id,housekeeper_id,inspector_id,item_id,inspection_check_id,detected_at,corrected_at')
        .gte('service_date',start)
        .lte('service_date',end),
      admin.from('staff_members').select('id,name').eq('active',true),
      admin.from('room_check_items').select('id,zone,label').eq('active',true),
      admin.from('housekeeping_correction_events').select('id,service_date,room_id,event_type,note,created_at').gte('service_date',start).lte('service_date',end).order('created_at',{ascending:false}).limit(1000),
      admin.from('housekeeping_daily_rooms').select('service_date,room_id,assigned_to').gte('service_date',start).lte('service_date',end),
      admin.from('rooms').select('id,name')
    ])
    const error=checkErr||discErr||peopleErr||itemErr||correctionErr||assignErr||roomErr
    if(error) throw new Error(error.message)

    // Room Operations correction history is an independent source from formal checklist inspections.
    // Count each "found" once; its matching "fixed" event is resolution, not another miss.
    const assignmentByRoomDay=new Map((dailyAssignments||[]).map((row:any)=>[
      String(row.service_date)+'|'+String(row.room_id),String(row.assigned_to||'').trim()
    ]))
    const roomNameById=new Map((roomNames||[]).map((row:any)=>[String(row.id),String(row.name||'Room')]))
    const idsByName=new Map<string,string[]>()
    for(const person of people||[]){
      const key=String((person as any).name||'').trim().toLowerCase()
      idsByName.set(key,[...(idsByName.get(key)||[]),String((person as any).id)])
    }
    const fixedKeys=new Set((corrections||[]).filter((event:any)=>event.event_type==='fixed')
      .map((event:any)=>[event.service_date,event.room_id,String(event.note||'').trim()].join('|')))
    const documentedCorrections=(corrections||[])
      .filter((event:any)=>event.event_type==='found')
      .map((event:any)=>{
        const key=[event.service_date,event.room_id,String(event.note||'').trim()].join('|')
        const assignment=assignmentByRoomDay.get(String(event.service_date)+'|'+String(event.room_id))||''
        // Do not guess if there are multiple cleaners or ambiguous names.
        const matchedIds=idsByName.get(assignment.toLowerCase())||[]
        const housekeeperId=matchedIds.length===1?matchedIds[0]:null
        return {id:String(event.id),serviceDate:String(event.service_date),roomName:roomNameById.get(String(event.room_id))||'Room',
          housekeeperId,housekeeperName:housekeeperId?assignment:null,assignedTo:assignment||null,
          note:String(event.note||''),resolved:fixedKeys.has(key),createdAt:String(event.created_at)}
      })
    const documentedByHousekeeper=new Map<string,typeof documentedCorrections>()
    for(const entry of documentedCorrections){
      if(!entry.housekeeperId)continue
      const previous=documentedByHousekeeper.get(entry.housekeeperId)||[]
      previous.push(entry)
      documentedByHousekeeper.set(entry.housekeeperId,previous)
    }

    const nameById=new Map((people||[]).map((p:any)=>[String(p.id),String(p.name||'Staff')]))
    const itemById=new Map((items||[]).map((i:any)=>[String(i.id),{label:String(i.label||'Checklist item'),zone:String(i.zone||'Other')}]))

    const firstInspections=(checks||[]).filter((c:any)=>c.stage==='inspection')
    const rechecks=(checks||[]).filter((c:any)=>c.stage==='recheck')
    const firstPasses=firstInspections.filter((c:any)=>c.status==='pass').length
    const unresolved=(discrepancies||[]).filter((d:any)=>!d.corrected_at).length

    const correctionMinutes=(discrepancies||[])
      .filter((d:any)=>d.corrected_at&&d.detected_at)
      .map((d:any)=>(new Date(d.corrected_at).getTime()-new Date(d.detected_at).getTime())/60000)
      .filter((v:number)=>Number.isFinite(v)&&v>=0)

    const department={
      roomsInspected:firstInspections.length,
      firstPasses,
      firstPassRate:pct(firstPasses,firstInspections.length),
      discrepancies:(discrepancies||[]).length,
      missesPer100Rooms:firstInspections.length?Math.round(((discrepancies||[]).length/firstInspections.length)*1000)/10:0,
      rechecks:rechecks.length,
      unresolved,
      averageCorrectionMinutes:correctionMinutes.length?Math.round(correctionMinutes.reduce((a:number,b:number)=>a+b,0)/correctionMinutes.length):null
    }

    const weeklyMap=new Map<string,{week:string;inspections:number;passes:number;discrepancies:number}>()
    for(const check of firstInspections as any[]){
      const week=weekStart(String(check.service_date))
      const row=weeklyMap.get(week)||{week,inspections:0,passes:0,discrepancies:0}
      row.inspections+=1
      if(check.status==='pass') row.passes+=1
      weeklyMap.set(week,row)
    }
    for(const disc of discrepancies||[]){
      const week=weekStart(String((disc as any).service_date))
      const row=weeklyMap.get(week)||{week,inspections:0,passes:0,discrepancies:0}
      row.discrepancies+=1
      weeklyMap.set(week,row)
    }
    const weekly=[...weeklyMap.values()]
      .sort((a,b)=>a.week.localeCompare(b.week))
      .map(row=>({...row,firstPassRate:pct(row.passes,row.inspections)}))

    const housekeeperIds=new Set<string>()
    for(const check of firstInspections as any[]) if(check.housekeeper_id) housekeeperIds.add(String(check.housekeeper_id))
    for(const disc of discrepancies||[]) if((disc as any).housekeeper_id) housekeeperIds.add(String((disc as any).housekeeper_id))
    for(const id of documentedByHousekeeper.keys()) housekeeperIds.add(id)

    const individuals=[...housekeeperIds].map(id=>{
      const inspections=(firstInspections as any[]).filter(c=>String(c.housekeeper_id||'')===id)
      const passes=inspections.filter(c=>c.status==='pass').length
      const personDiscs=(discrepancies||[]).filter((d:any)=>String(d.housekeeper_id||'')===id)
      const missCounts=new Map<string,number>()
      for(const disc of personDiscs as any[]){
        const itemId=String(disc.item_id||'')
        missCounts.set(itemId,(missCounts.get(itemId)||0)+1)
      }
      const commonMisses=[...missCounts.entries()]
        .map(([itemId,count])=>({itemId,count,...(itemById.get(itemId)||{label:'Checklist item',zone:'Other'})}))
        .sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label))
        .slice(0,3)
      return {
        housekeeperId:id,
        name:nameById.get(id)||'Former staff member',
        roomsInspected:inspections.length,
        firstPasses:passes,
        firstPassRate:pct(passes,inspections.length),
        discrepancies:personDiscs.length,
        missesPer100Rooms:inspections.length?Math.round((personDiscs.length/inspections.length)*1000)/10:0,
        unresolved:personDiscs.filter((d:any)=>!d.corrected_at).length,
        commonMisses,
        documentedCorrections:documentedByHousekeeper.get(id)||[]
      }
    }).sort((a,b)=>b.roomsInspected-a.roomsInspected||a.name.localeCompare(b.name))

    const missCounts=new Map<string,number>()
    for(const disc of discrepancies||[]){
      const itemId=String((disc as any).item_id||'')
      missCounts.set(itemId,(missCounts.get(itemId)||0)+1)
    }
    const commonMisses=[...missCounts.entries()]
      .map(([itemId,count])=>({itemId,count,...(itemById.get(itemId)||{label:'Checklist item',zone:'Other'})}))
      .sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label))
      .slice(0,10)

    return NextResponse.json({
      range:{days,start,end},
      department,
      weekly,
      individuals,
      commonMisses,
      documentedCorrections
    })
  }catch(error:any){
    return NextResponse.json({error:error?.message||'Could not load housekeeping quality trends.'},{status:500})
  }
}
