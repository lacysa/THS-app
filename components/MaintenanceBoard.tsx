'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Wrench } from 'lucide-react'

type Room = {id:string,name:string,sort_order:number}
type Ticket = {
  id:string
  room_id:string|null
  area:string|null
  title:string
  description:string|null
  priority:string
  status:string
  assigned_to:string|null
  created_at:string
  completed_at:string|null
  rooms?:{name:string}|null
}

const priorities = ['Normal','High','Urgent']
const statuses = ['Open','In Progress','Waiting','Complete']

export default function MaintenanceBoard() {
  const [rooms,setRooms] = useState<Room[]>([])
  const [tickets,setTickets] = useState<Ticket[]>([])
  const [filter,setFilter] = useState('Open')
  const [message,setMessage] = useState('')
  const [form,setForm] = useState({roomId:'',area:'',title:'',description:'',priority:'Normal',assignedTo:''})

  async function load() {
    setMessage('')
    const r = await fetch('/api/maintenance/tickets',{cache:'no-store'})
    const d = await r.json().catch(()=>({}))
    if (!r.ok) setMessage(d.error || 'Could not load maintenance tickets.')
    else { setRooms(d.rooms || []); setTickets(d.tickets || []) }
  }

  useEffect(()=>{ void load() },[])

  async function createTicket() {
    if (!form.title.trim()) { setMessage('Please enter an issue/title.'); return }
    const r = await fetch('/api/maintenance/tickets',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(form)
    })
    const d = await r.json().catch(()=>({}))
    if (!r.ok) { setMessage(d.error || 'Could not create ticket.'); return }
    setForm({roomId:'',area:'',title:'',description:'',priority:'Normal',assignedTo:''})
    setMessage('Maintenance ticket created.')
    await load()
  }

  async function setStatus(id:string,status:string) {
    const r = await fetch('/api/maintenance/tickets',{
      method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id,status})
    })
    const d = await r.json().catch(()=>({}))
    if (!r.ok) { setMessage(d.error || 'Could not update ticket.'); return }
    setTickets(current=>current.map(t=>t.id===id?{...t,status,completed_at:status==='Complete'?new Date().toISOString():null}:t))
  }

  const visible = useMemo(()=>filter==='All'?tickets:tickets.filter(t=>filter==='Open'?t.status!=='Complete':t.status===filter),[tickets,filter])

  return <div className="ops-module maintenance-module">
    <div className="module-toolbar">
      <div><div className="module-kicker">Operations</div><h1>Maintenance</h1><p>Track room issues, repairs, assignments, and completion.</p></div>
      <button className="ops-secondary-btn" onClick={load}><RefreshCw size={16}/>Refresh</button>
    </div>

    {message && <div className="module-message">{message}</div>}

    <section className="ops-panel new-ticket-panel">
      <div className="panel-heading"><Wrench size={18}/><div><h2>New maintenance ticket</h2><p>Room or property issue that needs follow-up.</p></div></div>
      <div className="ticket-form-grid">
        <label>Room<select value={form.roomId} onChange={e=>setForm({...form,roomId:e.target.value})}><option value="">Common area / no room</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>Area<input value={form.area} onChange={e=>setForm({...form,area:e.target.value})} placeholder="Deck, kitchen, office…" /></label>
        <label className="wide">Issue<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="What needs attention?" /></label>
        <label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}>{priorities.map(p=><option key={p}>{p}</option>)}</select></label>
        <label>Assigned to<input value={form.assignedTo} onChange={e=>setForm({...form,assignedTo:e.target.value})} placeholder="Staff name" /></label>
        <label className="wide">Details<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Notes, troubleshooting, guest impact…" /></label>
      </div>
      <div className="panel-actions"><button className="ops-primary-btn" onClick={createTicket}><Plus size={16}/>Create ticket</button></div>
    </section>

    <div className="ticket-list-toolbar">
      <strong>Tickets</strong>
      <div className="segmented">{['Open','In Progress','Waiting','Complete','All'].map(s=><button key={s} className={filter===s?'active':''} onClick={()=>setFilter(s)}>{s}</button>)}</div>
    </div>

    <div className="maintenance-grid">
      {visible.length===0 ? <div className="module-empty">No tickets in this view.</div> : visible.map(ticket=><article key={ticket.id} className={`maintenance-ticket priority-${ticket.priority.toLowerCase()}`}>
        <div className="ticket-top"><div><span className="ticket-location">{ticket.rooms?.name || ticket.area || 'Property'}</span><h3>{ticket.title}</h3></div><span className={`priority-pill ${ticket.priority.toLowerCase()}`}>{ticket.priority}</span></div>
        {ticket.description && <p>{ticket.description}</p>}
        <div className="ticket-meta"><span>Status: <strong>{ticket.status}</strong></span><span>Assigned: <strong>{ticket.assigned_to || 'Unassigned'}</strong></span></div>
        <div className="ticket-actions">{statuses.map(s=><button key={s} className={ticket.status===s?'active':''} onClick={()=>setStatus(ticket.id,s)}>{s}</button>)}</div>
      </article>)}
    </div>
  </div>
}
