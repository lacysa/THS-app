'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, Save } from 'lucide-react'

type NoteState = 'idle'|'saving'|'saved'|'error'

export default function KitchenBoard({initialDate}:{initialDate:string}) {
  const [date,setDate] = useState(initialDate)
  const [data,setData] = useState<any>(null)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [notes,setNotes] = useState('')
  const [noteState,setNoteState] = useState<NoteState>('idle')
  const notesLoaded = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>|null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [boardRes,noteRes] = await Promise.all([
        fetch(`/api/staff/day?date=${date}`,{cache:'no-store'}),
        fetch(`/api/kitchen/notes?date=${date}`,{cache:'no-store'})
      ])
      const json = await boardRes.json()
      if (!boardRes.ok) throw new Error(json.message || 'Could not load the kitchen board.')
      setData(json)
      const noteJson = await noteRes.json().catch(()=>({}))
      if (noteRes.ok) setNotes(noteJson.note || '')
      notesLoaded.current = true
      setNoteState('idle')
    } catch (e:any) {
      setData(null)
      setError(e?.message || 'Could not load the kitchen board.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{
    notesLoaded.current = false
    void load()
    return ()=>{ if(saveTimer.current) clearTimeout(saveTimer.current) }
  },[date])

  async function saveNotes(value=notes) {
    setNoteState('saving')
    try {
      const r = await fetch('/api/kitchen/notes',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({serviceDate:date,note:value})
      })
      const d = await r.json().catch(()=>({}))
      if (!r.ok) throw new Error(d.error || 'Could not save kitchen notes.')
      setNoteState('saved')
    } catch (e:any) {
      setNoteState('error')
      setError(e?.message || 'Could not save kitchen notes.')
    }
  }

  function changeNotes(value:string) {
    setNotes(value)
    if (!notesLoaded.current) return
    setNoteState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(()=>void saveNotes(value),700)
  }

  const grouped = useMemo(()=>{
    const map = new Map<string,any[]>()
    for (const g of data?.groups || []) {
      const key = g.timeSlot || 'unscheduled'
      if (!map.has(key)) map.set(key,[])
      map.get(key)!.push(g)
    }
    const slots = (data?.slots || []).map((s:any)=>s.value)
    const ordered:string[] = []
    for (const slot of slots) if (map.has(slot)) ordered.push(slot)
    for (const key of map.keys()) if (!ordered.includes(key)) ordered.push(key)
    return ordered.map(key=>({
      key,
      label:key==='unscheduled' ? 'Unscheduled' : (data?.slots || []).find((s:any)=>s.value===key)?.label || key,
      groups:map.get(key) || []
    }))
  },[data])

  const noteLabel = noteState==='saving' ? 'Saving…' : noteState==='saved' ? 'Saved ✓' : noteState==='error' ? 'Save failed' : 'Autosaves'

  return (
    <div className="breakfast-workspace kitchen-workspace">
      <div className="toolbar breakfast-toolbar kitchen-toolbar">
        <div className="toolbar-left">
          <div className="field"><label>Service date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} /></div>
        </div>
        <div className="toolbar-right">
          <a className="btn secondary" href={`/breakfast/overview?date=${encodeURIComponent(date)}`}>Read-only overview</a>
          <button className="btn secondary" onClick={load}><RefreshCw size={15}/> Refresh</button>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}

      <section className="card kitchen-notes-card">
        <div className="kitchen-notes-head">
          <div><strong>Kitchen notes</strong><span>Daily prep, substitutions, guest-specific kitchen notes, or anything the next kitchen person needs to know.</span></div>
          <div className={`kitchen-save-state ${noteState}`}>{noteLabel}</div>
        </div>
        <textarea value={notes} onChange={e=>changeNotes(e.target.value)} placeholder="Add kitchen notes for this service date…" />
        <button className="btn secondary kitchen-manual-save" onClick={()=>void saveNotes()}><Save size={14}/> Save now</button>
      </section>

      {loading ? <div className="card">Loading kitchen board…</div> : data && (
        <section className="card kitchen-board-card">
          <div className="kitchen-board-head">
            <div><strong>Breakfast delivery board</strong><span>Grouped by delivery time. Scroll vertically to move through service.</span></div>
            <span className="pill">{data.groups.length} rooms</span>
          </div>

          <div className="kitchen-scroll-board">
            {grouped.length===0 && <div className="muted kitchen-empty">No breakfast tickets for this date.</div>}
            {grouped.map(section=>(
              <section className="kitchen-time-section" key={section.key}>
                <div className="kitchen-time-header">
                  <strong>{section.label}</strong>
                  <span>{section.groups.length} {section.groups.length===1?'room':'rooms'}</span>
                </div>
                <div className="kitchen-time-grid">
                  {[...section.groups, ...Array(Math.max(0, 2 - section.groups.length)).fill(null)].map((g:any,index:number)=> g ? (
                    <article className="ticket kitchen-ticket compact" key={g.groupKey}>
                      <div className="ticket-head">
                        <div>
                          <div className="ticket-room">{g.room}</div>
                          {g.lastName && <div className="muted">{g.lastName}</div>}
                        </div>
                        <div className="ticket-badges">
                          {!g.menuSubmitted && <span className="pill warning">Missing menu</span>}
                          {g.unmatched && <span className="pill warning">Unmatched</span>}
                        </div>
                      </div>

                      {g.orders.length===0 ? (
                        <div className="notice kitchen-missing-menu">{g.menuSubmitted ? 'Menu received, but no meal selections were saved.' : 'No breakfast menu received.'}</div>
                      ) : (
                        <div className="order-lines kitchen-order-lines">
                          {g.orders.map((o:any)=>(
                            <div className="order-row kitchen-order-row" key={o.id}>
                              <strong className="guest-label">Guest {o.guest_number}</strong>
                              <div className="order-details">
                                {o.meal_declined ? <div><strong>Declined breakfast</strong></div> : <>
                                  {o.dietary && <div className="kitchen-diet"><strong>Dietary:</strong> {o.dietary}</div>}
                                  {o.dietary_comments && <div className="kitchen-diet"><strong>Notes:</strong> {o.dietary_comments}</div>}
                                  {o.entree && <div><strong>Entrée:</strong> {o.entree}</div>}
                                  {o.pancakes && <div><strong>Pancakes:</strong> {o.pancakes}</div>}
                                  {o.meat && <div><strong>Meat:</strong> {o.meat}</div>}
                                  {o.eggs && <div><strong>Eggs:</strong> {o.eggs}</div>}
                                  {o.coffee && <div><strong>Coffee:</strong> {o.coffee}{o.cream?` · ${o.cream}`:''}</div>}
                                  {o.juice && <div><strong>Juice:</strong> {o.juice}</div>}
                                  {o.condiments && <div><strong>Condiments:</strong> {o.condiments}</div>}
                                </>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  ) : (
                    <article className="ticket kitchen-ticket compact kitchen-empty-slot" key={`empty-${section.key}-${index}`}>
                      <div className="ticket-room muted">No second room scheduled</div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
