'use client'
import {useEffect,useMemo,useState} from 'react'
import {CalendarDays,ChevronLeft,ChevronRight,RefreshCw} from 'lucide-react'
import OpsRoomHub from '@/components/OpsRoomHub'

type Cell={reservationId:string;date:string;roomId:string;status:string;guest:string;arrival:string;departure:string;blocked:boolean;condition:string;lateArrival:boolean}
type Data={start:string;days:string[];rooms:{id:string;name:string}[];cells:Cell[];holds:{date:string;roomId:string}[];notes:{date:string;roomId:string;text:string}[]}
function shift(day:string,n:number){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function pretty(day:string){return new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'))}
function occupied(c:Cell){return Boolean(c.guest&&c.arrival&&c.departure&&c.date>=c.arrival&&c.date<c.departure)}
export default function ReservationCalendar({serviceDate}:{serviceDate:string}){
  const [start,setStart]=useState(()=>shift(serviceDate,-2))
  const [data,setData]=useState<Data|null>(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [activeRoom,setActiveRoom]=useState<{roomId:string;date:string;reservationId?:string}|null>(null)
  const [reload,setReload]=useState(0)
  useEffect(()=>{
    let active=true
    setLoading(true);setError('')
    fetch('/api/reservations/calendar?start='+encodeURIComponent(start),{cache:'no-store'})
      .then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load calendar');return d as Data})
      .then(d=>{if(active){setData(d)}})
      .catch(e=>{if(active){setData(null);setError(String(e.message||e))}})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[start,reload])
  const cells=useMemo(()=>new Map((data?.cells||[]).map(c=>[c.date+'|'+c.roomId,c])),[data])
  const notes=useMemo(()=>new Map((data?.notes||[]).map(n=>[n.date+'|'+n.roomId,n])),[data])
  const holds=useMemo(()=>new Set((data?.holds||[]).map(h=>h.date+'|'+h.roomId)),[data])
  return <div className="ths-calendar">
    <div className="ths-calendar-toolbar">
      <div><strong>Ops</strong><small>7-day window · 2 previous days by default</small></div>
      <div className="ths-calendar-controls">
        <button type="button" title="Previous week" aria-label="Previous week" onClick={()=>setStart(shift(start,-7))}><ChevronLeft size={18}/></button>
        <button type="button" onClick={()=>setStart(shift(serviceDate,-2))}>Today</button>
        <button type="button" title="Next week" aria-label="Next week" onClick={()=>setStart(shift(start,7))}><ChevronRight size={18}/></button>
        <button type="button" aria-label="Refresh calendar" onClick={()=>setReload(n=>n+1)}><RefreshCw size={16}/></button>
      </div>
    </div>
    <div className="ths-calendar-date"><CalendarDays size={17}/><input aria-label="First date" type="date" value={start} onChange={e=>{if(e.target.value)setStart(e.target.value)}}/><div className="ths-calendar-shortcuts"><button type="button" aria-pressed={start===shift(serviceDate,-2)} onClick={()=>setStart(shift(serviceDate,-2))}>Daily ops</button><button type="button" aria-pressed={start===shift(serviceDate,-6)} onClick={()=>setStart(shift(serviceDate,-6))}>Past 7 days</button></div></div>
    <p className="ths-calendar-help">Daily ops shows the previous 2 days, today, and the next 4. Past 7 days shows the last 6 days plus today. Swipe sideways to browse. Each teal bar represents an imported guest stay across its booked nights. Hatched dates represent room holds.</p>
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
              return <div key={day} className={'ths-calendar-day-bg '+(blocked?'blocked':c?'imported':'unknown')}>
                <button type="button" className={'ths-calendar-empty-slot'+(note&&!coveredByStay?' has-note':'')} title={note?.text||room.name+' · '+pretty(day)} aria-label={'Open '+room.name+' on '+pretty(day)+(note&&!coveredByStay?': '+note.text:'')} onClick={()=>setActiveRoom({roomId:room.id,date:day})}>
                  {note&&!coveredByStay&&<span className="ths-calendar-note-text">{note.text}</span>}
                </button>
              </div>
            })}
            {bars.map(bar=><button key={bar.reservationId} type="button" className="ths-calendar-stay" style={{gridColumn:`${bar.first+1} / ${bar.last+2}`}} title={bar.guest+' · '+bar.arrival+' to '+bar.departure} onClick={()=>setActiveRoom({roomId:room.id,date:data.days.includes(serviceDate)&&serviceDate>=bar.arrival&&serviceDate<bar.departure?serviceDate:bar.date,reservationId:bar.reservationId})}>
              <span className="ths-calendar-stay-text"><strong>{bar.guest}</strong><small>{bar.arrival} → {bar.departure}</small></span>
            </button>)}
          </div>
        </div>
      })}
    </div></div>}
    {activeRoom&&<OpsRoomHub key={activeRoom.roomId+'|'+activeRoom.date+'|'+(activeRoom.reservationId||'')} roomId={activeRoom.roomId} date={activeRoom.date} reservationId={activeRoom.reservationId} onClose={()=>setActiveRoom(null)} onUpdate={()=>setReload(n=>n+1)}/>}
    <p className="ths-calendar-caveat">This view reflects the latest imported reservation links, not live PMS inventory or prices. Gray/blank cells must not be treated as confirmed availability. No reservation or breakfast data is changed here.</p>
  </div>
}
