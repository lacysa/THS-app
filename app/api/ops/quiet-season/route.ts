import {NextRequest,NextResponse} from 'next/server'
import {canUseModule} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'

export const dynamic='force-dynamic'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const restaurants=['Phil\'s Bar & Grill','Singapore Room','Everyday People Cafe']
const gifts=['Local Pour','Something Sweet','Quiet Ritual']
const beer=['Light, crisp, or fruity','Hoppy or IPA-style','Darker or richer']
const scents=['Bright, fresh or floral','Warm, sweet or cozy','Earthy, amber or musky']
const field=(v:unknown,max=500)=>typeof v==='string'?v.trim().slice(0,max):''
async function check(request:NextRequest){
 const [ops,reservations]=await Promise.all([canUseModule('ops'),canUseModule('reservations')])
 const gate=ops.allowed?ops:reservations
 if(!gate.access)return {error:NextResponse.json({error:'Unauthorized'},{status:401})}
 if(!ops.allowed&&!reservations.allowed)return {error:NextResponse.json({error:'Forbidden'},{status:403})}
 const roomId=field(request.nextUrl.searchParams.get('roomId'))
 const reservationId=field(request.nextUrl.searchParams.get('reservationId'))
 const date=field(request.nextUrl.searchParams.get('date'))
 if(!uuid.test(roomId)||!uuid.test(reservationId)||!/^20\d\d-\d\d-\d\d$/.test(date))return {error:NextResponse.json({error:'Invalid room, reservation, or date'},{status:400})}
 const db=createSupabaseAdmin()
 const {data:link,error}=await db.from('reservation_daily_links').select('primary_reservation_id,arriving_reservation_id,stay_reservation_id,departing_reservation_id').eq('service_date',date).eq('room_id',roomId).maybeSingle()
 if(error)return {error:NextResponse.json({error:'Unable to verify reservation'},{status:500})}
 if(!link||![link.primary_reservation_id,link.arriving_reservation_id,link.stay_reservation_id,link.departing_reservation_id].some(id=>id===reservationId))
  return {error:NextResponse.json({error:'Reservation is not linked to this room and date'},{status:409})}
 const caps=gate.access.capabilities||[]
 const canManage=!gate.access.isPreviewMode&&(gate.access.isAdmin||caps.some((c:string)=>['manager','general_manager','operations_manager','owner'].includes(c)))
 return {db,canManage,reservationId,access:gate.access}
}
export async function GET(req:NextRequest){
 const result=await check(req)
 if(result.error)return result.error
 const {data,error}=await result.db!.from('reservation_quiet_season').select('active,restaurant,welcome_gift,beer_preference,nut_allergy,scent_preference,notes').eq('reservation_id',result.reservationId!).maybeSingle()
 if(error)return NextResponse.json({error:'Could not load Quiet Season promotion'},{status:500})
 return NextResponse.json({promotion:data||null},{headers:{'cache-control':'private, no-store'}})
}
export async function PATCH(req:NextRequest){
 const result=await check(req)
 if(result.error)return result.error
 if(!result.canManage)return NextResponse.json({error:'Only management may edit promotions'},{status:403})
 const body=await req.json().catch(()=>null)
 if(!body||typeof body!=='object')return NextResponse.json({error:'Invalid promotion details'},{status:400})
 const active=body.active===true
 const restaurant=field(body.restaurant,80)
 const welcome_gift=field(body.welcomeGift,80)
 const beer_preference=field(body.beerPreference,80)
 const nut_allergy=field(body.nutAllergy,10)
 const scent_preference=field(body.scentPreference,80)
 const notes=field(body.notes,1000)
 if(active&&(!restaurants.includes(restaurant)||!gifts.includes(welcome_gift)))
  return NextResponse.json({error:'Choose a restaurant and welcome gift'},{status:400})
 if(active&&welcome_gift==='Local Pour'&&!beer.includes(beer_preference))
  return NextResponse.json({error:'Choose a beer preference'},{status:400})
 if(active&&welcome_gift==='Something Sweet'&&!['Yes','No'].includes(nut_allergy))
  return NextResponse.json({error:'Record the nut allergy answer'},{status:400})
 if(active&&welcome_gift==='Quiet Ritual'&&!scents.includes(scent_preference))
  return NextResponse.json({error:'Choose a scent preference'},{status:400})
 const {error}=await result.db!.from('reservation_quiet_season').upsert({
  reservation_id:result.reservationId!,active,restaurant:active?restaurant:null,welcome_gift:active?welcome_gift:null,
  beer_preference:active&&welcome_gift==='Local Pour'?beer_preference:null,
  nut_allergy:active&&welcome_gift==='Something Sweet'?nut_allergy:null,
  scent_preference:active&&welcome_gift==='Quiet Ritual'?scent_preference:null,
  notes:active?notes:null,updated_by:result.access!.userId,updated_at:new Date().toISOString()
 },{onConflict:'reservation_id'})
 if(error)return NextResponse.json({error:'Unable to save Quiet Season promotion'},{status:500})
 return NextResponse.json({ok:true})
}
