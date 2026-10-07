'use client'

import { useEffect,useMemo,useRef,useState } from 'react'
import {
  AlertTriangle,
  BedDouble,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  X
} from 'lucide-react'

type Access={
  name?:string|null
  preferredName?:string|null
  roleName?:string|null
  isAdmin?:boolean
  permissions?:string[]
  capabilities?:string[]
}

type StaffOption={id:string;name:string;roleLabel?:string;fullRoomCleanLimit?:number}
type PackageOption={id:string;name:string;price:number|null;available:boolean}
type RoomRow={
  roomId:string
  roomName:string
  sortOrder:number
  reservationStatus:string
  serviceType:string
  requiresQualityCheck?:boolean
  stripHold:string
  assignedTo:string
  claimableRefresh?:boolean
  cleanOrder:number|null
  complete:boolean
  readyForInspection:boolean
  inspected:boolean
  completedAt?:string|null
  inspectedAt?:string|null
  roomCondition:string
  nextShiftCondition:string
  notes:string
  packageIds:string[]
  breakfastTag:boolean
  housekeeperAttested?:boolean
  housekeeperAttestedBy?:string|null
  housekeeperAttestedName?:string|null
  housekeeperAttestedAt?:string|null
  checkIssueOpen?:boolean
  checkIssueNote?:string
  checkIssueByName?:string|null
  checkIssueAt?:string|null
  haSignedBy?:string|null
  haSignedName?:string|null
  haSignedAt?:string|null
  fohSignedBy?:string|null
  fohSignedName?:string|null
  fohSignedAt?:string|null
  breakfast?:{serviceDate:string;status:'none'|'needed'|'received'|'declined';timeSlot?:string|null}
}

type CheckItem={id:string;zone:string;label:string;passed:boolean|null;note:string}
type InspectionRoom={
  roomId:string
  roomName:string
  reservationStatus:string
  serviceType:string
  assignedTo:string
  complete:boolean
  readyForInspection:boolean
  issueOpen:boolean
  issueNote:string
  inspected:boolean
  housekeeperName?:string|null
  latestInspection?:{stage:string;status:string;submittedAt:string;inspectorName:string}|null
  items:CheckItem[]
}

type SelfCheck={
  loading:boolean
  saving:boolean
  submitted:boolean
  submittedAt?:string|null
  items:Array<{id:string;zone:string;label:string;sort_order?:number}>
  checked:string[]
  openZones:string[]
}

type SaveState='idle'|'saving'|'saved'|'error'
type Filter='all'|'cleaning'|'self'|'inspection'|'correction'|'complete'

function todayDetroit(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
}
function normalize(v:unknown){return String(v||'').trim().toLowerCase()}
function splitAssigned(v:string){return String(v||'').split(',').map(x=>x.trim()).filter(Boolean)}
function shortTime(value?:string|null){
  if(!value)return ''
  const date=new Date(value)
  if(Number.isNaN(date.getTime()))return ''
  return new Intl.DateTimeFormat('en-US',{timeZone:'America/Detroit',hour:'numeric',minute:'2-digit'}).format(date)
}
function isManager(access:Access|null){
  if(!access)return false
  const caps=access.capabilities||[]
  return Boolean(access.isAdmin||caps.some(c=>['manager','general_manager','operations_manager','owner'].includes(c)))
}
function canInspect(access:Access|null){
  if(!access)return false
  const caps=access.capabilities||[]
  const perms=access.permissions||[]
  return Boolean(access.isAdmin||perms.includes('room_checks.perform')||caps.some(c=>['room_checks','ha_signoff','ha_signoff_override','manager','general_manager','operations_manager','owner'].includes(c)))
}
function isStayover(row:RoomRow){return normalize(row.reservationStatus)==='stayover'}
function isRefresh(row:RoomRow){return isStayover(row)&&String(row.serviceType||'').trim().toUpperCase()==='RF'}
function requiresRoomCheck(row:RoomRow){return !isStayover(row)}
function requiresSelfCheck(row:RoomRow){return Boolean(row.requiresQualityCheck)&&requiresRoomCheck(row)}
function workflowState(row:RoomRow,inspection?:InspectionRoom){
  if(row.checkIssueOpen||inspection?.issueOpen)return 'correction'
  if(isStayover(row)) return row.complete?'complete':'cleaning'
  if(requiresSelfCheck(row)&&!row.housekeeperAttested)return 'self'
  if(!row.complete)return 'cleaning'
  if(inspection && !inspection.inspected)return 'inspection'
  if(row.inspected && row.fohSignedBy)return 'complete'
  if(row.inspected)return 'foh'
  return row.complete?'inspection':'cleaning'
}

export default function UnifiedRoomsBoard(){
  const [date,setDate]=useState(todayDetroit())
  const [access,setAccess]=useState<Access|null>(null)
  const [rows,setRows]=useState<RoomRow[]>([])
  const [staffOptions,setStaffOptions]=useState<StaffOption[]>([])
  const [packageOptions,setPackageOptions]=useState<PackageOption[]>([])
  const [viewMode,setViewMode]=useState<'assigned'|'manager'>('manager')
  const [inspectionRooms,setInspectionRooms]=useState<InspectionRoom[]>([])
  const [selfChecks,setSelfChecks]=useState<Record<string,SelfCheck>>({})
  const [expanded,setExpanded]=useState<Record<string,boolean>>({})
  const [filter,setFilter]=useState<Filter>('all')
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')
  const [saveState,setSaveState]=useState<SaveState>('idle')
  const [canHaSignoff,setCanHaSignoff]=useState(false)
  const [canFohSignoff,setCanFohSignoff]=useState(false)
  const rowsRef=useRef<RoomRow[]>([])
  const dateRef=useRef(date)
  const saveTimer=useRef<ReturnType<typeof setTimeout>|null>(null)

  useEffect(()=>{rowsRef.current=rows},[rows])
  useEffect(()=>{dateRef.current=date},[date])

  async function load(){
    setLoading(true);setMessage('');setSaveState('idle');setSelfChecks({})
    try{
      const meResponse=await fetch('/api/me',{cache:'no-store'})
      const me=await meResponse.json().catch(()=>({}))
      if(!meResponse.ok)throw new Error(me.error||'Could not load your access.')
      const nextAccess=me.access||null
      setAccess(nextAccess)

      const dayResponse=await fetch(`/api/housekeeping/day?date=${encodeURIComponent(date)}`,{cache:'no-store'})
      const day=await dayResponse.json().catch(()=>({}))
      if(!dayResponse.ok)throw new Error(day.error||'Could not load rooms.')
      const nextRows=(day.rows||[]) as RoomRow[]
      setRows(nextRows);rowsRef.current=nextRows
      setViewMode(day.viewMode==='assigned'?'assigned':'manager')
      setStaffOptions(day.staffOptions||[])
      setPackageOptions(day.packageOptions||[])
      setCanHaSignoff(Boolean(day.signoffAccess?.canHaSignoff))
      setCanFohSignoff(Boolean(day.signoffAccess?.canFohSignoff))

      if(canInspect(nextAccess)){
        const checksResponse=await fetch(`/api/room-checks?date=${encodeURIComponent(date)}`,{cache:'no-store'})
        const checks=await checksResponse.json().catch(()=>({}))
        if(checksResponse.ok)setInspectionRooms(checks.rooms||[])
        else if(checksResponse.status!==403)throw new Error(checks.error||'Could not load room inspections.')
      }else setInspectionRooms([])
    }catch(error:any){
      setMessage(error?.message||'Could not load rooms.')
    }finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[date])

  async function saveRows(source=rowsRef.current){
    setSaveState('saving')
    try{
      const response=await fetch('/api/housekeeping/day',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({serviceDate:dateRef.current,rows:source})
      })
      const d=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(d.error||'Could not save rooms.')
      setSaveState('saved')
      return true
    }catch(error:any){
      setSaveState('error');setMessage(error?.message||'Could not save rooms.');return false
    }
  }

  function patch(roomId:string,update:Partial<RoomRow>,autosave=true){
    setRows(current=>{
      const next=current.map(r=>r.roomId===roomId?{...r,...update}:r)
      rowsRef.current=next
      if(autosave){
        if(saveTimer.current)clearTimeout(saveTimer.current)
        saveTimer.current=setTimeout(()=>void saveRows(next),550)
      }
      return next
    })
  }

  async function loadSelfCheck(row:RoomRow){
    const existing=selfChecks[row.roomId]
    if(existing?.items?.length)return
    setSelfChecks(current=>({...current,[row.roomId]:{loading:true,saving:false,submitted:false,items:[],checked:[],openZones:[]}}))
    try{
      const response=await fetch(`/api/housekeeping/self-check?date=${encodeURIComponent(date)}&roomId=${encodeURIComponent(row.roomId)}`,{cache:'no-store'})
      const d=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(d.error||'Could not load self-check.')
      const items=d.items||[]
      setSelfChecks(current=>({...current,[row.roomId]:{
        loading:false,saving:false,submitted:Boolean(d.submitted),submittedAt:d.submittedAt||null,
        items,checked:d.submitted?items.map((i:any)=>String(i.id)):[],openZones:[]
      }}))
    }catch(error:any){
      setSelfChecks(current=>({...current,[row.roomId]:{loading:false,saving:false,submitted:false,items:[],checked:[],openZones:[]}}))
      setMessage(error?.message||'Could not load self-check.')
    }
  }

  function confirmZone(roomId:string,zone:string){
    setSelfChecks(current=>{
      const state=current[roomId];if(!state||state.submitted)return current
      const zoneIds=state.items.filter(i=>i.zone===zone).map(i=>String(i.id))
      const allConfirmed=zoneIds.every(id=>state.checked.includes(id))
      const checked=allConfirmed?state.checked.filter(id=>!zoneIds.includes(id)):[...new Set([...state.checked,...zoneIds])]
      return {...current,[roomId]:{...state,checked}}
    })
  }

  function toggleZoneDetails(roomId:string,zone:string){
    setSelfChecks(current=>{
      const state=current[roomId];if(!state)return current
      const open=state.openZones.includes(zone)?state.openZones.filter(z=>z!==zone):[...state.openZones,zone]
      return {...current,[roomId]:{...state,openZones:open}}
    })
  }

  async function submitSelfCheck(row:RoomRow){
    const state=selfChecks[row.roomId];if(!state||state.saving)return
    if(state.checked.length!==state.items.length){setMessage('Confirm every room area before submitting.');return}
    setSelfChecks(current=>({...current,[row.roomId]:{...state,saving:true}}))
    try{
      const response=await fetch('/api/housekeeping/self-check',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({date,roomId:row.roomId,checkedItemIds:state.checked})
      })
      const d=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(d.error||'Could not submit self-check.')
      setSelfChecks(current=>({...current,[row.roomId]:{...current[row.roomId],saving:false,submitted:true,submittedAt:d.submittedAt}}))
      patch(row.roomId,{housekeeperAttested:true,housekeeperAttestedBy:d.housekeeperId,housekeeperAttestedName:d.housekeeperName,housekeeperAttestedAt:d.submittedAt},false)
      setMessage(`${row.roomName} self-check submitted. You can mark the clean complete.`)
    }catch(error:any){
      setSelfChecks(current=>({...current,[row.roomId]:{...current[row.roomId],saving:false}}))
      setMessage(error?.message||'Could not submit self-check.')
    }
  }

  async function toggleComplete(row:RoomRow){
    const next=!row.complete
    if(next&&requiresSelfCheck(row)&&!row.housekeeperAttestedBy){setMessage('Complete the room self-check before marking this clean complete.');return}
    const nextRows=rowsRef.current.map(r=>r.roomId===row.roomId?{
      ...r,
      complete:next,
      readyForInspection:next&&requiresRoomCheck(r),
      inspected:false,
      roomCondition:next?(isStayover(r)?(r.roomCondition||'Occupied'):'Ready for Inspection'):'Cleaning',
      ...(next?{}:{haSignedBy:null,haSignedName:null,haSignedAt:null,fohSignedBy:null,fohSignedName:null,fohSignedAt:null})
    }:r)
    setRows(nextRows);rowsRef.current=nextRows
    if(await saveRows(nextRows))await load()
  }

  async function claimRefresh(row:RoomRow){
    const response=await fetch('/api/housekeeping/claim-refresh',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({serviceDate:date,roomId:row.roomId})
    })
    const d=await response.json().catch(()=>({}))
    if(!response.ok){setMessage(d.error||'Could not claim refresh.');return}
    await load()
  }

  async function setInspectionResult(room:InspectionRoom,item:CheckItem,passed:boolean){
    const note=item.note||''
    setInspectionRooms(current=>current.map(r=>r.roomId===room.roomId?{...r,items:r.items.map(i=>i.id===item.id?{...i,passed}:i)}:r))
    const response=await fetch('/api/room-checks',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({date,roomId:room.roomId,itemId:item.id,passed,note})
    })
    const d=await response.json().catch(()=>({}))
    if(!response.ok){setMessage(d.error||'Could not save inspection item.');await load();return}

    if(d.complete&&d.allPassed){
      const now=new Date().toISOString()

      // Final pass: update only this room in place. This preserves scroll/card
      // state and immediately collapses the completed checklist.
      setInspectionRooms(current=>current.map(currentRoom=>
        currentRoom.roomId===room.roomId
          ? {...currentRoom,inspected:true,readyForInspection:false,issueOpen:false,issueNote:''}
          : currentRoom
      ))

      setRows(current=>{
        const next=current.map(currentRow=>{
          if(currentRow.roomId!==room.roomId)return currentRow
          const status=normalize(currentRow.reservationStatus)
          let roomCondition=currentRow.roomCondition
          if(['checkout','vacant','dirty'].includes(status))roomCondition='Vacant (Clean)'
          else if(status==='out/in')roomCondition='Ready'
          else if(status==='arrival'&&normalize(currentRow.roomCondition)!=='occupied')roomCondition='Ready'

          return {
            ...currentRow,
            inspected:true,
            inspectedAt:now,
            readyForInspection:false,
            checkIssueOpen:false,
            checkIssueNote:'',
            roomCondition,
            haSignedBy:currentRow.haSignedBy||'signed',
            haSignedName:currentRow.haSignedName||access?.preferredName||access?.name||'Signed',
            haSignedAt:currentRow.haSignedAt||now
          }
        })
        rowsRef.current=next
        return next
      })
      setMessage('')
      return
    }

    // A completed inspection with a failed item changes correction state in
    // several backend records, so reconcile only that uncommon path.
    if(d.complete)await load()
  }

  function updateInspectionNote(roomId:string,itemId:string,note:string){
    setInspectionRooms(current=>current.map(r=>r.roomId===roomId?{...r,items:r.items.map(i=>i.id===itemId?{...i,note}:i)}:r))
  }

  async function signOff(row:RoomRow,kind:'ha'|'foh'){
    const response=await fetch('/api/housekeeping/signoff',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({serviceDate:date,roomId:row.roomId,kind})
    })
    const d=await response.json().catch(()=>({}))
    if(!response.ok){setMessage(d.error||'Could not save sign-off.');return}

    // Keep the current card open and preserve scroll position. Sign-off should
    // update only this room instead of reloading the entire Rooms workspace.
    setRows(current=>{
      const next=current.map(currentRow=>{
        if(currentRow.roomId!==row.roomId)return currentRow
        if(kind==='ha'){
          return {
            ...currentRow,
            haSignedBy:d.signedBy||d.staffMemberId||currentRow.haSignedBy||'signed',
            haSignedName:d.signedName||d.staffName||access?.preferredName||access?.name||'Signed',
            haSignedAt:d.signedAt||new Date().toISOString()
          }
        }
        return {
          ...currentRow,
          fohSignedBy:d.signedBy||d.staffMemberId||currentRow.fohSignedBy||'signed',
          fohSignedName:d.signedName||d.staffName||access?.preferredName||access?.name||'Signed',
          fohSignedAt:d.signedAt||new Date().toISOString()
        }
      })
      rowsRef.current=next
      return next
    })
    setMessage('')
  }

  function assignStaff(row:RoomRow,name:string){
    if(!isManager(access))return
    patch(row.roomId,{assignedTo:name})
  }

  const checkByRoom=useMemo(()=>new Map(inspectionRooms.map(r=>[r.roomId,r])),[inspectionRooms])
  const filtered=useMemo(()=>rows.filter(row=>{
    if(filter==='all')return true
    const state=workflowState(row,checkByRoom.get(row.roomId))
    if(filter==='cleaning')return state==='cleaning'
    if(filter==='self')return state==='self'
    if(filter==='inspection')return state==='inspection'||state==='foh'
    if(filter==='correction')return state==='correction'
    return state==='complete'
  }),[rows,filter,checkByRoom])

  const counts=useMemo(()=>({
    all:rows.length,
    cleaning:rows.filter(r=>workflowState(r,checkByRoom.get(r.roomId))==='cleaning').length,
    self:rows.filter(r=>workflowState(r,checkByRoom.get(r.roomId))==='self').length,
    inspection:rows.filter(r=>['inspection','foh'].includes(workflowState(r,checkByRoom.get(r.roomId)))).length,
    correction:rows.filter(r=>workflowState(r,checkByRoom.get(r.roomId))==='correction').length,
    complete:rows.filter(r=>workflowState(r,checkByRoom.get(r.roomId))==='complete').length
  }),[rows,checkByRoom])

  return <div className="rooms-workspace module-pretty-page">
    <div className="module-toolbar rooms-toolbar">
      <div>
        <div className="module-kicker">Daily room operations</div>
        <h1>Rooms</h1>
        <p>{viewMode==='assigned'?'Your assigned housekeeping work and corrections.':'Cleaning, room inspections, HA and FOH checks in one workflow.'}</p>
      </div>
      <div className="toolbar-actions">
        <label className="date-control">Date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
        <button type="button" className="ops-secondary-btn" onClick={()=>void load()}><RefreshCw size={15}/>Refresh</button>
      </div>
    </div>

    <div className="rooms-filter-strip" role="tablist" aria-label="Room workflow filters">
      {([
        ['all','All',counts.all],['cleaning','Cleaning',counts.cleaning],['self','Self-check',counts.self],
        ['inspection','Room check',counts.inspection],['correction','Correction',counts.correction],['complete','Complete',counts.complete]
      ] as Array<[Filter,string,number]>).map(([key,label,count])=><button key={key} type="button" className={filter===key?'active':''} onClick={()=>setFilter(key)}>{label}<span>{count}</span></button>)}
    </div>

    <div className={`rooms-save-state ${saveState}`}>{saveState==='saving'?'Saving…':saveState==='error'?'Save failed':saveState==='saved'?'Saved ✓':''}</div>
    {message&&<div className="module-message">{message}</div>}

    {loading?<div className="module-empty">Loading rooms…</div>:filtered.length===0?<div className="module-empty">No rooms in this view.</div>:
      <div className="rooms-card-list">
        {filtered.map(row=>{
          const inspection=checkByRoom.get(row.roomId)
          const state=workflowState(row,inspection)
          const isOpen=Boolean(expanded[row.roomId])
          const self=selfChecks[row.roomId]
          const zones=[...new Set((self?.items||[]).map(i=>i.zone))]
          const assigned=splitAssigned(row.assignedTo)
          const failedCount=inspection?.items.filter(i=>i.passed===false).length||0
          const checkedCount=inspection?.items.filter(i=>i.passed!==null).length||0
          const packageNames=(row.packageIds||[]).map(id=>packageOptions.find(p=>p.id===id)?.name).filter(Boolean)

          return <section key={row.roomId} className={`rooms-card state-${state} ${row.checkIssueOpen?'has-issue':''}`}>
            <button type="button" className="rooms-card-header" onClick={()=>{
              const next=!isOpen;setExpanded(current=>({...current,[row.roomId]:next}))
              if(next&&requiresSelfCheck(row)&&!row.housekeeperAttested&&!selfChecks[row.roomId])void loadSelfCheck(row)
            }}>
              <div className="rooms-card-title">
                <span className="rooms-chevron">{isOpen?<ChevronDown size={18}/>:<ChevronRight size={18}/>}</span>
                <span><strong>{row.roomName}</strong><small>{row.reservationStatus||'No status'}{row.serviceType?` · ${row.serviceType}`:''}</small></span>
              </div>
              <div className={`rooms-state-pill ${state}`}>
                {state==='correction'?'Correction':state==='self'?'Self-check':state==='inspection'?'Room check':state==='foh'?'FOH check':state==='complete'?'Complete':'Cleaning'}
              </div>
            </button>

            <div className="rooms-progress" aria-label="Room workflow progress">
              <span className={row.complete?'done':''}>Clean</span>
              {requiresRoomCheck(row)&&<span className={row.housekeeperAttested?'done':''}>Self</span>}
              {requiresRoomCheck(row)&&<span className={row.inspected?'done':''}>Check</span>}
              {requiresRoomCheck(row)&&<span className={row.haSignedBy?'done':''}>HA</span>}
              {requiresRoomCheck(row)&&<span className={row.fohSignedBy?'done':''}>FOH</span>}
            </div>

            {isOpen&&<div className="rooms-card-body">
              {row.checkIssueOpen&&<div className="rooms-correction-box"><AlertTriangle size={17}/><div><strong>Correction required</strong><span>{row.checkIssueNote||'A room check found an issue that must be corrected.'}</span>{row.checkIssueByName&&<small>Flagged by {row.checkIssueByName}</small>}</div></div>}

              <div className="rooms-meta-grid">
                <div><span>Assigned</span><strong>{assigned.length?assigned.join(', '):'Unassigned'}</strong></div>
                <div><span>Condition</span><strong>{row.roomCondition||'—'}</strong></div>
                {row.housekeeperAttestedAt&&<div><span>Self-check</span><strong>{shortTime(row.housekeeperAttestedAt)}</strong></div>}
                {row.inspectedAt&&<div><span>Inspected</span><strong>{shortTime(row.inspectedAt)}</strong></div>}
              </div>

              {isManager(access)&&<div className="rooms-manager-row">
                <label>Assign cleaner<select value={assigned[0]||''} onChange={e=>assignStaff(row,e.target.value)}><option value="">Unassigned</option>{staffOptions.map(person=><option key={person.id} value={person.name}>{person.name}</option>)}</select></label>
              </div>}

              {viewMode==='manager'&&packageNames.length>0&&<div className="rooms-info-callout"><strong>Room items</strong><span>{packageNames.join(', ')}</span></div>}

              <label className="rooms-notes">Housekeeping notes<textarea value={row.notes||''} onChange={e=>patch(row.roomId,{notes:e.target.value})} placeholder="Room-specific housekeeping notes…"/></label>

              {row.claimableRefresh&&<button type="button" className="ops-primary-btn rooms-primary-action" onClick={()=>void claimRefresh(row)}><UserRoundCheck size={16}/>Claim refresh</button>}

              {requiresSelfCheck(row)&&(row.housekeeperAttested||self?.submitted
                ? <section className="rooms-section">
                    <div className="rooms-success-line"><Check size={16}/><strong>Self-check</strong><span>Complete ✓</span></div>
                  </section>
                : <section className="rooms-section">
                    <div className="rooms-section-heading"><ClipboardCheck size={17}/><div><strong>Housekeeper self-check</strong><small>Confirm each room area before completing the clean.</small></div></div>
                    {self?.loading?<div className="rooms-inline-loading">Loading checklist…</div>:self&&<>
                      <div className="rooms-zone-list">{zones.map(zone=>{
                        const zoneItems=self.items.filter(i=>i.zone===zone)
                        const confirmed=zoneItems.every(i=>self.checked.includes(String(i.id)))
                        const detailsOpen=self.openZones.includes(zone)
                        return <div className={`rooms-zone ${confirmed?'confirmed':''}`} key={zone}>
                          <div className="rooms-zone-main">
                            <button type="button" className="rooms-zone-confirm" onClick={()=>confirmZone(row.roomId,zone)}>{confirmed?<Check size={17}/>:<span className="rooms-empty-check"/>}<span><strong>{zone}</strong><small>{zoneItems.length} standard{zoneItems.length===1?'':'s'}</small></span></button>
                            <button type="button" className="rooms-zone-details" onClick={()=>toggleZoneDetails(row.roomId,zone)} aria-label={`Show ${zone} details`}>{detailsOpen?<ChevronDown size={17}/>:<ChevronRight size={17}/>}</button>
                          </div>
                          {detailsOpen&&<ul>{zoneItems.map(item=><li key={item.id}>{item.label}</li>)}</ul>}
                        </div>
                      })}</div>
                      <button type="button" className="ops-primary-btn rooms-primary-action" disabled={self.saving||self.checked.length!==self.items.length} onClick={()=>void submitSelfCheck(row)}><Check size={16}/>{self.saving?'Submitting…':`Submit self-check (${self.checked.length}/${self.items.length})`}</button>
                    </>}
                  </section>)}

              <section className="rooms-section">
                <div className="rooms-section-heading"><BedDouble size={17}/><div><strong>Cleaning</strong><small>{isStayover(row)?'Stayovers and refreshes do not require a room inspection.':'Full clean must be complete before inspection.'}</small></div></div>
                <button type="button" className={row.complete?'ops-secondary-btn rooms-primary-action':'ops-primary-btn rooms-primary-action'} onClick={()=>void toggleComplete(row)} disabled={!row.complete&&requiresSelfCheck(row)&&!row.housekeeperAttestedBy}><Check size={16}/>{row.complete?(isStayover(row)?'Stayover service complete ✓':'Ready for inspection ✓'):(row.checkIssueOpen?'Correction complete · send for re-check':'Mark clean complete')}</button>
              </section>

              {canInspect(access)&&inspection&&requiresRoomCheck(row)&&((row.inspected||inspection.inspected)&&!inspection.issueOpen
                ? <section className="rooms-section inspection-section">
                    <div className="rooms-success-line"><Check size={16}/><strong>Room check</strong><span>Pass ✓</span></div>
                  </section>
                : <section className="rooms-section inspection-section">
                    <div className="rooms-section-heading"><ShieldCheck size={17}/><div><strong>Independent room check</strong><small>{inspection.readyForInspection?`${checkedCount}/${inspection.items.length} standards checked`:'Waiting for housekeeping'}</small></div></div>
                    {inspection.issueOpen&&<div className="rooms-info-callout issue"><strong>Needs correction</strong><span>{inspection.issueNote}</span></div>}
                    {!inspection.readyForInspection?<div className="rooms-waiting">Housekeeping must finish the room and self-check before inspection.</div>:
                      <div className="rooms-inspection-list">{[...new Set(inspection.items.map(i=>i.zone))].map(zone=><div className="rooms-inspection-zone" key={zone}><h4>{zone}</h4>{inspection.items.filter(i=>i.zone===zone).map(item=><div className={`rooms-inspection-item ${item.passed===true?'pass':item.passed===false?'fail':''}`} key={item.id}><div><strong>{item.label}</strong>{item.passed===false&&<input value={item.note} onChange={e=>updateInspectionNote(row.roomId,item.id,e.target.value)} onBlur={()=>void setInspectionResult(inspection,item,false)} placeholder="What needs correction?"/>}</div><div className="rooms-inspection-actions"><button type="button" className={item.passed===true?'active pass':''} onClick={()=>void setInspectionResult(inspection,item,true)}><Check size={16}/>Pass</button><button type="button" className={item.passed===false?'active fail':''} onClick={()=>void setInspectionResult(inspection,item,false)}><X size={16}/>Fix</button></div></div>)}</div>)}</div>}
                    {failedCount>0&&<div className="rooms-warning-line"><AlertTriangle size={16}/>{failedCount} item{failedCount===1?'':'s'} marked for correction.</div>}
                  </section>)}

              {viewMode==='manager'&&requiresRoomCheck(row)&&<section className="rooms-section rooms-signoffs">
                <div className="rooms-section-heading"><UserRoundCheck size={17}/><div><strong>Final checks</strong><small>Visible only to staff with room-check/sign-off access.</small></div></div>
                <div className="rooms-signoff-grid">
                  <button type="button" className={row.haSignedBy?'signed':''} disabled={!canHaSignoff||!row.complete} onClick={()=>void signOff(row,'ha')}><span>HA</span><strong>{row.haSignedBy?`${row.haSignedName||'Signed'} ✓`:'Sign off'}</strong></button>
                  <button type="button" className={row.fohSignedBy?'signed':''} disabled={!canFohSignoff||!row.complete} onClick={()=>void signOff(row,'foh')}><span>FOH</span><strong>{row.fohSignedBy?`${row.fohSignedName||'Signed'} ✓`:'Final check'}</strong></button>
                </div>
              </section>}
            </div>}
          </section>
        })}
      </div>}
  </div>
}
