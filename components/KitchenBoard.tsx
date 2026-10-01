'use client'

import { useEffect, useState } from 'react'

export default function KitchenBoard({initialDate}:{initialDate:string}) {
  const [date,setDate] = useState(initialDate)
  const [data,setData] = useState<any>(null)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`/api/staff/day?date=${date}`,{cache:'no-store'})
      const json = await r.json()
      if (!r.ok) throw new Error(json.message || 'Could not load the kitchen board.')
      setData(json)
    } catch (e:any) {
      setData(null)
      setError(e?.message || 'Could not load the kitchen board.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{ load() },[date])

  async function status(orderId:string,status:string) {
    const r = await fetch('/api/staff/order-status',{
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({orderId,status})
    })
    if (!r.ok) {
      const json = await r.json().catch(()=>({}))
      setError(json.message || 'Could not update order status.')
      return
    }
    load()
  }

  return (
    <div className="breakfast-workspace">
      <div className="toolbar breakfast-toolbar">
        <div className="toolbar-left">
          <div className="field"><label>Service date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} /></div>
        </div>
        <div className="toolbar-right">
          <a className="btn secondary" href={`/breakfast/overview?date=${encodeURIComponent(date)}`}>Read-only overview</a>
          <button className="btn secondary" onClick={load}>Refresh</button>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}

      {loading ? <div className="card">Loading kitchen board…</div> : data && (
        <div className="breakfast-ticket-grid">
          {data.groups.length===0 && <div className="card muted">No breakfast tickets for this date.</div>}
          {data.groups.map((g:any)=>(
            <article className="ticket kitchen-ticket" key={g.groupKey}>
              <div className="ticket-head">
                <div>
                  <div className="ticket-room">{g.room}</div>
                  <div className="muted">{g.lastName}</div>
                </div>
                <div className="ticket-badges">
                  <span className="pill">{g.displayTime}</span>
                  {!g.menuSubmitted && <span className="pill">Missing menu</span>}
                  {g.unmatched && <span className="pill warning">Unmatched legacy menu</span>}
                </div>
              </div>

              {g.unmatched && (
                <div className="notice" style={{marginTop:12}}>
                  This legacy menu was received but could not be matched to a scheduled breakfast booking.
                </div>
              )}

              {g.orders.length===0 ? (
                <div className="notice" style={{marginTop:12}}>
                  {g.menuSubmitted
                    ? 'Breakfast menu received, but no guest meal selections were saved.'
                    : 'No breakfast menu received.'}
                </div>
              ) : (
                <div className="order-lines">
                  {g.orders.map((o:any)=>(
                    <div className="order-row kitchen-order-row" key={o.id}>
                      <strong className="guest-label">Guest {o.guest_number}</strong>
                      <div className="order-details">
                        {o.meal_declined ? (
                          <div className="notice" style={{margin:0}}><strong>Declined breakfast</strong></div>
                        ) : (<>
                        {o.dietary && <div><strong>Dietary:</strong> {o.dietary}</div>}
                        {o.dietary_comments && <div><strong>Notes:</strong> {o.dietary_comments}</div>}
                        {o.entree && <div><strong>Entrée:</strong> {o.entree}</div>}
                        {o.pancakes && <div><strong>Pancakes:</strong> {o.pancakes}</div>}
                        {o.meat && <div><strong>Meat:</strong> {o.meat}</div>}
                        {o.eggs && <div><strong>Eggs:</strong> {o.eggs}</div>}
                        {o.coffee && <div><strong>Coffee:</strong> {o.coffee}{o.cream?` · ${o.cream}`:''}</div>}
                        {o.juice && <div><strong>Juice:</strong> {o.juice}</div>}
                        {o.condiments && <div><strong>Condiments:</strong> {o.condiments}</div>}
                        <div className="status-actions">
                          {['new','prepping','ready','delivered','hold'].map(s=>
                            <button key={s} className={`btn ${o.status===s?'sage':'secondary'}`} onClick={()=>status(o.id,s)}>
                              {s[0].toUpperCase()+s.slice(1)}
                            </button>
                          )}
                        </div>
                        </>)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
