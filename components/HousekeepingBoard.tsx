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
  UtensilsCrossed
} from 'lucide-react'

type BreakfastStatus = 'none' | 'needed' | 'received' | 'declined'

type RoomRow = {
  roomId: string
  roomName: string
  sortOrder: number
  reservationStatus: string
  serviceType: string
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
  notes: string
  haSignedBy?: string | null
  haSignedName?: string | null
  haSignedAt?: string | null
  fohSignedBy?: string | null
  fohSignedName?: string | null
  fohSignedAt?: string | null
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
}

type Access = {
  name?: string | null
  preferredName?: string | null
  email?: string | null
  roleName?: string | null
  isAdmin?: boolean
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const reservationOptions = ['', 'Checkout', 'Out/In', 'Stayover', 'Arrival', 'Blocked']
const stripOptions = ['', 'Strip', 'Hold']
const conditionOptions = ['', 'Occupied', 'Cleaning', 'Ready for Inspection', 'Vacant (Clean)', 'Vacant (Dirty)', 'Vacant (Blocked)', 'Out of Order']
const nextShiftOptions = ['', 'Occupied', 'Vacant (Clean)', 'Vacant (Dirty)', 'Vacant (Blocked)', 'Out of Order']

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
  const rowsRef = useRef<RoomRow[]>([])
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
      !row.housekeeperAttestedBy
    ) {
      setMessage('Please attest that this room is fully cleaned and up to The Hotel Saugatuck standards first.')
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

  async function attestRoom(row:RoomRow, checked:boolean) {
    patch(row.roomId,{
      housekeeperAttestedBy: checked ? 'pending-self' : null,
      housekeeperAttestedName: checked ? (access?.preferredName || access?.name || 'You') : null,
      housekeeperAttestedAt: checked ? new Date().toISOString() : null
    })
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
    if (!q) return staffOptions
    return staffOptions.filter(option => option.name.toLowerCase().includes(q))
  }, [staffOptions, staffSearch])

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
              <article id={`room-${row.roomId}`} className={`hsk-assigned-card ${row.complete ? 'complete' : ''}`} key={row.roomId}>
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
                  </div>

                  <span className={row.complete ? 'hsk-complete-pill done' : 'hsk-complete-pill'}>
                    {row.complete ? 'Complete ✓' : 'In progress'}
                  </span>
                </div>

                {row.breakfast.status !== 'none' && (
                  <span className={`hsk-breakfast-badge hsk-breakfast-${row.breakfast.status}`}>
                    {row.breakfast.status === 'needed' && 'Breakfast · menu needed'}
                    {row.breakfast.status === 'received' && 'Breakfast · menu ✓'}
                    {row.breakfast.status === 'declined' && 'Breakfast · declined'}
                  </span>
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

                <label className="hsk-attestation">
                  <input
                    type="checkbox"
                    checked={Boolean(row.housekeeperAttestedBy)}
                    onChange={e => void attestRoom(row,e.target.checked)}
                    disabled={row.complete}
                  />
                  <span>I attest that this room has been fully cleaned, reset, and meets The Hotel Saugatuck standards.</span>
                </label>

                <button
                  type="button"
                  className={row.complete ? 'ops-secondary-btn hsk-complete-btn' : 'ops-primary-btn hsk-complete-btn'}
                  onClick={() => toggleComplete(row, !row.complete)}
                  disabled={
                    !row.complete &&
                    (
                      !row.housekeeperAttestedBy ||
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
        <div className="hsk-table-wrapper">
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
                <th>Condition</th>
                <th>Next</th>
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

                return (
                  <tr id={`room-${row.roomId}`} key={row.roomId}>
                    <td className="hsk-sticky-room hsk-room-column">
                      <div className="hsk-room-cell">
                        <BedDouble size={15} />
                        <strong>{row.roomName}</strong>
                      </div>
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
                                placeholder="Search current staff"
                              />
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
                                    {option.name}
                                  </button>
                                )
                              })}
                              {!filteredStaff.length && <div className="hsk-no-staff">No matching active staff.</div>}
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

                    <td>
                      <select value={row.nextShiftCondition} onChange={e => patch(row.roomId, { nextShiftCondition: e.target.value })}>
                        {nextShiftOptions.map(value => <option key={value} value={value}>{value || '—'}</option>)}
                      </select>
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
      )}
    </div>
  )
}
