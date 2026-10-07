import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

async function currentOwner(){
  const supabase=await createSupabaseServerClient()
  const {data:{user}}=await supabase.auth.getUser()
  if(!user) return null

  const admin=createSupabaseAdmin()
  const {data:profile}=await admin
    .from('staff_profiles')
    .select('user_id,active,staff_roles(name)')
    .eq('user_id',user.id)
    .maybeSingle()

  const roleRaw:any=Array.isArray((profile as any)?.staff_roles)
    ? (profile as any).staff_roles[0]
    : (profile as any)?.staff_roles

  if(!profile || (profile as any).active===false || roleRaw?.name!=='Owner') return null
  return user
}

export async function POST(req:NextRequest){
  const owner=await currentOwner()
  if(!owner) return NextResponse.json({error:'Forbidden'},{status:403})

  const body=await req.json().catch(()=>({}))
  const userId=String(body.user_id||'')
  if(!userId || userId===owner.id) return NextResponse.json({error:'Invalid preview target.'},{status:400})

  const admin=createSupabaseAdmin()
  const {data:target}=await admin
    .from('staff_profiles')
    .select('user_id,name,active')
    .eq('user_id',userId)
    .eq('active',true)
    .maybeSingle()

  if(!target) return NextResponse.json({error:'Staff member not found.'},{status:404})

  const response=NextResponse.json({ok:true,name:(target as any).name||'Staff'})
  response.cookies.set('ths-preview-user',userId,{
    httpOnly:true,
    sameSite:'lax',
    secure:process.env.NODE_ENV==='production',
    path:'/',
    maxAge:60*60*4
  })
  return response
}

export async function DELETE(){
  const owner=await currentOwner()
  if(!owner) return NextResponse.json({error:'Forbidden'},{status:403})

  const response=NextResponse.json({ok:true})
  response.cookies.set('ths-preview-user','',{
    httpOnly:true,
    sameSite:'lax',
    secure:process.env.NODE_ENV==='production',
    path:'/',
    maxAge:0
  })
  return response
}
