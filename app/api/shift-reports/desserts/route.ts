import {NextRequest,NextResponse} from 'next/server'
import {randomUUID} from 'node:crypto'
import {getStaffAccess} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'
import {normalizeDessertEntries} from '@/lib/shift-desserts'

export const dynamic='force-dynamic'
const managerKeys=new Set(['manager','general_manager','operations_manager','owner','foh_manager'])
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Save only dessert assignments; never overwrite other shift handoff notes. */
export async function PUT(req:NextRequest){
  const access=await getStaffAccess()
  if(!access)return NextResponse.json({error:'Unauthorized'},{status:401})
  const body=await req.json().catch(()=>null)
  const date=String(body?.date||'')
  const shift=String(body?.shift||'Daily')
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z'))||!['Daily','Morning','Evening'].includes(shift))
    return NextResponse.json({error:'Invalid report date or shift'},{status:400})
  const requested=body?.entries
  if(!Array.isArray(requested)||requested.length>40||requested.some((e:any)=>!e||typeof e.name!=='string'||!e.name.trim()||e.name.length>500||!Array.isArray(e.roomIds)||e.roomIds.some((id:unknown)=>typeof id!=='string'||!uuid.test(id))))
    return NextResponse.json({error:'Invalid dessert names or room selections'},{status:400})
  const entries=normalizeDessertEntries(requested).map(e=>({...e,id:uuid.test(e.id)?e.id:randomUUID()}))
  // At most one default dessert; newest default replaces earlier defaults.
  const lastDefault=entries.findLastIndex(e=>e.roomIds.length===0)
  const normalized=entries.filter((e,index)=>e.roomIds.length>0||index===lastDefault)
  const admin=createSupabaseAdmin()
  const {data:staff,error:staffError}=await admin.from('staff_members')
    .select('id').eq('auth_user_id',access.userId).eq('active',true).maybeSingle()
  if(staffError||!staff)return NextResponse.json({error:'Staff permission unavailable'},{status:403})
  const {data:capRows,error:capError}=await admin.from('staff_member_capabilities')
    .select('capability_key').eq('staff_member_id',staff.id)
  if(capError||!capRows?.some((r:any)=>managerKeys.has(String(r.capability_key))))
    return NextResponse.json({error:'Manager access required'},{status:403})
  const {data:existing,error:readError}=await admin.from('shift_reports')
    .select('id,status').eq('report_date',date).eq('shift',shift).maybeSingle()
  if(readError)return NextResponse.json({error:readError.message},{status:500})
  if(existing?.status==='finalized')
    return NextResponse.json({error:'Reopen this shift report before editing desserts.'},{status:409})
  const next={dessert_assignments:normalized,tonights_dessert:'',updated_at:new Date().toISOString()}
  const query=existing
    ?admin.from('shift_reports').update(next).eq('id',existing.id)
    :admin.from('shift_reports').insert({...next,report_date:date,shift,prepared_by:staff.id,status:'draft'})
  const {data:saved,error:saveError}=await query.select('id,dessert_assignments').single()
  if(saveError)return NextResponse.json({error:saveError.message},{status:500})
  await admin.from('audit_log').insert({
    actor_user_id:access.userId,action:'shift_report.desserts.save',
    entity_type:'shift_report',entity_id:saved.id,
    details:{report_date:date,shift,desserts:normalized.map(e=>({name:e.name,roomCount:e.roomIds.length,allRooms:e.roomIds.length===0}))}
  })
  return NextResponse.json({ok:true,entries:normalized},{headers:{'Cache-Control':'no-store'}})
}
