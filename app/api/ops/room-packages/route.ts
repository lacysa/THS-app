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
 const {data,error}=await admin.from('housekeeping_room_packages').select('room_id,package_id').eq('service_date',date)
 if(error)return NextResponse.json({error:'Could not load packages'},{status:500})
 const counts:Record<string,number>={}
 for(const row of data||[])counts[String(row.room_id)]=(counts[String(row.room_id)]||0)+1
 return NextResponse.json({counts},{headers:{'cache-control':'private, no-store'}})
}