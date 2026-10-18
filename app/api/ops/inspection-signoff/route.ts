import {NextRequest,NextResponse} from 'next/server'
import {canUseModule} from '@/lib/access'
import {createSupabaseAdmin} from '@/lib/supabase/admin'

export const dynamic='force-dynamic'
const validDate=(v:string)=>/^20\d{2}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))
const validRoom=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
async function permission(){
 const [ops,res]=await Promise.all([canUseModule('ops'),canUseModule('reservations')])
 const gate=ops.allowed?ops:res
 if(!gate.access)return {error:NextResponse.json({error:'Unauthorized'},{status:401})}
 if(!ops.allowed&&!res.allowed)return {error:NextResponse.json({error:'Forbidden'},{status:403})}
 const caps=gate.access.capabilities||[]
 const manager=!gate.access.isPreviewMode&&(gate.access.isAdmin||caps.some((c:string)=>['manager','general_manager','operations_manager','owner'].includes(c)))
 return {manager,userId:gate.access.userId}
}
export async function GET(req:NextRequest){
 const auth=await permission();if('error' in auth)return auth.error
 const date=req.nextUrl.searchParams.get('date')||''
 if(!validDate(date))return NextResponse.json({error:'Invalid date'},{status:400})
 const admin=createSupabaseAdmin()
 const {data,error}=await admin.from('housekeeping_daily_rooms').select('room_id,inspected,inspection_signed_by,inspection_signed_at').eq('service_date',date)
 if(error)return NextResponse.json({error:'Could not load inspection sign-offs'},{status:500})
 const ids=[...new Set((data||[]).map((r:any)=>r.inspection_signed_by).filter(Boolean))]
 const staff=ids.length?await admin.from('staff_members').select('name,auth_user_id').in('auth_user_id',ids):{data:[],error:null}
 if(staff.error)return NextResponse.json({error:'Could not load signers'},{status:500})
 const names=new Map((staff.data||[]).map((s:any)=>[String(s.auth_user_id),String(s.name||'')]))
 const initials=(name:string)=>{const n=name.trim().toLowerCase();if(n==='sarah'||n.includes('sarah lacy'))return 'SL';if(n==='david')return 'DH';if(n==='brittany')return 'BH';const p=name.trim().split(/\s+/).filter(Boolean);return p.length>=2?(p[0][0]+p[p.length-1][0]).toUpperCase():name.slice(0,2).toUpperCase()}
 const rooms=Object.fromEntries((data||[]).map((r:any)=>[String(r.room_id),{inspected:Boolean(r.inspected),signed:Boolean(r.inspection_signed_by),initials:r.inspection_signed_by?initials(names.get(String(r.inspection_signed_by))||'')||'✓':'',at:r.inspection_signed_at}]))
 return NextResponse.json({rooms,canSign:auth.manager},{headers:{'cache-control':'private, no-store'}})
}
export async function POST(req:NextRequest){
 const auth=await permission();if('error' in auth)return auth.error
 if(!auth.manager)return NextResponse.json({error:'Management permission required'},{status:403})
 const body=await req.json().catch(()=>({}))
 const date=String(body.date||''),roomId=String(body.roomId||'')
 if(!validDate(date)||!validRoom(roomId))return NextResponse.json({error:'Invalid room or date'},{status:400})
 const admin=createSupabaseAdmin()
 const {data:room,error:readError}=await admin.from('housekeeping_daily_rooms').select('inspected,check_issue_open,inspection_signed_by').eq('service_date',date).eq('room_id',roomId).maybeSingle()
 if(readError||!room)return NextResponse.json({error:'Room record unavailable'},{status:404})
 if(!room.inspected||room.check_issue_open)return NextResponse.json({error:'Inspection must be passed before management sign-off'},{status:409})
 if(room.inspection_signed_by)return NextResponse.json({error:'Inspection already signed off'},{status:409})
 const {data,error}=await admin.from('housekeeping_daily_rooms').update({inspection_signed_by:auth.userId,inspection_signed_at:new Date().toISOString()}).eq('service_date',date).eq('room_id',roomId).eq('inspected',true).eq('check_issue_open',false).is('inspection_signed_by',null).select('inspection_signed_at').maybeSingle()
 if(error||!data)return NextResponse.json({error:'Could not sign off inspection. Reload and try again.'},{status:409})
 return NextResponse.json({ok:true,signedAt:data.inspection_signed_at})
}
