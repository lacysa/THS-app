'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileText, Printer, RefreshCw, Save } from 'lucide-react'

type AutoData = {
  breakfastDate:string
  housekeeping:any[]
  breakfast:any[]
  maintenance:any[]
  roomNotes:any[]
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
}

function todayDetroit() {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
}

export default function ShiftReportBoard() {
  const [date,setDate] = useState(todayDetroit())
  const [shift,setShift] = useState('Daily')
  const [tab,setTab] = useState<'report'|'room-notes'|'handoff'|'management'>('report')
  const [report,setReport] = useState<Report|null>(null)
  const [auto,setAuto] = useState<AutoData>({breakfastDate:'',housekeeping:[],breakfast:[],maintenance:[],roomNotes:[]})
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
      setAuto(rd.auto || {breakfastDate:'',housekeeping:[],breakfast:[],maintenance:[],roomNotes:[]})
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
    return {
      completed:hk.filter(r=>r.complete).length,
      refreshes:hk.filter(r=>String(r.serviceType||'').toUpperCase()==='RF').length,
      holds:hk.filter(r=>String(r.stripHold||'').toLowerCase().includes('hold')).length,
      menusReceived:breakfast.filter(r=>r.status==='scheduled'&&r.menuSubmitted).length,
      menusMissing:breakfast.filter(r=>r.status==='scheduled'&&!r.menuSubmitted),
      breakfastDeclined:breakfast.filter(r=>r.status==='declined').length,
      maintenanceOpen:maintenance.filter(r=>r.status!=='complete'),
      maintenanceComplete:maintenance.filter(r=>r.status==='complete'),
      roomIssues:hk.filter(r=>r.notes||r.roomCondition||r.nextShiftCondition)
    }
  },[auto])

  const handoffRoomNotes = roomNotes.filter(n=>!n.resolved)
  const handoffMaintenance = summary.maintenanceOpen

  function textarea(key:keyof typeof draft,label:string,placeholder:string) {
    return <label>{label}<textarea value={draft[key]} onChange={e=>setDraft(cur=>({...cur,[key]:e.target.value}))} disabled={!canManage||locked} placeholder={placeholder}/></label>
  }

  return <div className="shift-page">
    <div className="shift-toolbar no-print">
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

    <div className="print-only shift-print-heading"><h1>The Hotel Saugatuck</h1><h2>Shift Report · {date} · {shift}</h2><div>Prepared by {currentStaffName}</div></div>

    {loading ? <div className="module-empty">Loading shift report…</div> : tab==='report' ? <div className="shift-grid">
      <section className="shift-section"><h3>Rooms</h3><div className="shift-list">
        <div className="shift-line"><span>Completed rooms</span><strong>{summary.completed}</strong></div>
        <div className="shift-line"><span>Refreshes</span><strong>{summary.refreshes}</strong></div>
        <div className="shift-line"><span>Holds</span><strong>{summary.holds}</strong></div>
        {summary.roomIssues.map((r:any)=><div key={r.roomId} className="shift-line"><span><strong>{r.roomName}</strong><br/><span className="shift-muted">{[r.roomCondition,r.nextShiftCondition,r.notes].filter(Boolean).join(' · ')}</span></span><span className="shift-badge">Room note</span></div>)}
        {roomNotes.filter(n=>n.include_in_shift_report).map(n=><div key={n.id} className="shift-line"><span><strong>{n.roomName}</strong><br/><span className="shift-muted">{n.note}</span></span><span className="shift-badge">{n.note_type}</span></div>)}
      </div></section>

      <section className="shift-section"><h3>Breakfast · {auto.breakfastDate}</h3><div className="shift-list">
        <div className="shift-line"><span>Menus received</span><strong>{summary.menusReceived}</strong></div>
        <div className="shift-line"><span>Declined breakfast</span><strong>{summary.breakfastDeclined}</strong></div>
        <div className="shift-line"><span>Menus outstanding</span><strong>{summary.menusMissing.length}</strong></div>
        {summary.menusMissing.map((r:any)=><div key={r.roomId} className="shift-line"><span>{r.roomName}</span><span className="shift-badge warn">Menu needed</span></div>)}
      </div></section>

      <section className="shift-section"><h3>Maintenance</h3><div className="shift-list">
        <div className="shift-line"><span>Open / carryover</span><strong>{summary.maintenanceOpen.length}</strong></div>
        <div className="shift-line"><span>Completed</span><strong>{summary.maintenanceComplete.length}</strong></div>
        {summary.maintenanceOpen.filter((m:any)=>m.include_in_shift_report).slice(0,10).map((m:any)=><div key={m.id} className="shift-line"><span><strong>{m.roomName}</strong><br/><span className="shift-muted">{m.title}</span></span><span className={`shift-badge ${m.priority==='urgent'?'danger':''}`}>{m.status.replace('_',' ')}</span></div>)}
      </div></section>

      <section className="shift-section"><h3>Guest Notes</h3>{textarea('guestNotes','Guest issues / requests / recovery','Complaints, special requests, compensation, late arrivals, anything the next shift should know.')}</section>
      <section className="shift-section"><h3>Staff</h3>{textarea('staffNotes','Staff notes','Attendance, coverage changes, training, handoff information.')}</section>
      <section className="shift-section"><h3>Supplies / Inventory</h3>{textarea('suppliesNotes','Supplies','Running low, ordered today, deliveries received.')}</section>
      <section className="shift-section"><h3>Tomorrow</h3>{textarea('tomorrowNotes','Tomorrow priorities','Room follow-up, breakfast outstanding, maintenance carryover, priority tasks.')}</section>
      <section className="shift-section full"><h3>General Notes</h3>{textarea('generalNotes','General notes','Anything else that belongs in the daily record.')}</section>
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
