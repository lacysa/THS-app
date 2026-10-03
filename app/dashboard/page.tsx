import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import DailyDashboard from '@/components/DailyDashboard'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess, isModuleAllowedForAccess } from '@/lib/access'
import { bohDefaultServiceDate, prettyDate, ymdInHotelTz } from '@/lib/time'

export const dynamic = 'force-dynamic'

const managerCaps = new Set(['manager','general_manager','operations_manager','owner'])

function roomName(value:any, roomMap:Map<string,string>) {
  return roomMap.get(String(value || '')) || 'Room'
}

function accessibleInventoryDepartments(moduleKeys:Set<string>) {
  const departments:string[] = []
  if (moduleKeys.has('front_desk_inventory')) departments.push('front_desk')
  if (moduleKeys.has('kitchen_inventory')) departments.push('kitchen')
  if (moduleKeys.has('housekeeping_inventory')) departments.push('housekeeping')
  if (moduleKeys.has('laundry_inventory')) departments.push('laundry')
  if (moduleKeys.has('lobby_inventory')) departments.push('lobby')
  return departments
}

export default async function DashboardPage() {
  const access = await getStaffAccess()
  if (!access) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const admin = createSupabaseAdmin()

  const { data:modules } = await supabase
    .from('app_modules')
    .select('*')
    .order('sort_order')

  const visibleModules = (modules || []).filter(module =>
    isModuleAllowedForAccess(access,module)
  )
  const moduleKeys = new Set(visibleModules.map((m:any)=>String(m.module_key)))

  const today = ymdInHotelTz()
  const breakfastDate = bohDefaultServiceDate()
  const inventoryDepartments = accessibleInventoryDepartments(moduleKeys)
  const isManager = access.isAdmin || access.capabilities.some(cap=>managerCaps.has(cap))

  const [
    roomsRes,
    staffMemberRes,
    housekeepingRes,
    breakfastRes,
    maintenanceRes,
    inventoryRes,
    notesRes,
    menuNotesRes
  ] = await Promise.all([
    admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
    admin.from('staff_members').select('id,name').eq('auth_user_id',access.userId).maybeSingle(),
    moduleKeys.has('housekeeping')
      ? admin.from('housekeeping_daily_rooms').select('*').eq('service_date',today).order('clean_order',{ascending:true,nullsFirst:false})
      : Promise.resolve({data:[],error:null}),
    (
      moduleKeys.has('front_desk') ||
      moduleKeys.has('kitchen') ||
      moduleKeys.has('daily_overview') ||
      moduleKeys.has('breakfast_guest')
    )
      ? admin.from('breakfast_bookings').select('*').eq('service_date',breakfastDate).in('status',['scheduled','declined']).order('time_slot')
      : Promise.resolve({data:[],error:null}),
    moduleKeys.has('maintenance')
      ? admin.from('maintenance_work_orders').select('*').order('created_at',{ascending:false})
      : Promise.resolve({data:[],error:null}),
    inventoryDepartments.length
      ? admin.from('inventory_requests').select('*').in('department',inventoryDepartments).order('requested_at',{ascending:false})
      : Promise.resolve({data:[],error:null}),
    (moduleKeys.has('laundry') || moduleKeys.has('lobby'))
      ? admin.from('department_daily_notes').select('department,note').eq('service_date',today).in('department',['laundry','lobby'])
      : Promise.resolve({data:[],error:null}),
    (
      moduleKeys.has('front_desk') ||
      moduleKeys.has('kitchen') ||
      moduleKeys.has('daily_overview') ||
      moduleKeys.has('breakfast_guest')
    )
      ? admin.from('breakfast_menu_notes').select('booking_id,note')
      : Promise.resolve({data:[],error:null})
  ])

  const roomMap = new Map<string,string>((roomsRes.data || []).map((r:any)=>[String(r.id),r.name]))
  const currentStaffName = String((staffMemberRes.data as any)?.name || access.preferredName || access.name || '').trim()

  let housekeeping = (housekeepingRes.data || []).map((row:any)=>({
    id:String(row.id),
    roomName:roomName(row.room_id,roomMap),
    reservationStatus:String(row.reservation_status || ''),
    serviceType:String(row.service_type || ''),
    assignedTo:String(row.assigned_to || ''),
    complete:Boolean(row.complete),
    notes:String(row.notes || '')
  }))

  if (!isManager && access.capabilities.includes('housekeeping') && currentStaffName) {
    housekeeping = housekeeping.filter((row:any)=>
      row.assignedTo
        .split(',')
        .map((name:string)=>name.trim().toLowerCase())
        .filter(Boolean)
        .includes(currentStaffName.toLowerCase())
    )
  }

  const menuNoteMap = new Map<string,string>(
    (menuNotesRes.data || []).map((row:any)=>[String(row.booking_id),String(row.note || '')])
  )

  const breakfast = (breakfastRes.data || []).map((row:any)=>({
    id:String(row.id),
    roomName:roomName(row.room_id,roomMap),
    lastName:String(row.last_name || ''),
    timeSlot:String(row.time_slot || ''),
    status:String(row.status || ''),
    menuSubmitted:Boolean(row.menu_submitted),
    note:menuNoteMap.get(String(row.id)) || ''
  }))

  const maintenance = (maintenanceRes.data || []).map((row:any)=>({
    id:String(row.id),
    location:row.room_id ? roomName(row.room_id,roomMap) : String(row.area || 'Property'),
    title:String(row.title || ''),
    priority:String(row.priority || 'medium'),
    status:String(row.status || 'open')
  }))

  const inventory = (inventoryRes.data || []).map((row:any)=>({
    id:String(row.id),
    department:String(row.department || ''),
    itemName:String(row.item_name || ''),
    quantity:String(row.requested_qty || ''),
    note:String(row.note || ''),
    status:String(row.status || 'requested')
  }))

  const departmentNotes = (notesRes.data || []).map((row:any)=>({
    department:String(row.department || ''),
    note:String(row.note || '')
  }))

  const displayName = access.preferredName || access.name || 'Staff'

  return (
    <StaffShell title="Dashboard">
      <DailyDashboard
        displayName={displayName}
        todayLabel={prettyDate(today)}
        breakfastDate={breakfastDate}
        showBreakfast={
          moduleKeys.has('front_desk') ||
          moduleKeys.has('kitchen') ||
          moduleKeys.has('daily_overview') ||
          moduleKeys.has('breakfast_guest')
        }
        showHousekeeping={moduleKeys.has('housekeeping')}
        showMaintenance={moduleKeys.has('maintenance')}
        showInventory={inventoryDepartments.length > 0}
        showLaundry={moduleKeys.has('laundry')}
        showLobby={moduleKeys.has('lobby')}
        breakfast={breakfast}
        housekeeping={housekeeping}
        maintenance={maintenance}
        inventory={inventory}
        departmentNotes={departmentNotes}
      />
    </StaffShell>
  )
}
