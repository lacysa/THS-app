import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({
  orderId:z.string().uuid(),
  status:z.enum(['new','prepping','ready','delivered','hold','cancelled'])
})

export async function PATCH(req:NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data:{user} } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({message:'Unauthorized'},{status:401})

  const parsed = schema.safeParse(await req.json().catch(()=>null))
  if (!parsed.success) return NextResponse.json({message:'Invalid status update'},{status:400})

  const { error } = await supabase
    .from('breakfast_guest_orders')
    .update({status:parsed.data.status,updated_at:new Date().toISOString()})
    .eq('id',parsed.data.orderId)

  if (error) return NextResponse.json({message:error.message},{status:500})

  return NextResponse.json({ok:true})
}
