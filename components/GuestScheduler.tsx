'use client'

import { useEffect, useState } from 'react'

type Room = { id:string; name:string; sort_order:number }
type Slot = { value:string; label:string; available:number; full:boolean }
type Scheduled = { id:string; roomId:string; room:string; timeSlot:string; displayTime:string; menuSubmitted:boolean; menuUrl:string|null }

export default function GuestScheduler() {
  const [loading,setLoading] = useState(true)
  const [data,setData] = useState<any>(null)
  const [roomId,setRoomId] = useState('')
  const [lastName,setLastName] = useState('')
  const [timeSlot,setTimeSlot] = useState('')
  const [message,setMessage] = useState('')
  const [saving,setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/guest/bootstrap',{ cache:'no-store' })
    const json = await res.json()
    setData(json)
    setLoading(false)
  }

  useEffect(()=>{ load() },[])

  async function reserve() {
    setMessage('')
    if (!roomId || !lastName.trim() || !timeSlot) {
      setMessage('Please choose your room, enter the reservation last name, and choose a delivery time.')
      return
    }

    setSaving(true)
    const res = await fetch('/api/guest/reserve',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ roomId,lastName,timeSlot })
    })
    const json = await res.json()
    setSaving(false)

    if (!res.ok || !json.ok) {
      setMessage(json.message || 'We could not reserve that time. Please try again.')
      await load()
      return
    }

    window.location.href = json.redirectUrl
  }

  if (loading) {
    return <div className="card hero"><div className="eyebrow">The Hotel Saugatuck</div><h1>Breakfast</h1><p className="muted">Loading breakfast delivery times…</p></div>
  }

  if (!data?.open) {
    return <div className="card hero"><div className="eyebrow">The Hotel Saugatuck</div><h1>Breakfast</h1><div className="notice">{data?.reason || 'Breakfast ordering is currently closed.'}</div></div>
  }

  const scheduled:Scheduled[] = data.scheduled || []

  return (
    <div className="card">
      <div className="hero">
        <div className="eyebrow">The Hotel Saugatuck</div>
        <h1>Breakfast Delivery</h1>
        <p className="muted">Breakfast for <strong>{data.serviceDateLabel}</strong></p>
      </div>

      <div className="grid" style={{gap:26}}>
        <section>
          <h2>1. Choose your room</h2>
          <div className="rooms">
            {data.rooms.map((room:Room)=>(
              <button
                key={room.id}
                className={`choice ${roomId===room.id?'active':''}`}
                onClick={()=>setRoomId(room.id)}
              >
                {room.name}
              </button>
            ))}
          </div>
        </section>

        <section className="field">
          <label>Last name on reservation</label>
          <input
            value={lastName}
            onChange={e=>setLastName(e.target.value)}
            placeholder="Enter last name"
            autoComplete="family-name"
          />
        </section>

        <section>
          <h2>2. Choose a delivery time</h2>
          <p className="muted">Up to {data.maxRoomsPerSlot} rooms may select each {data.slotMinutes}-minute delivery window.</p>
          <div className="slots">
            {data.slots.map((slot:Slot)=>(
              <button
                key={slot.value}
                disabled={slot.full}
                className={`choice ${timeSlot===slot.value?'active':''} ${slot.full?'disabled':''}`}
                onClick={()=>setTimeSlot(slot.value)}
              >
                {slot.label}
                <div style={{fontSize:11,marginTop:4}}>{slot.full?'Full':`${slot.available} available`}</div>
              </button>
            ))}
          </div>
        </section>

        {message && <div className="notice error">{message}</div>}

        <button className="btn sage" disabled={saving} onClick={reserve}>
          {saving ? 'Reserving…' : 'Reserve time & continue to breakfast menu'}
        </button>

        <section className="guest-status-section">
          <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'end',flexWrap:'wrap'}}>
            <div>
              <h2 style={{marginBottom:4}}>Scheduled / Menu submitted</h2>
              <p className="muted" style={{margin:0}}>Already chose a delivery time? Rooms still needing a menu can continue below. Once a menu is received, the menu link is locked.</p>
            </div>
          </div>

          {scheduled.length===0 ? (
            <div className="notice" style={{marginTop:14}}>No rooms have scheduled breakfast yet.</div>
          ) : (
            <div className="scheduled-grid" style={{marginTop:14}}>
              {scheduled.map(item=> item.menuSubmitted ? (
                <div
                  key={item.id}
                  className="scheduled-card scheduled-card-locked"
                  aria-disabled="true"
                >
                  <div>
                    <strong>{item.room}</strong>
                    <div className="muted" style={{marginTop:3}}>{item.displayTime}</div>
                  </div>
                  <span className="status-chip done">Menu submitted · locked</span>
                </div>
              ) : (
                <a
                  key={item.id}
                  href={item.menuUrl || '#'}
                  className="scheduled-card"
                  aria-disabled={!item.menuUrl}
                  onClick={e=>{ if (!item.menuUrl) e.preventDefault() }}
                >
                  <div>
                    <strong>{item.room}</strong>
                    <div className="muted" style={{marginTop:3}}>{item.displayTime}</div>
                  </div>
                  <span className="status-chip pending">Scheduled · menu needed</span>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
