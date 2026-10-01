import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const createSchema = z.object({
  category:z.string().trim().min(1).max(40),
  label:z.string().trim().min(1).max(160),
  description:z.string().trim().max(500).optional().nullable(),
  sortOrder:z.number().int().min(0).max(999).optional().default(100),
  showForEntree:z.array(z.string().max(160)).optional().default([]),
  blockedByDietary:z.array(z.string().max(160)).optional().default([])
})

const patchSchema = z.object({
  id:z.string().uuid(),
  label:z.string().trim().min(1).max(160).optional(),
  description:z.string().trim().max(500).optional().nullable(),
  active:z.boolean().optional(),
  sort_order:z.number().int().min(0).max(999).optional(),
  show_for_entree:z.array(z.string().max(160)).optional(),
  blocked_by_dietary:z.array(z.string().max(160)).optional()
})

async function authed() {
  const supabase = await createSupabaseServerClient()
  const { data:{user} } = await supabase.auth.getUser()
  return {supabase,user}
}

export async function GET() {
  const {supabase,user} = await authed()
  if (!user) return NextResponse.json({message:'Unauthorized'},{status:401})

  const {data,error} = await supabase
    .from('breakfast_menu_options')
    .select('*')
    .order('category')
    .order('sort_order')

  if (error) return NextResponse.json({message:error.message},{status:500})
  return NextResponse.json({options:data || []})
}

export async function POST(req:NextRequest) {
  const {supabase,user} = await authed()
  if (!user) return NextResponse.json({message:'Unauthorized'},{status:401})
  const parsed = createSchema.safeParse(await req.json().catch(()=>null))
  if (!parsed.success) return NextResponse.json({message:'Invalid menu option.'},{status:400})

  const {data,error} = await supabase.from('breakfast_menu_options').insert({
    category:parsed.data.category.toLowerCase(),
    label:parsed.data.label,
    description:parsed.data.description || null,
    sort_order:parsed.data.sortOrder,
    show_for_entree:parsed.data.showForEntree,
    blocked_by_dietary:parsed.data.blockedByDietary
  }).select('*').single()

  if (error) return NextResponse.json({message:error.message},{status:500})
  return NextResponse.json({ok:true,option:data})
}

export async function PATCH(req:NextRequest) {
  const {supabase,user} = await authed()
  if (!user) return NextResponse.json({message:'Unauthorized'},{status:401})
  const parsed = patchSchema.safeParse(await req.json().catch(()=>null))
  if (!parsed.success) return NextResponse.json({message:'Invalid menu update.'},{status:400})

  const {id,...changes} = parsed.data
  const {data,error} = await supabase
    .from('breakfast_menu_options')
    .update({...changes,updated_at:new Date().toISOString()})
    .eq('id',id)
    .select('*')
    .single()

  if (error) return NextResponse.json({message:error.message},{status:500})
  return NextResponse.json({ok:true,option:data})
}
