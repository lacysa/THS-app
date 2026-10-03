import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

const allowed = new Set(['front_desk','kitchen','housekeeping','laundry','lobby'])

function normalizeDepartment(value:string) {
  return value.replace(/-/g,'_')
}

function canUseDepartment(access:any, department:string) {
  const caps = new Set<string>(access?.capabilities || [])
  if (access?.isAdmin || ['owner','manager'].includes(String(access?.roleName || '').toLowerCase())) return true
  if (department === 'front_desk') return caps.has('foh_manager') || caps.has('foh_signoff') || caps.has('hospitality_assistant')
  if (department === 'kitchen') return caps.has('kitchen')
  if (department === 'housekeeping') return caps.has('housekeeping') || caps.has('runner')
  if (department === 'laundry') return caps.has('laundry')
  if (department === 'lobby') return caps.has('hospitality_assistant') || caps.has('runner')
  return false
}

function canManage(access:any) {
  const caps = new Set<string>(access?.capabilities || [])
  return Boolean(
    access?.isAdmin ||
    ['owner','manager'].includes(String(access?.roleName || '').toLowerCase()) ||
    ['manager','general_manager','operations_manager','owner'].some(k=>caps.has(k))
  )
}

async function notifyManagers(admin:any, access:any, department:string, itemName:string, qty:string, note:string) {
  const [{data:members},{data:caps}] = await Promise.all([
    admin.from('staff_members').select('id,auth_user_id,name,active').eq('active',true),
    admin.from('staff_member_capabilities').select('staff_member_id,capability_key')
  ])
  const managerIds = new Set<string>()
  for (const row of caps || []) {
    if (['manager','general_manager','operations_manager','owner'].includes(String(row.capability_key))) {
      managerIds.add(String(row.staff_member_id))
    }
  }
  const recipients = (members || [])
    .filter((m:any)=>managerIds.has(String(m.id)) && m.auth_user_id)
    .map((m:any)=>m.auth_user_id)

  if (!recipients.length) return

  const requester = access?.preferredName || access?.name || 'Staff'
  const message = `${requester} requested ${itemName}${qty ? ` · Qty: ${qty}` : ''}${note ? ` · ${note}` : ''}`
  await admin.from('notifications').insert(recipients.map((userId:string)=>({
    recipient_user_id:userId,
    notification_type:'inventory_request',
    title:`${department.replace(/_/g,' ')} inventory request`,
    message,
    created_by:access.userId
  })))
}

export async function GET(req:NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  const department = normalizeDepartment(req.nextUrl.searchParams.get('department') || '')
  if (!allowed.has(department) || !canUseDepartment(access,department)) {
    return NextResponse.json({error:'Access denied'},{status:403})
  }

  const admin = createSupabaseAdmin()
  const [{data:items,error:itemError},{data:requests,error:requestError}] = await Promise.all([
    admin.from('inventory_items').select('*').eq('department',department).eq('active',true).order('category').order('sort_order').order('item_name'),
    admin.from('inventory_requests').select('*').eq('department',department).order('requested_at',{ascending:false}).limit(100)
  ])
  const error = itemError || requestError
  if (error) return NextResponse.json({error:error.message},{status:500})
  return NextResponse.json({items:items || [],requests:requests || [],canManage:canManage(access)})
}

export async function POST(req:NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({error:'Unauthorized'},{status:401})
  const body = await req.json().catch(()=>null)
  const department = normalizeDepartment(String(body?.department || ''))
  if (!allowed.has(department) || !canUseDepartment(access,department)) {
    return NextResponse.json({error:'Access denied'},{status:403})
  }
  const admin = createSupabaseAdmin()
  const action = String(body?.action || '')

  if (action === 'request') {
    const itemName = String(body?.itemName || '').trim()
    if (!itemName) return NextResponse.json({error:'Item is required.'},{status:400})
    const row = {
      department,
      inventory_item_id: body?.inventoryItemId || null,
      item_name:itemName,
      requested_qty:String(body?.quantity || '').trim() || null,
      note:String(body?.note || '').trim() || null,
      status:'requested',
      requested_by:access.userId
    }
    const {data,error} = await admin.from('inventory_requests').insert(row).select('*').single()
    if (error) return NextResponse.json({error:error.message},{status:500})
    await notifyManagers(admin,access,department,itemName,row.requested_qty || '',row.note || '')
    return NextResponse.json({ok:true,request:data})
  }

  if (action === 'status') {
    if (!canManage(access)) return NextResponse.json({error:'Manager access required.'},{status:403})
    const id = String(body?.id || '')
    const status = String(body?.status || '')
    if (!id || !['requested','ordered','received','cancelled'].includes(status)) {
      return NextResponse.json({error:'Invalid request update.'},{status:400})
    }
    const {error} = await admin.from('inventory_requests').update({
      status,
      resolved_by: status === 'requested' ? null : access.userId,
      resolved_at: status === 'requested' ? null : new Date().toISOString()
    }).eq('id',id)
    if (error) return NextResponse.json({error:error.message},{status:500})
    return NextResponse.json({ok:true})
  }

  if (action === 'add_item') {
    if (!canManage(access)) return NextResponse.json({error:'Manager access required.'},{status:403})
    const itemName = String(body?.itemName || '').trim()
    if (!itemName) return NextResponse.json({error:'Item name is required.'},{status:400})
    const {error} = await admin.from('inventory_items').upsert({
      department,
      category:String(body?.category || 'General').trim() || 'General',
      item_name:itemName,
      supplier:String(body?.supplier || '').trim() || null,
      supplier_sku:String(body?.supplierSku || '').trim() || null,
      par_level:String(body?.parLevel || '').trim() || null,
      order_url:String(body?.orderUrl || '').trim() || null,
      notes:String(body?.notes || '').trim() || null,
      active:true,
      updated_at:new Date().toISOString()
    },{onConflict:'department,item_name'})
    if (error) return NextResponse.json({error:error.message},{status:500})
    return NextResponse.json({ok:true})
  }

  return NextResponse.json({error:'Unknown action.'},{status:400})
}
