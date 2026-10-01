'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Save, BedDouble } from 'lucide-react'

type RoomRow = {
  roomId:string
  roomName:string
  sortOrder:number
  reservationStatus:string
  serviceType:string
  stripHold:string
  assignedTo:string
  cleanOrder:number|null
  complete:boolean
  readyForInspection:boolean
  roomCondition:string
  nextShiftCondition:string
  notes:string
}

const reservationOptions = ['', 'Checkout', 'Out/In', 'Stayover', 'Arrival', 'Blocked']
const serviceOptions = ['', 'Full Clean', 'Refresh']
const stripOptions = ['', 'Strip', 'Hold']
const conditionOptions = ['', 'Occupied', 'Cleaning', 'Ready for Inspection', 'Vacant (Clean)', 'Vacant (Dirty)', 'Vacant (Blocked)', 'Out of Order']
const nextShiftOptions = ['', 'Occupied', 'Vacant (Clean)', 'Vacant (Dirty)', 'Vacant (Blocked)', 'Out of Order']

function todayDetroit() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
}

export default function HousekeepingBoard() {
  const [date,setDate] = useState(todayDetroit())
  const [rows,setRows] = useState<RoomRow[]>([])
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [message,setMessage] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')
    const r = await fetch(`/api/housekeeping/day?date=${encodeURIComponent(date)}`, {cache:'no-store'})
    const d = await r.json().catch(()=>({}))
    if (!r.ok) setMessage(d.error || 'Could not load housekeeping board.')
    else setRows(d.rows || [])
    setLoading(false)
  }

  useEffect(()=>{ void load() },[date])

  function patch(roomId:string, update:Partial<RoomRow>) {
    setRows(current => current.map(r => r.roomId === roomId ? {...r,...update} : r))
  }

  async function save() {
    setSaving(true)
    setMessage('Saving…')
    const r = await fetch('/api/housekeeping/day', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({serviceDate:date,rows})
    })
    const d = await r.json().catch(()=>({}))
    setMessage(r.ok ? 'Housekeeping board saved.' : (d.error || 'Could not save housekeeping board.'))
    setSaving(false)
  }

  const summary = useMemo(()=>({
    fullCleans: rows.filter(r=>r.serviceType==='Full Clean').length,
    refreshes: rows.filter(r=>r.serviceType==='Refresh').length,
    complete: rows.filter(r=>r.complete).length,
    inspect: rows.filter(r=>r.readyForInspection).length
  }),[rows])

  return <div className="ops-module hsk-module">
    <div className="module-toolbar">
      <div>
        <div className="module-kicker">Housekeeping</div>
        <h1>Daily Room Board</h1>
        <p>Digital version of the current housekeeping assignment sheet.</p>
      </div>
      <div className="toolbar-actions">
        <label className="date-control">Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
        <button className="ops-secondary-btn" onClick={load}><RefreshCw size={16}/>Refresh</button>
        <button className="ops-primary-btn" onClick={save} disabled={saving}><Save size={16}/>{saving?'Saving…':'Save changes'}</button>
      </div>
    </div>

    {message && <div className="module-message">{message}</div>}

    <div className="metric-row">
      <div className="metric-card"><span>Full cleans</span><strong>{summary.fullCleans}</strong></div>
      <div className="metric-card"><span>Refreshes</span><strong>{summary.refreshes}</strong></div>
      <div className="metric-card"><span>Complete</span><strong>{summary.complete}</strong></div>
      <div className="metric-card"><span>RF / Inspect</span><strong>{summary.inspect}</strong></div>
    </div>

    {loading ? <div className="module-empty">Loading rooms…</div> :
      <div className="hsk-table-wrap">
        <table className="hsk-table">
          <thead><tr>
            <th>Room</th><th>Status</th><th>Out / Refresh</th><th>Strip / Hold</th><th>Staff</th><th>Order</th><th>Complete</th><th>RF</th><th>Room condition</th><th>Next shift</th><th>Notes</th>
          </tr></thead>
          <tbody>{rows.map(row=><tr key={row.roomId}>
            <td className="room-cell"><BedDouble size={15}/><strong>{row.roomName}</strong></td>
            <td><select value={row.reservationStatus} onChange={e=>patch(row.roomId,{reservationStatus:e.target.value})}>{reservationOptions.map(v=><option key={v} value={v}>{v||'—'}</option>)}</select></td>
            <td><select value={row.serviceType} onChange={e=>patch(row.roomId,{serviceType:e.target.value})}>{serviceOptions.map(v=><option key={v} value={v}>{v||'—'}</option>)}</select></td>
            <td><select value={row.stripHold} onChange={e=>patch(row.roomId,{stripHold:e.target.value})}>{stripOptions.map(v=><option key={v} value={v}>{v||'—'}</option>)}</select></td>
            <td><input value={row.assignedTo} onChange={e=>patch(row.roomId,{assignedTo:e.target.value})} placeholder="Staff" /></td>
            <td><input className="order-input" type="number" min="1" value={row.cleanOrder ?? ''} onChange={e=>patch(row.roomId,{cleanOrder:e.target.value?Number(e.target.value):null})} /></td>
            <td className="check-cell"><input type="checkbox" checked={row.complete} onChange={e=>patch(row.roomId,{complete:e.target.checked})}/></td>
            <td className="check-cell"><input type="checkbox" checked={row.readyForInspection} onChange={e=>patch(row.roomId,{readyForInspection:e.target.checked,roomCondition:e.target.checked?'Ready for Inspection':row.roomCondition})}/></td>
            <td><select value={row.roomCondition} onChange={e=>patch(row.roomId,{roomCondition:e.target.value})}>{conditionOptions.map(v=><option key={v} value={v}>{v||'—'}</option>)}</select></td>
            <td><select value={row.nextShiftCondition} onChange={e=>patch(row.roomId,{nextShiftCondition:e.target.value})}>{nextShiftOptions.map(v=><option key={v} value={v}>{v||'—'}</option>)}</select></td>
            <td><input value={row.notes} onChange={e=>patch(row.roomId,{notes:e.target.value})} placeholder="Notes" /></td>
          </tr>)}</tbody>
        </table>
      </div>
    }
  </div>
}
