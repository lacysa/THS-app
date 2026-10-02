'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, RefreshCw, Wrench } from 'lucide-react'

type Room = { id:string; name:string; sort_order:number }
type Staff = { id:string; name:string }
type Ticket = {
  id:string
  room_id:string|null
  roomName:string|null
  area:string|null
  title:string
  description:string|null
  priority:'low'|'medium'|'high'|'urgent'
  status:'open'|'in_progress'|'waiting'|'complete'
  assigned_staff_id:string|null
  assignedName:string|null
  completed_at:string|null
  completedByName:string|null
  include_in_shift_report:boolean
  created_at:string
}

const areas = ['Lobby','Kitchen','Laundry','Exterior','Grounds','Mechanical','Office','Other']
const statusLabels:Record<string,string> = { open:'Open', in_progress:'In progress', waiting:'Waiting', complete:'Complete' }

export default function MaintenanceBoard() {
  const [rooms,setRooms] = useState<Room[]>([])
  const [tickets,setTickets] = useState<Ticket[]>([])
  const [staff,setStaff] = useState<Staff[]>([])
  const [canManage,setCanManage] = useState(false)
  const [loading,setLoading] = useState(true)
  const [message,setMessage] = useState('')
  const [filter,setFilter] = useState<'all'|'open'|'urgent'|'completed'>('open')
  const [expanded,setExpanded] = useState<Record<string,boolean>>({})
  const [locationType,setLocationType] = useState<'room'|'area'>('room')
  const [roomId,setRoomId] = useState('')
  const [area,setArea] = useState('')
  const [title,setTitle] = useState('')
  const [description,setDescription] = useState('')
  const [priority,setPriority] = useState<'low'|'medium'|'high'|'urgent'>('medium')
  const [assignedStaffId,setAssignedStaffId] = useState('')
  const [saving,setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setMessage('')
    try {
      const r = await fetch('/api/maintenance',{ cache:'no-store' })
      const d = await r.json().catch(()=>({}))
      if (!r.ok) throw new Error(d.error || 'Could not load maintenance.')
      setRooms(d.rooms || [])
      setTickets(d.tickets || [])
      setStaff(d.maintenanceStaff || [])
      setCanManage(Boolean(d.canManage))
      setExpanded(current => {
        if (Object.keys(current).length) return current
        const next:Record<string,boolean> = {}
        for (const t of d.tickets || []) {
          const key = t.room_id ? `room:${t.room_id}` : `area:${t.area || 'Other'}`
          if (t.status !== 'complete') next[key] = true
        }
        return next
      })
    } catch (e:any) {
      setMessage(e?.message || 'Could not load maintenance.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{ void load() },[])

  async function createTicket() {
    if (!title.trim() || (locationType==='room' ? !roomId : !area)) {
      setMessage('Choose a location and enter a ticket title.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const r = await fetch('/api/maintenance',{
        method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({
          roomId: locationType==='room' ? roomId : null,
          area: locationType==='area' ? area : null,
          title, description, priority, assignedStaffId: assignedStaffId || null,
          includeInShiftReport:true
        })
      })
      const d = await r.json().catch(()=>({}))
      if (!r.ok) throw new Error(d.error || 'Could not create maintenance ticket.')
      setTitle(''); setDescription(''); setPriority('medium'); setAssignedStaffId('')
      await load()
      setMessage('Maintenance ticket created.')
    } catch (e:any) {
      setMessage(e?.message || 'Could not create maintenance ticket.')
    } finally { setSaving(false) }
  }

  async function updateTicket(id:string, update:any) {
    if (!canManage) return
    setTickets(current => current.map(t => t.id===id ? {...t,...update} : t))
    const r = await fetch('/api/maintenance',{
      method:'PATCH', headers:{'content-type':'application/json'},
      body:JSON.stringify({ id, ...update })
    })
    if (!r.ok) {
      const d = await r.json().catch(()=>({}))
      setMessage(d.error || 'Could not update maintenance ticket.')
      await load()
    } else {
      await load()
    }
  }

  const visibleTickets = useMemo(()=>tickets.filter(t=>{
    if (filter==='open') return t.status!=='complete'
    if (filter==='urgent') return t.status!=='complete' && t.priority==='urgent'
    if (filter==='completed') {
      if (t.status!=='complete' || !t.completed_at) return false
      const ymd = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t.completed_at))
      return ymd === new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
    }
    return true
  }),[tickets,filter])

  const groups = useMemo(()=>{
    const map = new Map<string,{key:string;label:string;sort:number;tickets:Ticket[]}>()
    for (const room of rooms) map.set(`room:${room.id}`,{key:`room:${room.id}`,label:room.name,sort:room.sort_order,tickets:[]})
    for (const ticket of visibleTickets) {
      const key = ticket.room_id ? `room:${ticket.room_id}` : `area:${ticket.area || 'Other'}`
      if (!map.has(key)) map.set(key,{key,label:ticket.area || 'Other',sort:1000,tickets:[]})
      map.get(key)!.tickets.push(ticket)
    }
    return Array.from(map.values())
      .filter(g=>g.tickets.length>0)
      .sort((a,b)=>a.sort-b.sort || a.label.localeCompare(b.label))
  },[rooms,visibleTickets])

  return <div className="maintenance-page">
    <div className="maint-sticky-bar">
      <div className="maint-filter-row">
        {(['open','urgent','completed','all'] as const).map(value =>
          <button key={value} type="button" className={filter===value?'active':''} onClick={()=>setFilter(value)}>
            {value==='open'?'Open only':value==='urgent'?'Urgent':value==='completed'?'Completed today':'All'}
          </button>
        )}
      </div>
      <button type="button" className="ops-secondary-btn" onClick={load}><RefreshCw size={15}/> Refresh</button>
    </div>

    {message && <div className="module-message">{message}</div>}

    <div className="maint-add-card">
      <div className="module-kicker">New maintenance item</div>
      <div className="maint-form-grid">
        <label>Location type
          <select value={locationType} onChange={e=>setLocationType(e.target.value as any)}>
            <option value="room">Guest room</option><option value="area">Property area</option>
          </select>
        </label>
        {locationType==='room' ? <label>Room
          <select value={roomId} onChange={e=>setRoomId(e.target.value)}><option value="">Select room</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>
        </label> : <label>Area
          <select value={area} onChange={e=>setArea(e.target.value)}><option value="">Select area</option>{areas.map(a=><option key={a}>{a}</option>)}</select>
        </label>}
        <label>Priority
          <select value={priority} onChange={e=>setPriority(e.target.value as any)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select>
        </label>
        <label>Assign to
          <select value={assignedStaffId} onChange={e=>setAssignedStaffId(e.target.value)}><option value="">Unassigned</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label className="wide">Issue / task
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Shower pressure low" />
        </label>
        <label className="wide">Details
          <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="What was observed, what has been tried, parts needed, etc." />
        </label>
      </div>
      <div style={{marginTop:10}}><button type="button" className="ops-primary-btn" onClick={createTicket} disabled={saving}><Plus size={15}/>{saving?'Adding…':'Add maintenance ticket'}</button></div>
    </div>

    {loading ? <div className="module-empty">Loading maintenance…</div> : groups.length===0 ? <div className="maint-empty">No maintenance tickets match this view.</div> :
      <div className="maint-room-list">
        {groups.map(group=>{
          const open = group.tickets.filter(t=>t.status!=='complete').length
          const urgent = group.tickets.filter(t=>t.status!=='complete'&&t.priority==='urgent').length
          const isOpen = expanded[group.key] !== false
          return <section key={group.key} className="maint-room-card">
            <button type="button" className="maint-room-header" onClick={()=>setExpanded(cur=>({...cur,[group.key]:!isOpen}))}>
              <span className="maint-room-title">{isOpen?<ChevronDown size={16}/>:<ChevronRight size={16}/>}<Wrench size={15}/>{group.label}</span>
              <span className="maint-room-summary">{open} open{urgent?` · ${urgent} urgent`:''} · {group.tickets.length} shown</span>
            </button>
            {isOpen && <div className="maint-ticket-list">
              {group.tickets.map(ticket=><div key={ticket.id} className="maint-ticket">
                <div><strong>{ticket.title}</strong>{ticket.description && <small>{ticket.description}</small>}<small>Created {new Date(ticket.created_at).toLocaleString()}</small></div>
                <div><span className={`maint-priority ${ticket.priority}`}>{ticket.priority}</span>{canManage && <select value={ticket.priority} onChange={e=>updateTicket(ticket.id,{priority:e.target.value})} style={{marginTop:5}}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select>}</div>
                <div>{canManage ? <select value={ticket.status} onChange={e=>updateTicket(ticket.id,{status:e.target.value})}>{Object.entries(statusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select> : <span className="shift-badge">{statusLabels[ticket.status]}</span>}</div>
                <div className="maint-assignee">{canManage ? <select value={ticket.assigned_staff_id || ''} onChange={e=>updateTicket(ticket.id,{assignedStaffId:e.target.value})}><option value="">Unassigned</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select> : <small>{ticket.assignedName || 'Unassigned'}</small>}</div>
                <div className="maint-completed"><small>{ticket.status==='complete' ? `Completed${ticket.completedByName?` by ${ticket.completedByName}`:''}` : ticket.include_in_shift_report ? 'Included in shift report' : 'Not in shift report'}</small></div>
              </div>)}
            </div>}
          </section>
        })}
      </div>
    }
  </div>
}
