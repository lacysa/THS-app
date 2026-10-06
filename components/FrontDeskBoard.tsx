'use client'

import { useEffect, useState } from 'react'
import BookingMenuNote from '@/components/BookingMenuNote'

export default function FrontDeskBoard({initialDate}:{initialDate:string}) {
  const [date,setDate] = useState(initialDate)
  const [data,setData] = useState<any>(null)
  const [loading,setLoading] = useState(true)
  const [editing,setEditing] = useState<any>(null)
  const [error,setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`/api/staff/day?date=${date}`,{cache:'no-store'})
      const json = await r.json()
      if (!r.ok) throw new Error(json.message || 'Could not load breakfast data.')
      setData(json)
    } catch (e:any) {
      setData(null)
      setError(e?.message || 'Could not load breakfast data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{ load() },[date])

  async function saveEdit() {
    setError('')
    const r = await fetch('/api/staff/booking',{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(editing)
    })
    const json = await r.json().catch(()=>({}))
    if (!r.ok) {
      setError(json.message || 'Could not save changes.')
      return
    }
    setEditing(null)
    load()
  }

  async function cancel(id:string) {
    if (!confirm('Cancel this breakfast booking?')) return
    setError('')
    const r = await fetch('/api/staff/booking',{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id,status:'cancelled'})
    })
    const json = await r.json().catch(()=>({}))
    if (!r.ok) {
      setError(json.message || 'Could not cancel the booking.')
      return
    }
    load()
  }

  return (
    <div className="grid module-pretty-page front-desk-page" style={{gap:18}}>
      <section className="module-pretty-hero">
        <div>
          <div className="module-kicker">Breakfast operations</div>
          <h1>Front Desk</h1>
          <p>Manage delivery times, missing menus, guest breakfast updates, and room notes.</p>
        </div>
        <div className="module-pretty-hero-stat">
          <span>Service date</span>
          <strong>{date}</strong>
        </div>
      </section>

      <div className="toolbar module-pretty-toolbar">
        <div className="toolbar-left">
          <div className="field"><label>Service date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} /></div>
        </div>
        <div className="toolbar-right"><a className="btn secondary" href="/inventory/front-desk">Inventory</a><button className="btn secondary" onClick={load}>Refresh</button></div>
      </div>

      {error && <div className="notice error">{error}</div>}

      {loading ? <div className="card">Loading…</div> : data && (
        <>
          {data.unmatchedSubmissions.length>0 && (
            <div className="card">
              <h2>Unmatched legacy menus</h2>
              <div className="notice" style={{marginBottom:12}}>
                These older menu submissions could not be linked to a scheduled room. They remain visible in Kitchen for reference.
              </div>
              <div className="timeline">
                {data.unmatchedSubmissions.map((s:any)=>(
                  <div className="ticket" key={s.id}>
                    <div className="ticket-head">
                      <div>
                        <div className="ticket-room">{s.room || 'Unknown room'}</div>
                        <div className="muted">{s.lastName || 'No last name received'}</div>
                      </div>
                      <span className="pill warning">Needs matching</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card fd-breakfast-card">
            <h2>Breakfast schedule</h2>
            <div className="timeline fd-breakfast-list">
              {data.bookings.length===0 && <div className="muted">No breakfast bookings for this date.</div>}
              {data.bookings.map((b:any)=>(
                <div className={`fd-breakfast-pill ${b.menu_submitted?'is-received':'is-missing'}`} id={`booking-${b.id}`} key={b.id}>
                  <div className="fd-breakfast-pill-main">
                    <div className="fd-breakfast-pill-room">
                      <strong>{b.rooms?.name}</strong>
                      <span>{b.taggedOnly ? 'Menu Missing' : b.last_name}</span>
                    </div>
                    <div className="fd-breakfast-pill-status">
                      <span className="pill">{b.displayTime}</span>
                      <span className={`pill ${b.menu_submitted ? 'success' : 'warning'}`}>{b.menu_submitted?'Menu received':'Menu Missing'}</span>
                    </div>
                    {!b.taggedOnly && (
                      <div className="fd-breakfast-pill-actions">
                        <button className="btn secondary" onClick={()=>setEditing({...b,time_slot:String(b.time_slot).slice(0,5)})}>Edit time</button>
                        {b.guest_token && <a className="btn secondary" href={`/breakfast/menu?token=${encodeURIComponent(b.guest_token)}`} target="_blank" rel="noreferrer">Edit menu</a>}
                        <button className="btn danger" onClick={()=>cancel(b.id)}>Cancel</button>
                      </div>
                    )}
                  </div>
                  {!b.taggedOnly && <div className="fd-breakfast-pill-note"><BookingMenuNote bookingId={b.id} initialNote={b.note || ''} /></div>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {editing && data && (
        <div className="card">
          <h2>Edit {editing.rooms?.name}</h2>
          <div className="grid grid-2">
            <div className="field"><label>Last name</label><input value={editing.last_name} onChange={e=>setEditing({...editing,last_name:e.target.value})}/></div>
            <div className="field"><label>Delivery time</label><select value={editing.time_slot} onChange={e=>setEditing({...editing,time_slot:e.target.value})}>
              {data.slots.map((s:any)=><option key={s.value} value={s.value}>{s.label}</option>)}
            </select></div>
          </div>
          <div style={{display:'flex',gap:8,marginTop:14}}>
            <button className="btn sage" onClick={saveEdit}>Save changes</button>
            <button className="btn secondary" onClick={()=>setEditing(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
