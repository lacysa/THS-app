'use client'
import {useEffect,useMemo,useState} from 'react'
import {CalendarDays,ChevronLeft,ChevronRight,RefreshCw,X} from 'lucide-react'

type Cell={reservationId:string;date:string;roomId:string;status:string;guest:string;arrival:string;departure:string;blocked:boolean;condition:string;lateArrival:boolean}
type Data={start:string;days:string[];rooms:{id:string;name:string}[];cells:Cell[];holds:{date:string;roomId:string}[];notes:{date:string;roomId:string;text:string}[]}
function shift(day:string,n:number){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function pretty(day:string){return new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'))}
function occupied(c:Cell){return Boolean(c.guest&&c.arrival&&c.departure&&c.date>=c.arrival&&c.date<c.departure)}
export default function ReservationCalendar({serviceDate,onOpenRoom}:{serviceDate:string;onOpenRoom?:(id:string)=>void}){
  const [start,setStart]=useState(serviceDate)
  const [data,setData]=useState<Data|null>(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [selected,setSelected]=useState<Cell|null>(null)
  const [selectedNote,setSelectedNote]=useState<{date:string;roomId:string;text:string}|null>(null)
  const [reload,setReload]=useState(0)
  useEffect(()=>{
    let active=true
    setLoading(true);setError('')
    fetch('/api/reservations/calendar?start='+encodeURIComponent(start),{cache:'no-store'})
      .then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load calendar');return d as Data})
      .then(d=>{if(active){setData(d);setSelected(null)}})
      .catch(e=>{if(active){setData(null);setError(String(e.message||e))}})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[start,reload])
  const cells=useMemo(()=>new Map((data?.cells||[]).map(c=>[c.date+'|'+c.roomId,c])),[data])
  const notes=useMemo(()=>new Map((data?.notes||[]).map(n=>[n.date+'|'+n.roomId,n])),[data])
  const holds=useMemo(()=>new Set((data?.holds||[]).map(h=>h.date+'|'+h.roomId)),[data])
  return <div className="ths-calendar">
    <div className="ths-calendar-toolbar">
      <div><strong>Ops</strong><small>Room calendar · 7-day view</small></div>
      <div className="ths-calendar-controls">
        <button type="button" title="Previous week" aria-label="Previous week" onClick={()=>setStart(shift(start,-7))}><ChevronLeft size={18}/></button>
        <button type="button" onClick={()=>setStart(serviceDate)}>Today</button>
        <button type="button" title="Next week" aria-label="Next week" onClick={()=>setStart(shift(start,7))}><ChevronRight size={18}/></button>
        <button type="button" aria-label="Refresh calendar" onClick={()=>setReload(n=>n+1)}><RefreshCw size={16}/></button>
      </div>
    </div>
    <div className="ths-calendar-date"><CalendarDays size={17}/><input aria-label="First date" type="date" value={start} onChange={e=>{if(e.target.value)setStart(e.target.value)}}/></div>
    <p className="ths-calendar-help">Swipe sideways to browse. Each teal bar represents an imported guest stay across its booked nights. Hatched dates represent room holds.</p>
    {error&&<div role="alert" className="ths-ops-empty">{error}</div>}
    {loading&&<div className="ths-ops-empty">Loading calendar…</div>}
    {data&&!loading&&<div className="ths-calendar-scroll" tabIndex={0} aria-label="Scrollable seven-day reservation calendar"><div className="ths-calendar-grid" style={{gridTemplateColumns:'118px repeat(7, minmax(118px, 1fr))'}}>
      <div className="ths-calendar-corner">Room</div>
      {data.days.map(day=><div className={day===serviceDate?'ths-calendar-day today':'ths-calendar-day'} key={day}>{pretty(day)}</div>)}
      {data.rooms.map(room=>{
        const matching=data.cells.filter(c=>c.roomId===room.id)
        const stays=new Map<string,Cell>()
        for(const c of matching)if(occupied(c)&&c.reservationId&&!stays.has(c.reservationId))stays.set(c.reservationId,c)
        const bars=[...stays.values()].map(c=>{
          const first=data.days.findIndex(day=>day>=c.arrival&&day<c.departure)
          const last=data.days.findLastIndex(day=>day>=c.arrival&&day<c.departure)
          return {...c,first,last}
        }).filter(c=>c.first>=0&&c.last>=c.first)
        return <div className="ths-calendar-row" key={room.id} style={{display:'contents'}}>
          <div className="ths-calendar-room">{room.name}</div>
          <div className="ths-calendar-band">
            {data.days.map(day=>{
              const c=cells.get(day+'|'+room.id)
              const blocked=holds.has(day+'|'+room.id)||Boolean(c?.blocked)
              const note=notes.get(day+'|'+room.id)
              const coveredByStay=[...stays.values()].some(stay=>day>=stay.arrival&&day<stay.departure)
              return <div key={day} className={'ths-calendar-day-bg '+(blocked?'blocked':c?'imported':'unknown')} title={room.name+' · '+pretty(day)+(blocked?' · Blocked':'')}>
                {note&&!coveredByStay&&<button type="button" className="ths-calendar-note" title={note.text} aria-label={'Room note for '+room.name+' on '+pretty(day)+': '+note.text} onClick={()=>setSelectedNote(note)}><span className="ths-calendar-note-text">{note.text}</span></button>}
              </div>
            })}
            {bars.map(bar=><button key={bar.reservationId} type="button" className="ths-calendar-stay" style={{gridColumn:`${bar.first+1} / ${bar.last+2}`}} title={bar.guest+' · '+bar.arrival+' to '+bar.departure} onClick={()=>setSelected(bar)}>
              <strong>{bar.guest}</strong><small>{bar.arrival} → {bar.departure}</small>
            </button>)}
          </div>
        </div>
      })}
    </div></div>}
    {selectedNote&&<div className="ths-calendar-reservation-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setSelectedNote(null)}}>
      <section className="ths-calendar-reservation-sheet" role="dialog" aria-modal="true" aria-label="Room note">
        <header className="ths-calendar-reservation-head">
          <div><span>Room note · {pretty(selectedNote.date)}</span><strong>{data?.rooms.find(r=>r.id===selectedNote.roomId)?.name||'Room'}</strong></div>
          <button type="button" aria-label="Close room note" onClick={()=>setSelectedNote(null)}><X size={20}/></button>
        </header>
        <div className="ths-calendar-reservation-content">
          <p className="ths-calendar-note-full">{selectedNote.text}</p>
          {onOpenRoom&&<button type="button" className="ths-calendar-open-room" onClick={()=>{const roomId=selectedNote.roomId;setSelectedNote(null);onOpenRoom(roomId)}}>Manage room <ChevronRight size={17}/></button>}
        </div>
      </section>
    </div>}
    {selected&&<div className="ths-calendar-reservation-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setSelected(null)}}>
      <section className="ths-calendar-reservation-sheet" role="dialog" aria-modal="true" aria-label="Reservation details">
        <header className="ths-calendar-reservation-head">
          <div><span>Reservation details</span><strong>{selected.guest||'Guest reservation'}</strong></div>
          <button type="button" aria-label="Close reservation" onClick={()=>setSelected(null)}><X size={20}/></button>
        </header>
        <div className="ths-calendar-reservation-content">
          <div className="ths-calendar-reservation-meta">
            <div><span>Room</span><strong>{data?.rooms.find(r=>r.id===selected.roomId)?.name||'Room'}</strong></div>
            <div><span>Arrival</span><strong>{selected.arrival||'—'}</strong></div>
            <div><span>Departure</span><strong>{selected.departure||'—'}</strong></div>
            <div><span>Calendar status</span><strong>{selected.status||'Imported stay'}</strong></div>
          </div>
          <p>Read-only reservation summary from the latest PMS import. Changes to guest information remain in Guests.</p>
          {onOpenRoom&&<button type="button" className="ths-calendar-open-room" onClick={()=>{const roomId=selected.roomId;setSelected(null);onOpenRoom(roomId)}}>Manage room <ChevronRight size={17}/></button>}
        </div>
      </section>
    </div>}
    <p className="ths-calendar-caveat">This view reflects the latest imported reservation links, not live PMS inventory or prices. Gray/blank cells must not be treated as confirmed availability. No reservation or breakfast data is changed here.</p>
  </div>
}
