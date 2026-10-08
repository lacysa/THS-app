import {NextRequest,NextResponse} from 'next/server'
import {getStaffAccess} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'
export const dynamic='force-dynamic'
const fields=['guest_name','guest_phone','door_code','arrival_date','checkout_date','occupancy','rate_plan','check_in_time','products_raw','dietary_restrictions','reason_for_visit','guest_comments','innkeeper_notes'] as const
export async function PATCH(req:NextRequest){
 const access=await getStaffAccess()
 if(!access)return NextResponse.json({error:'Unauthorized'},{status:401})
 const caps=access.capabilities||[]
 if(access.isPreviewMode||!(access.isAdmin||caps.some(c=>['manager','general_manager','operations_manager','owner'].includes(c))))return NextResponse.json({error:'Manager access required'},{status:403})
 const body=await req.json().catch(()=>null)
 if(!body?.id||typeof body.id!=='string')return NextResponse.json({error:'Reservation ID required'},{status:400})
 const patch:Record<string,unknown>={}
 for(const field of fields)if(Object.prototype.hasOwnProperty.call(body.patch||{},field)){
   const value=body.patch[field]
   if(field==='occupancy'){const n=Number(value);if(!Number.isInteger(n)||n<1||n>20)return NextResponse.json({error:'Invalid occupancy'},{status:400});patch[field]=n}
   else if(field==='arrival_date'||field==='checkout_date'){if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))return NextResponse.json({error:'Invalid date'},{status:400});patch[field]=value}
   else if(typeof value==='string'&&value.length<=6000)patch[field]=value.trim()
   else return NextResponse.json({error:'Invalid '+field},{status:400})
 }
 if(!Object.keys(patch).length)return NextResponse.json({error:'Nothing to update'},{status:400})
 if(patch.arrival_date||patch.checkout_date)return NextResponse.json({error:'Date changes require reservation-calendar relinking and are not supported by this quick editor yet.'},{status:400})
 const admin=createSupabaseAdmin()
 const {data,error}=await admin.from('reservation_stays').update({...patch,updated_at:new Date().toISOString()}).eq('id',body.id).select('*').maybeSingle()
 if(error)return NextResponse.json({error:error.message},{status:500})
 if(!data)return NextResponse.json({error:'Reservation not found'},{status:404})
 // A manual edit must survive the next imported PMS report.
 const {data:oldOverride,error:readOverrideError}=await admin.from('reservation_staff_overrides').select('fields').eq('reservation_id',body.id).maybeSingle()
 if(readOverrideError)return NextResponse.json({error:'Saved reservation, but could not read manual-edit protection: '+readOverrideError.message},{status:500})
 const {error:overrideError}=await admin.from('reservation_staff_overrides').upsert({
   reservation_id:body.id,fields:{...(oldOverride?.fields||{}),...patch},updated_by:access.userId,updated_at:new Date().toISOString()
 },{onConflict:'reservation_id'})
 if(overrideError)return NextResponse.json({error:'Saved reservation, but could not protect edits from reimport: '+overrideError.message},{status:500})

 // Reconcile only breakfast eligibility on linked room nights, never modify
 // menus/orders, cleaning state, blocking, or manually overridden tags.
 if('rate_plan' in patch || 'innkeeper_notes' in patch){
   const {data:links,error:linkError}=await admin.from('reservation_daily_links')
    .select('service_date,room_id,arriving_reservation_id,stay_reservation_id')
    .or('arriving_reservation_id.eq.'+body.id+',stay_reservation_id.eq.'+body.id)
   if(linkError)return NextResponse.json({error:'Reservation saved; breakfast reconciliation failed: '+linkError.message},{status:500})
   const included=(rate:unknown)=>/\\broom\\s*\\+\\s*breakfast\\b|\\bbreakfast\\s+included\\b/i.test(String(rate||''))
   const notes=String(data.innkeeper_notes||'')
   const allNights=/(?:^|[\\s,;|])\\+(?:B|Breakfast)\\b/i.test(notes)
   const mornings=[...notes.matchAll(/(?:a la carte|à la carte)\\s+breakfast\\s+morning\\s*:\\s*(20\\d{2}-\\d{2}-\\d{2})/gi)].map(m=>m[1])
   for(const link of links||[]){
     const date=String(link.service_date)
     const morning=new Date(date+'T12:00:00Z')
     morning.setUTCDate(morning.getUTCDate()+1)
     const morningString=morning.toISOString().slice(0,10)
     const eligible=included(data.rate_plan)||allNights||mornings.includes(morningString)
     const {data:daily,error:dailyError}=await admin.from('housekeeping_daily_rooms')
       .select('breakfast_tag_override').eq('service_date',date).eq('room_id',link.room_id).maybeSingle()
     if(dailyError)return NextResponse.json({error:'Reservation saved; room tag lookup failed: '+dailyError.message},{status:500})
     if(daily?.breakfast_tag_override===null||daily?.breakfast_tag_override===undefined){
       const {error:tagError}=await admin.from('housekeeping_daily_rooms').update({breakfast_tag:eligible,updated_at:new Date().toISOString()})
         .eq('service_date',date).eq('room_id',link.room_id).is('breakfast_tag_override',null)
       if(tagError)return NextResponse.json({error:'Reservation saved; breakfast tag update failed: '+tagError.message},{status:500})
     }
   }
 }
 return NextResponse.json({ok:true,stay:data},{headers:{'cache-control':'no-store'}})
}
