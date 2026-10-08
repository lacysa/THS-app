import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { getStaffAccess } from '@/lib/access'

export const dynamic = 'force-dynamic'

type SaveRow = {
  roomId: string
  reservationStatus?: string
  serviceType?: string
  stripHold?: string
  assignedTo?: string
  cleanOrder?: number | null
  complete?: boolean
  readyForInspection?: boolean
  inspected?: boolean
  completedAt?: string | null
  inspectedAt?: string | null
  roomCondition?: string
  nextShiftCondition?: string
  notes?: string
  housekeeperAttested?: boolean
  lateArrival?: boolean
  breakfastTag?: boolean
  packageIds?: string[]
}

function validDate(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function nextDate(value: string) {
  const d = new Date(`${value}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function getPeopleAndCapabilities(admin: ReturnType<typeof createSupabaseAdmin>) {
  const [{ data: people, error: peopleError }, { data: caps, error: capsError }] = await Promise.all([
    admin
      .from('staff_members')
      .select('id,auth_user_id,name,job_title,active,full_room_clean_limit')
      .eq('active', true)
      .order('name'),
    admin
      .from('staff_member_capabilities')
      .select('staff_member_id,capability_key')
  ])

  if (peopleError) throw new Error(peopleError.message)
  if (capsError) throw new Error(capsError.message)

  const byMember = new Map<string, Set<string>>()
  for (const row of caps || []) {
    const id = String((row as any).staff_member_id || '')
    if (!id) continue
    const current = byMember.get(id) || new Set<string>()
    current.add(String((row as any).capability_key || ''))
    byMember.set(id, current)
  }

  return { people: people || [], byMember }
}

export async function GET(req: NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date')
  if (!validDate(date)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  const serviceDate = date as string
  const admin = createSupabaseAdmin()

  try {
    const [
      { data: rooms, error: roomError },
      { data: saved, error: savedError },
      peopleData,
      { data: packageCatalog, error: packageCatalogError },
      { data: roomPackageRows, error: roomPackageError },
      { data: scheduleRows, error: scheduleError }
    ] = await Promise.all([
      admin
        .from('rooms')
        .select('id,name,sort_order,active')
        .eq('active', true)
        .order('sort_order'),
      admin
        .from('housekeeping_daily_rooms')
        .select('*')
        .eq('service_date', serviceDate),
      getPeopleAndCapabilities(admin),
      admin
        .from('room_package_catalog')
        .select('id,name,price,available,sort_order')
        .order('sort_order'),
      admin
        .from('housekeeping_room_packages')
        .select('room_id,package_id,source')
        .eq('service_date', serviceDate),
      admin
        .from('staff_daily_schedule')
        .select('staff_member_id,shift_start,shift_end,role_label,work_mode')
        .eq('schedule_date', serviceDate)
    ])

    if (roomError) throw new Error(roomError.message)
    if (savedError) throw new Error(savedError.message)
    if (packageCatalogError) throw new Error(packageCatalogError.message)
    if (roomPackageError) throw new Error(roomPackageError.message)
    if (scheduleError) throw new Error(scheduleError.message)

    const peopleById = new Map<string, any>()
    for (const person of peopleData.people) peopleById.set(String((person as any).id), person)

    const currentPerson = peopleData.people.find(
      (person: any) => person.auth_user_id === access.userId
    ) as any | undefined
    const currentCaps = currentPerson
      ? peopleData.byMember.get(String(currentPerson.id)) || new Set<string>()
      : new Set<string>()

    const assignedOnlyView =
      !access.isAdmin &&
      currentCaps.has('housekeeping') &&
      !['manager','general_manager','operations_manager','owner'].some(cap => currentCaps.has(cap))

    const allStaffOptions = peopleData.people
      .filter((person: any) => person.active !== false)
      .map((person: any) => ({
        id: person.id,
        name: person.name,
        roleLabel: person.job_title || '',
        fullRoomCleanLimit: Number(person.full_room_clean_limit ?? 2),
        shiftStart: null,
        shiftEnd: null,
        onSite: false
      }))

    const scheduleByMember = new Map<string, any>()
    for (const row of scheduleRows || []) {
      scheduleByMember.set(String((row as any).staff_member_id), row)
    }

    const onsiteStaffOptions = peopleData.people
      .filter((person: any) => person.active !== false)
      .map((person: any) => {
        const schedule = scheduleByMember.get(String(person.id))
        if (!schedule || schedule.work_mode !== 'onsite') return null
        return {
          id: person.id,
          name: person.name,
          roleLabel: schedule.role_label || person.job_title || '',
          fullRoomCleanLimit: Number(person.full_room_clean_limit ?? 2),
          shiftStart: schedule.shift_start || null,
          shiftEnd: schedule.shift_end || null,
          onSite: true
        }
      })
      .filter(Boolean)

    const staffOptions = (scheduleRows || []).length ? onsiteStaffOptions : allStaffOptions

    const savedByRoom = new Map<string, any>()
    for (const row of saved || []) savedByRoom.set(String((row as any).room_id), row)

    const packageIdsByRoom = new Map<string,string[]>()
    for (const assignment of roomPackageRows || []) {
      const roomId = String((assignment as any).room_id || '')
      const packageId = String((assignment as any).package_id || '')
      if (!roomId || !packageId) continue
      const current = packageIdsByRoom.get(roomId) || []
      current.push(packageId)
      packageIdsByRoom.set(roomId,current)
    }

    const breakfastDate = nextDate(serviceDate)
    const { data: breakfastRows, error: breakfastError } = await admin
      .from('breakfast_bookings')
      .select('room_id,status,menu_submitted,time_slot')
      .eq('service_date', breakfastDate)
      .in('status', ['scheduled', 'declined'])

    if (breakfastError) throw new Error(breakfastError.message)

    const breakfastByRoom = new Map<string, any>()
    for (const booking of breakfastRows || []) {
      const roomId = String((booking as any).room_id || '')
      if (!roomId) continue
      breakfastByRoom.set(roomId, booking)
    }

    const rows = (rooms || []).map((room: any) => {
      const savedRow = savedByRoom.get(String(room.id)) || {}
      const breakfast = breakfastByRoom.get(String(room.id))

      let breakfastStatus: 'none' | 'needed' | 'received' | 'declined' = 'none'
      if (breakfast?.status === 'declined') breakfastStatus = 'declined'
      else if (breakfast?.status === 'scheduled' && breakfast?.menu_submitted) breakfastStatus = 'received'
      else if (breakfast?.status === 'scheduled') breakfastStatus = 'needed'

      return {
        roomId: room.id,
        roomName: room.name,
        sortOrder: room.sort_order,
        reservationStatus: savedRow.reservation_status || '',
        serviceType: savedRow.service_type || '',
        requiresQualityCheck:
          ['checkout','out/in'].includes(String(savedRow.reservation_status||'').trim().toLowerCase()) ||
          String(savedRow.service_type||'').trim().toUpperCase().startsWith('OUT'),
        stripHold: savedRow.strip_hold || '',
        stripStatus: savedRow.strip_status || '',
        stripRequestedAt: savedRow.strip_requested_at || null,
        strippedBy: savedRow.stripped_by || null,
        strippedByName: savedRow.stripped_by
          ? (peopleById.get(String(savedRow.stripped_by)) as any)?.name || 'Staff'
          : null,
        strippedAt: savedRow.stripped_at || null,
        assignedTo: savedRow.assigned_to || '',
        claimableRefresh:
          String(savedRow.reservation_status||'').trim().toLowerCase()==='stayover' &&
          String(savedRow.service_type||'').trim().toUpperCase()==='RF' &&
          !String(savedRow.assigned_to||'').trim(),
        cleanOrder: savedRow.clean_order ?? null,
        complete: Boolean(savedRow.complete),
        readyForInspection: Boolean(savedRow.ready_for_inspection),
        inspected: Boolean(savedRow.inspected),
        completedAt: savedRow.completed_at || null,
        inspectedAt: savedRow.inspected_at || null,
        roomCondition: savedRow.room_condition || '',
        nextShiftCondition: savedRow.next_shift_condition || '',
        notes: savedRow.notes || '',
        breakfastTag: Boolean(savedRow.breakfast_tag),
        lateArrival: Boolean(savedRow.late_arrival),
        packageIds: packageIdsByRoom.get(String(room.id)) || [],
        haSignedBy: savedRow.ha_signed_by || null,
        haSignedName: savedRow.ha_signed_by
          ? (peopleById.get(String(savedRow.ha_signed_by)) as any)?.name || 'Staff'
          : null,
        haSignedAt: savedRow.ha_signed_at || null,
        fohSignedBy: savedRow.foh_signed_by || null,
        fohSignedName: savedRow.foh_signed_by
          ? (peopleById.get(String(savedRow.foh_signed_by)) as any)?.name || 'Staff'
          : null,
        fohSignedAt: savedRow.foh_signed_at || null,
        housekeeperAttested: Boolean(savedRow.housekeeper_attested_by),
        housekeeperAttestedBy: savedRow.housekeeper_attested_by || null,
        housekeeperAttestedName: savedRow.housekeeper_attested_by
          ? (peopleById.get(String(savedRow.housekeeper_attested_by)) as any)?.name || 'Staff'
          : null,
        housekeeperAttestedAt: savedRow.housekeeper_attested_at || null,
        checkIssueOpen: Boolean(savedRow.check_issue_open),
        checkIssueNote: savedRow.check_issue_note || '',
        checkIssueBy: savedRow.check_issue_by || null,
        checkIssueByName: savedRow.check_issue_by
          ? (peopleById.get(String(savedRow.check_issue_by)) as any)?.name || 'Staff'
          : null,
        checkIssueAt: savedRow.check_issue_at || null,
        breakfast: {
          serviceDate: breakfastDate,
          status: breakfastStatus,
          timeSlot: breakfast?.time_slot || null
        }
      }
    })

    const visibleRows = assignedOnlyView && currentPerson
      ? rows.filter((row:any) => {
          const assigned=String(row.assignedTo || '')
            .split(',')
            .map((name:string)=>name.trim().toLowerCase())
            .filter(Boolean)
          const assignedToMe=assigned.includes(String(currentPerson.name || '').trim().toLowerCase())
          return assignedToMe || Boolean(row.claimableRefresh)
        })
      : rows

    const stripTasks = assignedOnlyView
      ? rows.filter((row:any)=>row.stripStatus==='needed')
      : []

    // Housekeeping-only users receive a deliberately narrow payload. Do not rely on
    // the client to hide FOH/guest-facing operational context: it is not sent.
    const responseRows = assignedOnlyView
      ? visibleRows.map((row:any)=>({
          ...row,
          packageIds: [],
          breakfastTag: false,
          breakfast: { serviceDate: breakfastDate, status: 'none', timeSlot: null },
          haSignedBy: null,
          haSignedName: null,
          haSignedAt: null,
          fohSignedBy: null,
          fohSignedName: null,
          fohSignedAt: null
        }))
      : visibleRows

    const menuNeededRooms = assignedOnlyView
      ? []
      : visibleRows.filter((row: any) => row.breakfast.status === 'needed').map((row: any) => row.roomName)

    const blockingRoom = assignedOnlyView
      ? visibleRows.find((row:any)=>row.checkIssueOpen)
      : null

    return NextResponse.json({
      rows: responseRows,
      stripTasks,
      blockingRoomId: blockingRoom?.roomId || null,
      blockingRoomName: blockingRoom?.roomName || null,
      viewMode: assignedOnlyView ? 'assigned' : 'manager',
      staffOptions: assignedOnlyView ? [] : staffOptions,
      onsiteStaffOptions: assignedOnlyView ? [] : onsiteStaffOptions,
      allStaffOptions: assignedOnlyView ? [] : allStaffOptions,
      staffing: {
        hasSchedule: (scheduleRows || []).length > 0,
        onSiteCount: onsiteStaffOptions.length
      },
      packageOptions: assignedOnlyView ? [] : (packageCatalog || []).map((pkg:any)=>({
        id:String(pkg.id),
        name:String(pkg.name || ''),
        price:pkg.price == null ? null : Number(pkg.price),
        available:Boolean(pkg.available)
      })),
      signoffAccess: {
        canHaSignoff: !assignedOnlyView && (currentCaps.has('ha_signoff') || currentCaps.has('ha_signoff_override')),
        canFohSignoff: !assignedOnlyView && (
          access.isAdmin ||
          ['manager','general_manager','operations_manager','owner','foh_manager'].some(cap=>currentCaps.has(cap)) ||
          ['manager','owner'].some(label=>String(access.roleName||'').trim().toLowerCase().includes(label)) ||
          currentCaps.has('foh_signoff') ||
          currentCaps.has('foh_signoff_override')
        )
      },
      breakfast: {
        serviceDate: breakfastDate,
        menuNeededRooms
      }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Could not load housekeeping board.' },
      { status: 500 }
    )
  }
}


export async function PATCH(req: NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.isPreviewMode) return NextResponse.json({ error: 'Owner staff preview is read-only.' }, { status: 403 })

  const payload = await req.json().catch(() => null)
  const serviceDate = payload?.serviceDate
  const roomId = cleanText(payload?.roomId)
  const requested = payload?.patch && typeof payload.patch === 'object' ? payload.patch : {}

  if (!validDate(serviceDate) || !roomId) {
    return NextResponse.json({ error: 'Invalid room update.' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const now = new Date().toISOString()

  try {
    const peopleData = await getPeopleAndCapabilities(admin)
    const currentPerson = peopleData.people.find((person:any) => person.auth_user_id === access.userId) as any | undefined
    const currentCaps = currentPerson
      ? peopleData.byMember.get(String(currentPerson.id)) || new Set<string>()
      : new Set<string>()
    const manager = access.isAdmin || ['manager','general_manager','operations_manager','owner'].some(cap=>currentCaps.has(cap))
    const housekeepingOnly = !manager && currentCaps.has('housekeeping')

    const { data: existing, error: existingError } = await admin
      .from('housekeeping_daily_rooms')
      .select('*')
      .eq('service_date', serviceDate)
      .eq('room_id', roomId)
      .maybeSingle()
    if (existingError) throw new Error(existingError.message)
    if (!existing) return NextResponse.json({ error: 'Room is not on this day.' }, { status: 404 })

    if (housekeepingOnly && currentPerson) {
      const assigned = String(existing.assigned_to || '').split(',').map((name:string)=>name.trim().toLowerCase()).filter(Boolean)
      const isMine = assigned.includes(String(currentPerson.name || '').trim().toLowerCase())
      const claimableRefresh = String(existing.reservation_status||'').trim().toLowerCase()==='stayover' && String(existing.service_type||'').trim().toUpperCase()==='RF' && !assigned.length
      if (!isMine && !claimableRefresh) return NextResponse.json({ error: 'This room is not assigned to you.' }, { status: 403 })
    }

    const allowedForHousekeeping = new Set(['notes','complete','readyForInspection','inspected','roomCondition'])
    if (!manager) {
      const disallowed = Object.keys(requested).filter(key=>!allowedForHousekeeping.has(key))
      if (disallowed.length) return NextResponse.json({ error: 'Manager access is required for that room change.' }, { status: 403 })
    }

    if (manager && Object.prototype.hasOwnProperty.call(requested,'assignedTo')) {
      const proposedName = cleanText(requested.assignedTo)
      if (proposedName) {
        const person = peopleData.people.find((p:any)=>String(p.name||'').trim().toLowerCase()===proposedName.toLowerCase()) as any
        if (!person) return NextResponse.json({ error: 'Choose an active staff member.' }, { status: 400 })
        const status = String(existing.reservation_status||'').trim().toLowerCase()
        if (['checkout','out/in','dirty'].includes(status)) {
          const { data: dayRows, error: countError } = await admin
            .from('housekeeping_daily_rooms')
            .select('room_id,reservation_status,assigned_to')
            .eq('service_date',serviceDate)
          if (countError) throw new Error(countError.message)
          const fullCleanCount=(dayRows||[]).filter((row:any)=>{
            if(String(row.room_id)===roomId)return false
            if(!['checkout','out/in','dirty'].includes(String(row.reservation_status||'').trim().toLowerCase()))return false
            return String(row.assigned_to||'').split(',').map((v:string)=>v.trim().toLowerCase()).includes(proposedName.toLowerCase())
          }).length
          const limit=Number(person.full_room_clean_limit??2)
          if(fullCleanCount+1>limit){
            return NextResponse.json({error:`${person.name} is limited to ${limit} full room clean${limit===1?'':'s'} per shift.`},{status:400})
          }
        }
      }
    }

    if(manager && Object.prototype.hasOwnProperty.call(requested,'reservationStatus')) {
      const nextStatus=cleanText(requested.reservationStatus)
      if(!['Checkout','Out/In','Stayover','Arrival','Vacant','Dirty','Blocked'].includes(nextStatus))
        return NextResponse.json({error:'Choose a valid reservation status.'},{status:400})
    }
    if(manager && Object.prototype.hasOwnProperty.call(requested,'roomCondition')) {
      const condition=cleanText(requested.roomCondition)
      if(!['Occupied','Vacant (Clean)','Vacant (Dirty)','Cleaning','Ready for Room Check','Ready','Blocked'].includes(condition))
        return NextResponse.json({error:'Choose a valid room condition.'},{status:400})
    }
    const dbPatch:any={updated_at:now}
    if(manager && Object.prototype.hasOwnProperty.call(requested,'reservationStatus')) dbPatch.reservation_status=cleanText(requested.reservationStatus)
    if (manager && Object.prototype.hasOwnProperty.call(requested,'assignedTo')) dbPatch.assigned_to=cleanText(requested.assignedTo)
    if (manager && Object.prototype.hasOwnProperty.call(requested,'cleanOrder')) dbPatch.clean_order=Number.isFinite(Number(requested.cleanOrder))&&requested.cleanOrder!==null&&requested.cleanOrder!==''?Number(requested.cleanOrder):null
    if (manager && Object.prototype.hasOwnProperty.call(requested,'serviceType')) dbPatch.service_type=cleanText(requested.serviceType)
    if (manager && Object.prototype.hasOwnProperty.call(requested,'stripHold')) dbPatch.strip_hold=cleanText(requested.stripHold)
    if (manager && Object.prototype.hasOwnProperty.call(requested,'lateArrival')) dbPatch.late_arrival=requested.lateArrival===true
    if (manager && Object.prototype.hasOwnProperty.call(requested,'breakfastTag')) {
      dbPatch.breakfast_tag=requested.breakfastTag===true
      dbPatch.breakfast_tag_override=requested.breakfastTag===true
    }
    if (manager && requested.resetBreakfastTag===true) {
      dbPatch.breakfast_tag_override=null
    }
    if (Object.prototype.hasOwnProperty.call(requested,'notes')) dbPatch.notes=cleanText(requested.notes)
    if(manager && (Object.prototype.hasOwnProperty.call(requested,'reservationStatus') || Object.prototype.hasOwnProperty.call(requested,'stripHold'))) {
      const nextStatus=String(requested.reservationStatus ?? existing.reservation_status ?? '')
      const nextHold=String(requested.stripHold ?? existing.strip_hold ?? '')
      const blocked=nextStatus.toLowerCase()==='blocked'||nextHold.toLowerCase().includes('hold')
      if(blocked){
        dbPatch.room_condition='Blocked'
        dbPatch.complete=false
        dbPatch.ready_for_inspection=false
        dbPatch.inspected=false
        dbPatch.assigned_to=''
        dbPatch.clean_order=null
      }else if(String(existing.reservation_status).toLowerCase()==='blocked'||String(existing.strip_hold||'').toLowerCase().includes('hold')){
        dbPatch.room_condition='Vacant (Dirty)'
        dbPatch.complete=false
        dbPatch.ready_for_inspection=false
        dbPatch.inspected=false
      }
    }


    const completeRequested = Object.prototype.hasOwnProperty.call(requested,'complete')
    if (completeRequested) {
      const complete=Boolean(requested.complete)
      const status=String(existing.reservation_status||'').trim().toLowerCase()
      const service=String((requested.serviceType ?? existing.service_type)||'').trim().toUpperCase()
      const isRefresh=status==='stayover'&&service==='RF'
      const requiresQuality=['checkout','out/in'].includes(status)||service.startsWith('OUT')||Boolean(existing.check_issue_open)
      const attestedAt=existing.housekeeper_attested_at?new Date(existing.housekeeper_attested_at).getTime():0
      const issueAt=existing.check_issue_at?new Date(existing.check_issue_at).getTime():0
      const validSelfCheck=Boolean(existing.housekeeper_attested_by&&attestedAt>issueAt)
      if(complete&&requiresQuality&&!validSelfCheck){
        return NextResponse.json({error:'Complete and submit the room self-check before marking the clean complete.'},{status:400})
      }
      dbPatch.complete=complete
      dbPatch.ready_for_inspection=!isRefresh&&complete
      dbPatch.inspected=false
      dbPatch.completed_at=complete?(existing.completed_at||now):null
      dbPatch.inspected_at=null
      dbPatch.room_condition=isRefresh?'Occupied':complete?'Ready for Room Check':'Cleaning'
      if(!complete){
        dbPatch.ha_signed_by=null; dbPatch.ha_signed_at=null
        dbPatch.foh_signed_by=null; dbPatch.foh_signed_at=null
      }
      if(existing.check_issue_open&&complete){
        dbPatch.check_issue_open=true
      }
    } else if (manager && Object.prototype.hasOwnProperty.call(requested,'roomCondition')) {
      dbPatch.room_condition=cleanText(requested.roomCondition)
    }

    if(manager && Object.prototype.hasOwnProperty.call(requested,'serviceType')){
      const nextService=cleanText(requested.serviceType).toUpperCase()
      const existingService=String(existing.service_type||'').trim().toUpperCase()
      if(nextService!==existingService && (nextService==='RF'||existingService==='RF')){
        dbPatch.complete=false
        dbPatch.ready_for_inspection=false
        dbPatch.inspected=false
        dbPatch.completed_at=null
        dbPatch.inspected_at=null
        dbPatch.housekeeper_attested_by=null
        dbPatch.housekeeper_attested_at=null
        dbPatch.ha_signed_by=null
        dbPatch.ha_signed_at=null
        dbPatch.foh_signed_by=null
        dbPatch.foh_signed_at=null
        dbPatch.room_condition=nextService==='RF'?'Occupied':'Cleaning'
      }
    }

    const { error:updateError } = await admin
      .from('housekeeping_daily_rooms')
      .update(dbPatch)
      .eq('service_date',serviceDate)
      .eq('room_id',roomId)
    if(updateError) throw new Error(updateError.message)

    if(manager && Object.prototype.hasOwnProperty.call(requested,'packageIds')){
      const requestedIds:string[]=[...new Set<string>(Array.isArray(requested.packageIds)?requested.packageIds.map((value:any)=>String(value)):[])]
      const { data:catalog,error:catalogError }=await admin.from('room_package_catalog').select('id')
      if(catalogError)throw new Error(catalogError.message)
      const valid=new Set((catalog||[]).map((row:any)=>String(row.id)))
      const packageIds=requestedIds.filter((id:string)=>valid.has(id))
      const {error:deleteError}=await admin.from('housekeeping_room_packages').delete().eq('source','manual').eq('service_date',serviceDate).eq('room_id',roomId)
      if(deleteError)throw new Error(deleteError.message)
      if(packageIds.length){
        const {error:insertError}=await admin.from('housekeeping_room_packages').insert(packageIds.map((packageId:string)=>({service_date:serviceDate,room_id:roomId,package_id:packageId,source:'manual'})))
        if(insertError)throw new Error(insertError.message)
      }
    }

    const { data:fresh,error:freshError }=await admin
      .from('housekeeping_daily_rooms')
      .select('*')
      .eq('service_date',serviceDate)
      .eq('room_id',roomId)
      .single()
    if(freshError)throw new Error(freshError.message)

    return NextResponse.json({
      ok:true,
      savedAt:now,
      row:{
        assignedTo:fresh.assigned_to||'',
        cleanOrder:fresh.clean_order??null,
        serviceType:fresh.service_type||'',
        reservationStatus:fresh.reservation_status||'',
        stripHold:fresh.strip_hold||'',
        breakfastTag:Boolean(fresh.breakfast_tag),
        lateArrival:Boolean(fresh.late_arrival),
        complete:Boolean(fresh.complete),
        readyForInspection:Boolean(fresh.ready_for_inspection),
        inspected:Boolean(fresh.inspected),
        completedAt:fresh.completed_at||null,
        inspectedAt:fresh.inspected_at||null,
        roomCondition:fresh.room_condition||'',
        notes:fresh.notes||'',
        housekeeperAttested:Boolean(fresh.housekeeper_attested_by),
        housekeeperAttestedBy:fresh.housekeeper_attested_by||null,
        checkIssueOpen:Boolean(fresh.check_issue_open),
        checkIssueNote:fresh.check_issue_note||'',
        haSignedBy:fresh.ha_signed_by||null,
        fohSignedBy:fresh.foh_signed_by||null,
        ...(Object.prototype.hasOwnProperty.call(requested,'packageIds')?{packageIds:Array.isArray(requested.packageIds)?requested.packageIds:[]}: {})
      }
    })
  } catch (error:any) {
    return NextResponse.json({ error:error?.message||'Could not update room.' },{status:500})
  }
}

export async function POST(req: NextRequest) {
  const access = await getStaffAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.isPreviewMode) return NextResponse.json({ error: 'Owner staff preview is read-only.' }, { status: 403 })

  const payload = await req.json().catch(() => null)
  const serviceDate = payload?.serviceDate
  const rows: SaveRow[] = Array.isArray(payload?.rows) ? payload.rows : []

  if (!validDate(serviceDate)) {
    return NextResponse.json({ error: 'Invalid service date' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const now = new Date().toISOString()

  try {
    const peopleData = await getPeopleAndCapabilities(admin)
    const currentPerson = peopleData.people.find(
      (person:any) => person.auth_user_id === access.userId
    ) as any | undefined
    const currentCaps = currentPerson
      ? peopleData.byMember.get(String(currentPerson.id)) || new Set<string>()
      : new Set<string>()

    const assignedOnlyView =
      !access.isAdmin &&
      currentCaps.has('housekeeping') &&
      !['manager','general_manager','operations_manager','owner'].some(cap => currentCaps.has(cap))

    const roomIds = rows.map(row => row.roomId).filter(Boolean)

    let blockingExisting:any = null
    if (assignedOnlyView && currentPerson) {
      const { data:allAssignedRows, error:blockError } = await admin
        .from('housekeeping_daily_rooms')
        .select('room_id,assigned_to,check_issue_open')
        .eq('service_date', serviceDate)
        .eq('check_issue_open', true)

      if (blockError) throw new Error(blockError.message)

      blockingExisting = (allAssignedRows || []).find((saved:any)=>
        String(saved.assigned_to || '')
          .split(',')
          .map((name:string)=>name.trim().toLowerCase())
          .filter(Boolean)
          .includes(String(currentPerson.name || '').trim().toLowerCase())
      ) || null
    }

    const { data: existingRows, error: existingError } = roomIds.length
      ? await admin
          .from('housekeeping_daily_rooms')
          .select('*')
          .eq('service_date', serviceDate)
          .in('room_id', roomIds)
      : { data: [], error: null as any }

    if (existingError) throw new Error(existingError.message)
    const existingByRoom = new Map<string, any>()
    for (const row of existingRows || []) existingByRoom.set(String((row as any).room_id), row)

    if (!assignedOnlyView) {
      const fullCleanCounts = new Map<string,number>()
      const limitsByName = new Map<string,number>(
        peopleData.people.map((person:any)=>[
          String(person.name||'').trim().toLowerCase(),
          Number(person.full_room_clean_limit ?? 2)
        ])
      )

      for (const row of rows) {
        const status=String(row.reservationStatus||'').trim().toLowerCase()
        if (!['checkout','out/in','dirty'].includes(status)) continue
        const assigned=String(row.assignedTo||'')
          .split(',')
          .map((name:string)=>name.trim().toLowerCase())
          .filter(Boolean)

        for (const name of assigned) {
          fullCleanCounts.set(name,(fullCleanCounts.get(name)||0)+1)
        }
      }

      for (const [name,count] of fullCleanCounts) {
        const limit=limitsByName.get(name) ?? 2
        if (count>limit) {
          const person=peopleData.people.find((p:any)=>String(p.name||'').trim().toLowerCase()===name)
          throw new Error(`${person?.name||name} is limited to ${limit} full room clean${limit===1?'':'s'} per shift. Remove or reassign a full clean before saving.`)
        }
      }
    }

    const upserts = rows
      .filter(row => {
        if (!assignedOnlyView) return true
        if (!currentPerson) return false
        const existing = existingByRoom.get(String(row.roomId)) || {}
        return String(existing.assigned_to || '')
          .split(',')
          .map((name:string)=>name.trim().toLowerCase())
          .filter(Boolean)
          .includes(String(currentPerson.name || '').trim().toLowerCase())
      })
      .map(row => {
        const existing = existingByRoom.get(String(row.roomId)) || {}
        const complete = Boolean(row.complete)

        if (assignedOnlyView) {
          if (
            complete &&
            blockingExisting &&
            String(blockingExisting.room_id) !== String(row.roomId)
          ) {
            throw new Error('You must correct and pass re-check on the flagged room before completing another room.')
          }

          const requiresQualityCheck =
            ['checkout','out/in'].includes(String(existing.reservation_status||'').trim().toLowerCase()) ||
            String(existing.service_type||'').trim().toUpperCase().startsWith('OUT')
          const attestedAt = existing.housekeeper_attested_at ? new Date(existing.housekeeper_attested_at).getTime() : 0
          const issueAt = existing.check_issue_at ? new Date(existing.check_issue_at).getTime() : 0
          const validSelfCheck = Boolean(existing.housekeeper_attested_by && attestedAt > issueAt)

          if (complete && requiresQualityCheck && !validSelfCheck) {
            throw new Error('Complete and submit the room checklist before marking this room complete.')
          }

          const attestedNow = requiresQualityCheck ? validSelfCheck : Boolean(existing.housekeeper_attested_by)
          const existingService = String(existing.service_type||'').trim().toUpperCase()
          const requestedService = cleanText(row.serviceType).toUpperCase()
          const safeHousekeeperService =
            existingService.startsWith('OUT-')
              ? existing.service_type
              : ['','OUT','RF'].includes(requestedService)
                ? requestedService
                : existing.service_type || ''

          const isRefresh =
            String(existing.reservation_status||'').trim().toLowerCase()==='stayover' &&
            safeHousekeeperService.toUpperCase()==='RF'

          return {
            service_date: serviceDate,
            room_id: row.roomId,
            reservation_status: existing.reservation_status || '',
            service_type: safeHousekeeperService,
            strip_hold: existing.strip_hold || '',
            assigned_to: existing.assigned_to || '',
            clean_order: existing.clean_order ?? null,
            complete,
            ready_for_inspection: isRefresh ? false : complete && !Boolean(existing.inspected),
            inspected: isRefresh ? false : Boolean(existing.inspected),
            completed_at: complete ? (existing.completed_at || row.completedAt || now) : null,
            inspected_at: existing.inspected_at || null,
            room_condition: isRefresh
              ? (existing.room_condition || 'Occupied')
              : complete
                ? (existing.room_condition || 'Ready for Room Check')
                : (existing.room_condition || ''),
            next_shift_condition: existing.next_shift_condition || '',
            notes: cleanText(row.notes),
            breakfast_tag: Boolean(existing.breakfast_tag),
            housekeeper_attested_by: attestedNow ? existing.housekeeper_attested_by : null,
            housekeeper_attested_at: attestedNow ? existing.housekeeper_attested_at : null,
            ha_signed_by: complete ? existing.ha_signed_by || null : null,
            ha_signed_at: complete ? existing.ha_signed_at || null : null,
            foh_signed_by: complete ? existing.foh_signed_by || null : null,
            foh_signed_at: complete ? existing.foh_signed_at || null : null,
            updated_at: now
          }
        }

        const isRefresh =
          String(row.reservationStatus||'').trim().toLowerCase()==='stayover' &&
          String(row.serviceType||'').trim().toUpperCase()==='RF'
        const inspected = isRefresh ? false : Boolean(row.inspected)
        return {
          service_date: serviceDate,
          room_id: row.roomId,
          reservation_status: cleanText(row.reservationStatus),
          service_type: cleanText(row.serviceType),
          strip_hold: cleanText(row.stripHold),
          strip_status: ['','needed','stripped'].includes(cleanText((row as any).stripStatus)) ? cleanText((row as any).stripStatus) : '',
          strip_requested_at: cleanText((row as any).stripStatus)==='needed' ? (existing.strip_requested_at || now) : existing.strip_requested_at || null,
          stripped_by: cleanText((row as any).stripStatus)==='stripped' ? (existing.stripped_by || null) : null,
          stripped_at: cleanText((row as any).stripStatus)==='stripped' ? (existing.stripped_at || now) : null,
          assigned_to: cleanText(row.assignedTo),
          clean_order: Number.isFinite(row.cleanOrder as number) ? row.cleanOrder : null,
          complete,
          ready_for_inspection: isRefresh ? false : complete && !inspected,
          inspected,
          completed_at: complete ? (existing.completed_at || row.completedAt || now) : null,
          inspected_at: inspected ? (existing.inspected_at || row.inspectedAt || now) : null,
          room_condition: cleanText(row.roomCondition),
          next_shift_condition: cleanText(row.nextShiftCondition),
          notes: cleanText(row.notes),
          breakfast_tag: Boolean(row.breakfastTag),
          late_arrival: Boolean(row.lateArrival),
          ha_signed_by: complete ? existing.ha_signed_by || null : null,
          ha_signed_at: complete ? existing.ha_signed_at || null : null,
          foh_signed_by: complete ? existing.foh_signed_by || null : null,
          foh_signed_at: complete ? existing.foh_signed_at || null : null,
          updated_at: now
        }
      })

    if (upserts.length) {
      const { error } = await admin
        .from('housekeeping_daily_rooms')
        .upsert(upserts, { onConflict: 'service_date,room_id' })
      if (error) throw new Error(error.message)
    }

    // EOS Vacant (Dirty) must become tomorrow's cleaning workload immediately.
    // next_shift_condition is the dedicated EOS field; room_condition is only
    // retained as a fallback for legacy rows created before Rooms consolidation.
    const dirtyRows = upserts.filter((row:any)=>
      String(row.next_shift_condition||row.room_condition||'').trim()==='Vacant (Dirty)'
    )
    if (dirtyRows.length) {
      const tomorrow = nextDate(serviceDate)
      const dirtyRoomIds = dirtyRows.map((row:any)=>String(row.room_id))
      const { data: tomorrowRows, error: tomorrowError } = await admin
        .from('housekeeping_daily_rooms')
        .select('room_id,reservation_status,service_type')
        .eq('service_date', tomorrow)
        .in('room_id', dirtyRoomIds)
      if (tomorrowError) throw new Error(tomorrowError.message)

      const tomorrowByRoom = new Map((tomorrowRows || []).map((row:any)=>[String(row.room_id),row]))
      const carryRows = dirtyRows.map((row:any)=>{
        const existing = tomorrowByRoom.get(String(row.room_id)) || {}
        const currentStatus = String((existing as any).reservation_status || '').trim()
        const nextStatus = !currentStatus || currentStatus === 'Vacant' ? 'Dirty' : currentStatus
        const existingService = String((existing as any).service_type || '').trim()
        return {
          service_date: tomorrow,
          room_id: row.room_id,
          reservation_status: nextStatus,
          service_type: existingService.toUpperCase().startsWith('OUT') ? existingService : 'OUT',
          complete: false,
          ready_for_inspection: false,
          inspected: false,
          completed_at: null,
          inspected_at: null,
          assigned_to: '',
          clean_order: null,
          updated_at: now
        }
      })

      const { error: carryError } = await admin
        .from('housekeeping_daily_rooms')
        .upsert(carryRows, { onConflict: 'service_date,room_id' })
      if (carryError) throw new Error(carryError.message)
    }

    // Package assignments are management-controlled. Housekeeper-only saves must
    // never clear or change package orders.
    if (!assignedOnlyView && roomIds.length) {
      const { data:catalogRows, error:catalogError } = await admin
        .from('room_package_catalog')
        .select('id')
      if (catalogError) throw new Error(catalogError.message)

      const validPackageIds = new Set((catalogRows || []).map((p:any)=>String(p.id)))

      const { error:deletePackageError } = await admin
        .from('housekeeping_room_packages')
        .delete()
        .eq('source','manual')
        .eq('service_date',serviceDate)
        .in('room_id',roomIds)
      if (deletePackageError) throw new Error(deletePackageError.message)

      const packageAssignments = rows.flatMap(row =>
        [...new Set(Array.isArray(row.packageIds) ? row.packageIds : [])]
          .map(String)
          .filter(packageId => validPackageIds.has(packageId))
          .map(packageId => ({
            service_date:serviceDate,
            room_id:row.roomId,
            package_id:packageId,
            source:'manual'
          }))
      )

      if (packageAssignments.length) {
        const { error:insertPackageError } = await admin
          .from('housekeeping_room_packages')
          .insert(packageAssignments)
        if (insertPackageError) throw new Error(insertPackageError.message)
      }
    }

    return NextResponse.json({ ok: true, savedAt: now })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Could not save housekeeping board.' },
      { status: 500 }
    )
  }
}
