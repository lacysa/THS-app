'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import {
  RefreshCw,
  Save,
  BedDouble,
  Search,
  Check,
  ChevronDown,
  UtensilsCrossed,
  ClipboardCheck
} from 'lucide-react'

type BreakfastStatus = 'none' | 'needed' | 'received' | 'declined'

type RoomRow = {
  roomId: string
  roomName: string
  sortOrder: number
  reservationStatus: string
  serviceType: string
  requiresQualityCheck?: boolean
  stripHold: string
  assignedTo: string
  cleanOrder: number | null
  complete: boolean
  readyForInspection: boolean
  inspected: boolean
  completedAt?: string | null
  inspectedAt?: string | null
  roomCondition: string
  nextShiftCondition: string
  packageIds: string[]
  notes: string
  breakfastTag: boolean
  haSignedBy?: string | null
  haSignedName?: string | null
  haSignedAt?: string | null
  fohSignedBy?: string | null
  fohSignedName?: string | null
  fohSignedAt?: string | null
  housekeeperAttested?: boolean
  housekeeperAttestedBy?: string | null
  housekeeperAttestedName?: string | null
  housekeeperAttestedAt?: string | null
  checkIssueOpen?: boolean
  checkIssueNote?: string
  checkIssueBy?: string | null
  checkIssueByName?: string | null
  checkIssueAt?: string | null
  breakfast: {
    serviceDate: string
    status: BreakfastStatus
    timeSlot?: string | null
  }
}

type StaffOption = {
  id: string
  name: string
  roleLabel?: string
  shiftStart?: string | null
  shiftEnd?: string | null
  onSite?: boolean
}

type RoomPackageOption = {
  id: string
  name: string
  price: number | null
  available: boolean
}

type Access = {
  name?: string | null
  preferredName?: string | null
  email?: string | null
  roleName?: string | null
  isAdmin?: boolean
}

type ChecklistItem = { id:string; zone:string; label:string; sort_order?:number }
type SelfCheckState = {
  open:boolean
  loading:boolean
  saving:boolean
  items:ChecklistItem[]
  checked:string[]
  submitted:boolean
  submittedAt?:string|null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const reservationOptions = ['', 'Checkout', 'Out/In', 'Stayover', 'Arrival', 'Vacant', 'Blocked']
const stripOptions = ['', 'Strip', 'Hold']
const conditionOptions = ['', 'Occupied', 'Cleaning', 'Ready for Inspection', 'Ready', 'Vacant', 'Vacant (Clean)', 'Vacant (Dirty)', 'Vacant (Blocked)', 'Out of Order']

function todayDetroit() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}

function normalize(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

function reservationStatusClass(value: string | null | undefined) {
  const status = normalize(value).replace(/[^a-z0-9]+/g, '-')
  return status ? `hsk-status-${status}` : 'hsk-status-none'
}

function getManagerInitials(access: Access | null) {
  if (!access) return ''

  const combined = normalize(
    `${access.name || ''} ${access.preferredName || ''} ${access.email || ''}`
  )

  if (combined.includes('sarah') || combined.includes('lacysa')) return 'SL'
  if (combined.includes('brittany') || combined.includes('brittanyahollingshead')) return 'BH'
  if (combined.includes('david') || combined.includes('davidheiser')) return 'DH'

  const rawName = access.name || access.preferredName || ''
  const pieces = rawName.trim().split(/\s+/).filter(Boolean)
  if (pieces.length >= 2) {
    return `${pieces[0][0]}${pieces[pieces.length - 1][0]}`.toUpperCase()
  }
  return ''
}

function formatShortTime(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Detroit',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

function splitAssigned(value: string) {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function saveStatusLabel(state: SaveState) {
  if (state === 'saving') return 'Saving…'
  if (state === 'saved') return 'Saved ✓'
  if (state === 'error') return 'Save failed'
  return 'All changes saved'
}

export default function HousekeepingBoard() {
  const [date, setDate] = useState(todayDetroit())
  const [rows, setRows] = useState<RoomRow[]>([])
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [allStaffOptions, setAllStaffOptions] = useState<StaffOption[]>([])
  const [showAllStaff, setShowAllStaff] = useState(false)
  const [packageOptions, setPackageOptions] = useState<RoomPackageOption[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [viewMode, setViewMode] = useState<'manager'|'assigned'>('manager')
  const [access, setAccess] = useState<Access | null>(null)
  const [canHaSignoff, setCanHaSignoff] = useState(false)
  const [canFohSignoff, setCanFohSignoff] = useState(false)
  const [breakfastDate, setBreakfastDate] = useState('')
  const [menuNeededRooms, setMenuNeededRooms] = useState<string[]>([])
  const [blockingRoomId, setBlockingRoomId] = useState<string | null>(null)
  const [blockingRoomName, setBlockingRoomName] = useState<string | null>(null)
  const [issueDrafts, setIssueDrafts] = useState<Record<string,string>>({})
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [dirty, setDirty] = useState(false)
  const [openStaffRoomId, setOpenStaffRoomId] = useState<string | null>(null)
  const [staffSearch, setStaffSearch] = useState('')
  const [openPackageRoomId, setOpenPackageRoomId] = useState<string | null>(null)
  const [selfChecks,setSelfChecks] = useState<Record<string,SelfCheckState>>({})
  const rowsRef = useRef<RoomRow[]>([])
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const [tableScrollMax,setTableScrollMax] = useState(0)
  const [tableScrollLeft,setTableScrollLeft] = useState(0)
  const dateRef = useRef(date)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(() => {
    dateRef.current = date
  }, [date])

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d) setAccess(d.access || null)
      })
      .catch(() => {})
  }, [])

  async function load() {
    setLoading(true)
    setMessage('')
    setDirty(false)
    setSaveState('idle')
    setSelfChecks({})

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    try {
      const r = await fetch(`/api/housekeeping/day?date=${encodeURIComponent(date)}`, {
        cache: 'no-store'
      })
      const d = await r.json().catch(() => ({}))

      if (!r.ok) {
        setMessage(d.error || 'Could not load housekeeping board.')
        return
      }

      const loadedRows = d.rows || []
      setRows(loadedRows)
      rowsRef.current = loadedRows
      setViewMode(d.viewMode === 'assigned' ? 'assigned' : 'manager')
      setStaffOptions(d.staffOptions || [])
      setAllStaffOptions(d.allStaffOptions || d.staffOptions || [])
      setShowAllStaff(false)
      setPackageOptions(d.packageOptions || [])
      setCanHaSignoff(Boolean(d.signoffAccess?.canHaSignoff))
      setCanFohSignoff(Boolean(d.signoffAccess?.canFohSignoff))
      setBreakfastDate(d.breakfast?.serviceDate || '')
      setMenuNeededRooms(d.breakfast?.menuNeededRooms || [])
      setBlockingRoomId(d.blockingRoomId || null)
      setBlockingRoomName(d.blockingRoomName || null)
    } catch {
      setMessage('Could not load housekeeping board.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  async function saveRows(sourceRows = rowsRef.current, showMessage = false) {
    setSaveState('saving')
    if (showMessage) setMessage('Saving…')

    try {
      const r = await fetch('/api/housekeeping/day', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceDate: dateRef.current,
          rows: sourceRows
        })
      })
      const d = await r.json().catch(() => ({}))

      if (!r.ok) {
        setSaveState('error')
        setMessage(d.error || 'Could not save housekeeping board.')
        return false
      }

      setDirty(false)
      setSaveState('saved')
      if (showMessage) setMessage('Housekeeping board saved.')
      return true
    } catch {
      setSaveState('error')
      setMessage('Could not save housekeeping board.')
      return false
    }
  }

  useEffect(() => {
    if (!dirty || loading) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(() => {
      void saveRows(rowsRef.current, false)
    }, 700)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dirty, loading])

  function patch(roomId: string, update: Partial<RoomRow>) {
    setRows(current => {
      const next = current.map(row => row.roomId === roomId ? { ...row, ...update } : row)
      rowsRef.current = next
      return next
    })
    setDirty(true)
    setSaveState('idle')
  }

  const canInitialEnvelope = Boolean(
    access?.isAdmin ||
    normalize(access?.roleName) === 'owner' ||
    normalize(access?.roleName) === 'manager'
  )

  const managerInitials = getManagerInitials(access)

  function markOut(row: RoomRow) {
    patch(row.roomId, { serviceType: 'OUT' })
  }

  function markRefresh(row: RoomRow) {
    patch(row.roomId, { serviceType: 'RF' })
  }

  function clearOutRf(row: RoomRow) {
    patch(row.roomId, { serviceType: '' })
  }

  function initialEnvelope(row: RoomRow) {
    if (!canInitialEnvelope || !managerInitials) {
      setMessage('Manager initials could not be determined from your profile.')
      return
    }
    if (!String(row.serviceType || '').toUpperCase().startsWith('OUT')) {
      setMessage('Mark the room OUT before initialing the envelope.')
      return
    }
    patch(row.roomId, { serviceType: `OUT-${managerInitials}` })
  }

  function toggleComplete(row: RoomRow, checked: boolean) {
    if (
      checked &&
      viewMode === 'assigned' &&
      blockingRoomId &&
      blockingRoomId !== row.roomId
    ) {
      setMessage(`You must correct ${blockingRoomName || 'the flagged room'} and have it pass re-check before completing another room.`)
      return
    }

    if (
      checked &&
      viewMode === 'assigned' &&
      row.requiresQualityCheck &&
      !row.housekeeperAttestedBy
    ) {
      setMessage('Complete and submit the room checklist before finalizing this room clean.')
      return
    }

    if (!checked) {
      patch(row.roomId, {
        complete: false,
        readyForInspection: false,
        inspected: false,
        haSignedBy: null,
        haSignedName: null,
        haSignedAt: null,
        fohSignedBy: null,
        fohSignedName: null,
        fohSignedAt: null
      })
      return
    }

    patch(row.roomId, {
      complete: true,
      readyForInspection: true,
      inspected: false,
      roomCondition: row.roomCondition || 'Ready for Inspection'
    })
  }

  function toggleStaff(row: RoomRow, name: string) {
    const current = splitAssigned(row.assignedTo)
    const next = current.includes(name)
      ? current.filter(item => item !== name)
      : [...current, name]
    patch(row.roomId, { assignedTo: next.join(', ') })
  }

  function togglePackage(row: RoomRow, packageId: string) {
    const current = Array.isArray(row.packageIds) ? row.packageIds : []
    const next = current.includes(packageId)
      ? current.filter(id => id !== packageId)
      : [...current, packageId]
    patch(row.roomId, { packageIds: next })
  }

  function packageLabel(packageIds: string[]) {
    const names = (packageIds || [])
      .map(id => packageOptions.find(option => option.id === id)?.name)
      .filter(Boolean) as string[]
    return names.length ? names.join(', ') : 'Select packages'
  }


  async function loadSelfCheck(room:RoomRow) {
    const current=selfChecks[room.roomId]
    if(current?.items?.length){
      setSelfChecks(state=>({...state,[room.roomId]:{...current,open:!current.open}}))
      return
    }

    setSelfChecks(state=>({...state,[room.roomId]:{
      open:true,loading:true,saving:false,items:[],checked:[],submitted:false,submittedAt:null
    }}))

    try{
      const r=await fetch(`/api/housekeeping/self-check?date=${encodeURIComponent(dateRef.current)}&roomId=${encodeURIComponent(room.roomId)}`,{cache:'no-store'})
      const d=await r.json().catch(()=>({}))
      if(!r.ok) throw new Error(d.error||'Could not load room checklist.')
      setSelfChecks(state=>({...state,[room.roomId]:{
        open:true,
        loading:false,
        saving:false,
        items:d.items||[],
        checked:d.submitted?(d.items||[]).map((item:any)=>String(item.id)):[],
        submitted:Boolean(d.submitted),
        submittedAt:d.submittedAt||null
      }}))
    }catch(error:any){
      setSelfChecks(state=>({...state,[room.roomId]:{
        open:true,loading:false,saving:false,items:[],checked:[],submitted:false,submittedAt:null
      }}))
      setMessage(error?.message||'Could not load room checklist.')
    }
  }

  function toggleSelfCheckItem(roomId:string,itemId:string){
    setSelfChecks(state=>{
      const current=state[roomId]
      if(!current || current.submitted) return state
      const checked=current.checked.includes(itemId)
        ? current.checked.filter(id=>id!==itemId)
        : [...current.checked,itemId]
      return {...state,[roomId]:{...current,checked}}
    })
  }

  async function submitSelfCheck(room:RoomRow){
    const current=selfChecks[room.roomId]
    if(!current || current.saving) return
    if(current.checked.length!==current.items.length){
      setMessage('Check every room checklist item before submitting.')
      return
    }

    setSelfChecks(state=>({...state,[room.roomId]:{...current,saving:true}}))
    try{
      const r=await fetch('/api/housekeeping/self-check',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          date:dateRef.current,
          roomId:room.roomId,
          checkedItemIds:current.checked
        })
      })
      const d=await r.json().catch(()=>({}))
      if(!r.ok) throw new Error(d.error||'Could not submit room checklist.')

      setSelfChecks(state=>({...state,[room.roomId]:{
        ...state[room.roomId],
        saving:false,
        submitted:true,
        submittedAt:d.submittedAt||new Date().toISOString()
      }}))

      setRows(currentRows=>{
        const next=currentRows.map(item=>item.roomId===room.roomId?{
          ...item,
          housekeeperAttested:true,
          housekeeperAttestedBy:d.housekeeperId||'self',
          housekeeperAttestedName:d.housekeeperName||access?.preferredName||access?.name||'You',
          housekeeperAttestedAt:d.submittedAt||new Date().toISOString()
        }:item)
        rowsRef.current=next
        return next
      })
      setMessage(`${room.roomName} checklist submitted. You can now mark the room complete.`)
    }catch(error:any){
      setSelfChecks(state=>({...state,[room.roomId]:{...state[room.roomId],saving:false}}))
      setMessage(error?.message||'Could not submit room checklist.')
    }
  }

  async function flagCheckIssue(row:RoomRow) {
    const note = (issueDrafts[row.roomId] || '').trim()
    if (!note) {
      setMessage('Enter what needs to be corrected before flagging the room.')
      return
    }

    const r = await fetch('/api/housekeeping/check-issue',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        serviceDate:dateRef.current,
        roomId:row.roomId,
        note,
        action:'flag'
      })
    })
    const d = await r.json().catch(()=>({}))
    if(!r.ok){
      setMessage(d.error || 'Could not flag room issue.')
      return
    }
    setIssueDrafts(current=>({...current,[row.roomId]:''}))
    setMessage(`${row.roomName} was sent back to housekeeping for correction.`)
    await load()
  }

  async function clearCheckIssue(row:RoomRow) {
    const r = await fetch('/api/housekeeping/check-issue',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        serviceDate:dateRef.current,
        roomId:row.roomId,
        action:'clear'
      })
    })
    const d = await r.json().catch(()=>({}))
    if(!r.ok){
      setMessage(d.error || 'Could not clear room issue.')
      return
    }
    setMessage(`${row.roomName} passed re-check.`)
    await load()
  }


  async function signOff(row: RoomRow, kind: 'ha' | 'foh') {
    if (!row.complete) {
      setMessage('Mark the room complete before signing off.')
      return
    }

    const saved = await saveRows(rowsRef.current, false)
    if (!saved) return

    try {
      const r = await fetch('/api/housekeeping/signoff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceDate: dateRef.current,
          roomId: row.roomId,
          kind
        })
      })
      const d = await r.json().catch(() => ({}))

      if (!r.ok) {
        setMessage(d.error || 'Could not save room sign-off.')
        return
      }

      patch(row.roomId, kind === 'ha'
        ? {
            haSignedBy: d.signedBy,
            haSignedName: d.signedName,
            haSignedAt: d.signedAt
          }
        : {
            fohSignedBy: d.signedBy,
            fohSignedName: d.signedName,
            fohSignedAt: d.signedAt
          }
      )
      setDirty(false)
      setSaveState('saved')
      setMessage(`${kind === 'ha' ? 'Hospitality Assistant' : 'FOH'} sign-off saved for ${row.roomName}.`)
    } catch {
      setMessage('Could not save room sign-off.')
    }
  }


  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase()
    const source = showAllStaff ? allStaffOptions : staffOptions
    if (!q) return source
    return source.filter(option =>
      [option.name, option.roleLabel].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [staffOptions, allStaffOptions, showAllStaff, staffSearch])

  useEffect(()=>{
    if(viewMode!=='manager'||loading) return
    const el=tableScrollRef.current
    if(!el) return
    const measure=()=>{
      const max=Math.max(0,el.scrollWidth-el.clientWidth)
      setTableScrollMax(max)
      setTableScrollLeft(Math.min(el.scrollLeft,max))
    }
    measure()
    const observer=new ResizeObserver(measure)
    observer.observe(el)
    const table=el.querySelector('table')
    if(table) observer.observe(table)
    window.addEventListener('resize',measure)
    return ()=>{
      observer.disconnect()
      window.removeEventListener('resize',measure)
    }
  },[viewMode,loading,rows.length])

  if (viewMode === 'assigned') {
    return (
      <div className="ops-module hsk-module hsk-assigned-view">
        <div className="module-toolbar hsk-sticky-toolbar">
          <div className="hsk-title-block">
            <div className="module-kicker">Housekeeping</div>
            <h1>My Rooms</h1>
            <p>Only your assigned rooms for today are shown here.</p>
          </div>

          <div className="toolbar-actions hsk-toolbar-actions">
            <div className={`hsk-save-indicator hsk-save-${saveState}`}>
              {saveStatusLabel(saveState)}
            </div>

            <label className="date-control">
              Date
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </label>

            <button className="ops-secondary-btn" onClick={load} type="button">
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </div>

        {message && <div className="module-message">{message}</div>}

        {loading ? (
          <div className="module-empty">Loading your rooms…</div>
        ) : rows.length === 0 ? (
          <div className="module-empty">You do not have any rooms assigned for this date.</div>
        ) : (
          <div className="hsk-assigned-grid">
            {rows.map(row => (
              <article
                id={`room-${row.roomId}`}
                className={`hsk-assigned-card ${row.complete ? 'complete' : 'in-progress'}`}
                data-reservation-status={row.reservationStatus||''}
                data-room-condition={row.roomCondition||''}
                data-strip-hold={row.stripHold||''}
                key={row.roomId}
              >
                <div className="hsk-assigned-card-head">
                  <div>
                    <div className="hsk-room-cell">
                      <BedDouble size={17} />
                      <strong>{row.roomName}</strong>
                    </div>
                    <div className="hsk-assigned-meta">
                      {[row.reservationStatus, row.serviceType, row.stripHold]
                        .filter(Boolean)
                        .join(' · ') || 'Assigned clean'}
                    </div>
                    <div className="hsk-assigned-service-controls">
                      <button type="button" className={!row.serviceType?'active':''} onClick={()=>clearOutRf(row)}>—</button>
                      <button type="button" className={String(row.serviceType||'').toUpperCase().startsWith('OUT')?'active':''} onClick={()=>markOut(row)}>OUT</button>
                      <button type="button" className={String(row.serviceType||'').toUpperCase()==='RF'?'active':''} onClick={()=>markRefresh(row)}>RF</button>
                    </div>
                  </div>

                  <span className={row.complete ? 'hsk-complete-pill done' : 'hsk-complete-pill'}>
                    {row.complete ? 'Complete ✓' : 'In progress'}
                  </span>
                </div>

                {row.breakfastTag && (
                  <span className="hsk-breakfast-badge hsk-breakfast-tag">Breakfast</span>
                )}

                {row.breakfast.status !== 'none' && (
                  <span className={`hsk-breakfast-badge hsk-breakfast-${row.breakfast.status}`}>
                    {row.breakfast.status === 'needed' && 'Breakfast · menu needed'}
                    {row.breakfast.status === 'received' && 'Breakfast · menu ✓'}
                    {row.breakfast.status === 'declined' && 'Breakfast · declined'}
                  </span>
                )}

                {row.packageIds?.length > 0 && (
                  <div className="hsk-assigned-packages">
                    <strong>Room packages</strong>
                    <span>{packageLabel(row.packageIds)}</span>
                  </div>
                )}

                {row.checkIssueOpen && (
                  <div className="hsk-correction-alert">
                    <strong>Correction required before continuing</strong>
                    <span>{row.checkIssueNote || 'A room check found something that needs to be corrected.'}</span>
                    {row.checkIssueByName && <small>Flagged by {row.checkIssueByName}</small>}
                  </div>
                )}

                <label className="hsk-assigned-notes">
                  Notes
                  <textarea
                    value={row.notes}
                    onChange={e => patch(row.roomId, { notes: e.target.value })}
                    placeholder="Add room notes…"
                  />
                </label>

                {row.requiresQualityCheck && <div className="hsk-self-check">
                  <button
                    type="button"
                    className={row.housekeeperAttested ? 'hsk-self-check-toggle complete' : 'hsk-self-check-toggle'}
                    onClick={()=>void loadSelfCheck(row)}
                  >
                    <ClipboardCheck size={16}/>
                    <span>
                      <strong>{row.housekeeperAttested ? 'Room checklist complete' : 'Complete room checklist'}</strong>
                      <small>{row.housekeeperAttestedAt ? `Submitted ${formatShortTime(row.housekeeperAttestedAt)}` : 'Required before the room can be finalized'}</small>
                    </span>
                    <ChevronDown size={16}/>
                  </button>

                  {selfChecks[row.roomId]?.open && (
                    <div className="hsk-self-check-panel">
                      {selfChecks[row.roomId]?.loading ? (
                        <div className="hsk-self-check-loading">Loading checklist…</div>
                      ) : (
                        <>
                          {[...new Set((selfChecks[row.roomId]?.items||[]).map(item=>item.zone))].map(zone=>(
                            <section key={zone} className="hsk-self-check-zone">
                              <h4>{zone}</h4>
                              {(selfChecks[row.roomId]?.items||[]).filter(item=>item.zone===zone).map(item=>(
                                <label key={item.id} className={selfChecks[row.roomId]?.checked.includes(item.id)?'checked':''}>
                                  <input
                                    type="checkbox"
                                    checked={selfChecks[row.roomId]?.checked.includes(item.id)||false}
                                    onChange={()=>toggleSelfCheckItem(row.roomId,item.id)}
                                    disabled={Boolean(selfChecks[row.roomId]?.submitted)}
                                  />
                                  <span>{item.label}</span>
                                </label>
                              ))}
                            </section>
                          ))}
                          {!selfChecks[row.roomId]?.submitted && (
                            <button
                              type="button"
                              className="ops-primary-btn hsk-self-check-submit"
                              onClick={()=>void submitSelfCheck(row)}
                              disabled={
                                Boolean(selfChecks[row.roomId]?.saving) ||
                                (selfChecks[row.roomId]?.checked.length||0)!==(selfChecks[row.roomId]?.items.length||0)
                              }
                            >
                              <Check size={16}/>
                              {selfChecks[row.roomId]?.saving?'Submitting…':'Submit room checklist'}
                            </button>
                          )}
                          {selfChecks[row.roomId]?.submitted && (
                            <div className="hsk-self-check-confirmation">
                              <Check size={15}/> Checklist attested and locked for this attempt.
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>}

                <button
                  type="button"
                  className={row.complete ? 'ops-secondary-btn hsk-complete-btn' : 'ops-primary-btn hsk-complete-btn'}
                  onClick={() => toggleComplete(row, !row.complete)}
                  disabled={
                    !row.complete &&
                    (
                      (Boolean(row.requiresQualityCheck) && !row.housekeeperAttested) ||
                      Boolean(blockingRoomId && blockingRoomId !== row.roomId)
                    )
                  }
                >
                  <Check size={16} />
                  {row.checkIssueOpen
                    ? 'Ready for re-check'
                    : row.complete ? 'Mark incomplete' : 'Mark complete'}
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="ops-module hsk-module">
      <div className="module-toolbar hsk-sticky-toolbar">
        <div className="hsk-title-block">
          <div className="module-kicker">Housekeeping</div>
          <h1>Daily Room Board</h1>
          <p>Assignments, room status, completion, checks, and next-shift condition.</p>
        </div>

        <div className="toolbar-actions hsk-toolbar-actions">
          <div className={`hsk-save-indicator hsk-save-${saveState}`}>
            {saveStatusLabel(saveState)}
          </div>

          <label className="date-control">
            Date
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </label>


          <button className="ops-secondary-btn" onClick={load} type="button">
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            className="ops-primary-btn"
            onClick={() => void saveRows(rowsRef.current, true)}
            disabled={saveState === 'saving'}
            type="button"
          >
            <Save size={16} />
            Save all
          </button>
        </div>
      </div>

      {message && <div className="module-message">{message}</div>}

      <div className="hsk-breakfast-strip">
        <div className="hsk-breakfast-title">
          <UtensilsCrossed size={16} />
          <strong>Breakfast · {breakfastDate || 'Tomorrow'}</strong>
        </div>
        {menuNeededRooms.length ? (
          <div>
            <span className="hsk-warning-dot">!</span>
            Menu needed: <strong>{menuNeededRooms.join(', ')}</strong>
          </div>
        ) : (
          <div className="hsk-breakfast-clear">No submitted breakfast bookings are waiting on a menu.</div>
        )}
      </div>



      {loading ? (
        <div className="module-empty">Loading rooms…</div>
      ) : (
        <>
          <div className="hsk-table-card">
          <div
            className="hsk-table-wrapper"
            ref={tableScrollRef}
            onScroll={e=>setTableScrollLeft(e.currentTarget.scrollLeft)}
          >
          <table className="hsk-table">
            <thead>
              <tr>
                <th className="hsk-sticky-room">Room</th>
                <th>Status</th>
                <th>Out / RF</th>
                <th>Strip</th>
                <th>Staff</th>
                <th>Order</th>
                <th>Complete</th>
                <th>Room checks</th>
                <th>End of shift status</th>
                <th>Room Packages</th>
                <th>Notes</th>
              </tr>
            </thead>

            <tbody>
              {rows.map(row => {
                const outRf = String(row.serviceType || '').toUpperCase()
                const isOut = outRf.startsWith('OUT')
                const isRefresh = outRf === 'RF'
                const envelopeInitialed = /^OUT-[A-Z]{2,4}$/.test(outRf)
                const selectedStaff = splitAssigned(row.assignedTo)
                const selectedPackageIds = Array.isArray(row.packageIds) ? row.packageIds : []

                return (
                  <tr
                    id={`room-${row.roomId}`}
                    key={row.roomId}
                    className={`hsk-status-row ${reservationStatusClass(row.reservationStatus)}`}
                  >
                    <td className="hsk-sticky-room hsk-room-column">
                      <div className="hsk-room-cell">
                        <BedDouble size={15} />
                        <strong>{row.roomName}</strong>
                      </div>
                      <button
                        type="button"
                        className={`hsk-breakfast-badge hsk-breakfast-toggle ${row.breakfastTag ? 'hsk-breakfast-tag is-active' : ''}`}
                        aria-pressed={row.breakfastTag}
                        onClick={() => patch(row.roomId, { breakfastTag: !row.breakfastTag })}
                        title="Breakfast service the following morning"
                      >
                        Breakfast
                      </button>
                      {row.breakfast.status !== 'none' && (
                        <span className={`hsk-breakfast-badge hsk-breakfast-${row.breakfast.status}`}>
                          {row.breakfast.status === 'needed' && 'Breakfast · menu needed'}
                          {row.breakfast.status === 'received' && 'Breakfast · menu ✓'}
                          {row.breakfast.status === 'declined' && 'Breakfast · declined'}
                        </span>
                      )}
                    </td>

                    <td>
                      <select
                        className={`hsk-status-select ${reservationStatusClass(row.reservationStatus)}`}
                        value={row.reservationStatus}
                        onChange={e => patch(row.roomId, { reservationStatus: e.target.value })}
                      >
                        {reservationOptions.map(value => (
                          <option key={value} value={value}>{value || '—'}</option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <div className="hsk-out-controls">
                        <div className="hsk-out-buttons">
                          <button type="button" onClick={() => clearOutRf(row)} className={!outRf ? 'is-active' : ''}>—</button>
                          <button type="button" onClick={() => markOut(row)} className={isOut ? 'is-active' : ''}>OUT</button>
                          <button type="button" onClick={() => markRefresh(row)} className={isRefresh ? 'is-active' : ''}>RF</button>
                        </div>
                        {isOut && (
                          <div className="hsk-envelope-row">
                            <strong>{outRf}</strong>
                            {canInitialEnvelope && !envelopeInitialed && (
                              <button type="button" onClick={() => initialEnvelope(row)}>Initial</button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    <td>
                      <select value={row.stripHold} onChange={e => patch(row.roomId, { stripHold: e.target.value })}>
                        {stripOptions.map(value => <option key={value} value={value}>{value || '—'}</option>)}
                      </select>
                    </td>

                    <td className="hsk-staff-cell">
                      <div className="hsk-staff-picker">
                        <button
                          type="button"
                          className="hsk-staff-trigger"
                          onClick={() => {
                            const opening = openStaffRoomId !== row.roomId
                            setOpenStaffRoomId(opening ? row.roomId : null)
                            setStaffSearch('')
                          }}
                        >
                          <span>{selectedStaff.length ? selectedStaff.join(', ') : 'Select staff'}</span>
                          <ChevronDown size={14} />
                        </button>

                        {openStaffRoomId === row.roomId && (
                          <div className="hsk-staff-popover">
                            <div className="hsk-staff-search">
                              <Search size={14} />
                              <input
                                autoFocus
                                value={staffSearch}
                                onChange={e => setStaffSearch(e.target.value)}
                                placeholder={showAllStaff ? 'Search all active staff' : 'Search on-site staff'}
                              />
                            </div>
                            <div className="hsk-staff-scope">
                              <strong>{showAllStaff ? 'All active staff' : 'On site today'}</strong>
                              <button type="button" onClick={() => setShowAllStaff(value => !value)}>
                                {showAllStaff ? 'On-site only' : 'All active staff'}
                              </button>
                            </div>
                            <div className="hsk-staff-options">
                              {filteredStaff.map(option => {
                                const checked = selectedStaff.includes(option.name)
                                return (
                                  <button
                                    type="button"
                                    key={option.id}
                                    className={checked ? 'is-selected' : ''}
                                    onClick={() => toggleStaff(row, option.name)}
                                  >
                                    <span className="hsk-staff-check">{checked && <Check size={13} />}</span>
                                    <span>
                                      {option.name}
                                      {!showAllStaff && option.onSite && (
                                        <small>
                                          {[option.roleLabel, option.shiftStart && option.shiftEnd ? `${String(option.shiftStart).slice(0,5)}–${String(option.shiftEnd).slice(0,5)}` : ''].filter(Boolean).join(' · ')}
                                        </small>
                                      )}
                                    </span>
                                  </button>
                                )
                              })}
                              {!filteredStaff.length && <div className="hsk-no-staff">{showAllStaff ? 'No matching active staff.' : 'No on-site staff scheduled for this day.'}</div>}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>

                    <td>
                      <input
                        className="order-input"
                        type="number"
                        min="1"
                        value={row.cleanOrder ?? ''}
                        onChange={e => patch(row.roomId, {
                          cleanOrder: e.target.value ? Number(e.target.value) : null
                        })}
                      />
                    </td>

                    <td className="check-cell">
                      <input
                        type="checkbox"
                        checked={row.complete}
                        onChange={e => toggleComplete(row, e.target.checked)}
                      />
                    </td>

                    <td className="hsk-signoff-cell">
                      <div className="hsk-signoff-stack">
                        <div className={row.haSignedBy ? 'hsk-signoff done' : 'hsk-signoff'}>
                          <span className="hsk-signoff-label">HA</span>
                          {row.haSignedBy ? (
                            <span className="hsk-signoff-value">✓ {row.haSignedName} {formatShortTime(row.haSignedAt)}</span>
                          ) : canHaSignoff && row.complete ? (
                            <button type="button" onClick={() => void signOff(row, 'ha')}>Pass</button>
                          ) : (
                            <span className="hsk-signoff-pending">Pending</span>
                          )}
                        </div>

                        {canHaSignoff && row.complete && !row.haSignedBy && (
                          <div className="hsk-check-issue">
                            <input
                              value={issueDrafts[row.roomId] || ''}
                              onChange={e=>setIssueDrafts(current=>({...current,[row.roomId]:e.target.value}))}
                              placeholder="Problem found…"
                            />
                            <button type="button" onClick={()=>void flagCheckIssue(row)}>Needs fix</button>
                          </div>
                        )}

                        {canHaSignoff && row.checkIssueOpen && (
                          <button type="button" className="hsk-pass-recheck" onClick={()=>void clearCheckIssue(row)}>
                            Pass re-check
                          </button>
                        )}

                        <div className={row.fohSignedBy ? 'hsk-signoff done' : 'hsk-signoff'}>
                          <span className="hsk-signoff-label">FOH</span>
                          {row.fohSignedBy ? (
                            <span className="hsk-signoff-value">✓ {row.fohSignedName} {formatShortTime(row.fohSignedAt)}</span>
                          ) : canFohSignoff && row.complete ? (
                            <button type="button" onClick={() => void signOff(row, 'foh')}>Sign</button>
                          ) : (
                            <span className="hsk-signoff-pending">Pending</span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td>
                      <select value={row.roomCondition} onChange={e => patch(row.roomId, { roomCondition: e.target.value })}>
                        {conditionOptions.map(value => <option key={value} value={value}>{value || '—'}</option>)}
                      </select>
                    </td>

                    <td className="hsk-package-cell">
                      <div className="hsk-package-picker">
                        <button
                          type="button"
                          className="hsk-package-trigger"
                          onClick={() => setOpenPackageRoomId(openPackageRoomId === row.roomId ? null : row.roomId)}
                        >
                          <span>{packageLabel(selectedPackageIds)}</span>
                          <ChevronDown size={14}/>
                        </button>

                        {openPackageRoomId === row.roomId && (
                          <div className="hsk-package-popover">
                            <div className="hsk-package-options">
                              {packageOptions
                                .filter(option => option.available || selectedPackageIds.includes(option.id))
                                .map(option => {
                                  const checked = selectedPackageIds.includes(option.id)
                                  return (
                                    <button
                                      type="button"
                                      key={option.id}
                                      className={checked ? 'is-selected' : ''}
                                      onClick={() => togglePackage(row, option.id)}
                                      disabled={!option.available && !checked}
                                    >
                                      <span className="hsk-package-check">{checked && <Check size={13}/>}</span>
                                      <span className="hsk-package-copy">
                                        <strong>{option.name}</strong>
                                        <small>{option.available ? (option.price == null ? 'Available' : `${option.price.toFixed(2)}`) : 'Unavailable'}</small>
                                      </span>
                                    </button>
                                  )
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>

                    <td>
                      <input
                        value={row.notes}
                        onChange={e => patch(row.roomId, { notes: e.target.value })}
                        placeholder="Notes"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          <div className="hsk-scroll-control">
            <span>Scroll table</span>
            <input
              type="range"
              min="0"
              max={Math.max(0,tableScrollMax)}
              step="1"
              value={Math.min(tableScrollLeft,tableScrollMax)}
              disabled={tableScrollMax<=0}
              onChange={e=>{
                const value=Number(e.target.value)
                setTableScrollLeft(value)
                if(tableScrollRef.current) tableScrollRef.current.scrollLeft=value
              }}
              aria-label="Scroll housekeeping table horizontally"
            />
            <span>{tableScrollMax>0?'↔':'Fits'}</span>
          </div>
          </div>
        </>
      )}
    </div>
  )
}
