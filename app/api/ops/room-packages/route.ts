import {NextRequest,NextResponse} from 'next/server'
import {canUseModule} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest){
 const [ops,reservations]=await Promise.all([canUseModule('ops'),canUseModule('reservations')])
 if(!ops.access&&!reservations.access)return NextResponse.json({error:'Unauthorized'},{status:401})
 if(!ops.allowed&&!reservations.allowed)return NextResponse.json({error:'Forbidden'},{status:403})
 const date=req.nextUrl.searchParams.get('date')||''
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z')))return NextResponse.json({error:'Invalid date'},{status:400})
 const admin=createSupabaseAdmin()
 const [{data:assigned,error:assignedError},{data:catalog,error:catalogError}]=await Promise.all([
  admin.from('housekeeping_room_packages').select('room_id,package_id').eq('service_date',date),
  admin.from('room_package_catalog').select('id,name').order('name')
 ])
 if(assignedError||catalogError)return NextResponse.json({error:'Could not load packages'},{status:500})
 const namesById=new Map((catalog||[]).map(row=>[String(row.id),String(row.name)]))
 const packagesByRoom:Record<string,string[]>={}
 for(const row of assigned||[]){
  const roomId=String(row.room_id)
  const name=namesById.get(String(row.package_id))
  if(!name)continue
  if(!packagesByRoom[roomId])packagesByRoom[roomId]=[]
  if(!packagesByRoom[roomId].includes(name))packagesByRoom[roomId].push(name)
 }
 return NextResponse.json({packagesByRoom},{headers:{'cache-control':'private, no-store'}})
}