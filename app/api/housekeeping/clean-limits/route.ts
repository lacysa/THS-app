import { NextRequest,NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic='force-dynamic'

function canManage(access:any){
  return Boolean(
    access?.isAdmin ||
    access?.capabilities?.some((c:string)=>['manager','general_manager','operations_manager','owner'].includes(c))
  )
}

export async function GET(){
  const access=await getStaffAccess()
  if(!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  if(!canManage(access)) return NextResponse.json({error:'Manager access required.'},{status:403})

  const admin=createSupabaseAdmin()
  const {data,error}=await admin
    .from('staff_members')
    .select('id,name,job_title,active,full_room_clean_limit')
    .eq('active',true)
    .order('name')

  if(error) return NextResponse.json({error:error.message},{status:500})

  return NextResponse.json({
    staff:(data||[]).map((row:any)=>({
      id:String(row.id),
      name:String(row.name||'Staff'),
      jobTitle:String(row.job_title||''),
      fullRoomCleanLimit:Number(row.full_room_clean_limit??2)
    }))
  })
}

export async function PATCH(req:NextRequest){
  const access=await getStaffAccess()
  if(!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  if(!canManage(access)) return NextResponse.json({error:'Manager access required.'},{status:403})

  const body=await req.json().catch(()=>null)
  const staffMemberId=String(body?.staffMemberId||'')
  const limit=Number(body?.limit)

  if(!staffMemberId||!Number.isInteger(limit)||limit<0||limit>10){
    return NextResponse.json({error:'Full room clean limit must be a whole number between 0 and 10.'},{status:400})
  }

  const admin=createSupabaseAdmin()
  const now=new Date().toISOString()
  const {data,error}=await admin
    .from('staff_members')
    .update({full_room_clean_limit:limit,updated_at:now})
    .eq('id',staffMemberId)
    .eq('active',true)
    .select('id,name,full_room_clean_limit')
    .single()

  if(error) return NextResponse.json({error:error.message},{status:500})

  return NextResponse.json({
    ok:true,
    staff:{
      id:String((data as any).id),
      name:String((data as any).name||'Staff'),
      fullRoomCleanLimit:Number((data as any).full_room_clean_limit??2)
    }
  })
}
