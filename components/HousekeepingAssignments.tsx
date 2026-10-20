'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, ClipboardList, RefreshCw, Search, UsersRound } from 'lucide-react'

type Staff = {
  id: string; name: string; roleLabel: string; onSite: boolean; housekeepingEligible: boolean
  scheduleState: string; shiftStart: string | null; shiftEnd: string | null
  fullRoomCleanLimit: number
}
type Room = {
  roomId: string; roomName: string; sortOrder: number; activity: string; serviceType: string
  condition: string; assignedTo: string; cleanOrder: number | null; complete: boolean
  checkIssueOpen: boolean; task: 'none' | 'blocked' | 'full' | 'refresh' | 'tub'
  needsAssignment: boolean; hasDailyRecord: boolean
}
type TubTask = {roomId:string;roomName:string;assignedTo:string;due:boolean}
type AssignmentData = {
  date: string; rooms: Room[]; staff: Staff[]; tubTasks:TubTask[]
  staffing: { scheduledOnSite: number; hasSchedule: boolean }
  readOnly: boolean
}
type DeepClean = {room_id:string;assigned_to:string;instructions:string;completed_at:string|null}
type View = 'staff' | 'unassigned'

function todayDetroit() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function shiftDate(date: string, offset: number) {
  const day = new Date(date + 'T12:00:00Z')
  day.setUTCDate(day.getUTCDate() + offset)
  return day.toISOString().slice(0, 10)
}
function names(assignment: string) {
  return assignment.split(',').map(name => name.trim()).filter(Boolean)
}
function assigned(room: Room, name: string) {
  return names(room.assignedTo).some(value => value.toLowerCase() === name.toLowerCase())
}
function taskLabel(room: Room) {
  if (room.task === 'refresh') return 'Stayover · Refresh'
  if (room.task === 'tub') return 'Tub clean only'
  // Show the operational reason for a clean, while keeping the internal
  // full-clean task type for capacity limits and assignment accounting.
  const activity = room.activity.trim()
  if (['vacant', 'arrival'].includes(activity.toLowerCase()) && /dirty|cleaning/i.test(room.condition)) {
    return activity + ' (Dirty)'
  }
  return activity || 'Cleaning required'
}
function timeLabel(raw: string | null) {
  return raw ? raw.slice(0, 5) : ''
}

export default function HousekeepingAssignments({initialDate}:{initialDate?:string}={}) {
  const [date, setDate] = useState(initialDate || todayDetroit())
  const [view, setView] = useState<View>('staff')
  const [data, setData] = useState<AssignmentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [deepCleans,setDeepCleans] = useState<DeepClean[]>([])
  const [deepRoom,setDeepRoom] = useState('')
  const [deepStaff,setDeepStaff] = useState('')
  const [deepInstructions,setDeepInstructions] = useState('')
  const [deepBusy,setDeepBusy] = useState(false)
  const [tubBusy,setTubBusy] = useState('')
  const [showAssigned, setShowAssigned] = useState(false)
  const [busyRoom, setBusyRoom] = useState('')
  const busyRef = useRef(false)
  const [reload, setReload] = useState(0)
  const refresh = useCallback(() => setReload(current => current + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      if (busyRef.current) return
      if (!data || data.date !== date) setLoading(true)
      try {
        const response = await fetch('/api/housekeeping/assignments?date=' + encodeURIComponent(date), { cache: 'no-store', signal: controller.signal })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || 'Could not load assignments.')
        if (!controller.signal.aborted) { setData(result as AssignmentData); setError('') }
      } catch (err: any) {
        if (!controller.signal.aborted) setError(err?.message || 'Unable to load assignments.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    const onRefresh = () => { if (document.visibilityState === 'visible' && !busyRef.current) void load() }
    window.addEventListener('ths:live-data-refresh', onRefresh)
    window.addEventListener('focus', onRefresh)
    return () => { controller.abort(); window.removeEventListener('ths:live-data-refresh', onRefresh); window.removeEventListener('focus', onRefresh) }
  }, [date, reload])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/housekeeping/deep-cleans?date='+encodeURIComponent(date),{signal:controller.signal,cache:'no-store'})
      .then(async response => {const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to load deep cleans');return result})
      .then(result=>{if(!controller.signal.aborted)setDeepCleans(result.tasks||[])})
      .catch(err=>{if(!controller.signal.aborted)setError(err.message)})
    return ()=>controller.abort()
  },[date,reload])
  async function deepAction(action:'save'|'complete'|'remove',roomId:string,values:Record<string,unknown>={}) {
    if(deepBusy||data?.readOnly)return
    setDeepBusy(true);setError('');setMessage('')
    try {
      const response=await fetch('/api/housekeeping/deep-cleans',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({date,roomId,action,...values})})
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error||'Unable to save deep clean')
      const fresh=await fetch('/api/housekeeping/deep-cleans?date='+encodeURIComponent(date),{cache:'no-store'})
      const loaded=await fresh.json()
      if(!fresh.ok)throw new Error(loaded.error||'Unable to refresh deep clean')
      setDeepCleans(loaded.tasks||[])
      if(action==='save'){setDeepRoom('');setDeepStaff('');setDeepInstructions('')}
      setMessage(action==='save'?'Deep clean scheduled.':action==='complete'?'Deep clean updated.':'Deep clean removed.')
      window.dispatchEvent(new CustomEvent('ths:live-data-refresh'))
    }catch(err:any){setError(err.message||'Unable to save deep clean')}
    finally{setDeepBusy(false)}
  }
  async function assignTub(task:TubTask,name:string){
    if(tubBusy||data?.readOnly)return
    setTubBusy(task.roomId);setError('')
    try{
      const response=await fetch('/api/ops/room-details',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({date,roomId:task.roomId,action:'tubAssign',assignedTo:name})})
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error||'Could not assign tub clean.')
      setData(current=>current?{...current,tubTasks:(current.tubTasks||[]).map(item=>item.roomId===task.roomId?{...item,assignedTo:name}:item)}:current)
      setMessage(name?task.roomName+' tub-only task assigned to '+name+'.':task.roomName+' tub-only task unassigned.')
      window.dispatchEvent(new CustomEvent('ths:live-data-refresh'))
    }catch(err:any){setError(err.message||'Unable to assign tub clean.')}
    finally{setTubBusy('')}
  }
  const rooms = data?.rooms || []
  const staff = data?.staff || []
  const onSite = staff.filter(person => person.onSite && (person.housekeepingEligible || (rooms.some(room => assigned(room, person.name)) || (data?.tubTasks||[]).some(t=>t.assignedTo.toLowerCase()===person.name.toLowerCase()))))
  const offSite = staff.filter(person => !person.onSite && (rooms.some(room => assigned(room, person.name)) || (data?.tubTasks||[]).some(t=>t.assignedTo.toLowerCase()===person.name.toLowerCase())))
  const assignable = staff.filter(person => person.onSite && person.housekeepingEligible)
  const otherScheduled = staff.filter(person => person.onSite && !person.housekeepingEligible)
  const otherActive = staff.filter(person => !person.onSite && !['called_off', 'no_call_no_show', 'time_off', 'unavailable'].includes(person.scheduleState))
  const absent = staff.filter(person => ['called_off', 'no_call_no_show', 'time_off', 'unavailable'].includes(person.scheduleState))
  const work = rooms.filter(room => room.task === 'full' || room.task === 'refresh' || room.task === 'tub')
  const unassigned = work.filter(room => room.needsAssignment)
  const completed = work.filter(room => room.complete)
  const counts = useMemo(() => {
    const result = new Map<string, number>()
    for (const person of staff) result.set(person.name.toLowerCase(), work.filter(room => room.task === 'full' && assigned(room, person.name)).length)
    return result
  }, [data])

  async function saveAssignment(room: Room, next: string) {
    if (busyRef.current || data?.readOnly || !room.hasDailyRecord || room.assignedTo === next) return
    busyRef.current = true
    setBusyRoom(room.roomId)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/housekeeping/day', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serviceDate: date, roomId: room.roomId, patch: { assignedTo: next } })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Assignment could not be saved.')
      const savedName = String(result.row?.assignedTo ?? next)
      setData(current => current && current.date === date ? {
        ...current,
        rooms: current.rooms.map(item => item.roomId !== room.roomId ? item : {
          ...item, assignedTo: savedName,
          needsAssignment: item.task !== 'none' && item.task !== 'blocked' && !item.complete && !savedName.trim()
        })
      } : current)
      setMessage(savedName ? room.roomName + ' assigned to ' + savedName + '.' : room.roomName + ' is unassigned.')
      window.dispatchEvent(new CustomEvent('ths:live-data-refresh', { detail: { roomId: room.roomId, date } }))
    } catch (err: any) {
      setError(err?.message || 'Unable to save assignment.')
    } finally {
      busyRef.current = false
      setBusyRoom('')
    }
  }

  async function clearPendingAssignments() {
    if (busyRef.current || !data || data.readOnly) return
    const pending = data.rooms.filter(room => room.assignedTo.trim() && !room.complete)
    if (!pending.length) return
    if (!window.confirm('Clear '+pending.length+' pending room assignment'+(pending.length===1?'':'s')+' for '+date+'? Completed rooms will keep their cleaner history.')) return
    busyRef.current = true
    setBusyRoom('bulk')
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/housekeeping/assignments', {
        method: 'PATCH',
        headers: {'content-type':'application/json'},
        body: JSON.stringify({date,action:'clearPending'})
      })
      const result = await response.json().catch(()=>({}))
      if (!response.ok) throw new Error(result.error || 'Could not clear pending assignments.')
      setMessage(String(result.cleared||0)+' pending assignments cleared. Completed room records were preserved.')
      refresh()
      window.dispatchEvent(new CustomEvent('ths:live-data-refresh'))
    } catch (err:any) {
      setError(err?.message || 'Unable to clear assignments.')
    } finally {
      busyRef.current = false
      setBusyRoom('')
    }
  }

  function assignmentSelect(room: Room) {
    return <select
      aria-label={'Assign ' + room.roomName + ' to a housekeeper'}
      value={room.assignedTo}
      disabled={Boolean(data?.readOnly) || Boolean(busyRoom) || !room.hasDailyRecord}
      onChange={event => void saveAssignment(room, event.target.value)}
    >
      <option value="">Unassigned</option>
      {room.assignedTo && !staff.some(person => person.name === room.assignedTo) && <option value={room.assignedTo}>{room.assignedTo} (existing assignment)</option>}
      <optgroup label="Scheduled on site">
        {assignable.map(person => {
          const atLimit = room.task === 'full' && !assigned(room, person.name) &&
            (counts.get(person.name.toLowerCase()) || 0) >= person.fullRoomCleanLimit
          return <option key={person.id} value={person.name} disabled={atLimit}>
            {person.name}{atLimit ? ' · full-clean limit reached' : ''}
          </option>
        })}
      </optgroup>
      {otherScheduled.length > 0 && <optgroup label="Other scheduled staff">
        {otherScheduled.map(person => <option key={person.id} value={person.name}>{person.name} · {person.roleLabel || 'Other role'}</option>)}
      </optgroup>}
      {otherActive.length > 0 && <optgroup label="Other active staff (not scheduled on site)">
        {otherActive.map(person => <option key={person.id} value={person.name}>{person.name} · not on site</option>)}
      </optgroup>}
      {absent.length > 0 && <optgroup label="Unavailable today (assignments disabled)">
        {absent.map(person => <option key={person.id} value={person.name} disabled={room.assignedTo !== person.name}>{person.name} · {person.scheduleState.replaceAll('_', ' ')}</option>)}
      </optgroup>}
    </select>
  }

  function roomCard(room: Room) {
    return <div className={'hka-room ' + (room.needsAssignment ? 'needs-assignment' : '')} key={room.roomId}>
      <div className="hka-room-info">
        <strong>{room.roomName}</strong>
        <span>{taskLabel(room)}{room.complete ? ' · Complete' : ''}</span>
        {room.checkIssueOpen && <em>Correction required</em>}
        {!room.hasDailyRecord && <em>Daily room record missing; initialize via Room Operations</em>}
      </div>
      <div className="hka-assignment-field">
        {assignmentSelect(room)}
        {busyRoom === room.roomId && <small>Saving…</small>}
      </div>
    </div>
  }

  function staffCard(person: Staff) {
    const theirs = work.filter(room => assigned(room, person.name))
    const full = theirs.filter(room => room.task === 'full')
    const refreshes = theirs.filter(room => room.task === 'refresh')
    const tubs = (data?.tubTasks||[]).filter(t=>t.assignedTo.toLowerCase()===person.name.toLowerCase())
    const overLimit = full.length > person.fullRoomCleanLimit
    const available = work.filter(room => room.needsAssignment && room.hasDailyRecord && (room.task !== 'full' || full.length < person.fullRoomCleanLimit))
    return <section key={person.id} className="hka-person">
      <div className="hka-person-head">
        <div>
          <strong>{person.name}</strong>
          <small>{person.roleLabel || 'Staff'}{person.shiftStart && person.shiftEnd ? ' · ' + timeLabel(person.shiftStart) + '–' + timeLabel(person.shiftEnd) : ''}</small>
        </div>
        <div className="hka-person-count">
          <span className={overLimit ? 'over-limit' : ''}>{full.length}/{person.fullRoomCleanLimit} cleans</span>
          <span>{refreshes.length} refreshes{tubs.length?' · '+tubs.length+' tub cleans':''}</span>
          {!person.onSite && <span className="offsite">Not scheduled on site</span>}
        </div>
      </div>
      <div className="hka-person-rooms">
        {theirs.length||tubs.length ? <>{theirs.map(room => <div className="hka-person-room" key={room.roomId}>
          <div><strong>{room.roomName}</strong><small>{taskLabel(room)}{room.complete ? ' · Complete' : ''}</small></div>
          <button type="button" disabled={Boolean(data?.readOnly) || Boolean(busyRoom)} onClick={() => { if (names(room.assignedTo).length > 1 && !window.confirm('This room has multiple assigned people. Clear all assignments for ' + room.roomName + '?')) return; void saveAssignment(room, '') }} aria-label={'Clear assignment for ' + room.roomName}>{names(room.assignedTo).length > 1 ? 'Clear all' : 'Unassign'}</button>
        </div>)}{tubs.map(task=><div className="hka-person-room" key={'tub-'+task.roomId}>
          <div><strong>{task.roomName}</strong><small>Tub clean only</small></div>
          <button type="button" disabled={Boolean(data?.readOnly)||Boolean(tubBusy)} onClick={()=>void assignTub(task,'')}>Unassign tub</button>
        </div>)}</> : <p className="hka-empty-line">No rooms assigned yet.</p>}
      </div>
      {person.onSite && available.length > 0 && <label className="hka-add">
        <span>Assign another room</span>
        <select value="" disabled={Boolean(data?.readOnly) || Boolean(busyRoom)} onChange={event => {
          const room = work.find(item => item.roomId === event.target.value)
          if (room) void saveAssignment(room, person.name)
        }}>
          <option value="">Choose unassigned room…</option>
          {available.map(room => <option key={room.roomId} value={room.roomId}>{room.roomName} · {taskLabel(room)}</option>)}
        </select>
      </label>}
    </section>
  }

  const filteredUnassigned = work.filter(room => (showAssigned || room.needsAssignment) &&
    (!query.trim() || [room.roomName, room.activity, room.assignedTo].join(' ').toLowerCase().includes(query.toLowerCase())))

  return <div className="hka-workspace">
    <header className="hka-header">
      <div><span className="hka-kicker">THE HOTEL SAUGATUCK</span><h2>Housekeeping Assignments</h2>
        <p>Plan the day's room services using your existing schedule and room assignments.</p>
      </div>
      <div className="hka-date-picker">
        <div className="hka-date-nav">
          <CalendarDays size={17} aria-hidden="true"/>
          <button type="button" onClick={() => setDate(d => shiftDate(d, -1))} aria-label="Previous day">‹</button>
          <input aria-label="Assignment date" type="date" value={date} onChange={event => { if (/^20\d{2}-\d{2}-\d{2}$/.test(event.target.value)) setDate(event.target.value) }}/>
          <button type="button" onClick={() => setDate(d => shiftDate(d, 1))} aria-label="Next day">›</button>
        </div>
        <div className="hka-date-actions">
          <button type="button" onClick={() => setDate(todayDetroit())}>Today</button>
          <button type="button" onClick={refresh} title="Refresh assignments" aria-label="Refresh assignments"><RefreshCw size={17}/></button>
        </div>
      </div>
    </header>

    <div className="hka-stats">
      <div><strong>{onSite.length}</strong><span>Scheduled room staff</span></div>
      <div><strong>{work.length}</strong><span>Services to assign</span></div>
      <div><strong>{unassigned.length}</strong><span>Unassigned</span></div>
      <div><strong>{completed.length}</strong><span>Completed</span></div>
    </div>
    <section className="hka-person hka-deep-clean" aria-label="Tub-only assignments">
      <div className="hka-person-head">
        <div><strong>Tub-only cleaning</strong><small>Independent of full-room cleaning, refreshes, and room-check sign-offs</small></div>
        <span className="hka-deep-count">{(data?.tubTasks||[]).length} open</span>
      </div>
      {(data?.tubTasks||[]).length===0?<p className="hka-empty-line">No tub-only work is due for this date.</p>:
       <div className="hka-person-rooms">{(data?.tubTasks||[]).map(task=>
        <div className="hka-person-room" key={task.roomId} style={{gap:12,flexWrap:'wrap'}}>
          <div style={{flex:'1 1 170px'}}><strong>{task.roomName} · Tub only</strong><small>{task.assignedTo?'Assigned to '+task.assignedTo:'Needs tub-only assignment'}</small></div>
          <select aria-label={'Assign tub-only cleaning for '+task.roomName} value={task.assignedTo} disabled={data?.readOnly||Boolean(tubBusy)} onChange={e=>void assignTub(task,e.target.value)} style={{maxWidth:220}}>
            <option value="">Unassigned</option>
            {task.assignedTo&&!staff.some(person=>person.name===task.assignedTo)&&<option value={task.assignedTo}>{task.assignedTo} (existing)</option>}
            {staff.filter(person=>person.housekeepingEligible).map(person=><option key={person.id} value={person.name}>{person.name}{person.onSite?'':' (not scheduled)'}</option>)}
          </select>
        </div>)}</div>}
    </section>
    <section className="hka-person hka-deep-clean">
      <div className="hka-person-head">
        <div><strong>Deep cleans</strong><small>Additional detailed cleaning, separate from regular room service</small></div>
        <span className="hka-deep-count">{deepCleans.filter(task=>!task.completed_at).length} open</span>
      </div>
      {!data?.readOnly && <div className="hka-deep-form">
        <label>Room
          <select aria-label="Deep clean room" value={deepRoom} onChange={e=>setDeepRoom(e.target.value)}>
            <option value="">Select room…</option>{rooms.filter(room=>!deepCleans.some(task=>task.room_id===room.roomId)).map(room=><option key={room.roomId} value={room.roomId}>{room.roomName}</option>)}
          </select>
        </label>
        <label>Housekeeper
          <select aria-label="Deep clean housekeeper" value={deepStaff} onChange={e=>setDeepStaff(e.target.value)}>
            <option value="">Unassigned</option>{[...assignable,...otherActive.filter(person=>person.housekeepingEligible)].map(person=><option key={person.id} value={person.name}>{person.name}{person.onSite?'':' (not scheduled)'}</option>)}
          </select>
        </label>
        <label className="hka-deep-instructions">Instructions
          <input aria-label="Deep clean instructions" placeholder="e.g. grout, baseboards, behind furniture…" value={deepInstructions} onChange={e=>setDeepInstructions(e.target.value)}/>
        </label>
        <button type="button" disabled={!deepRoom||deepBusy} onClick={()=>void deepAction('save',deepRoom,{assignedTo:deepStaff,instructions:deepInstructions})}>Add deep clean</button>
      </div>}
      {deepCleans.length===0 ? <p className="hka-empty-line">No deep cleans scheduled for this date.</p> : <div className="hka-person-rooms">
        {deepCleans.map(task=>{const room=rooms.find(item=>item.roomId===task.room_id);return <div className="hka-person-room" key={task.room_id} style={{gap:12,flexWrap:'wrap'}}>
          <div style={{flex:'1 1 170px'}}><strong>{room?.roomName||'Room'} · Deep clean</strong><small>{task.completed_at?'Completed':task.assigned_to||'Unassigned'}{task.instructions?' · '+task.instructions:''}</small></div>
          {!data?.readOnly&&!task.completed_at&&<select style={{maxWidth:180}} aria-label={'Assign deep clean '+(room?.roomName||'room')} value={task.assigned_to} disabled={deepBusy} onChange={e=>void deepAction('save',task.room_id,{assignedTo:e.target.value,instructions:task.instructions})}><option value="">Unassigned</option>{staff.filter(person=>person.housekeepingEligible).map(person=><option key={person.id} value={person.name}>{person.name}</option>)}</select>}
          {!data?.readOnly&&<button type="button" disabled={deepBusy} onClick={()=>void deepAction('complete',task.room_id,{completed:!!task.completed_at?false:true})}>{task.completed_at?'Reopen':'Mark complete'}</button>}
          {!data?.readOnly&&!task.completed_at&&<button type="button" disabled={deepBusy} onClick={()=>{if(window.confirm('Remove this deep clean?'))void deepAction('remove',task.room_id)}}>Remove</button>}
        </div>})}
      </div>}
    </section>
    <div className="hka-controls">
      <div className="hka-toggle" role="group" aria-label="Assignment board view">
        <button type="button" className={view === 'staff' ? 'active' : ''} aria-pressed={view === 'staff'} onClick={() => setView('staff')}><UsersRound size={16}/> Scheduled staff</button>
        <button type="button" className={view === 'unassigned' ? 'active' : ''} aria-pressed={view === 'unassigned'} onClick={() => setView('unassigned')}><ClipboardList size={16}/> Rooms needing assignment {unassigned.length > 0 && <b>{unassigned.length}</b>}</button>
      </div>
      {data && !data.readOnly && data.date === date && rooms.some(room => room.assignedTo.trim() && !room.complete) && <button type="button" className="hka-bottom-link" style={{marginLeft:'auto'}} disabled={Boolean(busyRoom)} onClick={()=>void clearPendingAssignments()}>Clear pending assignments</button>}
    </div>
    {error && <div className="hka-feedback error" role="alert">{error}</div>}
    {message && <div className="hka-feedback" role="status"><CheckCircle2 size={16}/> {message}</div>}
    {data?.readOnly && <p className="hka-notice">Staff preview is read-only. Return to your own account to make assignments.</p>}
    {data && !data.staffing.hasSchedule && <p className="hka-notice">No staff schedule has been entered for this date. Assignments can still be made from active staff, but no one is marked on site.</p>}
    {loading && !data && <div className="hka-loading">Loading daily assignments…</div>}
    {data && data.date !== date && <div className="hka-loading">Loading {date}…</div>}
    {data && data.date === date && view === 'staff' && <>
      {onSite.length === 0 ? <div className="hka-empty">There are no housekeeping or hospitality staff scheduled on site for this date. Check Staff & Scheduling or use the rooms view to assign an active employee.</div> :
        <div className="hka-staff-grid">{onSite.map(staffCard)}</div>}
      {offSite.length > 0 && <details className="hka-details"><summary>Assigned employees who are not scheduled on site ({offSite.length})</summary>
        <p>Review these assignments, especially if someone called off or did not show up.</p>
        <div className="hka-staff-grid">{offSite.map(staffCard)}</div>
      </details>}
      {unassigned.length > 0 && <button className="hka-bottom-link" type="button" onClick={() => setView('unassigned')}>View {unassigned.length} unassigned room{unassigned.length === 1 ? '' : 's'} →</button>}
    </>}
    {data && data.date === date && view === 'unassigned' && <div className="hka-room-workspace">
      <div className="hka-list-top">
        <label className="hka-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a room or housekeeper"/></label>
        <label className="hka-show-all"><input type="checkbox" checked={showAssigned} onChange={event => setShowAssigned(event.target.checked)}/> Include already assigned</label>
      </div>
      {filteredUnassigned.length ? <div className="hka-room-list">{filteredUnassigned.map(roomCard)}</div> :
        <div className="hka-empty">{work.length === 0 ? 'No room cleaning or refresh assignments are needed for this date.' : 'All applicable rooms have assignments. Toggle “Include already assigned” to review or reassign.'}</div>}
    </div>}
    <footer className="hka-footer">Assignments save immediately to the existing housekeeping day record. Completed work and inspections remain in their current workflows.</footer>
  </div>
}
