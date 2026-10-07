import { redirect } from 'next/navigation'
import StaffShell from '@/components/StaffShell'
import DailyDashboard from '@/components/DailyDashboard'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess, isModuleAllowedForAccess } from '@/lib/access'
import { bohDefaultServiceDate, prettyDate, ymdInHotelTz } from '@/lib/time'

export const dynamic = 'force-dynamic'

const managerCaps = new Set(['manager','general_manager','operations_manager','owner'])

function previousDate(value:string) {
  const d = new Date(`${value}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate()-1)
  return d.toISOString().slice(0,10)
}

function initials(value:string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(part=>part[0])
    .join('')
    .slice(0,3)
    .toUpperCase()
}

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
    breakfastTagRes,
    maintenanceRes,
    inventoryRes,
    notesRes,
    menuNotesRes,
    allStaffRes,
    packageCatalogRes,
    roomPackagesRes
  ] = await Promise.all([
    admin.from('rooms').select('id,name,sort_order').eq('active',true).order('sort_order'),
    admin.from('staff_members').select('id,name').eq('auth_user_id',access.userId).maybeSingle(),
    moduleKeys.has('housekeeping')
      ? admin.from('housekeeping_daily_rooms').select('*').eq('service_date',today)
      : Promise.resolve({data:[],error:null}),
    (
      moduleKeys.has('front_desk') ||
      moduleKeys.has('kitchen') ||
      moduleKeys.has('daily_overview') ||
      moduleKeys.has('breakfast_guest')
    )
      ? admin.from('breakfast_bookings').select('*').eq('service_date',breakfastDate).in('status',['scheduled','declined']).order('time_slot')
      : Promise.resolve({data:[],error:null}),
    (
      moduleKeys.has('front_desk') ||
      moduleKeys.has('kitchen') ||
      moduleKeys.has('daily_overview') ||
      moduleKeys.has('breakfast_guest')
    )
      ? admin.from('housekeeping_daily_rooms').select('room_id,breakfast_skipped,breakfast_skipped_at').eq('service_date',previousDate(breakfastDate)).eq('breakfast_tag',true)
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
      : Promise.resolve({data:[],error:null}),
    moduleKeys.has('housekeeping')
      ? admin.from('staff_members').select('id,name')
      : Promise.resolve({data:[],error:null}),
    moduleKeys.has('housekeeping')
      ? admin.from('room_package_catalog').select('id,name')
      : Promise.resolve({data:[],error:null}),
    moduleKeys.has('housekeeping')
      ? admin.from('housekeeping_room_packages').select('room_id,package_id').eq('service_date',today)
      : Promise.resolve({data:[],error:null})
  ])

  const roomMap = new Map<string,string>((roomsRes.data || []).map((r:any)=>[String(r.id),r.name]))
  const roomSortMap = new Map<string,number>((roomsRes.data || []).map((r:any)=>[String(r.id),Number(r.sort_order ?? 9999)]))
  const staffNameMap = new Map<string,string>((allStaffRes.data || []).map((r:any)=>[String(r.id),String(r.name || '')]))
  const packageNameMap = new Map<string,string>((packageCatalogRes.data || []).map((r:any)=>[String(r.id),String(r.name || '')]))
  const packageNamesByRoom = new Map<string,string[]>()
  for (const assignment of (roomPackagesRes.data || [])) {
    const roomId = String((assignment as any).room_id || '')
    const packageName = packageNameMap.get(String((assignment as any).package_id || ''))
    if (!roomId || !packageName) continue
    const current = packageNamesByRoom.get(roomId) || []
    current.push(packageName)
    packageNamesByRoom.set(roomId,current)
  }
  const currentStaffName = String((staffMemberRes.data as any)?.name || access.preferredName || access.name || '').trim()

  let housekeeping = (housekeepingRes.data || []).map((row:any)=>({
    id:String(row.id),
    roomId:String(row.room_id || ''),
    roomName:roomName(row.room_id,roomMap),
    reservationStatus:String(row.reservation_status || ''),
    serviceType:String(row.service_type || ''),
    assignedTo:String(row.assigned_to || ''),
    cleanOrder:row.clean_order == null ? null : Number(row.clean_order),
    complete:Boolean(row.complete),
    stripHold:String(row.strip_hold || ''),
    roomCondition:String(row.room_condition || ''),
    haCheckInitials:row.ha_signed_by ? initials(staffNameMap.get(String(row.ha_signed_by)) || 'Staff') : '',
    fohCheckInitials:row.foh_signed_by ? initials(staffNameMap.get(String(row.foh_signed_by)) || 'Staff') : '',
    checkIssueOpen:Boolean(row.check_issue_open),
    inspected:Boolean(row.inspected),
    packages:packageNamesByRoom.get(String(row.room_id || '')) || [],
    notes:String(row.notes || '')
  })).sort((a:any,b:any)=>
    (roomSortMap.get(a.roomId) ?? 9999) - (roomSortMap.get(b.roomId) ?? 9999)
  )

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

  const breakfast:any[] = (breakfastRes.data || []).map((row:any)=>({
    id:String(row.id),
    roomId:String(row.room_id || ''),
    roomName:roomName(row.room_id,roomMap),
    lastName:String(row.last_name || ''),
    timeSlot:String(row.time_slot || ''),
    status:String(row.status || ''),
    menuSubmitted:Boolean(row.menu_submitted),
    taggedOnly:false,
    breakfastSkipped:String(row.status || '')==='declined',
    note:menuNoteMap.get(String(row.id)) || ''
  }))

  const bookedBreakfastRooms = new Set(breakfast.map((row:any)=>row.roomId).filter(Boolean))
  for (const row of (breakfastTagRes.data || [])) {
    const roomId = String((row as any).room_id || '')
    if (!roomId || bookedBreakfastRooms.has(roomId)) continue
    breakfast.push({
      id:`breakfast-tag:${roomId}`,
      roomId,
      roomName:roomName(roomId,roomMap),
      lastName:'',
      timeSlot:'',
      status:(row as any).breakfast_skipped ? 'declined' : 'scheduled',
      menuSubmitted:false,
      taggedOnly:true,
      breakfastSkipped:Boolean((row as any).breakfast_skipped),
      note:''
    })
  }

  const skippedBreakfastRoomIds = new Set(
    breakfast
      .filter((row:any)=>row.breakfastSkipped || row.status==='declined')
      .map((row:any)=>row.roomId)
      .filter(Boolean)
  )

  housekeeping = housekeeping.map((row:any)=>({
    ...row,
    breakfastSkipped:skippedBreakfastRoomIds.has(row.roomId)
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

  let reservationDaily:any[] = []
  if (moduleKeys.has('reservations')) {
    const { data:linkRows, error:linkError } = await admin
      .from('reservation_daily_links')
      .select('*')
      .eq('service_date',today)
    if (!linkError && linkRows?.length) {
      const reservationIds=[...new Set(linkRows.flatMap((row:any)=>[
        row.primary_reservation_id,row.arriving_reservation_id,row.stay_reservation_id,row.departing_reservation_id
      ]).filter(Boolean).map(String))]
      let stayRows:any[]=[]
      if (reservationIds.length) {
        const { data } = await admin.from('reservation_stays').select('*').in('id',reservationIds)
        stayRows=data||[]
      }
      const stayById=new Map<string,any>(stayRows.map((row:any)=>[String(row.id),row] as [string,any]))
      reservationDaily=linkRows
        .map((row:any)=>({
          roomId:String(row.room_id||''),
          roomName:roomName(row.room_id,roomMap),
          status:String(row.reservation_status||'Vacant'),
          primary:row.primary_reservation_id?stayById.get(String(row.primary_reservation_id))||null:null,
          arriving:row.arriving_reservation_id?stayById.get(String(row.arriving_reservation_id))||null:null,
          staying:row.stay_reservation_id?stayById.get(String(row.stay_reservation_id))||null:null,
          departing:row.departing_reservation_id?stayById.get(String(row.departing_reservation_id))||null:null
        }))
        .sort((a:any,b:any)=>(roomSortMap.get(a.roomId)??9999)-(roomSortMap.get(b.roomId)??9999))
    }
  }

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
        showReservationDaily={moduleKeys.has('reservations')}
        reservationDaily={reservationDaily}
      />
    </StaffShell>
  )
}
