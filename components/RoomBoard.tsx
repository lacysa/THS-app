'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BedDouble, Check, ChevronDown, ChevronUp, RefreshCw, Save, Search, SlidersHorizontal, UtensilsCrossed } from 'lucide-react'

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
  checkIssueOpen?:boolean
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

function staffHue(name:string){
  let hash=0
  for(let i=0;i<name.length;i++) hash=((hash<<5)-hash)+name.charCodeAt(i)
  return Math.abs(hash)%360
}

function staffStyle(name:string){
  return {'--staff-hue':staffHue(name)} as CSSProperties
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
  const [collapsedRooms,setCollapsedRooms]=useState<Record<string,boolean>>({})
  const [search,setSearch]=useState('')
  const [statusFilters,setStatusFilters]=useState<string[]>([])
  const [staffFilters,setStaffFilters]=useState<string[]>([])
  const [serviceFilters,setServiceFilters]=useState<string[]>([])
  const [progressFilters,setProgressFilters]=useState<string[]>([])
  const [breakfastFilters,setBreakfastFilters]=useState<string[]>([])
  const [packageFilters,setPackageFilters]=useState<string[]>([])
  const [filtersOpen,setFiltersOpen]=useState(false)
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

  const filteredRows=useMemo(()=>{
    const q=search.trim().toLowerCase()

    return rows.filter(row=>{
      const packageNames=(row.packageIds||[])
        .map(id=>packageOptions.find(p=>p.id===id)?.name||'')
        .join(' ')

      const haystack=[
        row.roomName,
        row.reservationStatus,
        row.serviceType,
        row.stripHold,
        row.assignedTo,
        row.cleanOrder==null?'':String(row.cleanOrder),
        row.complete?'complete':'in progress',
        row.roomCondition,
        row.notes,
        row.breakfastTag?'breakfast':'',
        packageNames
      ].join(' ').toLowerCase()

      if(q && !haystack.includes(q)) return false
      if(statusFilters.length && !statusFilters.includes(row.reservationStatus)) return false

      if(staffFilters.length){
        const assigned=splitAssigned(row.assignedTo)
        const matchesStaff=staffFilters.some(filter=>
          filter==='__unassigned__' ? assigned.length===0 : assigned.includes(filter)
        )
        if(!matchesStaff) return false
      }

      if(serviceFilters.length){
        const service=String(row.serviceType||'').toUpperCase()
        const matchesService=serviceFilters.some(filter=>
          filter==='OUT' ? service.startsWith('OUT') : service===filter
        )
        if(!matchesService) return false
      }

      if(progressFilters.length){
        const progress=row.complete?'complete':'open'
        if(!progressFilters.includes(progress)) return false
      }

      if(breakfastFilters.length){
        const breakfast=row.breakfastTag?'yes':'no'
        if(!breakfastFilters.includes(breakfast)) return false
      }

      if(packageFilters.length){
        const hasPackage=Array.isArray(row.packageIds) && row.packageIds.length>0
        const packageState=hasPackage?'yes':'no'
        if(!packageFilters.includes(packageState)) return false
      }

      return true
    })
  },[
    rows,
    search,
    packageOptions,
    statusFilters,
    staffFilters,
    serviceFilters,
    progressFilters,
    breakfastFilters,
    packageFilters
  ])

  const activeFilterCount=
    statusFilters.length+
    staffFilters.length+
    serviceFilters.length+
    progressFilters.length+
    breakfastFilters.length+
    packageFilters.length

  const hasFilters=Boolean(search || activeFilterCount)

  function toggleFilter(
    value:string,
    setter:React.Dispatch<React.SetStateAction<string[]>>
  ){
    setter(current=>current.includes(value)
      ? current.filter(item=>item!==value)
      : [...current,value]
    )
  }

  function clearFilters(){
    setSearch('')
    setStatusFilters([])
    setStaffFilters([])
    setServiceFilters([])
    setProgressFilters([])
    setBreakfastFilters([])
    setPackageFilters([])
  }

  function collapseAll(){
    const next:Record<string,boolean>={}
    for(const row of rows) next[row.roomId]=true
    setCollapsedRooms(next)
    setOpenRooms({})
  }

  function expandAll(){
    setCollapsedRooms({})
  }

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
        <label className="rb-date-control">Date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
        <button className="ops-secondary-btn rb-refresh-btn" type="button" onClick={load}><RefreshCw size={15}/>Refresh</button>
        <button className="ops-primary-btn rb-save-btn" type="button" onClick={()=>void saveRows(rowsRef.current,true)}><Save size={15}/>Save all</button>
      </div>
    </div>

    {message&&<div className="module-message">{message}</div>}

    <div className="rb-breakfast-strip">
      <div><UtensilsCrossed size={16}/><strong>Breakfast · {breakfastDate||'Tomorrow'}</strong></div>
      {menuNeededRooms.length
        ?<span><b>{menuNeededRooms.length} menu{menuNeededRooms.length===1?'':'s'} missing:</b> {menuNeededRooms.join(', ')}</span>
        :<span>No breakfast menus currently outstanding.</span>}
    </div>

    <div className="rb-view-controls">
      <label className="rb-search">
        <Search size={15}/>
        <input
          type="search"
          value={search}
          onChange={e=>setSearch(e.target.value)}
          placeholder="Search rooms, staff, status, notes, packages…"
          aria-label="Search HSK"
        />
      </label>

      <div className="rb-view-actions">
        <div className="rb-filter-menu">
          <button
            type="button"
            className={`ops-secondary-btn rb-filter-button ${activeFilterCount?'is-active':''}`}
            onClick={()=>setFiltersOpen(open=>!open)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal size={15}/>
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </button>

          {filtersOpen&&(
            <div className="rb-filter-panel">
              <div className="rb-filter-panel-head">
                <strong>Filter rooms</strong>
                <button type="button" onClick={clearFilters} disabled={!hasFilters}>Clear</button>
              </div>

              <fieldset>
                <legend>Status</legend>
                <div className="rb-check-grid">
                  {reservationOptions.filter(Boolean).map(value=>(
                    <label key={value}>
                      <input
                        type="checkbox"
                        checked={statusFilters.includes(value)}
                        onChange={()=>toggleFilter(value,setStatusFilters)}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>Staff</legend>
                <div className="rb-check-grid">
                  <label>
                    <input
                      type="checkbox"
                      checked={staffFilters.includes('__unassigned__')}
                      onChange={()=>toggleFilter('__unassigned__',setStaffFilters)}
                    />
                    <span>Unassigned</span>
                  </label>
                  {staffOptions.map(option=>(
                    <label key={option.id}>
                      <input
                        type="checkbox"
                        checked={staffFilters.includes(option.name)}
                        onChange={()=>toggleFilter(option.name,setStaffFilters)}
                      />
                      <span>{option.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>Service</legend>
                <div className="rb-check-grid">
                  {['OUT','RF'].map(value=>(
                    <label key={value}>
                      <input
                        type="checkbox"
                        checked={serviceFilters.includes(value)}
                        onChange={()=>toggleFilter(value,setServiceFilters)}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>Progress</legend>
                <div className="rb-check-grid">
                  <label>
                    <input
                      type="checkbox"
                      checked={progressFilters.includes('open')}
                      onChange={()=>toggleFilter('open',setProgressFilters)}
                    />
                    <span>Open</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={progressFilters.includes('complete')}
                      onChange={()=>toggleFilter('complete',setProgressFilters)}
                    />
                    <span>Complete</span>
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Breakfast</legend>
                <div className="rb-check-grid">
                  <label>
                    <input
                      type="checkbox"
                      checked={breakfastFilters.includes('yes')}
                      onChange={()=>toggleFilter('yes',setBreakfastFilters)}
                    />
                    <span>Breakfast tagged</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={breakfastFilters.includes('no')}
                      onChange={()=>toggleFilter('no',setBreakfastFilters)}
                    />
                    <span>No breakfast</span>
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Package</legend>
                <div className="rb-check-grid">
                  <label>
                    <input
                      type="checkbox"
                      checked={packageFilters.includes('yes')}
                      onChange={()=>toggleFilter('yes',setPackageFilters)}
                    />
                    <span>Has package</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={packageFilters.includes('no')}
                      onChange={()=>toggleFilter('no',setPackageFilters)}
                    />
                    <span>No package</span>
                  </label>
                </div>
              </fieldset>
            </div>
          )}
        </div>

        <button type="button" className="ops-secondary-btn" onClick={collapseAll}>Collapse all</button>
        <button type="button" className="ops-secondary-btn" onClick={expandAll}>Expand all</button>
      </div>
    </div>

    <div className="rb-summary-strip">
      <span><b>{filteredRows.length}</b> shown</span>
      <span><b>{rows.length}</b> rooms</span>
      <span><b>{counts.complete}</b> complete</span>
      <span><b>{counts.open}</b> open</span>
    </div>

    {loading?<div className="module-empty">Loading Room Board…</div>:(
      <div className="rb-room-list">
        {filteredRows.map(row=>{
          const open=Boolean(openRooms[row.roomId])
          const collapsed=Boolean(collapsedRooms[row.roomId])
          const staff=splitAssigned(row.assignedTo)
          const selectedPackages=(row.packageIds||[]).map(id=>packageOptions.find(p=>p.id===id)?.name).filter(Boolean)
          const service=String(row.serviceType||'').toUpperCase()
          const status=row.reservationStatus
          const isStayover=status==='Stayover'
          const requiresCorrectionOnly=['Arrival','Vacant','Blocked'].includes(status)
          const showHousekeepingWorkflow =
            isStayover ? service==='RF'
            : requiresCorrectionOnly ? Boolean(row.checkIssueOpen)
            : true
          return <article
            className={`rb-room-card ${statusClass(row.reservationStatus)} ${row.complete?'is-complete':'is-in-progress'} ${collapsed?'is-collapsed':''}`}
            data-room-condition={row.roomCondition||''}
            data-strip-hold={row.stripHold||''}
            data-reservation-status={row.reservationStatus||''}
            key={row.roomId}
          >
            {collapsed ? (
              <div className="rb-collapsed-row">
                <button
                  type="button"
                  className="rb-collapse-toggle"
                  onClick={()=>setCollapsedRooms(cur=>({...cur,[row.roomId]:false}))}
                  title="Expand room"
                >
                  <BedDouble size={17}/>
                  <strong>{row.roomName}</strong>
                  <ChevronDown size={15}/>
                </button>
                <div className="rb-collapsed-data">
                  {row.reservationStatus&&<span className={`rb-summary-pill ${statusClass(row.reservationStatus)}`}>{row.reservationStatus}</span>}
                  {service&&<span className="rb-summary-pill service"><b>Service</b> {service}</span>}
                  {showHousekeepingWorkflow&&<>
                    {staff.length
                      ? staff.map(name=><span className="rb-summary-pill staff" style={staffStyle(name)} key={name}><b>Staff</b> {name}</span>)
                      : <span className="rb-summary-pill staff-unassigned"><b>Staff</b> Unassigned</span>}
                    <span className="rb-summary-pill order"><b>Order</b> {row.cleanOrder??'—'}</span>
                    <span className={`rb-summary-pill progress ${row.complete?'is-done':'is-open'}`}>{row.complete?'Complete':'In progress'}</span>
                  </>}
                  <span className="rb-summary-pill eos"><b>EOS</b> {row.roomCondition||'—'}</span>
                  {row.breakfastTag&&<span className="rb-summary-pill breakfast">Breakfast</span>}
                  {row.stripHold&&<span className="rb-summary-pill warn">{row.stripHold}</span>}
                  {selectedPackages.map(name=><span className="rb-summary-pill package" key={name}>{name}</span>)}
                  {row.notes&&<span className="rb-summary-pill note" title={row.notes}><b>Note</b> {row.notes}</span>}
                </div>
              </div>
            ) : (
            <>
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
                <button
                  type="button"
                  className="rb-mini-collapse"
                  onClick={()=>setCollapsedRooms(cur=>({...cur,[row.roomId]:true}))}
                  title="Collapse room"
                >
                  <ChevronUp size={14}/>
                </button>
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

              {showHousekeepingWorkflow&&<>
                <div className="rb-field rb-staff-summary">
                  <span>Staff</span>
                  <strong>{staff.length?staff.join(', '):'Unassigned'}</strong>
                </div>

                <label className="rb-field rb-order-summary">
                  <span>Order</span>
                  <input type="number" min="1" value={row.cleanOrder??''} onChange={e=>patch(row.roomId,{cleanOrder:e.target.value?Number(e.target.value):null})}/>
                </label>

                <label className="rb-progress">
                  <input type="checkbox" checked={row.complete} onChange={e=>patch(row.roomId,{
                    complete:e.target.checked,
                    roomCondition:e.target.checked?(row.roomCondition||'Ready for Inspection'):row.roomCondition
                  })}/>
                  <span>{row.complete?'Complete ✓':'In progress'}</span>
                </label>
              </>}

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
            </>
            )}
          </article>
        })}
      </div>
    )}
  </div>
}
