'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BedDouble, Check, ChevronDown, ChevronUp, RefreshCw, Save, UtensilsCrossed } from 'lucide-react'

type BreakfastStatus = 'none'|'needed'|'received'|'declined'
type SaveState = 'idle'|'saving'|'saved'|'error'

type RoomRow = {
  roomId:string
  roomName:string
  reservationStatus:string
  serviceType:string
  stripHold:string
  assignedTo:string
  cleanOrder:number|null
  complete:boolean
  roomCondition:string
  notes:string
  packageIds:string[]
  breakfastTag:boolean
  breakfast:{serviceDate:string;status:BreakfastStatus;timeSlot?:string|null}
  haSignedBy?:string|null
  haSignedName?:string|null
  haSignedAt?:string|null
  fohSignedBy?:string|null
  fohSignedName?:string|null
  fohSignedAt?:string|null
}

type StaffOption={id:string;name:string}
type PackageOption={id:string;name:string;price:number|null;available:boolean}
type Access={
  name?:string|null
  preferredName?:string|null
  email?:string|null
  roleName?:string|null
  isAdmin?:boolean
}

const reservationOptions=['','Checkout','Out/In','Stayover','Arrival','Vacant','Blocked']
const conditionOptions=['','Occupied','Cleaning','Ready for Inspection','Ready','Vacant','Vacant (Clean)','Vacant (Dirty)','Vacant (Blocked)','Out of Order']
const stripOptions=['','Strip','Hold']

function todayDetroit(){
  return new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date())
}

function splitAssigned(value:string){
  return String(value||'').split(',').map(x=>x.trim()).filter(Boolean)
}

function normalize(value:string|null|undefined){
  return String(value||'').trim().toLowerCase()
}

function getManagerInitials(access:Access|null){
  if(!access) return ''
  const combined=normalize(`${access.name||''} ${access.preferredName||''} ${access.email||''}`)
  if(combined.includes('sarah')||combined.includes('lacysa')) return 'SL'
  if(combined.includes('brittany')||combined.includes('brittanyahollingshead')) return 'BH'
  if(combined.includes('david')||combined.includes('davidheiser')) return 'DH'
  const rawName=access.name||access.preferredName||''
  const parts=rawName.trim().split(/\s+/).filter(Boolean)
  if(parts.length>=2) return `${parts[0][0]}${parts[parts.length-1][0]}`.toUpperCase()
  return ''
}

function statusClass(value:string){
  return 'rb-status-'+String(value||'none').toLowerCase().replace(/[^a-z0-9]+/g,'-')
}

function shortTime(value?:string|null){
  if(!value) return ''
  const d=new Date(value)
  if(Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-US',{timeZone:'America/Detroit',hour:'numeric',minute:'2-digit'}).format(d)
}

export default function RoomBoard(){
  const [date,setDate]=useState(todayDetroit())
  const [rows,setRows]=useState<RoomRow[]>([])
  const [staffOptions,setStaffOptions]=useState<StaffOption[]>([])
  const [access,setAccess]=useState<Access|null>(null)
  const [packageOptions,setPackageOptions]=useState<PackageOption[]>([])
  const [breakfastDate,setBreakfastDate]=useState('')
  const [menuNeededRooms,setMenuNeededRooms]=useState<string[]>([])
  const [canHaSignoff,setCanHaSignoff]=useState(false)
  const [canFohSignoff,setCanFohSignoff]=useState(false)
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const [saveState,setSaveState]=useState<SaveState>('idle')
  const [dirty,setDirty]=useState(false)
  const [openRooms,setOpenRooms]=useState<Record<string,boolean>>({})
  const rowsRef=useRef<RoomRow[]>([])
  const dateRef=useRef(date)
  const saveTimer=useRef<ReturnType<typeof setTimeout>|null>(null)

  useEffect(()=>{ rowsRef.current=rows },[rows])
  useEffect(()=>{ dateRef.current=date },[date])

  useEffect(()=>{
    fetch('/api/me',{cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(d) setAccess(d.access||null) })
      .catch(()=>{})
  },[])

  async function load(){
    setLoading(true)
    setMessage('')
    setDirty(false)
    setSaveState('idle')
    if(saveTimer.current) clearTimeout(saveTimer.current)
    try{
      const r=await fetch(`/api/housekeeping/day?date=${encodeURIComponent(date)}`,{cache:'no-store'})
      const d=await r.json().catch(()=>({}))
      if(!r.ok) throw new Error(d.error||'Could not load Room Board.')
      const next=d.rows||[]
      setRows(next)
      rowsRef.current=next
      setStaffOptions(d.staffOptions||[])
      setPackageOptions(d.packageOptions||[])
      setBreakfastDate(d.breakfast?.serviceDate||'')
      setMenuNeededRooms(d.breakfast?.menuNeededRooms||[])
      setCanHaSignoff(Boolean(d.signoffAccess?.canHaSignoff))
      setCanFohSignoff(Boolean(d.signoffAccess?.canFohSignoff))
    }catch(e:any){
      setMessage(e?.message||'Could not load Room Board.')
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{ void load() },[date])

  async function saveRows(sourceRows=rowsRef.current,showMessage=false){
    setSaveState('saving')
    try{
      const r=await fetch('/api/housekeeping/day',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({serviceDate:dateRef.current,rows:sourceRows})
      })
      const d=await r.json().catch(()=>({}))
      if(!r.ok) throw new Error(d.error||'Could not save Room Board.')
      setDirty(false)
      setSaveState('saved')
      if(showMessage) setMessage('Room Board saved.')
      return true
    }catch(e:any){
      setSaveState('error')
      setMessage(e?.message||'Could not save Room Board.')
      return false
    }
  }

  useEffect(()=>{
    if(!dirty||loading) return
    if(saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current=setTimeout(()=>void saveRows(rowsRef.current,false),700)
    return()=>{ if(saveTimer.current) clearTimeout(saveTimer.current) }
  },[rows,dirty,loading])

  function patch(roomId:string,update:Partial<RoomRow>){
    setRows(current=>{
      const next=current.map(row=>row.roomId===roomId?{...row,...update}:row)
      rowsRef.current=next
      return next
    })
    setDirty(true)
    setSaveState('idle')
  }

  async function signOff(row:RoomRow,kind:'ha'|'foh'){
    if(!row.complete){
      setMessage('Mark the room complete before signing off.')
      return
    }
    if(!(await saveRows(rowsRef.current,false))) return
    const r=await fetch('/api/housekeeping/signoff',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({serviceDate:dateRef.current,roomId:row.roomId,kind})
    })
    const d=await r.json().catch(()=>({}))
    if(!r.ok){
      setMessage(d.error||'Could not save room sign-off.')
      return
    }
    patch(row.roomId,kind==='ha'
      ?{haSignedBy:d.signedBy,haSignedName:d.signedName,haSignedAt:d.signedAt}
      :{fohSignedBy:d.signedBy,fohSignedName:d.signedName,fohSignedAt:d.signedAt}
    )
    setDirty(false)
    setSaveState('saved')
  }

  function toggleStaff(row:RoomRow,name:string){
    const current=splitAssigned(row.assignedTo)
    const next=current.includes(name)?current.filter(x=>x!==name):[...current,name]
    patch(row.roomId,{assignedTo:next.join(', ')})
  }

  function togglePackage(row:RoomRow,id:string){
    const current=Array.isArray(row.packageIds)?row.packageIds:[]
    patch(row.roomId,{packageIds:current.includes(id)?current.filter(x=>x!==id):[...current,id]})
  }

  const counts=useMemo(()=>({
    complete:rows.filter(r=>r.complete).length,
    open:rows.filter(r=>!r.complete).length
  }),[rows])

  const saveLabel=saveState==='saving'?'Saving…':saveState==='saved'?'Saved ✓':saveState==='error'?'Save failed':'All changes saved'
  const managerInitials=getManagerInitials(access)

  function setService(row:RoomRow,value:string){
    if(value==='OUT'){
      if(!managerInitials){
        setMessage('Manager initials could not be determined from your profile.')
        return
      }
      patch(row.roomId,{serviceType:`OUT-${managerInitials}`})
      return
    }
    patch(row.roomId,{serviceType:value})
  }

  return <div className="rb-page">
    <div className="rb-toolbar">
      <div>
        <div className="module-kicker">Housekeeping</div>
        <h1>Room Board</h1>
        <p>Scan the day quickly, expand only when you need the details.</p>
      </div>
      <div className="rb-toolbar-actions">
        <span className={`rb-save rb-save-${saveState}`}>{saveLabel}</span>
        <label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
        <button className="ops-secondary-btn" type="button" onClick={load}><RefreshCw size={15}/>Refresh</button>
        <button className="ops-primary-btn" type="button" onClick={()=>void saveRows(rowsRef.current,true)}><Save size={15}/>Save all</button>
      </div>
    </div>

    {message&&<div className="module-message">{message}</div>}

    <div className="rb-breakfast-strip">
      <div><UtensilsCrossed size={16}/><strong>Breakfast · {breakfastDate||'Tomorrow'}</strong></div>
      {menuNeededRooms.length
        ?<span><b>{menuNeededRooms.length} menu{menuNeededRooms.length===1?'':'s'} missing:</b> {menuNeededRooms.join(', ')}</span>
        :<span>No breakfast menus currently outstanding.</span>}
    </div>

    <div className="rb-summary-strip">
      <span><b>{rows.length}</b> rooms</span>
      <span><b>{counts.complete}</b> complete</span>
      <span><b>{counts.open}</b> open</span>
    </div>

    {loading?<div className="module-empty">Loading Room Board…</div>:(
      <div className="rb-room-list">
        {rows.map(row=>{
          const open=Boolean(openRooms[row.roomId])
          const staff=splitAssigned(row.assignedTo)
          const selectedPackages=(row.packageIds||[]).map(id=>packageOptions.find(p=>p.id===id)?.name).filter(Boolean)
          const service=String(row.serviceType||'').toUpperCase()
          return <article className={`rb-room-card ${statusClass(row.reservationStatus)} ${row.complete?'is-complete':''}`} key={row.roomId}>
            <div className="rb-room-main">
              <div className="rb-room-name">
                <BedDouble size={17}/>
                <div>
                  <strong>{row.roomName}</strong>
                  <div className="rb-badges">
                    <button
                      type="button"
                      className={`rb-badge rb-breakfast-toggle ${row.breakfastTag?'breakfast is-active':''}`}
                      aria-pressed={row.breakfastTag}
                      onClick={()=>patch(row.roomId,{breakfastTag:!row.breakfastTag})}
                      title="Breakfast service the following morning"
                    >
                      Breakfast
                    </button>
                    {selectedPackages.length>0&&(
                      <span
                        className="rb-badge rb-package-summary"
                        title={selectedPackages.join(', ')}
                      >
                        {selectedPackages.join(', ')}
                      </span>
                    )}
                    {row.stripHold&&<span className="rb-badge warn">{row.stripHold}</span>}
                  </div>
                </div>
              </div>

              <label className="rb-field rb-status-field">
                <span>Status</span>
                <select className={statusClass(row.reservationStatus)} value={row.reservationStatus} onChange={e=>patch(row.roomId,{reservationStatus:e.target.value})}>
                  {reservationOptions.map(v=><option key={v} value={v}>{v||'—'}</option>)}
                </select>
              </label>

              <label className="rb-field">
                <span>Service</span>
                <select value={service} onChange={e=>setService(row,e.target.value)}>
                  <option value="">—</option>
                  <option value="OUT">OUT{managerInitials?`-${managerInitials}`:''}</option>
                  {service.startsWith('OUT-')&&service!==`OUT-${managerInitials}`&&<option value={service}>{service}</option>}
                  <option value="RF">RF</option>
                </select>
              </label>

              <div className="rb-field rb-staff-summary">
                <span>Staff</span>
                <strong>{staff.length?staff.join(', '):'Unassigned'}</strong>
              </div>

              <label className="rb-progress">
                <input type="checkbox" checked={row.complete} onChange={e=>patch(row.roomId,{
                  complete:e.target.checked,
                  roomCondition:e.target.checked?(row.roomCondition||'Ready for Inspection'):row.roomCondition
                })}/>
                <span>{row.complete?'Complete ✓':'In progress'}</span>
              </label>

              <label className="rb-field rb-end-field">
                <span>End of shift</span>
                <select value={row.roomCondition} onChange={e=>patch(row.roomId,{roomCondition:e.target.value})}>
                  {conditionOptions.map(v=><option key={v} value={v}>{v||'—'}</option>)}
                </select>
              </label>

              <button className="rb-details-btn" type="button" onClick={()=>setOpenRooms(cur=>({...cur,[row.roomId]:!open}))}>
                Details {open?<ChevronUp size={15}/>:<ChevronDown size={15}/>}
              </button>
            </div>

            {open&&<div className="rb-details">
              <div className="rb-detail-grid">
                <label className="rb-field">
                  <span>Strip / Hold</span>
                  <select value={row.stripHold} onChange={e=>patch(row.roomId,{stripHold:e.target.value})}>
                    {stripOptions.map(v=><option key={v} value={v}>{v||'—'}</option>)}
                  </select>
                </label>

                <label className="rb-field">
                  <span>Cleaning order</span>
                  <input type="number" min="1" value={row.cleanOrder??''} onChange={e=>patch(row.roomId,{cleanOrder:e.target.value?Number(e.target.value):null})}/>
                </label>

                <div className="rb-detail-block">
                  <span>Assigned staff</span>
                  <div className="rb-chip-list">
                    {staffOptions.map(option=>{
                      const checked=staff.includes(option.name)
                      return <button type="button" key={option.id} className={checked?'is-selected':''} onClick={()=>toggleStaff(row,option.name)}>
                        {checked&&<Check size={12}/>} {option.name}
                      </button>
                    })}
                  </div>
                </div>

                <div className="rb-detail-block">
                  <span>Room checks</span>
                  <div className="rb-signoffs">
                    <div><b>HA</b>{row.haSignedBy?<span>✓ {row.haSignedName} {shortTime(row.haSignedAt)}</span>:canHaSignoff&&row.complete?<button type="button" onClick={()=>void signOff(row,'ha')}>Pass</button>:<span>Pending</span>}</div>
                    <div><b>FOH</b>{row.fohSignedBy?<span>✓ {row.fohSignedName} {shortTime(row.fohSignedAt)}</span>:canFohSignoff&&row.complete?<button type="button" onClick={()=>void signOff(row,'foh')}>Sign</button>:<span>Pending</span>}</div>
                  </div>
                </div>

                <div className="rb-detail-block rb-packages">
                  <span>Room packages</span>
                  <div className="rb-chip-list">
                    {packageOptions.filter(p=>p.available||(row.packageIds||[]).includes(p.id)).map(option=>{
                      const checked=(row.packageIds||[]).includes(option.id)
                      return <button type="button" key={option.id} className={checked?'is-selected':''} onClick={()=>togglePackage(row,option.id)}>
                        {checked&&<Check size={12}/>} {option.name}
                      </button>
                    })}
                    {!packageOptions.length&&<em>No packages available.</em>}
                  </div>
                </div>

                <label className="rb-field rb-notes">
                  <span>Room notes</span>
                  <textarea value={row.notes} onChange={e=>patch(row.roomId,{notes:e.target.value})} placeholder="Add room notes…"/>
                </label>
              </div>
            </div>}
          </article>
        })}
      </div>
    )}
  </div>
}
