'use client'

import { getStaffSession } from '@/lib/client/staff-session'

import { useEffect,useMemo,useRef,useState } from 'react'
import { derivedLiveCondition, finalVerificationComplete, requiresHousekeeperSelfCheck, roomNextAction, roomWorkflowLabel, roomWorkflowState } from '@/lib/room-state'
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
  email?:string|null
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
  lateArrival:boolean
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
type Filter='active'|'all'|'stayovers'|'cleaning'|'self'|'inspection'|'correction'|'complete'

const reservationOptions=['','Checkout','Out/In','Stayover','Arrival','Vacant','Dirty','Blocked']

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
function managerInitials(access:Access|null){
  if(!access)return ''
  const combined=normalize(`${access.name||''} ${access.preferredName||''} ${access.email||''}`)
  if(combined.includes('sarah')||combined.includes('lacysa'))return 'SL'
  if(combined.includes('brittany')||combined.includes('hollingshead'))return 'BH'
  if(combined.includes('david')||combined.includes('heiser'))return 'DH'
  const raw=String(access.name||access.preferredName||'').trim()
  const parts=raw.split(/\s+/).filter(Boolean)
  if(parts.length>=2)return `${parts[0][0]}${parts[parts.length-1][0]}`.toUpperCase()
  return raw.slice(0,2).toUpperCase()
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
function isBlocked(row:RoomRow){return normalize(row.reservationStatus)==='blocked'||normalize(row.stripHold).includes('hold')}
function requiresRoomCheck(row:RoomRow){return !isStayover(row)&&!isBlocked(row)}
function requiresSelfCheck(row:RoomRow){return requiresHousekeeperSelfCheck(row)}
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
  const [refreshRoomId,setRefreshRoomId]=useState('')
  const [managerDisplay,setManagerDisplay]=useState<'focus'|'cards'|'table'>('focus')
  const [selectedRoomId,setSelectedRoomId]=useState('')
  const [roomSearch,setRoomSearch]=useState('')
  const rowsRef=useRef<RoomRow[]>([])
  const dateRef=useRef(date)
  const saveTimers=useRef<Record<string,ReturnType<typeof setTimeout>>>({})
  const pendingPatches=useRef<Record<string,Partial<RoomRow>>>({})
  const saveQueues=useRef<Record<string,Promise<boolean>>>({})
  const [isCompact,setIsCompact]=useState(false)

  useEffect(()=>{rowsRef.current=rows},[rows])
  useEffect(()=>{dateRef.current=date},[date])
  useEffect(()=>{
    const query=window.matchMedia('(max-width: 900px)')
    const sync=()=>{
      setIsCompact(query.matches)
      if(query.matches){setManagerDisplay('focus');setFilter(current=>current==='all'?'active':current)}
      else{
        try{
          const saved=window.localStorage.getItem('ths-rooms-manager-view')
          if(saved==='table'||saved==='cards'||saved==='focus')setManagerDisplay(saved)
        }catch{}
      }
    }
    sync(); query.addEventListener('change',sync)
    return()=>query.removeEventListener('change',sync)
  },[])

  async function load(){
    setLoading(true);setMessage('');setSaveState('idle');setSelfChecks({})
    try{
      const [me,dayResponse]=await Promise.all([
        getStaffSession(),
        fetch(`/api/housekeeping/day?date=${encodeURIComponent(date)}`,{cache:'no-store'})
      ])
      const nextAccess=me.access||null
      setAccess(nextAccess)

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

  async function saveRoomPatch(roomId:string,update:Partial<RoomRow>){
    setSaveState('saving')
    try{
      const response=await fetch('/api/housekeeping/day',{
        method:'PATCH',headers:{'content-type':'application/json'},
        body:JSON.stringify({serviceDate:dateRef.current,roomId,patch:update})
      })
      const d=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(d.error||'Could not save room.')
      if(d.row){
        setRows(current=>{
          const next=current.map(row=>{
            if(row.roomId!==roomId)return row
            // Do not replace values the user has edited since this request began.
            const serverRow=d.row as Partial<RoomRow>
            const safeFields=Object.fromEntries(Object.entries(serverRow).filter(([key])=>
              !(key in (pendingPatches.current[roomId]||{})) &&
              (!(key in update) || row[key as keyof RoomRow]===update[key as keyof RoomRow])
            ))
            return {...row,...safeFields}
          })
          rowsRef.current=next
          return next
        })
      }
      setSaveState('saved')
      window.setTimeout(()=>setSaveState(current=>current==='saved'?'idle':current),1600)
      return true
    }catch(error:any){
      setSaveState('error');setMessage(error?.message||'Could not save room.');return false
    }
  }

  function patch(roomId:string,update:Partial<RoomRow>,autosave=true){
    setRows(current=>{
      const next=current.map(r=>r.roomId===roomId?{...r,...update}:r)
      rowsRef.current=next
      return next
    })
    if(autosave){
      pendingPatches.current[roomId]={...(pendingPatches.current[roomId]||{}),...update}
      const existing=saveTimers.current[roomId]
      if(existing)clearTimeout(existing)
      saveTimers.current[roomId]=setTimeout(()=>{
        const pending=pendingPatches.current[roomId]||{}
        delete pendingPatches.current[roomId]
        const previous=saveQueues.current[roomId]||Promise.resolve(true)
        const queued=previous.catch(()=>false).then(()=>saveRoomPatch(roomId,pending))
        saveQueues.current[roomId]=queued
        void queued.finally(()=>{if(saveQueues.current[roomId]===queued)delete saveQueues.current[roomId]})
      },450)
    }
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
    if(isBlocked(row)){setMessage('Blocked / held rooms are awareness-only and are not part of the cleaning workflow.');return}
    const next=!row.complete
    if(next&&requiresSelfCheck(row)&&!row.housekeeperAttestedBy){setMessage('Complete the room self-check before marking this clean complete.');return}
    const update:Partial<RoomRow>={
      complete:next,
      readyForInspection:next&&requiresRoomCheck(row),
      inspected:false,
      roomCondition:next?(isStayover(row)?'Occupied':'Ready for Room Check'):'Cleaning',
      ...(next?{}:{haSignedBy:null,haSignedName:null,haSignedAt:null,fohSignedBy:null,fohSignedName:null,fohSignedAt:null})
    }
    patch(row.roomId,update,false)
    const ok=await saveRoomPatch(row.roomId,update)
    if(!ok)patch(row.roomId,row,false)
  }

  async function claimRefresh(row:RoomRow){
    const response=await fetch('/api/housekeeping/claim-refresh',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({serviceDate:date,roomId:row.roomId})
    })
    const d=await response.json().catch(()=>({}))
    if(!response.ok){setMessage(d.error||'Could not claim refresh.');return}
    patch(row.roomId,{assignedTo:d.assignedTo||access?.preferredName||access?.name||row.assignedTo,claimableRefresh:false},false)
    setMessage(`${row.roomName} refresh claimed.`)
  }

  async function setInspectionResult(room:InspectionRoom,item:CheckItem,passed:boolean){
    const note=item.note||''
    const roomElement=document.getElementById(`room-card-${room.roomId}`)
    const beforeTop=roomElement?.getBoundingClientRect().top ?? null

    setInspectionRooms(current=>current.map(r=>r.roomId===room.roomId?{...r,items:r.items.map(i=>i.id===item.id?{...i,passed}:i)}:r))
    const response=await fetch('/api/room-checks',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({date,roomId:room.roomId,itemId:item.id,passed,note})
    })
    const d=await response.json().catch(()=>({}))
    if(!response.ok){setMessage(d.error||'Could not save inspection item.');setInspectionRooms(current=>current.map(r=>r.roomId===room.roomId?{...r,items:r.items.map(i=>i.id===item.id?{...i,passed:item.passed}:i)}:r));return}

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

      if(beforeTop!==null){
        window.requestAnimationFrame(()=>{
          window.requestAnimationFrame(()=>{
            const after=document.getElementById(`room-card-${room.roomId}`)?.getBoundingClientRect().top
            if(after!==undefined)window.scrollBy({top:after-beforeTop,left:0,behavior:'auto'})
          })
        })
      }
      return
    }

    // Failed inspections can alter several backend records and correction
    // assignments. Reconcile that path only; successful completion never reloads.
    if(d.complete&&d.failed>0){
      const issue=d.issue||room.items.filter(i=>i.passed===false).map(i=>`${i.label}${i.note?`: ${i.note}`:''}`).join(' · ')
      setInspectionRooms(current=>current.map(r=>r.roomId===room.roomId?{...r,issueOpen:true,issueNote:issue,readyForInspection:false,inspected:false,items:r.items.map(i=>({...i,passed:null}))}:r))
      patch(room.roomId,{complete:false,readyForInspection:false,inspected:false,roomCondition:'Cleaning',housekeeperAttested:false,housekeeperAttestedBy:null,housekeeperAttestedAt:null,checkIssueOpen:true,checkIssueNote:issue,haSignedBy:null,haSignedName:null,haSignedAt:null,fohSignedBy:null,fohSignedName:null,fohSignedAt:null},false)
      setSelfChecks(current=>({...current,[room.roomId]:{...(current[room.roomId]||{loading:false,saving:false,submitted:false,items:[],checked:[],openZones:[]}),submitted:false,checked:[]}}))
      setMessage(`${room.roomName} needs correction.`)
    }
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

  function setRefresh(row:RoomRow){
    if(!isManager(access))return
    patch(row.roomId,{
      serviceType:'RF',
      complete:false,
      readyForInspection:false,
      inspected:false,
      roomCondition:row.roomCondition||'Occupied',
      haSignedBy:null,haSignedName:null,haSignedAt:null,
      fohSignedBy:null,fohSignedName:null,fohSignedAt:null
    })
  }

  function clearService(row:RoomRow){
    if(!isManager(access))return
    patch(row.roomId,{serviceType:''})
  }

  function setOut(row:RoomRow){
    if(!isManager(access))return
    patch(row.roomId,{serviceType:'OUT'})
  }

  function initialOut(row:RoomRow){
    if(!isManager(access))return
    const initials=managerInitials(access)
    if(!initials){
      setMessage('Manager initials could not be determined from your profile.')
      return
    }
    if(!String(row.serviceType||'').toUpperCase().startsWith('OUT')){
      setMessage('Mark the room OUT before initialing it.')
      return
    }
    patch(row.roomId,{serviceType:`OUT-${initials}`})
    setMessage('')
  }

  function togglePackage(row:RoomRow,packageId:string){
    if(!isManager(access))return
    const current=Array.isArray(row.packageIds)?row.packageIds:[]
    const next=current.includes(packageId)?current.filter(id=>id!==packageId):[...current,packageId]
    patch(row.roomId,{packageIds:next})
  }

  function promoteSelectedRefresh(){
    const row=rowsRef.current.find(r=>r.roomId===refreshRoomId)
    if(!row)return
    setRefresh(row)
    setRefreshRoomId('')
    setExpanded(current=>({...current,[row.roomId]:true}))
  }

  function chooseManagerDisplay(next:'focus'|'cards'|'table'){
    if(isCompact&&next==='table')return
    setManagerDisplay(next)
    try{window.localStorage.setItem('ths-rooms-manager-view',next)}catch{}
  }

  function openRoomCard(row:RoomRow){
    chooseManagerDisplay('focus')
    setSelectedRoomId(row.roomId)
    setExpanded(current=>({...current,[row.roomId]:true}))
    window.requestAnimationFrame(()=>{
      document.getElementById(`room-card-${row.roomId}`)?.scrollIntoView({block:'start',behavior:'smooth'})
    })
  }

  const checkByRoom=useMemo(()=>new Map(inspectionRooms.map(r=>[r.roomId,r])),[inspectionRooms])
  const activeRows=useMemo(()=>rows.filter(row=>!isStayover(row)||isRefresh(row)),[rows])
  const inactiveStayovers=useMemo(()=>rows.filter(row=>isStayover(row)&&!isRefresh(row)),[rows])
  const filtered=useMemo(()=>rows.filter(row=>{
    if(filter==='stayovers')return isStayover(row)
    if(isStayover(row)&&!isRefresh(row))return filter==='all'
    const state=roomWorkflowState({...row,checkIssueOpen:row.checkIssueOpen||checkByRoom.get(row.roomId)?.issueOpen})
    if(filter==='all')return true
    if(filter==='active')return !['ready','blocked','occupied'].includes(state)
    if(filter==='cleaning')return state==='cleaning'
    if(filter==='self')return state==='self'
    if(filter==='inspection')return state==='inspection'||state==='final'
    if(filter==='correction')return state==='correction'
    return state==='ready'
  }),[rows,filter,checkByRoom])

  const searchedRows=useMemo(()=>filtered.filter(row=>`${row.roomName} ${row.reservationStatus} ${row.assignedTo} ${row.serviceType}`.toLowerCase().includes(roomSearch.trim().toLowerCase())),[filtered,roomSearch])
  const selectedRow=searchedRows.find(row=>row.roomId===selectedRoomId)||searchedRows[0]
  const displayRows=managerDisplay==='focus'?(selectedRow?[selectedRow]:[]):searchedRows
  function focusRoom(row:RoomRow){setSelectedRoomId(row.roomId);setExpanded(current=>({...current,[row.roomId]:true}));if(requiresSelfCheck(row)&&!row.housekeeperAttested&&!selfChecks[row.roomId])void loadSelfCheck(row)}
  const counts=useMemo(()=>({
    active:activeRows.filter(r=>!['ready','blocked','occupied'].includes(roomWorkflowState({...r,checkIssueOpen:r.checkIssueOpen||checkByRoom.get(r.roomId)?.issueOpen}))).length,
    all:rows.length,
    stayovers:inactiveStayovers.length,
    cleaning:activeRows.filter(r=>roomWorkflowState({...r,checkIssueOpen:r.checkIssueOpen||checkByRoom.get(r.roomId)?.issueOpen})==='cleaning').length,
    self:activeRows.filter(r=>roomWorkflowState({...r,checkIssueOpen:r.checkIssueOpen||checkByRoom.get(r.roomId)?.issueOpen})==='self').length,
    inspection:activeRows.filter(r=>['inspection','final'].includes(roomWorkflowState({...r,checkIssueOpen:r.checkIssueOpen||checkByRoom.get(r.roomId)?.issueOpen}))).length,
    correction:activeRows.filter(r=>roomWorkflowState({...r,checkIssueOpen:r.checkIssueOpen||checkByRoom.get(r.roomId)?.issueOpen})==='correction').length,
    complete:activeRows.filter(r=>roomWorkflowState({...r,checkIssueOpen:r.checkIssueOpen||checkByRoom.get(r.roomId)?.issueOpen})==='ready').length
  }),[activeRows,inactiveStayovers,rows,checkByRoom])

  return <div className="rooms-workspace module-pretty-page">
    <div className="module-toolbar rooms-toolbar">
      <div>
        <div className="module-kicker">Daily room operations</div>
        <h1>Rooms</h1>
        <p>{viewMode==='assigned'?'Your assigned housekeeping work and corrections.':'A clear room-by-room path from turnover to guest-ready.'}</p>
      </div>
      <div className="toolbar-actions">
        <label className="date-control">Date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
        <button type="button" className="ops-secondary-btn" onClick={()=>void load()}><RefreshCw size={15}/>Refresh</button>
      </div>
    </div>

    {viewMode==='manager'&&isManager(access)&&inactiveStayovers.length>0&&<section className="rooms-stayover-planner">
      <div className="rooms-stayover-heading"><div><strong>Stayovers & refresh coverage</strong><span>Visible for planning. Assigning coverage alone does not request a refresh or add a cleaning task.</span></div><span>{inactiveStayovers.length} stayovers</span></div>
      <div className="rooms-stayover-grid">
        {inactiveStayovers.map(row=><div className="rooms-stayover-item" key={row.roomId}>
          <div><strong>{row.roomName}</strong><small>Occupied · no refresh requested</small></div>
          <label>Assigned coverage<select value={splitAssigned(row.assignedTo)[0]||''} onChange={e=>assignStaff(row,e.target.value)}>
            <option value="">Unassigned</option>{staffOptions.map(person=><option key={person.id} value={person.name}>{person.name}</option>)}
          </select></label>
          <button type="button" onClick={()=>setRefresh(row)}>Request RF</button>
        </div>)}
      </div>
    </section>}
    {viewMode==='assigned'&&inactiveStayovers.length>0&&<section className="rooms-stayover-planner">
      <div className="rooms-stayover-heading"><div><strong>Stayover coverage</strong><span>These rooms are assigned to you for awareness. No refresh is due unless RF is requested.</span></div><span>{inactiveStayovers.length} assigned</span></div>
      <div className="rooms-stayover-grid">{inactiveStayovers.map(row=><div className="rooms-stayover-item" key={row.roomId}><div><strong>{row.roomName}</strong><small>No service requested</small></div></div>)}</div>
    </section>}

    {<div className="rooms-view-toggle" role="group" aria-label="Rooms view">
      <button type="button" className={managerDisplay==='focus'?'active':''} onClick={()=>chooseManagerDisplay('focus')}>Focus</button>
      <button type="button" className={managerDisplay==='cards'?'active':''} onClick={()=>chooseManagerDisplay('cards')}>Cards</button>
      {viewMode==='manager'&&isManager(access)&&!isCompact&&<button type="button" className={managerDisplay==='table'?'active':''} onClick={()=>chooseManagerDisplay('table')}>Table</button>}
    </div>}

    <div className="rooms-filter-strip" role="tablist" aria-label="Room workflow filters">
      {([
        ['active','Needs action',counts.active],['all','All rooms',counts.all],['stayovers','Stayovers',counts.stayovers],['cleaning','Cleaning',counts.cleaning],['self','Self-check',counts.self],
        ['inspection','Room check',counts.inspection],['correction','Correction',counts.correction],['complete','Ready for guest',counts.complete]
      ] as Array<[Filter,string,number]>).map(([key,label,count])=><button key={key} type="button" className={filter===key?'active':''} onClick={()=>setFilter(key)}>{label}<span>{count}</span></button>)}
    </div>

    <div className="rooms-workflow-overview"><div><strong>{counts.complete}<span> / {counts.all}</span></strong><small>Rooms complete</small></div><div><strong>{counts.correction}</strong><small>Needs correction</small></div><div><strong>{counts.inspection}</strong><small>Awaiting checks</small></div></div>
    <label className="rooms-search-field"><span>Find a room or team member</span><input type="search" value={roomSearch} onChange={e=>setRoomSearch(e.target.value)} placeholder="Search rooms, staff, status…" /></label>
    {managerDisplay==='focus'&&!loading&&searchedRows.length>0&&<div className="rooms-focus-layout">
      <div className="rooms-focus-heading"><strong>Choose a room</strong><span>{searchedRows.length} shown</span></div>
      <div className="rooms-room-picker" role="group" aria-label="Select room">
        {searchedRows.map(row=>{const state=roomWorkflowState({...row,checkIssueOpen:row.checkIssueOpen||checkByRoom.get(row.roomId)?.issueOpen});return <button type="button" key={row.roomId} aria-pressed={selectedRow?.roomId===row.roomId} className={`rooms-picker-item ${state} ${selectedRow?.roomId===row.roomId?'chosen':''}`} onClick={()=>focusRoom(row)}>
          <span className="rooms-picker-name">{row.roomName}</span>{row.lateArrival&&<span className="rooms-late-chip">Late arrival</span>}<span className="rooms-picker-sub">{row.serviceType||row.reservationStatus||'Room'}{row.assignedTo?` · ${row.assignedTo}`:''}</span>{row.breakfastTag&&<span className="rooms-breakfast-chip">Breakfast</span>}<span className="rooms-picker-state">{state==='blocked'?'Blocked':state==='correction'?'Fix needed':state==='self'?'Self-check':state==='inspection'||state==='final'?'Inspect':state==='ready'?'Ready':state==='occupied'||(isStayover(row)&&!isRefresh(row))?'Occupied · no service':'Clean'}</span>
        </button>})}
      </div>
      <div className="rooms-focus-heading rooms-focus-detail-title"><strong>Room details</strong><span>Changes save without leaving this page</span></div>
    </div>}
    <div className={`rooms-save-state ${saveState}`}>{saveState==='saving'?'Saving…':saveState==='error'?'Save failed':saveState==='saved'?'Saved ✓':''}</div>
    {message&&<div className="module-message">{message}</div>}

    {loading?<div className="module-empty">Loading rooms…</div>:searchedRows.length===0?<div className="module-empty">No rooms match this view.</div>:
      viewMode==='manager'&&isManager(access)&&managerDisplay==='table'
        ? <div className="rooms-table-shell">
            <div className="rooms-table-scroll">
              <table className="rooms-table">
                <thead>
                  <tr>
                    <th className="rooms-table-sticky">Room</th>
                    <th>Stay</th>
                    <th>Service</th>
                    <th>Late arrival</th><th>Breakfast tag</th>
                    <th>Staff</th>
                    <th>Order</th>
                    <th>Next action</th>
                    <th>Live condition</th>
                    <th>Packages</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {searchedRows.map(row=>{
                    const state=roomWorkflowState({...row,checkIssueOpen:row.checkIssueOpen||checkByRoom.get(row.roomId)?.issueOpen})
                    const assigned=splitAssigned(row.assignedTo)
                    const selectedPackages=(row.packageIds||[]).map(id=>packageOptions.find(p=>p.id===id)?.name).filter(Boolean) as string[]
                    const outValue=String(row.serviceType||'').toUpperCase()
                    return <tr key={row.roomId} className={row.checkIssueOpen?'has-issue':''}>
                      <td className="rooms-table-sticky">
                        <button type="button" className="rooms-table-room" onClick={()=>openRoomCard(row)}>
                          <strong>{row.roomName}</strong>
                          <small>{row.reservationStatus||'No status'}</small>
                        </button>
                      </td>
                      <td><select aria-label="Stay status" className="rooms-table-status-select" value={row.reservationStatus||''} onChange={e=>patch(row.roomId,{reservationStatus:e.target.value})}>{reservationOptions.map(status=><option key={status} value={status}>{status||'—'}</option>)}</select><button type="button" className="rooms-table-hold" onClick={()=>patch(row.roomId,{stripHold:isBlocked(row)?'':'Hold'})}>{isBlocked(row)?'Release hold':'Block'}</button></td>
                      <td>
                        <div className="rooms-table-service">
                          <button type="button" className={!row.serviceType?'active':''} onClick={()=>clearService(row)}>—</button>
                          <button type="button" className={outValue.startsWith('OUT')?'active':''} onClick={()=>setOut(row)}>OUT</button>
                          <button type="button" className={/^OUT-[A-Z]{2,4}$/.test(outValue)?'active':''} disabled={!outValue.startsWith('OUT')} onClick={()=>initialOut(row)}>
                            {/^OUT-[A-Z]{2,4}$/.test(outValue)?outValue:'Initial'}
                          </button>
                          <button type="button" className={isRefresh(row)?'active':''} onClick={()=>setRefresh(row)}>RF</button>
                        </div>
                      </td>
                      <td><label className="rooms-late-toggle"><input type="checkbox" checked={Boolean(row.lateArrival)} onChange={e=>patch(row.roomId,{lateArrival:e.target.checked})}/> Late</label></td><td><label className="rooms-breakfast-toggle"><input type="checkbox" checked={Boolean(row.breakfastTag)} onChange={e=>patch(row.roomId,{breakfastTag:e.target.checked})} aria-label={`Breakfast tag for ${row.roomName}`}/><span>{row.breakfastTag?'Tagged':'Not tagged'}</span></label></td>
                      <td>
                        <select value={assigned[0]||''} onChange={e=>assignStaff(row,e.target.value)}>
                          <option value="">Unassigned</option>
                          {staffOptions.map(person=><option key={person.id} value={person.name}>{person.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <input className="rooms-table-order" type="number" min="1" inputMode="numeric" value={row.cleanOrder??''} onChange={e=>patch(row.roomId,{cleanOrder:e.target.value?Number(e.target.value):null})}/>
                      </td>
                      <td>
                        <button type="button" className={`rooms-table-workflow ${state}`} onClick={()=>openRoomCard(row)}>
                          <span>{isStayover(row)&&!isRefresh(row)?'No refresh requested':roomNextAction({...row,checkIssueOpen:row.checkIssueOpen||checkByRoom.get(row.roomId)?.issueOpen})}</span>
                          <small>{roomWorkflowLabel({...row,checkIssueOpen:row.checkIssueOpen||checkByRoom.get(row.roomId)?.issueOpen})}</small>
                        </button>
                      </td>
                      <td><select aria-label="Room condition" className="rooms-table-status-select" value={row.roomCondition||''} onChange={e=>patch(row.roomId,{roomCondition:e.target.value,...(e.target.value==='Blocked'?{stripHold:'Hold'}:normalize(row.stripHold).includes('hold')?{stripHold:''}:{})})}>{['','Occupied','Vacant (Clean)','Vacant (Dirty)','Cleaning','Ready for Room Check','Ready','Blocked'].map(v=><option key={v} value={v}>{v||'Not set'}</option>)}</select><span className={`rooms-live-condition ${state}`}>{derivedLiveCondition({...row,checkIssueOpen:row.checkIssueOpen||checkByRoom.get(row.roomId)?.issueOpen})}</span></td>
                      <td>
                        <details className="rooms-table-packages">
                          <summary>{selectedPackages.length?selectedPackages.join(', '):'Select packages'}</summary>
                          <div>{packageOptions.filter(option=>option.available||row.packageIds.includes(option.id)).map(option=>{
                            const checked=row.packageIds.includes(option.id)
                            return <button type="button" key={option.id} className={checked?'selected':''} onClick={event=>{event.preventDefault();togglePackage(row,option.id)}}>{checked?'✓ ':''}{option.name}</button>
                          })}</div>
                        </details>
                      </td>
                      <td>
                        <input className="rooms-table-notes" value={row.notes||''} onChange={e=>patch(row.roomId,{notes:e.target.value})} placeholder="Notes"/>
                      </td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
          </div>
        : <div className="rooms-card-list">
        {displayRows.map(row=>{
          const inspection=checkByRoom.get(row.roomId)
          const effectiveRow={...row,checkIssueOpen:row.checkIssueOpen||inspection?.issueOpen}
          const state=roomWorkflowState(effectiveRow)
          const isOpen=managerDisplay==='focus'||Boolean(expanded[row.roomId])
          const self=selfChecks[row.roomId]
          const zones=[...new Set((self?.items||[]).map(i=>i.zone))]
          const assigned=splitAssigned(row.assignedTo)
          const failedCount=inspection?.items.filter(i=>i.passed===false).length||0
          const checkedCount=inspection?.items.filter(i=>i.passed!==null).length||0
          const packageNames=(row.packageIds||[]).map(id=>packageOptions.find(p=>p.id===id)?.name).filter(Boolean)

          return <section id={`room-card-${row.roomId}`} key={row.roomId} className={`rooms-card state-${state} ${row.checkIssueOpen?'has-issue':''}`}>
            <button type="button" className="rooms-card-header" onClick={()=>{
              const next=!isOpen;setExpanded(current=>({...current,[row.roomId]:next}))
              if(next&&requiresSelfCheck(row)&&!row.housekeeperAttested&&!selfChecks[row.roomId])void loadSelfCheck(row)
            }}>
              <div className="rooms-card-title">
                <span className="rooms-chevron">{isOpen?<ChevronDown size={18}/>:<ChevronRight size={18}/>}</span>
                <span><strong>{row.roomName}</strong><small>{row.reservationStatus||'No status'}{row.serviceType?` · ${row.serviceType}`:''}</small></span>
              </div>
              <div className={`rooms-state-pill ${state}`}>
                {roomWorkflowLabel(effectiveRow)}
              </div>
            </button>

            {!isBlocked(row)&&<div className="rooms-progress-summary" aria-label="Room workflow progress">
              <span><strong>{(requiresRoomCheck(row)?[row.complete,row.housekeeperAttested,row.inspected,finalVerificationComplete(row)]:[row.complete]).filter(Boolean).length}</strong> of {requiresRoomCheck(row)?4:1} complete</span>
              <span className="rooms-progress-dots" aria-hidden="true"><i className={row.complete?'done':''}/>{requiresRoomCheck(row)&&<i className={row.housekeeperAttested?'done':''}/>} {requiresRoomCheck(row)&&<i className={row.inspected?'done':''}/>} {requiresRoomCheck(row)&&<i className={finalVerificationComplete(row)?'done':''}/>}</span>
              {!isOpen&&<strong className="rooms-next-action">{roomNextAction(effectiveRow)}</strong>}
            </div>}

            {isOpen&&<div className="rooms-card-body">
              {row.checkIssueOpen&&<div className="rooms-correction-box"><AlertTriangle size={17}/><div><strong>Correction required</strong><span>{row.checkIssueNote||'A room check found an issue that must be corrected.'}</span>{row.checkIssueByName&&<small>Flagged by {row.checkIssueByName}</small>}</div></div>}

              <div className="rooms-meta-grid">
                <div><span>Assigned</span><strong>{assigned.length?assigned.join(', '):'Unassigned'}</strong></div>
                <div><span>Live condition</span><strong>{derivedLiveCondition(effectiveRow)||'—'}</strong></div>
                <div><span>Next</span><strong>{roomNextAction(effectiveRow)}</strong></div>
                {row.housekeeperAttestedAt&&<div><span>Self-check</span><strong>{shortTime(row.housekeeperAttestedAt)}</strong></div>}
                {row.inspectedAt&&<div><span>Inspected</span><strong>{shortTime(row.inspectedAt)}</strong></div>}
              </div>

              {isManager(access)&&<details className="rooms-details-drawer"><summary>Room details & manager controls</summary><div className="rooms-manager-edit">
                <div className="rooms-manager-context">
                  <div><span>Reservation</span><strong>{row.reservationStatus||'Not set'}</strong></div>
                  <div><span>Live condition</span><strong>{derivedLiveCondition(effectiveRow)||'—'}</strong></div>
                </div>
                <label className="rooms-late-toggle"><input type="checkbox" checked={Boolean(row.lateArrival)} onChange={e=>patch(row.roomId,{lateArrival:e.target.checked})}/> Late arrival</label><div className="rooms-manager-status-tools"><label>Stay status<select value={row.reservationStatus||''} onChange={e=>patch(row.roomId,{reservationStatus:e.target.value})}>{reservationOptions.map(status=><option key={status} value={status}>{status||'—'}</option>)}</select></label><label>Room condition<select value={row.roomCondition||''} onChange={e=>patch(row.roomId,{roomCondition:e.target.value,...(e.target.value==='Blocked'?{stripHold:'Hold'}:normalize(row.stripHold).includes('hold')?{stripHold:''}:{})})}>{['','Occupied','Vacant (Clean)','Vacant (Dirty)','Cleaning','Ready for Room Check','Ready','Blocked'].map(v=><option key={v} value={v}>{v||'Not set'}</option>)}</select></label><button type="button" className={isBlocked(row)?'rooms-unblock-action':'rooms-block-action'} onClick={()=>patch(row.roomId,{stripHold:isBlocked(row)?'':'Hold'})}>{isBlocked(row)?'Release maintenance hold':'Block for maintenance'}</button></div>
<div className="rooms-manager-grid">
                  <label>Assign cleaner<select value={assigned[0]||''} onChange={e=>assignStaff(row,e.target.value)}><option value="">Unassigned</option>{staffOptions.map(person=><option key={person.id} value={person.name}>{person.name}</option>)}</select></label>
                  <label>Cleaning order<input type="number" min="1" inputMode="numeric" value={row.cleanOrder??''} onChange={e=>patch(row.roomId,{cleanOrder:e.target.value?Number(e.target.value):null})}/></label>
                </div>

                <label className="rooms-breakfast-toggle rooms-breakfast-focus"><input type="checkbox" checked={Boolean(row.breakfastTag)} onChange={e=>patch(row.roomId,{breakfastTag:e.target.checked})}/><span>Breakfast tag</span><small>{row.breakfastTag?'Tagged for breakfast follow-up':'Not tagged'}</small></label>
                <div className="rooms-service-controls">
                  <span>Service</span>
                  <button type="button" className={!row.serviceType?'active':''} onClick={()=>clearService(row)}>None</button>
                  <button type="button" className={String(row.serviceType||'').toUpperCase().startsWith('OUT')?'active':''} onClick={()=>setOut(row)}>OUT</button>
                  <button type="button" className={/^OUT-[A-Z]{2,4}$/i.test(String(row.serviceType||''))?'active':''} disabled={!String(row.serviceType||'').toUpperCase().startsWith('OUT')} onClick={()=>initialOut(row)}>
                    {/^OUT-[A-Z]{2,4}$/i.test(String(row.serviceType||''))?String(row.serviceType||'').toUpperCase():'Initial OUT'}
                  </button>
                  <button type="button" className={isRefresh(row)?'active':''} onClick={()=>setRefresh(row)}>RF</button>
                </div>

                <div className="rooms-package-editor">
                  <span>Room packages</span>
                  <div>{packageOptions.filter(option=>option.available||row.packageIds.includes(option.id)).map(option=>{
                    const checked=row.packageIds.includes(option.id)
                    return <button type="button" key={option.id} className={checked?'selected':''} onClick={()=>togglePackage(row,option.id)}>{checked?<Check size={14}/>:null}{option.name}</button>
                  })}</div>
                </div>
              </div></details>}

              {viewMode==='manager'&&packageNames.length>0&&<div className="rooms-info-callout"><strong>Selected room items</strong><span>{packageNames.join(', ')}</span></div>}

              <label className="rooms-notes">Housekeeping notes<textarea value={row.notes||''} onChange={e=>patch(row.roomId,{notes:e.target.value})} placeholder="Room-specific housekeeping notes…"/></label>

              {row.claimableRefresh&&<button type="button" className="ops-primary-btn rooms-primary-action" onClick={()=>void claimRefresh(row)}><UserRoundCheck size={16}/>Claim refresh</button>}

              {requiresSelfCheck(row)&&(row.housekeeperAttested||self?.submitted
                ? <section className="rooms-section self-check-section">
                    <div className="rooms-success-line"><Check size={16}/><strong>Self-check</strong><span>Complete ✓</span></div>
                  </section>
                : <section className="rooms-section self-check-section">
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

              {(!isStayover(row)||isRefresh(row))&&<section className="rooms-section cleaning-section">
                <div className="rooms-section-heading"><BedDouble size={17}/><div><strong>Cleaning</strong><small>{isStayover(row)?'Stayovers and refreshes do not require a room inspection.':'Full clean must be complete before inspection.'}</small></div></div>
                <button type="button" className={row.complete?'ops-secondary-btn rooms-primary-action':'ops-primary-btn rooms-primary-action'} onClick={()=>void toggleComplete(row)} disabled={!row.complete&&requiresSelfCheck(row)&&!row.housekeeperAttestedBy}><Check size={16}/>{row.complete?(isStayover(row)?'Stayover service complete ✓':'Ready for room check ✓'):(row.checkIssueOpen?'Correction complete · send for re-check':'Mark clean complete')}</button>
              </section>}

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
                <div className="rooms-section-heading"><UserRoundCheck size={17}/><div><strong>Final verification</strong><small>Final guest-ready check.</small></div></div>
                {finalVerificationComplete(row)
                  ? <div className="rooms-success-line"><Check size={16}/><strong>Final check</strong><span>{row.fohSignedBy?`FOH · ${row.fohSignedName||'Signed'}`:`HA · ${row.haSignedName||'Signed'}`} ✓</span></div>
                  : <button type="button" className="ops-primary-btn rooms-primary-action" disabled={!row.complete||(!canFohSignoff&&!canHaSignoff)} onClick={()=>void signOff(row,canFohSignoff?'foh':'ha')}><UserRoundCheck size={16}/>Complete final check</button>}
              </section>}
            </div>}
          </section>
        })}
      </div>}
  </div>
}
