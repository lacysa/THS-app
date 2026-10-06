'use client'

import { CalendarDays, ChevronLeft, ChevronRight, DoorOpen, Package, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Stay={
  guest_name?:string|null
  door_code?:string|null
  arrival_date?:string|null
  checkout_date?:string|null
  check_in_time?:string|null
  products_raw?:string|null
  dietary_restrictions?:string|null
  guest_comments?:string|null
  innkeeper_notes?:string|null
  reason_for_visit?:string|null
}

type Row={
  roomId:string
  roomName:string
  status:string
  primary:Stay|null
  arriving:Stay|null
  staying:Stay|null
  departing:Stay|null
}

function addDay(value:string,amount:number){
  const d=new Date(value+'T12:00:00Z')
  d.setUTCDate(d.getUTCDate()+amount)
  return d.toISOString().slice(0,10)
}

function pretty(value:string){
  const d=new Date(value+'T12:00:00')
  return new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(d)
}

function cleanDiet(value?:string|null){
  const text=String(value||'').trim()
  return text && !/^(no|none|n\/a|no dietary restrictions)$/i.test(text) ? text : ''
}

function statusClass(value:string){
  return 'reservation-status-'+String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')
}

export default function ReservationsBoard({serviceDate,rows}:{serviceDate:string;rows:Row[]}){
  const router=useRouter()
  const counts={
    arrivals:rows.filter(r=>r.status==='Arrival').length,
    stayovers:rows.filter(r=>r.status==='Stayover').length,
    checkouts:rows.filter(r=>r.status==='Checkout').length,
    outIn:rows.filter(r=>r.status==='Out/In').length
  }

  const setDate=(value:string)=>router.push('/reservations?date='+encodeURIComponent(value))

  return <div className="reservations-page">
    <section className="reservations-hero">
      <div>
        <div className="reservations-kicker">Front office operations</div>
        <h1>Reservations</h1>
        <p>{pretty(serviceDate)}</p>
      </div>
      <div className="reservations-date-controls">
        <button onClick={()=>setDate(addDay(serviceDate,-1))} aria-label="Previous day"><ChevronLeft size={18}/></button>
        <label><CalendarDays size={16}/><input type="date" value={serviceDate} onChange={e=>setDate(e.target.value)}/></label>
        <button onClick={()=>setDate(addDay(serviceDate,1))} aria-label="Next day"><ChevronRight size={18}/></button>
      </div>
    </section>

    <section className="reservations-snapshot">
      <div className="reservations-snapshot-head">
        <div><span>Daily reservation snapshot</span><strong>{rows.length} occupied / changing rooms</strong></div>
        <small>Live from the latest Reservation Sync import</small>
      </div>
      <div className="reservations-summary-grid">
        <div><span>Arrivals</span><strong>{counts.arrivals}</strong></div>
        <div><span>Stayovers</span><strong>{counts.stayovers}</strong></div>
        <div><span>Checkouts</span><strong>{counts.checkouts}</strong></div>
        <div><span>Out / In</span><strong>{counts.outIn}</strong></div>
      </div>
    </section>

    {rows.length===0 ? <section className="reservations-empty">No occupied or changing rooms are currently synced for this date.</section> :
      <section className="reservations-grid">
        {rows.map(row=>{
          const stay=row.arriving||row.primary||row.departing
          const dietary=cleanDiet(stay?.dietary_restrictions)
          return <article className={'reservation-card '+statusClass(row.status)} key={row.roomId}>
            <div className="reservation-card-head">
              <div><strong>{row.roomName}</strong><span>{row.status}</span></div>
              {stay?.door_code && <div className="reservation-door"><DoorOpen size={15}/><b>{stay.door_code}</b></div>}
            </div>

            {row.status==='Out/In' && <div className="reservation-outin">
              <div><span>OUT</span><strong>{row.departing?.guest_name||'—'}</strong></div>
              <div><span>IN</span><strong>{row.arriving?.guest_name||'—'}</strong></div>
            </div>}

            {stay && <div className="reservation-card-body">
              <div className="reservation-pair"><span>Guest</span><strong>{stay.guest_name||'—'}</strong></div>
              <div className="reservation-pair"><span>Stay</span><strong>{stay.arrival_date||'—'} → {stay.checkout_date||'—'}</strong></div>
              <div className="reservation-pair"><span>Check-in</span><strong>{stay.check_in_time||'—'}</strong></div>
              {stay.products_raw&&<div className="reservation-detail"><Package size={14}/><div><span>Packages / products</span><strong>{stay.products_raw}</strong></div></div>}
              {stay.innkeeper_notes&&<div className="reservation-note"><span>Innkeeper</span><p>{stay.innkeeper_notes}</p></div>}
              {stay.guest_comments&&<div className="reservation-note"><span>Guest comment</span><p>{stay.guest_comments}</p></div>}
              {dietary&&<div className="reservation-note dietary"><span>Dietary</span><p>{dietary}</p></div>}
            </div>}
          </article>
        })}
      </section>
    }
  </div>
}
