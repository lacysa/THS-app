'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileText, Printer, RefreshCw, Save } from 'lucide-react'

type AutoData = {
  breakfastDate:string
  housekeeping:any[]
  breakfast:any[]
  maintenance:any[]
  roomNotes:any[]
  todayStaff:any[]
  tomorrowStaff:any[]
  tomorrowHousekeeping:any[]
  tomorrowDessertRooms:any[]
}

type Report = {
  id:string
  report_date:string
  shift:string
  status:'draft'|'finalized'
  guest_notes:string
  staff_notes:string
  supplies_notes:string
  tomorrow_notes:string
  general_notes:string
  management_notes:string
  finalized_at:string|null
  note_authors?:{
    guest?:{id:string;name:string;initials:string}|null
    staff?:{id:string;name:string;initials:string}|null
    supplies?:{id:string;name:string;initials:string}|null
    tomorrow?:{id:string;name:string;initials:string}|null
    general?:{id:string;name:string;initials:string}|null
    management?:{id:string;name:string;initials:string}|null
  }
}

function todayDetroit() {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
}

function initials(value:string) {
  const parts=String(value||'').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  if (parts.length===1) return parts[0].slice(0,1).toUpperCase()
  return `${parts[0][0]}${parts[parts.length-1][0]}`.toUpperCase()
}

export default function ShiftReportBoard() {
  const [date,setDate] = useState(todayDetroit())
  const [shift,setShift] = useState('Daily')
  const [tab,setTab] = useState<'report'|'room-notes'|'handoff'|'management'>('report')
  const [report,setReport] = useState<Report|null>(null)
  const [auto,setAuto] = useState<AutoData>({breakfastDate:'',housekeeping:[],breakfast:[],maintenance:[],roomNotes:[],todayStaff:[],tomorrowStaff:[],tomorrowHousekeeping:[],tomorrowDessertRooms:[]})
  const [canManage,setCanManage] = useState(false)
  const [currentStaffName,setCurrentStaffName] = useState('Staff')
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [message,setMessage] = useState('')
  const [rooms,setRooms] = useState<any[]>([])
  const [roomNotes,setRoomNotes] = useState<any[]>([])
  const [noteRoomId,setNoteRoomId] = useState('')
  const [noteType,setNoteType] = useState<'daily'|'persistent'>('daily')
  const [noteText,setNoteText] = useState('')
  const [includeNote,setIncludeNote] = useState(true)
  const [draft,setDraft] = useState({guestNotes:'',staffNotes:'',suppliesNotes:'',tomorrowNotes:'',generalNotes:'',managementNotes:''})

  async function load() {
    setLoading(true); setMessage('')
    try {
      const [reportRes,notesRes] = await Promise.all([
        fetch(`/api/shift-reports?date=${encodeURIComponent(date)}&shift=${encodeURIComponent(shift)}`,{cache:'no-store'}),
        fetch(`/api/room-notes?date=${encodeURIComponent(date)}`,{cache:'no-store'})
      ])
      const rd = await reportRes.json().catch(()=>({}))
      const nd = await notesRes.json().catch(()=>({}))
      if (!reportRes.ok) throw new Error(rd.error || 'Could not load shift report.')
      if (!notesRes.ok) throw new Error(nd.error || 'Could not load room notes.')
      setReport(rd.report || null)
      setAuto(rd.auto || {breakfastDate:'',housekeeping:[],breakfast:[],maintenance:[],roomNotes:[],todayStaff:[],tomorrowStaff:[],tomorrowHousekeeping:[],tomorrowDessertRooms:[]})
      setCanManage(Boolean(rd.access?.canManageReport))
      setCurrentStaffName(rd.access?.currentStaffName || 'Staff')
      const r = rd.report || {}
      setDraft({
        guestNotes:r.guest_notes || '', staffNotes:r.staff_notes || '', suppliesNotes:r.supplies_notes || '',
        tomorrowNotes:r.tomorrow_notes || '', generalNotes:r.general_notes || '', managementNotes:r.management_notes || ''
      })
      setRooms(nd.rooms || [])
      setRoomNotes(nd.notes || [])
    } catch(e:any) { setMessage(e?.message || 'Could not load shift report.') }
    finally { setLoading(false) }
  }

  useEffect(()=>{ void load() },[date,shift])

  const locked = report?.status === 'finalized'

  async function saveReport(action:'save'|'finalize'|'reopen'='save') {
    if (!canManage) return
    setSaving(true); setMessage(action==='finalize'?'Finalizing…':'Saving…')
    try {
      const r = await fetch('/api/shift-reports',{
        method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({reportDate:date,shift,action,...draft})
      })
      const d = await r.json().catch(()=>({}))
      if (!r.ok) throw new Error(d.error || 'Could not save shift report.')
      setMessage(action==='finalize'?'Shift report finalized.':'Shift report saved.')
      await load()
    } catch(e:any) { setMessage(e?.message || 'Could not save shift report.') }
    finally { setSaving(false) }
  }

  async function addRoomNote() {
    if (!noteRoomId || !noteText.trim()) { setMessage('Choose a room and enter a note.'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/room-notes',{
        method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({roomId:noteRoomId,serviceDate:date,note:noteText,noteType,includeInShiftReport:includeNote})
      })
      const d = await r.json().catch(()=>({}))
      if (!r.ok) throw new Error(d.error || 'Could not add room note.')
      setNoteText(''); setMessage('Room note added.'); await load()
    } catch(e:any) { setMessage(e?.message || 'Could not add room note.') }
    finally { setSaving(false) }
  }

  async function resolveRoomNote(id:string, resolved:boolean) {
    const r = await fetch('/api/room-notes',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id,resolved})})
    if (r.ok) await load()
  }

  const summary = useMemo(()=>{
    const hk = auto.housekeeping || []
    const breakfast = auto.breakfast || []
    const maintenance = auto.maintenance || []
    const tomorrowHk = auto.tomorrowHousekeeping || []

    const needsService = (row:any) => {
      const status=String(row.reservationStatus||'').trim().toLowerCase()
      const service=String(row.serviceType||'').trim().toUpperCase()
      if(status==='checkout' || status==='out/in') return true
      if(status==='stayover' && service==='RF') return true
      if((status==='arrival' || status==='vacant' || status==='blocked') && row.checkIssueOpen) return true
      return false
    }

    const tomorrowCleans = tomorrowHk.filter((row:any)=>{
      const status=String(row.reservationStatus||'').trim().toLowerCase()
      const service=String(row.serviceType||'').trim().toUpperCase()
      return status==='checkout' || status==='out/in' || (status==='stayover' && service==='RF')
    })

    const tomorrowRefreshes = tomorrowHk.filter((row:any)=>String(row.serviceType||'').trim().toUpperCase()==='RF')
    const scheduledBreakfast = breakfast.filter((r:any)=>r.status==='scheduled'&&!r.breakfastSkipped)
    const menusReceived = scheduledBreakfast.filter((r:any)=>r.menuSubmitted).length
    const menusMissing = scheduledBreakfast.filter((r:any)=>!r.menuSubmitted)

    return {
      completed:hk.filter((r:any)=>needsService(r)&&r.complete).length,
      roomCleans:hk.filter(needsService).length,
      refreshes:hk.filter((r:any)=>String(r.serviceType||'').toUpperCase()==='RF').length,
      holds:hk.filter((r:any)=>String(r.stripHold||'').toLowerCase().includes('hold')).length,
      menusReceived,
      menusMissing,
      breakfastExpected:scheduledBreakfast.length,
      dessertsTonight:(auto.tomorrowDessertRooms || []).length,
      dessertRooms:auto.tomorrowDessertRooms || [],
      todayStaff:auto.todayStaff || [],
      tomorrowStaff:auto.tomorrowStaff || [],
      tomorrowCleans:tomorrowCleans.length,
      tomorrowRefreshes:tomorrowRefreshes.length,
      maintenanceOpen:maintenance.filter((r:any)=>r.status!=='complete'),
      maintenanceComplete:maintenance.filter((r:any)=>r.status==='complete')
    }
  },[auto])

  const handoffRoomNotes = roomNotes.filter(n=>!n.resolved)
  const handoffMaintenance = summary.maintenanceOpen

  const roomHandoff = useMemo(()=>{
    const byRoom = new Map<string,{roomId:string;roomName:string;details:string[]}>()
    const normalConditions = new Set(['','ready','vacant (clean)','occupied'])

    for (const row of (auto.housekeeping || [])) {
      const roomId=String(row.roomId||'')
      const roomName=String(row.roomName||'Room')
      const details:string[]=[]
      const reservation=String(row.reservationStatus||'').trim()
      const condition=String(row.roomCondition||'').trim()
      const next=String(row.nextShiftCondition||'').trim()
      const stripHold=String(row.stripHold||'').trim()
      const note=String(row.notes||'').trim()

      if (reservation.toLowerCase()==='blocked') details.push('Blocked')
      if (stripHold) details.push(stripHold)
      if (condition && !normalConditions.has(condition.toLowerCase())) details.push(condition)
      if (next && !normalConditions.has(next.toLowerCase())) details.push(`Next: ${next}`)
      if (note) details.push(note)

      if (details.length) byRoom.set(roomId,{roomId,roomName,details:[...new Set(details)]})
    }

    for (const note of handoffRoomNotes) {
      const roomId=String(note.room_id||note.roomId||'')
      const roomName=String(note.roomName||'Room')
      const text=String(note.note||'').trim()
      if (!text) continue
      const current=byRoom.get(roomId)||{roomId,roomName,details:[]}
      if (!current.details.includes(text)) current.details.push(text)
      byRoom.set(roomId,current)
    }

    return [...byRoom.values()]
  },[auto.housekeeping,handoffRoomNotes])

  const actionItems = useMemo(()=>{
    const items:{key:string;title:string;detail:string}[]=[]

    for (const room of roomHandoff) {
      items.push({
        key:`room-${room.roomId}`,
        title:room.roomName,
        detail:room.details.join(' · ')
      })
    }

    if (summary.menusMissing.length) {
      items.push({
        key:'breakfast-missing',
        title:'Breakfast',
        detail:`${summary.menusMissing.length} missing menu${summary.menusMissing.length===1?'':'s'}: ${summary.menusMissing.map((r:any)=>r.roomName).join(', ')}`
      })
    }

    for (const item of summary.maintenanceOpen) {
      items.push({
        key:`maintenance-${item.id}`,
        title:String(item.roomName||item.area||'Property'),
        detail:`${String(item.title||'Maintenance item')} · ${String(item.status||'open').replace('_',' ')}`
      })
    }

    return items
  },[roomHandoff,summary.menusMissing,summary.maintenanceOpen])

  function textarea(key:keyof typeof draft,label:string,placeholder:string,authorKey?:keyof NonNullable<Report['note_authors']>) {
    const author=authorKey ? report?.note_authors?.[authorKey] : null
    return <label>{label}
      {author && <span className="shift-note-author">{author.initials} · {author.name}</span>}
      <textarea value={draft[key]} onChange={e=>setDraft(cur=>({...cur,[key]:e.target.value}))} disabled={!canManage||locked} placeholder={placeholder}/>
    </label>
  }

  function authoredText(value:string,authorKey:keyof NonNullable<Report['note_authors']>) {
    const author=report?.note_authors?.[authorKey]
    return <>{author && <strong className="shift-note-prefix">{author.initials}: </strong>}{value}</>
  }

  return <div className="shift-page module-pretty-page">
    <section className="module-pretty-hero no-print">
      <div>
        <div className="module-kicker">Operations handoff</div>
        <h1>Shift Reports</h1>
        <p>Capture the day clearly, surface exceptions, and leave the next shift with the information they actually need.</p>
      </div>
      <div className="module-pretty-hero-stat">
        <span>Status</span>
        <strong>{report?.status || 'Draft'}</strong>
      </div>
    </section>

    <div className="shift-toolbar no-print module-pretty-toolbar">
      <div className="shift-toolbar-left">
        <label>Date <input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
        <label>Shift <select value={shift} onChange={e=>setShift(e.target.value)}><option>Daily</option><option>Morning</option><option>Evening</option></select></label>
        <span className={`shift-status ${report?.status || 'draft'}`}>{report?.status || 'New draft'}</span>
      </div>
      <div className="shift-toolbar-right">
        <button type="button" className="ops-secondary-btn" onClick={load}><RefreshCw size={15}/>Refresh</button>
        <button type="button" className="ops-secondary-btn" onClick={()=>window.print()}><Printer size={15}/>Print / Save PDF</button>
        {canManage && !locked && <button type="button" className="ops-secondary-btn" onClick={()=>saveReport('save')} disabled={saving}><Save size={15}/>{saving?'Saving…':'Save Draft'}</button>}
        {canManage && !locked && <button type="button" className="ops-primary-btn" onClick={()=>saveReport('finalize')} disabled={saving}><CheckCircle2 size={15}/>Finalize</button>}
        {canManage && locked && <button type="button" className="ops-secondary-btn" onClick={()=>saveReport('reopen')} disabled={saving}>Reopen report</button>}
      </div>
    </div>

    {message && <div className="module-message">{message}</div>}

    <div className="shift-tabs no-print">
      <button className={tab==='report'?'active':''} onClick={()=>setTab('report')}>Daily Shift Report</button>
      <button className={tab==='room-notes'?'active':''} onClick={()=>setTab('room-notes')}>Room Notes</button>
      <button className={tab==='handoff'?'active':''} onClick={()=>setTab('handoff')}>Shift Handoff</button>
      {canManage && <button className={tab==='management'?'active':''} onClick={()=>setTab('management')}>Management Notes</button>}
    </div>

    <div className="shift-print-document" aria-hidden="true">
      <header className="shift-print-heading">
        <h1>The Hotel Saugatuck</h1>
        <h2>Daily Shift Report · {date} · {shift}</h2>
        <div>Prepared by {currentStaffName}</div>
        <div>Status: {report?.status || 'Draft'}</div>
      </header>

      <section className="shift-print-section shift-print-snapshot">
        <h3>Today · {date}</h3>
        <div className="shift-print-summary-grid shift-print-summary-six">
          <div><span>Staff on site</span><strong>{summary.todayStaff.length}</strong></div>
          <div><span>Room cleans</span><strong>{summary.roomCleans}</strong></div>
          <div><span>Rooms completed</span><strong>{summary.completed}</strong></div>
          <div><span>Refreshes</span><strong>{summary.refreshes}</strong></div>
          <div><span>Menus received</span><strong>{summary.menusReceived}</strong></div>
          <div><span>Menus needed</span><strong>{summary.menusMissing.length}</strong></div>
        </div>
        {summary.todayStaff.length>0 && <p className="shift-print-narrative"><strong>On site:</strong> {summary.todayStaff.map((s:any)=>`${s.name}${s.roleLabel?` (${s.roleLabel})`:''}`).join(', ')}</p>}
      </section>

      {actionItems.length>0 && <section className="shift-print-section">
        <h3>Action Required / Handoff</h3>
        <ul className="shift-print-action-list">
          {actionItems.map(item=><li key={`print-action-${item.key}`}><strong>{item.title}</strong> — {item.detail}</li>)}
        </ul>
      </section>}

      <section className="shift-print-section">
        <h3>Breakfast · {auto.breakfastDate}</h3>
        <p><strong>{summary.menusReceived + summary.menusMissing.length} rooms expected</strong> · {summary.menusReceived} menus received · {summary.menusMissing.length} missing</p>
        {summary.menusMissing.length>0 && <div className="shift-print-bullets">
          <strong>Missing menus</strong>
          <ul>{summary.menusMissing.map((r:any)=><li key={`print-menu-${r.roomId}`}>{r.roomName}</li>)}</ul>
        </div>}
      </section>

      {roomNotes.filter(n=>n.include_in_shift_report).length>0 && <section className="shift-print-section">
        <h3>Room / Guest Notes</h3>
        <div className="shift-print-list">
          {roomNotes.filter(n=>n.include_in_shift_report).map(n=><div key={`print-note-${n.id}`} className="shift-print-row">
            <strong>{n.roomName}</strong><span><b>{initials(n.createdByName)}:</b> {n.note}</span>
          </div>)}
        </div>
        {draft.guestNotes.trim() && <p className="shift-print-narrative">{authoredText(draft.guestNotes,'guest')}</p>}
      </section>}

      {!roomNotes.filter(n=>n.include_in_shift_report).length && draft.guestNotes.trim() && <section className="shift-print-section">
        <h3>Room / Guest Notes</h3><p>{authoredText(draft.guestNotes,'guest')}</p>
      </section>}

      {draft.staffNotes.trim() && <section className="shift-print-section"><h3>Staff Notes</h3><p>{authoredText(draft.staffNotes,'staff')}</p></section>}
      {draft.suppliesNotes.trim() && <section className="shift-print-section"><h3>Supplies / Inventory</h3><p>{authoredText(draft.suppliesNotes,'supplies')}</p></section>}
      {draft.tomorrowNotes.trim() && <section className="shift-print-section"><h3>Tomorrow / Follow-up</h3><p>{authoredText(draft.tomorrowNotes,'tomorrow')}</p></section>}
      {draft.generalNotes.trim() && <section className="shift-print-section"><h3>General Notes</h3><p>{authoredText(draft.generalNotes,'general')}</p></section>}

      <section className="shift-print-section">
        <h3>Tomorrow · {auto.breakfastDate}</h3>
        <div className="shift-print-summary-grid shift-print-summary-six">
          <div><span>Staff scheduled</span><strong>{summary.tomorrowStaff.length}</strong></div>
          <div><span>Room cleans</span><strong>{summary.tomorrowCleans}</strong></div>
          <div><span>Refreshes</span><strong>{summary.tomorrowRefreshes}</strong></div>
          <div><span>Breakfast rooms</span><strong>{summary.breakfastExpected}</strong></div>
          <div><span>Menus received</span><strong>{summary.menusReceived}</strong></div>
          <div><span>Desserts tonight</span><strong>{summary.dessertsTonight}</strong></div>
        </div>
        {summary.tomorrowStaff.length>0 && <p className="shift-print-narrative"><strong>Scheduled:</strong> {summary.tomorrowStaff.map((s:any)=>`${s.name}${s.roleLabel?` (${s.roleLabel})`:''}`).join(', ')}</p>}
        {summary.dessertRooms.length>0 && <p className="shift-print-narrative"><strong>Dessert rooms:</strong> {summary.dessertRooms.map((r:any)=>r.roomName).join(', ')}</p>}
      </section>

      {draft.managementNotes.trim() && <section className="shift-print-section"><h3>Management Notes</h3><p>{authoredText(draft.managementNotes,'management')}</p></section>}
    </div>

    {loading ? <div className="module-empty">Loading shift report…</div> : tab==='report' ? <div className="shift-report-flow">
      <section className="shift-section shift-snapshot-section shift-day-section">
        <div className="shift-day-heading">
          <div><span>TODAY</span><h3>{date}</h3></div>
          <small>Current staffing, housekeeping workload, and menu status</small>
        </div>
        <div className="shift-snapshot-grid">
          <div><span>Staff on site</span><strong>{summary.todayStaff.length}</strong></div>
          <div><span>Room cleans</span><strong>{summary.roomCleans}</strong></div>
          <div><span>Rooms completed</span><strong>{summary.completed}</strong></div>
          <div><span>Refreshes</span><strong>{summary.refreshes}</strong></div>
          <div><span>Menus received</span><strong>{summary.menusReceived}</strong></div>
          <div><span>Menus needed</span><strong>{summary.menusMissing.length}</strong></div>
        </div>
        {summary.todayStaff.length>0 && <div className="shift-staff-strip">
          {summary.todayStaff.map((person:any)=><span key={person.staffMemberId}><strong>{person.name}</strong><small>{person.roleLabel||'On site'}</small></span>)}
        </div>}
      </section>

      <section className="shift-section shift-action-section">
        <h3>Action Required / Handoff</h3>
        {actionItems.length ? <div className="shift-action-list">
          {actionItems.map(item=><div className="shift-action-item" key={item.key}>
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </div>)}
        </div> : <div className="shift-muted">No exceptions or open handoff items.</div>}
      </section>

      <section className="shift-section">
        <h3>Breakfast · {auto.breakfastDate}</h3>
        <div className="shift-breakfast-overview">
          <strong>{summary.menusReceived + summary.menusMissing.length} rooms expected</strong>
          <span>{summary.menusReceived} menus received · {summary.menusMissing.length} missing</span>
        </div>
        {summary.menusMissing.length>0 && <div className="shift-missing-menu-list">
          <strong>Missing menus</strong>
          <ul>{summary.menusMissing.map((r:any)=><li key={r.roomId}>{r.roomName}</li>)}</ul>
        </div>}
      </section>

      <section className="shift-section full">
        <h3>Room / Guest Notes</h3>
        {roomNotes.filter(n=>n.include_in_shift_report).length>0 && <div className="shift-list">
          {roomNotes.filter(n=>n.include_in_shift_report).map(n=><div key={n.id} className="shift-line">
            <span><strong>{n.roomName}</strong><br/><span className="shift-muted"><b>{initials(n.createdByName)}:</b> {n.note}</span></span>
            <span className="shift-badge">{n.note_type}</span>
          </div>)}
        </div>}
        {textarea('guestNotes','Guest issues / requests / recovery','Complaints, special requests, compensation, late arrivals, anything the next shift should know.','guest')}
      </section>

      <section className="shift-section"><h3>Staff Notes</h3>{textarea('staffNotes','Staff notes','Attendance, coverage changes, training, handoff information.','staff')}</section>
      <section className="shift-section"><h3>Supplies / Inventory</h3>{textarea('suppliesNotes','Supplies','Running low, ordered today, deliveries received.','supplies')}</section>
      <section className="shift-section"><h3>Tomorrow / Follow-up</h3>{textarea('tomorrowNotes','Tomorrow priorities','Room follow-up, breakfast outstanding, maintenance carryover, priority tasks.','tomorrow')}</section>
      <section className="shift-section"><h3>General Notes</h3>{textarea('generalNotes','General notes','Anything else that belongs in the daily record.','general')}</section>

      <section className="shift-section shift-snapshot-section shift-tomorrow-section">
        <div className="shift-day-heading">
          <div><span>TOMORROW</span><h3>{auto.breakfastDate}</h3></div>
          <small>Scheduled staffing, room workload, breakfast, and tonight&apos;s dessert prep</small>
        </div>
        <div className="shift-snapshot-grid">
          <div><span>Staff scheduled</span><strong>{summary.tomorrowStaff.length}</strong></div>
          <div><span>Room cleans</span><strong>{summary.tomorrowCleans}</strong></div>
          <div><span>Refreshes</span><strong>{summary.tomorrowRefreshes}</strong></div>
          <div><span>Breakfast rooms</span><strong>{summary.breakfastExpected}</strong></div>
          <div><span>Menus received</span><strong>{summary.menusReceived}</strong></div>
          <div><span>Desserts tonight</span><strong>{summary.dessertsTonight}</strong></div>
        </div>
        {summary.tomorrowStaff.length>0 && <div className="shift-staff-strip">
          {summary.tomorrowStaff.map((person:any)=><span key={person.staffMemberId}><strong>{person.name}</strong><small>{person.roleLabel||'Scheduled'}</small></span>)}
        </div>}
        {summary.dessertRooms.length>0 && <div className="shift-dessert-rooms">
          <strong>Dessert rooms</strong>
          <span>{summary.dessertRooms.map((room:any)=>room.roomName).join(', ')}</span>
        </div>}
        <p className="shift-dessert-note">Desserts are counted from tomorrow&apos;s breakfast-inclusive room rates, not from menu submission timing.</p>
      </section>

      <section className="shift-section full"><h3>Management Notes</h3>{textarea('managementNotes','Manager-only notes','Attendance concerns, performance issues, guest compensation decisions, incidents, disciplinary matters, or other restricted notes.','management')}</section>
    </div> : tab==='room-notes' ? <div className="shift-section full">
      <h3>Room Notes</h3>
      <div className="room-note-form">
        <label>Room<select value={noteRoomId} onChange={e=>setNoteRoomId(e.target.value)}><option value="">Select room</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>Type<select value={noteType} onChange={e=>setNoteType(e.target.value as any)}><option value="daily">Daily</option><option value="persistent">Persistent</option></select></label>
        <label className="note-input">Note<input value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="What should the next shift or future staff know?"/></label>
        <label style={{display:'flex',alignItems:'center',gap:7,paddingBottom:12}}><input type="checkbox" checked={includeNote} onChange={e=>setIncludeNote(e.target.checked)} style={{width:'auto'}}/>Shift report</label>
        <button type="button" className="ops-primary-btn" onClick={addRoomNote} disabled={saving}>Add note</button>
      </div>
      <div className="room-note-list">{roomNotes.map(n=><div key={n.id} className="room-note"><strong>{n.roomName}</strong><span className="shift-badge">{n.note_type}</span><div>{n.note}<div className="shift-muted">Added by {n.createdByName}</div></div><button type="button" className="ops-secondary-btn" onClick={()=>resolveRoomNote(n.id,!n.resolved)}>{n.resolved?'Reopen':'Resolve'}</button></div>)}</div>
    </div> : tab==='handoff' ? <div className="handoff-column">
      <section className="handoff-card"><h3>Unresolved room issues</h3>{handoffRoomNotes.length ? handoffRoomNotes.map(n=><div key={n.id} className="shift-line"><span><strong>{n.roomName}</strong><br/><span className="shift-muted">{n.note}</span></span><span className="shift-badge">{n.note_type}</span></div>) : <div className="shift-muted">No unresolved room notes.</div>}</section>
      <section className="handoff-card"><h3>Outstanding breakfast menus · {auto.breakfastDate}</h3>{summary.menusMissing.length ? summary.menusMissing.map((r:any)=><div key={r.roomId} className="shift-line"><span>{r.roomName}</span><span className="shift-badge warn">Menu needed</span></div>) : <div className="shift-muted">No outstanding scheduled breakfast menus.</div>}</section>
      <section className="handoff-card"><h3>Open maintenance</h3>{handoffMaintenance.length ? handoffMaintenance.map((m:any)=><div key={m.id} className="shift-line"><span><strong>{m.roomName}</strong><br/><span className="shift-muted">{m.title}</span></span><span className={`shift-badge ${m.priority==='urgent'?'danger':''}`}>{m.status.replace('_',' ')}</span></div>) : <div className="shift-muted">No open maintenance work orders.</div>}</section>
      <section className="handoff-card"><h3>Tomorrow priorities</h3><div style={{whiteSpace:'pre-wrap'}}>{draft.tomorrowNotes || <span className="shift-muted">No priorities entered yet.</span>}</div></section>
    </div> : <div className="shift-section full">
      <h3>Management Notes</h3>
      {canManage ? <>{textarea('managementNotes','Manager-only notes','Attendance concerns, performance issues, guest compensation decisions, incidents, disciplinary matters, or other restricted notes.')}<p className="shift-muted">This field is only returned to manager-level users by the API.</p></> : <div className="manager-lock">Manager access required.</div>}
    </div>}
  </div>
}
