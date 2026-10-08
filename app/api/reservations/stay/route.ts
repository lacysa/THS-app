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
 const {data,error}=await admin.from('reservation_stays').update({...patch,updated_at:new Date().toISOString()}).eq('id',body.id).select('id,'+fields.join(',')).maybeSingle()
 if(error)return NextResponse.json({error:error.message},{status:500})
 if(!data)return NextResponse.json({error:'Reservation not found'},{status:404})
 return NextResponse.json({ok:true,stay:data},{headers:{'cache-control':'no-store'}})
}
