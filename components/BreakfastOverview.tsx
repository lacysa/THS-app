'use client'

import { useEffect, useMemo, useState } from 'react'

function splitDietary(value:string) {
  return String(value || '').split(',').map(x=>x.trim()).filter(Boolean)
}

export default function BreakfastOverview({initialDate}:{initialDate:string}) {
  const [date,setDate] = useState(initialDate)
  const [data,setData] = useState<any>(null)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`/api/staff/day?date=${date}&includeDeclined=1`,{cache:'no-store'})
      const json = await r.json()
      if (!r.ok) throw new Error(json.message || 'Could not load breakfast overview.')
      setData(json)
    } catch (e:any) {
      setData(null)
      setError(e?.message || 'Could not load breakfast overview.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{ load() },[date])

  const dietarySummary = useMemo(()=>{
    const counts = new Map<string,number>()
    for (const g of data?.groups || []) {
      if (g.breakfastSkipped) continue
      for (const o of g.orders || []) {
      if (o.meal_declined) continue
      for (const item of splitDietary(o.dietary)) counts.set(item,(counts.get(item)||0)+1)
      if (o.dietary_comments) counts.set(o.dietary_comments,(counts.get(o.dietary_comments)||0)+1)
      }
    }
    return [...counts.entries()]
  },[data])

  const breakfastCounts = useMemo(()=>{
    const counts = new Map<string,number>()
    const add=(label:string,value:any)=>{ if(value) counts.set(`${label}: ${value}`,(counts.get(`${label}: ${value}`)||0)+1) }
    for (const g of data?.groups || []) {
      if (g.breakfastSkipped) continue
      for (const o of g.orders || []) {
        if (o.meal_declined) continue
        add('Entrée',o.entree); add('Meat',o.meat); add('Eggs',o.eggs)
      }
    }
    return [...counts.entries()].sort((a,b)=>b[1]-a[1])
  },[data])

  return (
    <div className="breakfast-overview-page module-pretty-page">
      <div className="overview-actions no-print">
        <div className="field"><label>Service date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} /></div>
        <div className="toolbar-right">
          <button className="btn secondary" onClick={load}>Refresh</button>
          <button className="btn" onClick={()=>window.print()}>Print</button>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}
      {loading ? <div className="card">Loading overview…</div> : data && (() => {
        const serviceBookings=(data.bookings||[]).filter((x:any)=>!x.breakfastSkipped && x.status!=='declined')
        return <div className="overview-sheet">
          <header className="overview-title-row">
            <div>
              <div className="ops-kicker">The Hotel Saugatuck</div>
              <h1>Daily Breakfast Overview</h1>
              <p>{date}</p>
            </div>
            <div className="overview-print-date">{serviceBookings.length} scheduled</div>
          </header>

          <section className="overview-summary-grid">
            <div className="overview-panel">
              <h3>Overview</h3>
              <div className="overview-metrics">
                <div><strong>{serviceBookings.length}</strong><span>Scheduled rooms</span></div>
                <div><strong>{serviceBookings.filter((x:any)=>x.menu_submitted).length}</strong><span>Menus received</span></div>
                <div><strong>{serviceBookings.filter((x:any)=>!x.menu_submitted).length}</strong><span>Missing menus</span></div>
              </div>
            </div>
            <div className="overview-panel">
              <h3>Dietary Restrictions / Notes</h3>
              <div className="summary-chips">
                {dietarySummary.length===0 ? <span className="muted">None reported</span> : dietarySummary.map(([label,count])=><span className="summary-chip dietary" key={label}>{label}{count>1?` · ${count}`:''}</span>)}
              </div>
            </div>
          </section>

          <section className="overview-panel">
            <h3>Breakfast Counts</h3>
            <div className="summary-chips">
              {breakfastCounts.length===0 ? <span className="muted">No submitted menus yet.</span> : breakfastCounts.map(([label,count])=><span className="summary-chip" key={label}>{label}: {count}</span>)}
            </div>
          </section>

          <section className="overview-panel tickets-panel">
            <div className="overview-section-head">
              <div><h3>Tickets</h3><p className="muted">Sorted by scheduled delivery time.</p></div>
            </div>
            <div className="overview-table-wrap">
              <table className="overview-table">
                <thead><tr><th>Room</th><th>Time</th><th>Dietary</th><th>Meals</th><th>Beverages</th></tr></thead>
                <tbody>
                  {data.groups.filter((g:any)=>!g.unmatched).map((g:any)=><tr key={g.groupKey} className={g.breakfastSkipped?'overview-skipped-row':''}>
                    <td><strong>{g.room}</strong><div className="muted">{g.breakfastSkipped?'Breakfast skipped':g.taggedOnly?'Menu Missing':g.lastName}</div>{g.note && <div className="overview-menu-note"><strong>Menu note:</strong> {g.note}</div>}</td>
                    <td>{g.breakfastSkipped?'—':g.displayTime}</td>
                    <td>{g.breakfastSkipped ? <span className="pill neutral">Skipped</span> : g.orders.length===0 ? <span className="missing-badge">Missing menu</span> : g.orders.map((o:any)=><div className="overview-guest-block" key={o.id}><b>Guest {o.guest_number}</b>{o.meal_declined ? <div><strong>Declined breakfast</strong></div> : <>{o.dietary&&<div>{o.dietary}</div>}{o.dietary_comments&&<div className="diet-note">{o.dietary_comments}</div>}</>}</div>)}</td>
                    <td>{g.breakfastSkipped ? <span className="muted">No breakfast service</span> : g.orders.map((o:any)=><div className="overview-guest-block" key={o.id}><b>Guest {o.guest_number}</b>{o.meal_declined ? <div><strong>Declined breakfast</strong></div> : <>{o.entree&&<div><strong>Entrée:</strong> {o.entree}</div>}{o.meat&&<div><strong>Meat:</strong> {o.meat}</div>}{o.eggs&&<div><strong>Eggs:</strong> {o.eggs}</div>}{o.condiments&&<div><strong>Condiments:</strong> {o.condiments}</div>}</>}</div>)}</td>
                    <td>{g.breakfastSkipped ? <span className="muted">—</span> : g.orders.map((o:any)=><div className="overview-guest-block" key={o.id}><b>Guest {o.guest_number}</b>{o.meal_declined ? <div><strong>Declined breakfast</strong></div> : <>{o.coffee&&<div><strong>Coffee:</strong> {o.coffee}</div>}{o.cream&&<div><strong>Cream:</strong> {o.cream}</div>}{o.juice&&<div><strong>Juice:</strong> {o.juice}</div>}</>}</div>)}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      })()}
    </div>
  )
}
