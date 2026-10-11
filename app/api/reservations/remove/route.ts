import {NextRequest,NextResponse} from 'next/server'
import {canUseModule,getStaffAccess} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'

export const dynamic='force-dynamic'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const managerCapabilities=['foh_manager','manager','general_manager','operations_manager','owner']

export async function POST(req:NextRequest){
  const access=await getStaffAccess()
  if(!access)return NextResponse.json({error:'Unauthorized'},{status:401})
  const [reservations,ops]=await Promise.all([canUseModule('reservations'),canUseModule('ops')])
  if(!reservations.allowed&&!ops.allowed)return NextResponse.json({error:'Forbidden'},{status:403})
  if(access.isPreviewMode||!(access.isAdmin||managerCapabilities.some(cap=>access.capabilities?.includes(cap)))){
    return NextResponse.json({error:'Manager access required'},{status:403})
  }
  const body=await req.json().catch(()=>null)
  if(typeof body?.id!=='string'||!uuid.test(body.id)){
    return NextResponse.json({error:'Valid reservation ID required'},{status:400})
  }
  const admin=createSupabaseAdmin()
  const {data,error}=await admin.rpc('ops_remove_reservation',{
    p_reservation_id:body.id,
    p_actor_user_id:access.userId
  })
  if(error)return NextResponse.json({error:error.message||'Could not remove reservation'},{status:500})
  return NextResponse.json(data||{ok:true},{headers:{'cache-control':'private, no-store'}})
}
