import type React from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  BedDouble,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Package,
  Users,
  UtensilsCrossed,
  Wrench
} from 'lucide-react'

type BreakfastRow = {
  id:string
  roomName:string
  lastName:string
  timeSlot:string
  status:string
  menuSubmitted:boolean
  taggedOnly?:boolean
  breakfastSkipped?:boolean
  note?:string
}

type HousekeepingRow = {
  id:string
  roomId:string
  roomName:string
  reservationStatus:string
  serviceType:string
  assignedTo:string
  cleanOrder:number|null
  complete:boolean
  stripHold:string
  roomCondition:string
  haCheckInitials:string
  fohCheckInitials:string
  checkIssueOpen:boolean
  inspected:boolean
  breakfastSkipped?:boolean
  packages:string[]
  notes:string
}

type MaintenanceRow = {
  id:string
  location:string
  title:string
  priority:string
  status:string
}

type InventoryRow = {
  id:string
  department:string
  itemName:string
  quantity:string
  note:string
  status:string
}

type DepartmentNote = {
  department:string
  note:string
}

type ReservationStay = {
  guest_name?:string|null
  door_code?:string|null
  arrival_date?:string|null
  checkout_date?:string|null
  check_in_time?:string|null
  products_raw?:string|null
  innkeeper_notes?:string|null
  guest_comments?:string|null
  dietary_restrictions?:string|null
}

type ReservationDailyRow = {
  roomId:string
  roomName:string
  status:string
  primary:ReservationStay|null
  arriving:ReservationStay|null
  staying:ReservationStay|null
  departing:ReservationStay|null
}

type TodayStaffRow = {
  id:string
  name:string
  roleLabel:string
  shiftStart:string
  shiftEnd:string
}

type Props = {
  displayName:string
  todayLabel:string
  breakfastDate:string
  showBreakfast:boolean
  showHousekeeping:boolean
  showMaintenance:boolean
  showInventory:boolean
  showLaundry:boolean
  showLobby:boolean
  breakfast:BreakfastRow[]
  housekeeping:HousekeepingRow[]
  maintenance:MaintenanceRow[]
  inventory:InventoryRow[]
  departmentNotes:DepartmentNote[]
  showReservationDaily:boolean
  reservationDaily:ReservationDailyRow[]
  todayStaff:TodayStaffRow[]
}

function formatTime(value:string) {
  if (!value) return 'Unscheduled'
  const [h,m] = value.slice(0,5).split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2,'0')} ${suffix}`
}

function titleCase(value:string) {
  return value.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
}

function inventoryHref(department:string) {
  return `/inventory/${department.replace(/_/g,'-')}`
}

function statusClass(value:string) {
  return 'daily-status-'+String(value||'none').toLowerCase().replace(/[^a-z0-9]+/g,'-')
}

function splitStaff(value:string) {
  return String(value||'').split(',').map(v=>v.trim()).filter(Boolean)
}

function staffHue(name:string) {
  let hash=0
  for(let i=0;i<name.length;i++) hash=((hash<<5)-hash)+name.charCodeAt(i)
  return Math.abs(hash)%360
}

function staffStyle(name:string) {
  return {'--staff-hue':staffHue(name)} as React.CSSProperties
}

function roomCheckLabel(row:HousekeepingRow) {
  if (row.checkIssueOpen) return 'Needs correction'
  if (row.fohCheckInitials) return `FOH ✓ ${row.fohCheckInitials}`
  if (row.haCheckInitials) return `HA ✓ ${row.haCheckInitials} · FOH pending`
  return 'Pending'
}

function RoomSummary({row}:{row:HousekeepingRow}) {
  const staff=splitStaff(row.assignedTo)
  return (
    <details className={`daily-room-card ${statusClass(row.reservationStatus)}`}>
      <summary>
        <div className="daily-room-summary-name">
          <strong>{row.roomName}</strong>
        </div>
        <div className="daily-room-pills">
          {row.reservationStatus && <span className={`daily-chip ${statusClass(row.reservationStatus)}`}>{row.reservationStatus}</span>}
          {row.serviceType && <span className="daily-chip service">{row.serviceType}</span>}
          {row.stripHold && <span className="daily-chip warning">{row.stripHold}</span>}
          {staff.map(name=><span className="daily-chip staff" style={staffStyle(name)} key={name}><b>HSK</b> {name}</span>)}
          {row.cleanOrder!=null && <span className="daily-chip order"><b>Order</b> {row.cleanOrder}</span>}
          <span className={`daily-chip progress ${row.complete?'done':'open'}`}>{row.complete?'Complete':'In progress'}</span>
          {row.roomCondition && <span className="daily-chip eos"><b>EOS</b> {row.roomCondition}</span>}
          {(row.haCheckInitials || row.fohCheckInitials || row.checkIssueOpen) && (
            <span className={`daily-chip ${row.checkIssueOpen?'danger':''}`}>{roomCheckLabel(row)}</span>
          )}
          {row.packages.map(pkg=><span className="daily-chip package" key={pkg}>{pkg}</span>)}
          {row.breakfastSkipped && <span className="daily-chip breakfast-skip">Breakfast skipped</span>}
          {row.notes && <span className="daily-chip note daily-note-chip" title={row.notes}><b>Note</b> {row.notes}</span>}
        </div>
      </summary>
      <div className="daily-room-detail">
        <div><span>Status</span><strong>{row.reservationStatus || '—'}</strong></div>
        <div><span>Service</span><strong>{row.serviceType || '—'}</strong></div>
        <div><span>Strip / Hold</span><strong>{row.stripHold || '—'}</strong></div>
        <div><span>Staff</span><strong>{row.assignedTo || 'Unassigned'}</strong></div>
        <div><span>Cleaning order</span><strong>{row.cleanOrder ?? '—'}</strong></div>
        <div><span>Progress</span><strong>{row.complete ? 'Complete' : 'In progress'}</strong></div>
        <div><span>End of shift</span><strong>{row.roomCondition || '—'}</strong></div>
        <div><span>Room check</span><strong>{roomCheckLabel(row)}</strong></div>
        <div className="daily-room-detail-wide"><span>Packages</span><strong>{row.packages.length ? row.packages.join(', ') : 'None'}</strong></div>
        <div className="daily-room-detail-wide"><span>Notes</span><strong>{row.notes || 'None'}</strong></div>
        <Link href={`/housekeeping#room-${encodeURIComponent(row.roomId)}`} className="daily-room-open-link">Open in Housekeeping →</Link>
      </div>
    </details>
  )
}

export default function DailyDashboard({
  displayName,
  todayLabel,
  breakfastDate,
  showBreakfast,
  showHousekeeping,
  showMaintenance,
  showInventory,
  showLaundry,
  showLobby,
  breakfast,
  housekeeping,
  maintenance,
  inventory,
  departmentNotes,
  showReservationDaily,
  reservationDaily,
  todayStaff
}:Props) {
  const breakfastScheduled = breakfast.filter(r=>r.status==='scheduled' && !r.breakfastSkipped)
  const missingMenus = breakfastScheduled.filter(r=>!r.menuSubmitted)
  const receivedMenus = breakfastScheduled.filter(r=>r.menuSubmitted)
  const skippedBreakfast = breakfast.filter(r=>r.breakfastSkipped || r.status==='declined')

  // Housekeeping workload:
  // - Checkout / Out-In always count
  // - legacy/current OUT service markers also count, even if the row status was overwritten to Vacant
  // - Stayover only counts when RF is requested
  // - Arrival only counts when Housekeeping fixes/corrections are needed
  const housekeepingWorkload = housekeeping.filter(row=>{
    const status=String(row.reservationStatus||'')
    const service=String(row.serviceType||'').toUpperCase()
    const isOutService=service.startsWith('OUT')
    if(status==='Checkout' || status==='Out/In' || isOutService) return true
    if(status==='Stayover' && service==='RF') return true
    if(status==='Arrival' && row.checkIssueOpen) return true
    return false
  })
  const hkComplete = housekeepingWorkload.filter(r=>r.complete && !r.checkIssueOpen)

  // Room checks:
  // Every room on the daily board requires inspection except blocked / held rooms.
  const roomCheckRooms = housekeeping.filter(row=>{
    const status=String(row.reservationStatus||'').trim().toLowerCase()
    const stripHold=String(row.stripHold||'').trim().toLowerCase()
    return status!=='blocked' && !stripHold.includes('hold')
  })
  const roomChecksPassed = roomCheckRooms.filter(r=>Boolean(r.fohCheckInitials) || r.inspected)
  const roomCheckCorrections = roomCheckRooms.filter(r=>r.checkIssueOpen)

  const maintenanceOpen = maintenance.filter(r=>r.status!=='complete')
  const urgentMaintenance = maintenanceOpen.filter(r=>r.priority==='urgent')
  const openInventory = inventory.filter(r=>!['received','cancelled'].includes(r.status))

  const blockedRooms = housekeeping.filter(r=>r.reservationStatus==='Blocked' || r.stripHold==='Hold')
  const unassignedService = housekeeping.filter(row=>
    !row.complete &&
    !splitStaff(row.assignedTo).length &&
    (Boolean(row.serviceType) || ['Checkout','Out/In'].includes(row.reservationStatus))
  )
  const pendingChecks = roomCheckRooms.filter(row=>
    row.complete &&
    !row.inspected &&
    !row.fohCheckInitials &&
    !row.checkIssueOpen
  )
  const arrivals = housekeeping.filter(row=>['Arrival','Out/In'].includes(row.reservationStatus))
  const arrivalProgressed = (row:HousekeepingRow) =>
    ['Ready','Occupied'].includes(String(row.roomCondition||''))
  const arrivalsNotReady = arrivals.filter(row=>!arrivalProgressed(row))
  const arrivalsReady = arrivals.filter(arrivalProgressed)
  const packageRooms = arrivals.filter(row=>row.packages.length>0)

  const pct = (done:number,total:number) => total>0 ? Math.round((done/total)*100) : 0
  const hkPercent = pct(hkComplete.length,housekeepingWorkload.length)
  const roomCheckPercent = pct(roomChecksPassed.length,roomCheckRooms.length)
  const breakfastPercent = pct(receivedMenus.length,breakfastScheduled.length)
  const arrivalPercent = pct(arrivalsReady.length,arrivals.length)

  const attentionCount =
    missingMenus.length +
    blockedRooms.length +
    unassignedService.length +
    roomCheckCorrections.length +
    pendingChecks.length +
    arrivalsNotReady.length +
    packageRooms.length +
    urgentMaintenance.length +
    openInventory.length

  const blockedIds = new Set(blockedRooms.map(r=>r.id))
  const arrivalIds = new Set(arrivals.map(r=>r.id))
  const completeIds = new Set(housekeeping.filter(r=>r.complete || ['Ready','Occupied'].includes(String(r.roomCondition||''))).map(r=>r.id))

  const hkGroups = [
    {
      title:'Blocked / Hold',
      rows:housekeeping.filter(r=>blockedIds.has(r.id))
    },
    {
      title:'Arrivals',
      rows:housekeeping.filter(r=>!blockedIds.has(r.id) && arrivalIds.has(r.id))
    },
    {
      title:'Needs service',
      rows:housekeeping.filter(r=>!blockedIds.has(r.id) && !arrivalIds.has(r.id) && !completeIds.has(r.id))
    },
    {
      title:'Complete / Ready',
      rows:housekeeping.filter(r=>!blockedIds.has(r.id) && !arrivalIds.has(r.id) && completeIds.has(r.id))
    }
  ].filter(group=>group.rows.length>0)

  const laundryNote = departmentNotes.find(n=>n.department==='laundry')?.note || ''
  const lobbyNote = departmentNotes.find(n=>n.department==='lobby')?.note || ''

  const metrics = [
    showHousekeeping ? {
      label:'Housekeeping',
      value:`${hkComplete.length}/${housekeepingWorkload.length}`,
      sub:`${housekeepingWorkload.filter(r=>r.reservationStatus==='Stayover').length} RF · ${housekeepingWorkload.filter(r=>r.checkIssueOpen).length} fixes`,
      icon:BedDouble,
      href:'/housekeeping',
      tone:hkComplete.length===housekeepingWorkload.length && housekeepingWorkload.length>0 ? 'good' : 'neutral'
    } : null,
    showBreakfast ? {
      label:`Breakfast · ${breakfastDate.slice(5)}`,
      value:String(breakfastScheduled.length),
      sub:`${missingMenus.length} missing · ${receivedMenus.length} received`,
      icon:UtensilsCrossed,
      href:'/front-desk',
      tone:missingMenus.length>0 ? 'warning' : 'good'
    } : null,
    showHousekeeping ? {
      label:'Room checks',
      value:`${roomChecksPassed.length}/${roomCheckRooms.length}`,
      sub:`${Math.max(0,roomCheckRooms.length-roomChecksPassed.length)} pending · ${roomCheckCorrections.length} correction${roomCheckCorrections.length===1?'':'s'}`,
      icon:ClipboardCheck,
      href:'/room-checks',
      tone:roomCheckCorrections.length>0 ? 'danger' : (roomCheckRooms.length>0 && roomChecksPassed.length===roomCheckRooms.length ? 'good' : 'neutral')
    } : null,
    showMaintenance ? {
      label:'Maintenance',
      value:String(maintenanceOpen.length),
      sub:`${urgentMaintenance.length} urgent`,
      icon:Wrench,
      href:'/maintenance',
      tone:urgentMaintenance.length>0 ? 'danger' : (maintenanceOpen.length>0 ? 'warning' : 'good')
    } : null
  ].filter(Boolean) as Array<{label:string;value:string;sub:string;icon:any;href:string;tone:'neutral'|'good'|'warning'|'danger'}>

  return (
    <div className="daily-dashboard">
      <div className="daily-dashboard-hero">
        <div>
          <div className="ops-kicker">The Hotel Saugatuck</div>
          <h1>Good day, {displayName}</h1>
          <p>{todayLabel}</p>
        </div>
        <div className="daily-dashboard-status">
          <span className="daily-live-dot" />
          Live operations
        </div>
      </div>


      <div className="daily-visual-overview">
        <section className="daily-snapshot-card">
          <div className="daily-snapshot-head">
            <div>
              <span>Today at a glance</span>
              <strong>Operations progress</strong>
            </div>
            <small>Live from today’s room and breakfast data</small>
          </div>

          <div className="daily-progress-stack">
            <div className="daily-progress-row">
              <div><span>Housekeeping</span><b>{hkComplete.length}/{housekeepingWorkload.length}</b></div>
              <div className="daily-progress-track"><i style={{width:`${hkPercent}%`}}/></div>
              <small>{hkPercent}% complete</small>
            </div>

            <div className="daily-progress-row">
              <div><span>Room checks</span><b>{roomChecksPassed.length}/{roomCheckRooms.length}</b></div>
              <div className="daily-progress-track"><i style={{width:`${roomCheckPercent}%`}}/></div>
              <small>{roomCheckPercent}% passed</small>
            </div>

            <div className="daily-progress-row">
              <div><span>Breakfast menus</span><b>{receivedMenus.length}/{breakfastScheduled.length}</b></div>
              <div className="daily-progress-track"><i style={{width:`${breakfastPercent}%`}}/></div>
              <small>{missingMenus.length} missing</small>
            </div>

            <div className="daily-progress-row">
              <div><span>Arrivals ready</span><b>{arrivalsReady.length}/{arrivals.length}</b></div>
              <div className="daily-progress-track"><i style={{width:`${arrivalPercent}%`}}/></div>
              <small>{arrivalsNotReady.length} not ready</small>
            </div>
          </div>
        </section>

        {metrics.length > 0 && (
          <div className="daily-metric-grid daily-metric-stack">
            {metrics.map(({label,value,sub,icon:Icon,href,tone})=>(
              <Link className={`daily-metric-card daily-link-card tone-${tone}`} href={href} key={label}>
                <span className="daily-metric-icon"><Icon size={17}/></span>
                <div>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>{sub}</small>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showReservationDaily && reservationDaily.some(item=>item.status!=='Vacant') && (() => {
        const active=reservationDaily.filter(item=>item.status!=='Vacant')
        const arrivals=active.filter(item=>item.status==='Arrival').length
        const stayovers=active.filter(item=>item.status==='Stayover').length
        const checkouts=active.filter(item=>item.status==='Checkout').length
        const outIn=active.filter(item=>item.status==='Out/In').length
        return <Link href="/reservations" className="daily-reservations-summary">
          <div className="daily-reservations-summary-head">
            <div>
              <span>Reservations</span>
              <strong>Today&apos;s stay snapshot</strong>
            </div>
            <small>Open reservations →</small>
          </div>
          <div className="daily-reservations-summary-grid">
            <div><CalendarDays size={15}/><span>Arrivals</span><strong>{arrivals}</strong></div>
            <div><Users size={15}/><span>Stayovers</span><strong>{stayovers}</strong></div>
            <div><BedDouble size={15}/><span>Checkouts</span><strong>{checkouts}</strong></div>
            <div><ClipboardList size={15}/><span>Out / In</span><strong>{outIn}</strong></div>
            <div className="total"><span>Occupied / changing</span><strong>{active.length}</strong></div>
          </div>
        </Link>
      })()}

      <section className={`daily-panel daily-attention-panel ${attentionCount===0?'all-clear':''}`}>
        <div className="daily-panel-head">
          <div>{attentionCount===0?<CheckCircle2 size={17}/>:<AlertTriangle size={17}/>}<strong>Needs attention</strong></div>
          <span>{attentionCount===0?'All clear':`${attentionCount} item${attentionCount===1?'':'s'}`}</span>
        </div>
        {attentionCount===0 ? (
          <div className="daily-attention-clear">No operational issues currently need attention.</div>
        ) : (
          <div className="daily-attention-groups">
            {missingMenus.length>0 && (
              <Link href="/front-desk" className="daily-attention-item tone-warning">
                <span>{missingMenus.length}</span>
                <div><strong>Missing breakfast menus</strong><small>{missingMenus.map(r=>r.roomName).join(', ')}</small></div>
              </Link>
            )}
            {blockedRooms.length>0 && (
              <Link href="/housekeeping" className="daily-attention-item tone-danger">
                <span>{blockedRooms.length}</span>
                <div><strong>Blocked / hold rooms</strong><small>{blockedRooms.map(r=>r.roomName).join(', ')}</small></div>
              </Link>
            )}
            {unassignedService.length>0 && (
              <Link href="/room-board" className="daily-attention-item tone-warning">
                <span>{unassignedService.length}</span>
                <div><strong>Service rooms unassigned</strong><small>{unassignedService.map(r=>r.roomName).join(', ')}</small></div>
              </Link>
            )}
            {roomCheckCorrections.length>0 && (
              <Link href="/room-checks" className="daily-attention-item tone-danger">
                <span>{roomCheckCorrections.length}</span>
                <div><strong>Rooms need correction</strong><small>{roomCheckCorrections.map(r=>r.roomName).join(', ')}</small></div>
              </Link>
            )}
            {pendingChecks.length>0 && (
              <Link href="/room-checks" className="daily-attention-item tone-info">
                <span>{pendingChecks.length}</span>
                <div><strong>Completed rooms awaiting FOH check</strong><small>{pendingChecks.map(r=>r.roomName).join(', ')}</small></div>
              </Link>
            )}
            {arrivalsNotReady.length>0 && (
              <Link href="/housekeeping" className="daily-attention-item tone-warning">
                <span>{arrivalsNotReady.length}</span>
                <div><strong>Arrival rooms not marked Ready</strong><small>{arrivalsNotReady.map(r=>r.roomName).join(', ')}</small></div>
              </Link>
            )}
            {packageRooms.length>0 && (
              <Link href="/room-board" className="daily-attention-item tone-info">
                <span>{packageRooms.length}</span>
                <div><strong>Arrival packages due today</strong><small>{packageRooms.map(r=>`${r.roomName}: ${r.packages.join(', ')}`).join(' · ')}</small></div>
              </Link>
            )}
            {urgentMaintenance.length>0 && (
              <Link href="/maintenance" className="daily-attention-item tone-danger">
                <span>{urgentMaintenance.length}</span>
                <div><strong>Urgent maintenance</strong><small>{urgentMaintenance.map(r=>r.location).join(', ')}</small></div>
              </Link>
            )}
            {openInventory.length>0 && (
              <Link href={openInventory[0]?inventoryHref(openInventory[0].department):'/dashboard'} className="daily-attention-item tone-info">
                <span>{openInventory.length}</span>
                <div><strong>Open inventory requests</strong><small>{openInventory.map(r=>r.itemName).slice(0,5).join(', ')}</small></div>
              </Link>
            )}
          </div>
        )}
      </section>

      {showHousekeeping && arrivals.length>0 && (
        <section className="daily-panel">
          <div className="daily-panel-head">
            <div><BedDouble size={17}/><strong>Arrivals</strong></div>
            <span>{arrivals.length} room{arrivals.length===1?'':'s'}</span>
          </div>
          <div className="daily-arrival-list">
            {arrivals.map(row=>(
              <Link href={`/housekeeping#room-${encodeURIComponent(row.roomId)}`} className="daily-arrival-row" key={row.id}>
                <div>
                  <strong>{row.roomName}</strong>
                  <div className="daily-room-pills">
                    <span className={`daily-chip ${arrivalProgressed(row)?'done':'warning'}`}>{row.roomCondition || 'Not ready'}</span>
                    {splitStaff(row.assignedTo).map(name=><span className="daily-chip staff" style={staffStyle(name)} key={name}>{name}</span>)}
                    {row.fohCheckInitials && <span className="daily-chip done">FOH ✓ {row.fohCheckInitials}</span>}
                    {!row.fohCheckInitials && <span className="daily-chip warning">Room check pending</span>}
                    {row.packages.map(pkg=><span className="daily-chip package" key={pkg}>{pkg}</span>)}
                    {row.breakfastSkipped && <span className="daily-chip breakfast-skip">Breakfast skipped</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {showHousekeeping && (
        <section className="daily-panel daily-housekeeping-panel">
          <div className="daily-panel-head">
            <div><BedDouble size={17}/><strong>Housekeeping today</strong></div>
            <span>{housekeeping.length} rooms</span>
          </div>
          {housekeeping.length===0 ? (
            <div className="daily-empty">No housekeeping rooms assigned.</div>
          ) : (
            <div className="daily-hk-groups">
              {hkGroups.map((group,index)=>(
                <details className="daily-hk-group" key={group.title} open={index<3}>
                  <summary><strong>{group.title}</strong><span>{group.rows.length}</span></summary>
                  <div>
                    {group.rows.map(row=><RoomSummary row={row} key={row.id}/>)}
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="daily-dashboard-grid">
        {showBreakfast && (
          <section className="daily-panel">
            <Link href="/front-desk" className="daily-panel-head daily-panel-link">
              <div><UtensilsCrossed size={17}/><strong>Breakfast · {breakfastDate}</strong></div>
              <span>{breakfastScheduled.length} expected</span>
            </Link>
            <div className="daily-breakfast-summary">
              <span><b>{receivedMenus.length}</b> received</span>
              <span><b>{missingMenus.length}</b> missing</span>
            </div>
            <div className="daily-list">
              {missingMenus.length===0 && <div className="daily-empty">No breakfast menus currently missing.</div>}
              {missingMenus.map(row=>(
                <Link href={row.taggedOnly?'/front-desk':`/front-desk#booking-${encodeURIComponent(row.id)}`} className="daily-list-row daily-list-link" key={row.id}>
                  <div className="daily-row-time">{formatTime(row.timeSlot)}</div>
                  <div className="daily-row-main">
                    <strong>{row.roomName}</strong>
                    <span>{row.lastName || 'Menu missing'}</span>
                    {row.note && <small>{row.note}</small>}
                  </div>
                  <span className="daily-state warning">Missing</span>
                </Link>
              ))}
              {skippedBreakfast.map(row=>(
                <Link href={row.taggedOnly?'/front-desk':`/front-desk#booking-${encodeURIComponent(row.id)}`} className="daily-list-row daily-list-link" key={`skip-${row.id}`}>
                  <div className="daily-row-time">—</div>
                  <div className="daily-row-main">
                    <strong>{row.roomName}</strong>
                    <span>Breakfast skipped</span>
                  </div>
                  <span className="daily-state neutral">Skipped</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="daily-panel">
          <div className="daily-panel-head">
            <div><Users size={17}/><strong>Today&apos;s staff</strong></div>
            <span>{todayStaff.length} on site</span>
          </div>
          <div className="daily-staff-list">
            {todayStaff.length
              ? todayStaff.map(person=>{
                  const roomCount=housekeeping.filter(r=>splitStaff(r.assignedTo).includes(person.name)).length
                  return <span className="daily-staff-person" style={staffStyle(person.name)} key={person.id}>
                    <strong>{person.name}</strong>
                    <small>
                      {person.roleLabel || 'On site'}
                      {person.shiftStart && person.shiftEnd ? ` · ${formatTime(person.shiftStart)}–${formatTime(person.shiftEnd)}` : ''}
                      {roomCount ? ` · ${roomCount} room${roomCount===1?'':'s'}` : ''}
                    </small>
                  </span>
                })
              : <div className="daily-empty">No on-site staff schedule entered for today.</div>}
          </div>
        </section>

        {showMaintenance && (
          <section className="daily-panel">
            <Link href="/maintenance" className="daily-panel-head daily-panel-link">
              <div><Wrench size={17}/><strong>Maintenance</strong></div>
              <span>{maintenanceOpen.length} open</span>
            </Link>
            <div className="daily-list">
              {maintenanceOpen.length===0 && <div className="daily-empty">No open maintenance items.</div>}
              {maintenanceOpen.slice(0,10).map(row=>(
                <Link href={`/maintenance#maintenance-${encodeURIComponent(row.id)}`} className="daily-list-row daily-list-link" key={row.id}>
                  <div className="daily-row-main"><strong>{row.location}</strong><span>{row.title}</span></div>
                  <span className={`daily-state ${row.priority==='urgent'?'danger':''}`}>{titleCase(row.priority)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {showInventory && (
          <section className="daily-panel">
            <div className="daily-panel-head">
              <div><Package size={17}/><strong>Inventory / ordering</strong></div>
              <span>{openInventory.length} open</span>
            </div>
            <div className="daily-list">
              {openInventory.length===0 && <div className="daily-empty">No outstanding inventory requests.</div>}
              {openInventory.slice(0,12).map(row=>(
                <Link href={inventoryHref(row.department)} className="daily-list-row daily-list-link" key={row.id}>
                  <div className="daily-row-main">
                    <strong>{row.itemName}</strong>
                    <span>{titleCase(row.department)}{row.quantity?` · ${row.quantity}`:''}</span>
                    {row.note && <small>{row.note}</small>}
                  </div>
                  <span className="daily-state">{titleCase(row.status)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {(showLaundry || showLobby) && (
          <section className="daily-panel">
            <div className="daily-panel-head">
              <div><ClipboardList size={17}/><strong>Department handoff</strong></div>
              <span>Today</span>
            </div>
            <div className="daily-notes-grid">
              {showLaundry && (
                <Link href="/laundry" className="daily-note-block daily-note-link">
                  <strong>Laundry</strong><p>{laundryNote || 'No laundry shift note entered yet.'}</p>
                </Link>
              )}
              {showLobby && (
                <Link href="/lobby" className="daily-note-block daily-note-link">
                  <strong>Lobby</strong><p>{lobbyNote || 'No lobby shift note entered yet.'}</p>
                </Link>
              )}
            </div>
          </section>
        )}
      </div>

      {packageRooms.length>0 && (
        <div className="daily-footnote">Packages due on arrival today: <strong>{packageRooms.map(r=>r.roomName).join(', ')}</strong></div>
      )}
    </div>
  )
}
