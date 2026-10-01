import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(req:NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data:{user} } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({error:'Unauthorized'},{status:401})
  if (!user.email) return NextResponse.json({error:'No Supabase Auth email is attached to this account.'},{status:400})

  const origin = new URL(req.url).origin
  const { error } = await supabase.auth.resetPasswordForEmail(user.email,{redirectTo:`${origin}/settings`})
  if (error) return NextResponse.json({error:error.message},{status:400})
  return NextResponse.json({ok:true})
}
