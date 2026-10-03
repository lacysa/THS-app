import Link from 'next/link'
import {
  BedDouble,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Package,
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
  note?:string
}

type HousekeepingRow = {
  id:string
  roomName:string
  reservationStatus:string
  serviceType:string
  assignedTo:string
  complete:boolean
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
  departmentNotes
}:Props) {
  const breakfastScheduled = breakfast.filter(r=>r.status==='scheduled')
  const missingMenus = breakfastScheduled.filter(r=>!r.menuSubmitted)
  const hkComplete = housekeeping.filter(r=>r.complete)
  const maintenanceOpen = maintenance.filter(r=>r.status!=='complete')
  const urgentMaintenance = maintenanceOpen.filter(r=>r.priority==='urgent')
  const openInventory = inventory.filter(r=>!['received','cancelled'].includes(r.status))
  const laundryNote = departmentNotes.find(n=>n.department==='laundry')?.note || ''
  const lobbyNote = departmentNotes.find(n=>n.department==='lobby')?.note || ''

  const metrics = [
    showHousekeeping ? {
      label:'Housekeeping',
      value:`${hkComplete.length}/${housekeeping.length}`,
      sub:'rooms complete',
      icon:BedDouble,
      href:'/housekeeping'
    } : null,
    showBreakfast ? {
      label:'Breakfast',
      value:String(breakfastScheduled.length),
      sub:`${missingMenus.length} missing menu${missingMenus.length===1?'':'s'}`,
      icon:UtensilsCrossed,
      href:'/front-desk'
    } : null,
    showMaintenance ? {
      label:'Maintenance',
      value:String(maintenanceOpen.length),
      sub:`${urgentMaintenance.length} urgent`,
      icon:Wrench,
      href:'/maintenance'
    } : null,
    showInventory ? {
      label:'Inventory',
      value:String(openInventory.length),
      sub:'open order requests',
      icon:Package,
      href:openInventory[0] ? inventoryHref(openInventory[0].department) : '/dashboard'
    } : null
  ].filter(Boolean) as Array<{label:string;value:string;sub:string;icon:any;href:string}>

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

      {metrics.length > 0 && (
        <div className="daily-metric-grid">
          {metrics.map(({label,value,sub,icon:Icon,href})=>(
            <Link className="daily-metric-card daily-link-card" href={href} key={label}>
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

      <div className="daily-dashboard-grid">
        {showHousekeeping && (
          <section className="daily-panel">
            <Link href="/housekeeping" className="daily-panel-head daily-panel-link">
              <div><BedDouble size={17}/><strong>Housekeeping today</strong></div>
              <span>{housekeeping.length} assigned</span>
            </Link>
            <div className="daily-list">
              {housekeeping.length===0 && <div className="daily-empty">No housekeeping rooms assigned.</div>}
              {housekeeping.map(row=>(
                <Link href="/housekeeping" className="daily-list-row daily-list-link" key={row.id}>
                  <div className="daily-row-main">
                    <strong>{row.roomName}</strong>
                    <span>{[row.reservationStatus,row.serviceType,row.assignedTo].filter(Boolean).join(' · ') || 'Assigned clean'}</span>
                    {row.notes && <small>{row.notes}</small>}
                  </div>
                  <span className={row.complete?'daily-state done':'daily-state'}>{row.complete?'Complete':'Open'}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {showBreakfast && (
          <section className="daily-panel">
            <Link href="/front-desk" className="daily-panel-head daily-panel-link">
              <div><UtensilsCrossed size={17}/><strong>Breakfast</strong></div>
              <span>Service {breakfastDate}</span>
            </Link>
            <div className="daily-list">
              {breakfastScheduled.length===0 && <div className="daily-empty">No breakfast rooms scheduled.</div>}
              {breakfastScheduled.map(row=>(
                <Link href="/front-desk" className="daily-list-row daily-list-link" key={row.id}>
                  <div className="daily-row-time">{formatTime(row.timeSlot)}</div>
                  <div className="daily-row-main">
                    <strong>{row.roomName}</strong>
                    <span>{row.lastName || 'Guest'}</span>
                    {row.note && <small>{row.note}</small>}
                  </div>
                  <span className={row.menuSubmitted?'daily-state done':'daily-state warning'}>
                    {row.menuSubmitted?'Menu received':'Menu needed'}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {showMaintenance && (
          <section className="daily-panel">
            <Link href="/maintenance" className="daily-panel-head daily-panel-link">
              <div><Wrench size={17}/><strong>Maintenance</strong></div>
              <span>{maintenanceOpen.length} open</span>
            </Link>
            <div className="daily-list">
              {maintenanceOpen.length===0 && <div className="daily-empty">No open maintenance items.</div>}
              {maintenanceOpen.slice(0,10).map(row=>(
                <Link href="/maintenance" className="daily-list-row daily-list-link" key={row.id}>
                  <div className="daily-row-main">
                    <strong>{row.location}</strong>
                    <span>{row.title}</span>
                  </div>
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
                  <strong>Laundry</strong>
                  <p>{laundryNote || 'No laundry shift note entered yet.'}</p>
                </Link>
              )}
              {showLobby && (
                <Link href="/lobby" className="daily-note-block daily-note-link">
                  <strong>Lobby</strong>
                  <p>{lobbyNote || 'No lobby shift note entered yet.'}</p>
                </Link>
              )}
            </div>
          </section>
        )}

        {(missingMenus.length>0 || urgentMaintenance.length>0 || openInventory.length>0) && (
          <section className="daily-panel daily-attention-panel">
            <div className="daily-panel-head">
              <div><BellRing size={17}/><strong>Needs attention</strong></div>
            </div>
            <div className="daily-attention-list">
              {missingMenus.length>0 && <div><span>{missingMenus.length}</span> breakfast menu{missingMenus.length===1?' is':'s are'} still missing.</div>}
              {urgentMaintenance.length>0 && <div><span>{urgentMaintenance.length}</span> urgent maintenance item{urgentMaintenance.length===1?'':'s'} open.</div>}
              {openInventory.length>0 && <div><span>{openInventory.length}</span> inventory/order request{openInventory.length===1?'':'s'} open.</div>}
            </div>
          </section>
        )}

        {metrics.length>0 && (
          <section className="daily-panel daily-all-clear">
            <CheckCircle2 size={18}/>
            <div>
              <strong>Daily overview</strong>
              <span>Detailed work stays inside each module. This dashboard is the quick operational snapshot.</span>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
