import Link from 'next/link'
import { AlertTriangle, ArrowUpRight, BedDouble, CalendarClock, ClipboardCheck, ClipboardList, Clock3, ShieldCheck, Sparkles, Users, Wrench } from 'lucide-react'

type Room={roomId:string;roomName:string;reservationStatus:string;serviceType:string;assignedTo:string;complete:boolean;stripHold:string;roomCondition:string;inspected:boolean;fohCheckInitials:string;haCheckInitials:string;checkIssueOpen:boolean;notes:string;completedAt?:string;inspectedAt?:string;fohSignedAt?:string;haSignedAt?:string;housekeeperAttestedAt?:string}
type Work={id:string;location:string;title:string;priority:string;status:string}
type Shift={id:string;name:string;roleLabel:string;shiftStart:string;shiftEnd:string}
type NextRoom={roomId:string;roomName:string;reservationStatus:string;serviceType:string;roomCondition:string;stripHold:string;assignedTo:string}
type Props={today:string;tomorrow:string;rooms:Room[];tomorrowRooms:NextRoom[];maintenance:Work[];staff:Shift[];tomorrowStaff:Shift[];showHousekeeping:boolean;showMaintenance:boolean;showStaff:boolean;handoffNotes:{department:string;note:string}[]}
const assigned=(s:string)=>String(s||'').split(',').map(x=>x.trim()).filter(Boolean)
const hold=(r:{reservationStatus:string;stripHold:string})=>r.reservationStatus==='Blocked'||String(r.stripHold).toLowerCase().includes('hold')
const clean=(r:Room)=>['Checkout','Out/In'].includes(r.reservationStatus)||String(r.serviceType).toUpperCase().startsWith('OUT')||(r.reservationStatus==='Stayover'&&String(r.serviceType).toUpperCase()==='RF')
const ready=(r:Room)=>['Ready','Occupied','Vacant (Clean)'].includes(r.roomCondition)||Boolean(r.fohCheckInitials)
const roomLink=(r:Room)=>'/housekeeping#room-'+encodeURIComponent(r.roomId)
export default function ManagerCommandCenter({today,tomorrow,rooms,tomorrowRooms,maintenance,staff,tomorrowStaff,showHousekeeping,showMaintenance,showStaff,handoffNotes}:Props){
  const service=showHousekeeping?rooms.filter(r=>!hold(r)&&clean(r)):[]
  const unassigned=service.filter(r=>!r.complete&&!assigned(r.assignedTo).length)
  const corrections=showHousekeeping?rooms.filter(r=>!hold(r)&&r.checkIssueOpen):[]
  const arrivals=showHousekeeping?rooms.filter(r=>!hold(r)&&['Arrival','Out/In'].includes(r.reservationStatus)):[]
  const arrivalIssues=arrivals.filter(r=>!ready(r)||r.checkIssueOpen)
  const waitingChecks=showHousekeeping?rooms.filter(r=>!hold(r)&&r.reservationStatus!=='Stayover'&&r.serviceType!=='RF'&&r.complete&&!r.inspected&&!r.fohCheckInitials&&!r.checkIssueOpen):[]
  const holds=showHousekeeping?rooms.filter(hold):[]
  const urgent=showMaintenance?maintenance.filter(r=>r.priority==='urgent'&&r.status!=='complete'):[]
  const outstanding=unassigned.length+corrections.length+arrivalIssues.length+waitingChecks.length+urgent.length
  const tomorrowArrivals=tomorrowRooms.filter(r=>['Arrival','Out/In'].includes(r.reservationStatus)&&!hold(r))
  const tomorrowReview=tomorrowArrivals.filter(r=>!['Ready','Occupied','Vacant (Clean)'].includes(r.roomCondition))
  const tomorrowBlocked=tomorrowRooms.filter(hold)
  const tomorrowUnassigned=tomorrowRooms.filter(r=>!hold(r)&&['Checkout','Out/In'].includes(r.reservationStatus)&&!assigned(r.assignedTo).length)
  const events=rooms.flatMap(r=>([['completedAt','Clean completed'],['housekeeperAttestedAt','Housekeeper self-check'],['inspectedAt','Inspection completed'],['haSignedAt','HA final check'],['fohSignedAt','FOH approved']] as const).flatMap(([key,label])=>r[key]?[{id:r.roomId+'-'+key,roomName:r.roomName,label,at:String(r[key]),roomId:r.roomId}]:[])).filter(e=>!Number.isNaN(Date.parse(e.at))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,9)
  const handoff=[...corrections.map(r=>({label:r.roomName+' · correction still open',href:roomLink(r)})),...arrivalIssues.map(r=>({label:r.roomName+' · arrival readiness',href:roomLink(r)})),...urgent.map(r=>({label:r.location+' · '+r.title,href:'/maintenance'})),...handoffNotes.filter(n=>n.note.trim()).map(n=>({label:n.department+': '+n.note,href:n.department==='laundry'?'/laundry':'/lobby'}))]
  const groups=[
    {name:'Arrival not ready',rows:arrivalIssues,href:'/housekeeping',tone:'warning',hint:'Review room condition'},
    {name:'Corrections open',rows:corrections,href:'/room-checks',tone:'danger',hint:'Resolve and recheck'},
    {name:'Unassigned cleans',rows:unassigned,href:'/housekeeping',tone:'warning',hint:'Assign a housekeeper'},
    {name:'Room checks pending',rows:waitingChecks,href:'/room-checks',tone:'info',hint:'Complete inspection'},
    {name:'Urgent maintenance',rows:urgent,href:'/maintenance',tone:'danger',hint:'Review open work orders'}
  ].filter(g=>g.rows.length)
  const workload=staff.map(s=>({...s,count:service.filter(r=>assigned(r.assignedTo).some(n=>n.toLowerCase()===s.name.toLowerCase())).length}))
  return <section className="ops-command" aria-label="Operations command center">
    <div className="ops-command-hero">
      <div><span className="ops-command-eyebrow"><Sparkles size={14}/> MANAGEMENT WORKSPACE</span><h2>Operations command</h2><p>Decisions first. Details when you need them.</p></div>
      <div className="ops-command-live"><span className="daily-live-dot"/> {outstanding?'Attention needed':'On track'} · {today}</div>
    </div>
    <div className="ops-command-kpis">
      <a href="#ops-command-attention" className="ops-command-kpi"><span>Needs attention</span><strong>{outstanding}</strong><small>{groups.length} categories</small></a>
      <Link href="/housekeeping" className="ops-command-kpi"><span>Arrivals ready</span><strong>{arrivals.filter(ready).length}<em> / {arrivals.length}</em></strong><small>{arrivalIssues.length} require review</small></Link>
      <Link href="/room-checks" className="ops-command-kpi"><span>Pending room checks</span><strong>{waitingChecks.length}</strong><small>{corrections.length} corrections open</small></Link>
      <Link href="/maintenance" className="ops-command-kpi"><span>Urgent repairs</span><strong>{urgent.length}</strong><small>{maintenance.filter(r=>r.status!=='complete').length} total open</small></Link>
    </div>
    <div className="ops-command-columns">
      <section className="ops-command-card ops-command-attention" id="ops-command-attention">
        <div className="ops-command-card-heading"><div><span>YOUR PRIORITIES</span><h3><AlertTriangle size={19}/> Needs your attention</h3></div><span className="ops-command-count">{outstanding}</span></div>
        {!groups.length?<div className="ops-command-clear"><ShieldCheck size={26}/><strong>All clear</strong><span>No outstanding exceptions from the available operational data.</span></div>:<div className="ops-command-actions">{groups.map(group=><div className={'ops-command-action '+group.tone} key={group.name}><div><strong>{group.name}</strong><small>{group.rows.slice(0,4).map((r:any)=>r.roomName||r.location).join(' · ')}{group.rows.length>4?' +'+(group.rows.length-4)+' more':''}</small></div><Link href={group.href} aria-label={group.hint+' for '+group.name}><span>{group.rows.length}</span><ArrowUpRight size={17}/></Link></div>)}</div>}
      </section>
      <section className="ops-command-card ops-command-tomorrow">
        <div className="ops-command-card-heading"><div><span>LOOKING AHEAD</span><h3><CalendarClock size={19}/> Tomorrow readiness</h3></div><small>{tomorrow}</small></div>
        <div className="ops-command-tomorrow-grid"><div><strong>{tomorrowArrivals.length}</strong><span>Arriving</span></div><div><strong>{tomorrowReview.length}</strong><span>Review condition</span></div><div><strong>{tomorrowUnassigned.length}</strong><span>Assign service</span></div><div><strong>{tomorrowBlocked.length}</strong><span>Blocked / held</span></div></div>
        <p className="ops-command-helper">{tomorrowRooms.length===0?'Tomorrow’s room board has no entries yet. Counts do not mean rooms are confirmed ready.':'Tomorrow’s assignments and room conditions are preliminary; review again after today’s turnover.'}</p>
        <Link className="ops-command-actionlink" href="/housekeeping">Open room workspace <ArrowUpRight size={16}/></Link>
      </section>
      <section className="ops-command-card ops-command-staff">
        <div className="ops-command-card-heading"><div><span>TEAM COVERAGE</span><h3><Users size={19}/> Staff workload</h3></div><small>{staff.length} scheduled</small></div>
        {!showStaff||!workload.length?<p className="ops-command-helper">No scheduled on-site staff available in today's data.</p>:<div className="ops-command-team">{workload.map(s=><div className="ops-command-person" key={s.id}><div><strong>{s.name}</strong><small>{s.roleLabel||'On site'}</small></div><span>{s.count} room{s.count===1?'':'s'}</span></div>)}</div>}
        <p className="ops-command-helper">Assigned service rooms only; review before adjusting workload.</p>
        <Link className="ops-command-actionlink" href="/staff">Review staff <ArrowUpRight size={16}/></Link>
      </section>
      <section className="ops-command-card ops-command-timeline">
        <div className="ops-command-card-heading"><div><span>ACTIVITY TRAIL</span><h3><Clock3 size={19}/> Recent room activity</h3></div><small>{events.length} recent events</small></div>
        {!events.length?<p className="ops-command-helper">No recorded room completion or inspection events for today.</p>:<div className="ops-command-events">{events.map(e=><Link href={'/housekeeping#room-'+encodeURIComponent(e.roomId)} key={e.id}><time dateTime={e.at}>{new Intl.DateTimeFormat('en-US',{timeZone:'America/Detroit',hour:'numeric',minute:'2-digit'}).format(new Date(e.at))}</time><div><strong>{e.roomName}</strong><small>{e.label}</small></div><ArrowUpRight size={15}/></Link>)}</div>}
      </section>
      <section className="ops-command-card ops-command-handoff">
        <div className="ops-command-card-heading"><div><span>NOTHING LOST BETWEEN SHIFTS</span><h3><ClipboardList size={19}/> Shift handoff</h3></div><small>{handoff.length} open items</small></div>
        {!handoff.length?<div className="ops-command-clear compact"><ClipboardCheck size={24}/><strong>No open handoff items</strong><span>Current room issues, urgent repairs and department notes are clear.</span></div>:<div className="ops-command-handoff-items">{handoff.slice(0,6).map((item,i)=><Link key={i} href={item.href}><Clock3 size={15}/><span>{item.label}</span><ArrowUpRight size={15}/></Link>)}</div>}
        <div className="ops-command-handoff-foot">Tomorrow: {tomorrowStaff.length} scheduled on site · {tomorrowBlocked.length} blocked/held rooms</div>
      </section>
    </div>
  </section>
}
