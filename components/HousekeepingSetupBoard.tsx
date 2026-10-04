'use client'

import { useEffect,useMemo,useRef,useState } from 'react'
import { Check, ChevronDown, RefreshCw, Save, Search, UtensilsCrossed } from 'lucide-react'

type Row={
  roomId:string
  roomName:string
  reservationStatus:string
  serviceType:string
  stripHold:string
  assignedTo:string
  cleanOrder:number|null
  notes:string
  complete:boolean
  breakfastTag:boolean
}
type Staff={id:string;name:string}
type SaveState='idle'|'saving'|'saved'|'error'

function todayDetroit(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
}
function splitNames(value:string){return value.split(',').map(v=>v.trim()).filter(Boolean)}

export default function HousekeepingSetupBoard(){
  const [date,setDate]=useState(todayDetroit())
  const [rows,setRows]=useState<Row[]>([])
  const [staff,setStaff]=useState<Staff[]>([])
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const [saveState,setSaveState]=useState<SaveState>('idle')
  const [openStaffRoom,setOpenStaffRoom]=useState<string|null>(null)
  const [staffSearch,setStaffSearch]=useState('')
  const saveTimer=useRef<ReturnType<typeof setTimeout>|null>(null)

  async function load(){
    setLoading(true);setMessage('')
    const r=await fetch(`/api/housekeeping/day?date=${date}`,{cache:'no-store'})
    const d=await r.json().catch(()=>({}))
    if(!r.ok){setMessage(d.error||'Could not load housekeeping setup.');setLoading(false);return}
    setRows((d.rows||[]).map((x:any)=>({
      roomId:x.roomId,roomName:x.roomName,reservationStatus:x.reservationStatus||'',
      serviceType:x.serviceType||'',stripHold:x.stripHold||'',assignedTo:x.assignedTo||'',
      cleanOrder:x.cleanOrder??null,notes:x.notes||'',complete:Boolean(x.complete),
      breakfastTag:Boolean(x.breakfastTag)
    })))
    setStaff(d.staffOptions||[])
    setLoading(false)
  }
  useEffect(()=>{void load()},[date])

  async function save(nextRows:Row[]){
    setSaveState('saving')
    const r=await fetch('/api/housekeeping/day',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({serviceDate:date,rows:nextRows})
    })
    const d=await r.json().catch(()=>({}))
    if(!r.ok){setSaveState('error');setMessage(d.error||'Could not save housekeeping setup.');return}
    setSaveState('saved')
    setTimeout(()=>setSaveState('idle'),1200)
  }

  function update(roomId:string,patch:Partial<Row>){
    setRows(current=>{
      const next=current.map(r=>r.roomId===roomId?{...r,...patch}:r)
      if(saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current=setTimeout(()=>void save(next),650)
      return next
    })
  }

  function toggleStaff(row:Row,name:string){
    const current=splitNames(row.assignedTo)
    const next=current.includes(name)?current.filter(n=>n!==name):[...current,name]
    update(row.roomId,{assignedTo:next.join(', ')})
  }

  const filteredStaff=useMemo(()=>{
    const q=staffSearch.trim().toLowerCase()
    return q?staff.filter(s=>s.name.toLowerCase().includes(q)):staff
  },[staff,staffSearch])

  function setService(row:Row,value:''|'OUT'|'RF'){
    update(row.roomId,{serviceType:value})
  }

  return <div className="hsk-setup-page">
    <div className="module-toolbar hsk-setup-toolbar">
      <div>
        <div className="module-kicker">Front Desk / Management</div>
        <h1>Daily Housekeeping Setup</h1>
        <p>Fast room-status and assignment entry. Changes update the live Housekeeping board automatically.</p>
      </div>
      <div className="toolbar-actions">
        <span className={`hsk-save-indicator hsk-save-${saveState}`}>{saveState==='saving'?'Saving…':saveState==='saved'?'Saved ✓':saveState==='error'?'Save failed':'Autosaves'}</span>
        <label className="date-control">Date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
        <button className="ops-secondary-btn" onClick={load}><RefreshCw size={15}/>Refresh</button>
        <button className="ops-primary-btn" onClick={()=>void save(rows)}><Save size={15}/>Save all</button>
      </div>
    </div>

    {message&&<div className="module-message">{message}</div>}

    {loading?<div className="module-empty">Loading rooms…</div>:
      <div className="hsk-setup-grid">
        {rows.map(row=>{
          const selected=splitNames(row.assignedTo)
          return <article className="hsk-setup-card" key={row.roomId}>
            <div className="hsk-setup-room">
              <strong>{row.roomName}</strong>
              <div className="hsk-setup-room-tags">
                <button
                  type="button"
                  className={`hsk-breakfast-toggle ${row.breakfastTag ? 'active' : ''}`}
                  onClick={()=>update(row.roomId,{breakfastTag:!row.breakfastTag})}
                  aria-pressed={row.breakfastTag}
                  title="Mark whether this room is receiving breakfast for this date"
                >
                  <UtensilsCrossed size={13}/>
                  Breakfast
                </button>
                {row.complete&&<span className="daily-state done">Complete</span>}
              </div>
            </div>

            <div className="hsk-setup-fields">
              <label>Status
                <select value={row.reservationStatus} onChange={e=>update(row.roomId,{reservationStatus:e.target.value})}>
                  <option value="">—</option><option>Checkout</option><option>Out/In</option><option>Stayover</option><option>Arrival</option><option>Blocked</option>
                </select>
              </label>

              <div className="hsk-setup-service">
                <span>Service</span>
                <div>
                  <button className={!row.serviceType?'active':''} onClick={()=>setService(row,'')}>—</button>
                  <button className={row.serviceType.startsWith('OUT')?'active':''} onClick={()=>setService(row,'OUT')}>OUT</button>
                  <button className={row.serviceType==='RF'?'active':''} onClick={()=>setService(row,'RF')}>RF</button>
                </div>
              </div>

              <label>Strip / Hold
                <select value={row.stripHold} onChange={e=>update(row.roomId,{stripHold:e.target.value})}>
                  <option value="">—</option><option>Strip</option><option>Room Strip</option><option>Hold</option>
                </select>
              </label>

              <label>Order
                <input type="number" min="1" value={row.cleanOrder??''} onChange={e=>update(row.roomId,{cleanOrder:e.target.value?Number(e.target.value):null})}/>
              </label>
            </div>

            <div className="hsk-setup-staff">
              <span>Assigned staff</span>
              <button className="hsk-staff-trigger" onClick={()=>{setOpenStaffRoom(openStaffRoom===row.roomId?null:row.roomId);setStaffSearch('')}}>
                <span>{selected.length?selected.join(', '):'Select any active staff'}</span><ChevronDown size={14}/>
              </button>
              {openStaffRoom===row.roomId&&<div className="hsk-staff-popover">
                <div className="hsk-staff-search"><Search size={14}/><input autoFocus value={staffSearch} onChange={e=>setStaffSearch(e.target.value)} placeholder="Search staff"/></div>
                <div className="hsk-staff-options">
                  {filteredStaff.map(option=><button key={option.id} className={selected.includes(option.name)?'is-selected':''} onClick={()=>toggleStaff(row,option.name)}>
                    <span className="hsk-staff-check">{selected.includes(option.name)&&<Check size={13}/>}</span>{option.name}
                  </button>)}
                </div>
              </div>}
            </div>

            <label className="hsk-setup-note">FD note
              <input value={row.notes} onChange={e=>update(row.roomId,{notes:e.target.value})} placeholder="Optional room note"/>
            </label>
          </article>
        })}
      </div>
    }
  </div>
}
