'use client'

import {
  useEffect,
  useMemo,
  useState
} from 'react'

import {
  RefreshCw,
  Save,
  BedDouble
} from 'lucide-react'

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
}

type Access = {
  name?: string | null
  preferredName?: string | null
  email?: string | null
  roleName?: string | null
  isAdmin?: boolean
}

const reservationOptions = [
  '',
  'Checkout',
  'Out/In',
  'Stayover',
  'Arrival',
  'Blocked'
]

const stripOptions = [
  '',
  'Strip',
  'Hold'
]

const conditionOptions = [
  '',
  'Occupied',
  'Cleaning',
  'Ready for Inspection',
  'Vacant (Clean)',
  'Vacant (Dirty)',
  'Vacant (Blocked)',
  'Out of Order'
]

const nextShiftOptions = [
  '',
  'Occupied',
  'Vacant (Clean)',
  'Vacant (Dirty)',
  'Vacant (Blocked)',
  'Out of Order'
]

function todayDetroit() {
  return new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: 'America/Detroit',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }
  ).format(new Date())
}

function normalize(
  value: string | null | undefined
) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function getManagerInitials(
  access: Access | null
) {
  if (!access) return ''

  const combined = normalize(
    `${access.name || ''} ${
      access.preferredName || ''
    } ${access.email || ''}`
  )

  if (
    combined.includes('sarah') ||
    combined.includes('lacysa')
  ) {
    return 'SL'
  }

  if (
    combined.includes('brittany') ||
    combined.includes(
      'brittanyahollingshead'
    )
  ) {
    return 'BH'
  }

  if (
    combined.includes('david') ||
    combined.includes('davidheiser')
  ) {
    return 'DH'
  }

  const rawName =
    access.name ||
    access.preferredName ||
    ''

  const pieces = rawName
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (pieces.length >= 2) {
    return (
      pieces[0][0] +
      pieces[
        pieces.length - 1
      ][0]
    ).toUpperCase()
  }

  return ''
}

export default function HousekeepingBoard() {
  const [date, setDate] =
    useState(todayDetroit())

  const [rows, setRows] =
    useState<RoomRow[]>([])

  const [loading, setLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  const [message, setMessage] =
    useState('')

  const [access, setAccess] =
    useState<Access | null>(null)

  const [canInspect, setCanInspect] =
    useState(false)

  useEffect(() => {
    fetch('/api/me', {
      cache: 'no-store'
    })
      .then(r =>
        r.ok ? r.json() : null
      )
      .then(d => {
        if (!d) return
        setAccess(d.access || null)
      })
      .catch(() => {})
  }, [])

  async function load() {
    setLoading(true)
    setMessage('')

    try {
      const r = await fetch(
        `/api/housekeeping/day?date=${encodeURIComponent(
          date
        )}`,
        {
          cache: 'no-store'
        }
      )

      const d =
        await r
          .json()
          .catch(() => ({}))

      if (!r.ok) {
        setMessage(
          d.error ||
            'Could not load housekeeping board.'
        )
      } else {
        setRows(d.rows || [])
        setCanInspect(
          Boolean(d.canInspect)
        )
      }
    } catch {
      setMessage(
        'Could not load housekeeping board.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [date])

  function patch(
    roomId: string,
    update: Partial<RoomRow>
  ) {
    setRows(current =>
      current.map(row =>
        row.roomId === roomId
          ? {
              ...row,
              ...update
            }
          : row
      )
    )
  }

  async function save() {
    setSaving(true)
    setMessage('Saving…')

    try {
      const r = await fetch(
        '/api/housekeeping/day',
        {
          method: 'POST',
          headers: {
            'content-type':
              'application/json'
          },
          body: JSON.stringify({
            serviceDate: date,
            rows
          })
        }
      )

      const d =
        await r
          .json()
          .catch(() => ({}))

      if (!r.ok) {
        setMessage(
          d.error ||
            'Could not save housekeeping board.'
        )

        return
      }

      let savedMessage =
        'Housekeeping board saved.'

      if (
        Array.isArray(d.warnings) &&
        d.warnings.length > 0
      ) {
        savedMessage +=
          ` ${d.warnings.join(' ')}`
      }

      setMessage(savedMessage)

      await load()
    } catch {
      setMessage(
        'Could not save housekeeping board.'
      )
    } finally {
      setSaving(false)
    }
  }

  const canInitialEnvelope =
    Boolean(
      access?.isAdmin ||
      normalize(
        access?.roleName
      ) === 'owner' ||
      normalize(
        access?.roleName
      ) === 'manager'
    )

  const managerInitials =
    getManagerInitials(access)

  function markOut(
    row: RoomRow
  ) {
    patch(
      row.roomId,
      {
        serviceType: 'OUT'
      }
    )
  }

  function markRefresh(
    row: RoomRow
  ) {
    patch(
      row.roomId,
      {
        serviceType: 'RF'
      }
    )
  }

  function clearOutRf(
    row: RoomRow
  ) {
    patch(
      row.roomId,
      {
        serviceType: ''
      }
    )
  }

  function initialEnvelope(
    row: RoomRow
  ) {
    if (
      !canInitialEnvelope ||
      !managerInitials
    ) {
      setMessage(
        'Manager initials could not be determined from your profile.'
      )

      return
    }

    if (
      !String(
        row.serviceType || ''
      )
        .toUpperCase()
        .startsWith('OUT')
    ) {
      setMessage(
        'Mark the room OUT before initialing the envelope.'
      )

      return
    }

    patch(
      row.roomId,
      {
        serviceType:
          `OUT-${managerInitials}`
      }
    )
  }

  function toggleComplete(
    row: RoomRow,
    checked: boolean
  ) {
    if (!checked) {
      patch(
        row.roomId,
        {
          complete: false,
          readyForInspection: false,
          inspected: false
        }
      )

      return
    }

    patch(
      row.roomId,
      {
        complete: true,
        readyForInspection: true,
        inspected: false,
        roomCondition:
          row.roomCondition ||
          'Ready for Inspection'
      }
    )
  }

  function toggleInspected(
    row: RoomRow,
    checked: boolean
  ) {
    if (!canInspect) {
      return
    }

    if (
      checked &&
      !row.complete
    ) {
      setMessage(
        'A room must be marked complete before it can be marked inspected.'
      )

      return
    }

    patch(
      row.roomId,
      {
        inspected:
          checked,

        readyForInspection:
          checked
            ? false
            : row.complete,

        roomCondition:
          checked
            ? 'Vacant (Clean)'
            : row.complete
            ? 'Ready for Inspection'
            : row.roomCondition
      }
    )
  }

  const summary =
    useMemo(() => {
      const fullCleans =
        rows.filter(row =>
          [
            'Checkout',
            'Out/In',
            'Blocked'
          ].includes(
            row.reservationStatus
          )
        ).length

      const refreshes =
        rows.filter(
          row =>
            row.serviceType ===
            'RF'
        ).length

      const checkedOut =
        rows.filter(
          row =>
            String(
              row.serviceType || ''
            )
              .toUpperCase()
              .startsWith('OUT')
        ).length

      const complete =
        rows.filter(
          row => row.complete
        ).length

      const readyForInspection =
        rows.filter(
          row =>
            row.complete &&
            !row.inspected
        ).length

      const inspected =
        rows.filter(
          row => row.inspected
        ).length

      return {
        fullCleans,
        refreshes,
        checkedOut,
        complete,
        readyForInspection,
        inspected
      }
    }, [rows])

  return (
    <div className="ops-module hsk-module">

      <div className="module-toolbar">

        <div>

          <div className="module-kicker">
            Housekeeping
          </div>

          <h1>
            Daily Room Board
          </h1>

          <p>
            Daily housekeeping assignments,
            checkout confirmation, refreshes,
            room completion, inspection, and
            room condition.
          </p>

        </div>

        <div className="toolbar-actions">

          <label className="date-control">

            Date

            <input
              type="date"
              value={date}
              onChange={e =>
                setDate(
                  e.target.value
                )
              }
            />

          </label>

          <button
            className="ops-secondary-btn"
            onClick={load}
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            className="ops-primary-btn"
            onClick={save}
            disabled={saving}
          >
            <Save size={16} />

            {saving
              ? 'Saving…'
              : 'Save changes'}
          </button>

        </div>

      </div>

      {message && (
        <div className="module-message">
          {message}
        </div>
      )}

      <div className="metric-row">

        <div className="metric-card">
          <span>
            Full cleans
          </span>
          <strong>
            {summary.fullCleans}
          </strong>
        </div>

        <div className="metric-card">
          <span>
            Refreshes
          </span>
          <strong>
            {summary.refreshes}
          </strong>
        </div>

        <div className="metric-card">
          <span>
            Checked out
          </span>
          <strong>
            {summary.checkedOut}
          </strong>
        </div>

        <div className="metric-card">
          <span>
            Complete
          </span>
          <strong>
            {summary.complete}
          </strong>
        </div>

        <div className="metric-card">
          <span>
            Ready to inspect
          </span>
          <strong>
            {summary.readyForInspection}
          </strong>
        </div>

        <div className="metric-card">
          <span>
            Inspected
          </span>
          <strong>
            {summary.inspected}
          </strong>
        </div>

      </div>

      {loading ? (

        <div className="module-empty">
          Loading rooms…
        </div>

      ) : (

        <div className="hsk-table-wrapper">

          <table className="hsk-table">

            <thead>
              <tr>
                <th>Room</th>
                <th>Status</th>
                <th>Out / RF</th>
                <th>Strip / Hold</th>
                <th>Staff</th>
                <th>Order</th>
                <th>Complete</th>
                <th>Inspected</th>
                <th>Room condition</th>
                <th>Next shift</th>
                <th>Notes</th>
              </tr>
            </thead>

            <tbody>

              {rows.map(row => {

                const outRf =
                  String(
                    row.serviceType ||
                    ''
                  ).toUpperCase()

                const isOut =
                  outRf.startsWith(
                    'OUT'
                  )

                const isRefresh =
                  outRf === 'RF'

                const envelopeInitialed =
                  /^OUT-[A-Z]{2,4}$/.test(
                    outRf
                  )

                return (
                  <tr key={row.roomId}>

                    <td>
                      <div className="hsk-room-cell">
                        <BedDouble size={15} />
                        <strong>
                          {row.roomName}
                        </strong>
                      </div>
                    </td>

                    <td>
                      <select
                        value={
                          row.reservationStatus
                        }
                        onChange={e =>
                          patch(
                            row.roomId,
                            {
                              reservationStatus:
                                e.target.value
                            }
                          )
                        }
                      >
                        {reservationOptions.map(
                          value => (
                            <option
                              key={value}
                              value={value}
                            >
                              {value || '—'}
                            </option>
                          )
                        )}
                      </select>
                    </td>

                    <td>

                      <div
                        style={{
                          display: 'grid',
                          gap: 5
                        }}
                      >

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns:
                              'repeat(3, minmax(0, 1fr))',
                            gap: 4
                          }}
                        >

                          <button
                            type="button"
                            onClick={() =>
                              clearOutRf(
                                row
                              )
                            }
                            style={{
                              minHeight: 32,
                              border:
                                '1px solid var(--ths-line)',
                              borderRadius: 5,
                              background:
                                !outRf
                                  ? 'var(--ths-charcoal)'
                                  : 'white',
                              color:
                                !outRf
                                  ? 'white'
                                  : 'var(--ths-text)',
                              cursor:
                                'pointer',
                              fontSize: 10,
                              fontWeight: 700
                            }}
                          >
                            —
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              markOut(
                                row
                              )
                            }
                            style={{
                              minHeight: 32,
                              border:
                                '1px solid var(--ths-line)',
                              borderRadius: 5,
                              background:
                                isOut
                                  ? 'var(--ths-charcoal)'
                                  : 'white',
                              color:
                                isOut
                                  ? 'white'
                                  : 'var(--ths-text)',
                              cursor:
                                'pointer',
                              fontSize: 10,
                              fontWeight: 800
                            }}
                          >
                            OUT
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              markRefresh(
                                row
                              )
                            }
                            style={{
                              minHeight: 32,
                              border:
                                '1px solid var(--ths-line)',
                              borderRadius: 5,
                              background:
                                isRefresh
                                  ? 'var(--ths-charcoal)'
                                  : 'white',
                              color:
                                isRefresh
                                  ? 'white'
                                  : 'var(--ths-text)',
                              cursor:
                                'pointer',
                              fontSize: 10,
                              fontWeight: 800
                            }}
                          >
                            RF
                          </button>

                        </div>

                        {isOut && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5
                            }}
                          >

                            <strong
                              style={{
                                fontSize: 10,
                                whiteSpace:
                                  'nowrap'
                              }}
                            >
                              {outRf}
                            </strong>

                            {canInitialEnvelope &&
                              !envelopeInitialed && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    initialEnvelope(
                                      row
                                    )
                                  }
                                  style={{
                                    minHeight: 26,
                                    padding:
                                      '0 7px',
                                    border:
                                      '1px solid var(--ths-line)',
                                    borderRadius: 5,
                                    background:
                                      '#f3f1ec',
                                    color:
                                      'var(--ths-text)',
                                    cursor:
                                      'pointer',
                                    fontSize: 9,
                                    fontWeight: 700
                                  }}
                                >
                                  Initial envelope
                                </button>
                              )}

                          </div>
                        )}

                      </div>

                    </td>

                    <td>
                      <select
                        value={
                          row.stripHold
                        }
                        onChange={e =>
                          patch(
                            row.roomId,
                            {
                              stripHold:
                                e.target.value
                            }
                          )
                        }
                      >
                        {stripOptions.map(
                          value => (
                            <option
                              key={value}
                              value={value}
                            >
                              {value || '—'}
                            </option>
                          )
                        )}
                      </select>
                    </td>

                    <td>
                      <input
                        value={
                          row.assignedTo
                        }
                        onChange={e =>
                          patch(
                            row.roomId,
                            {
                              assignedTo:
                                e.target.value
                            }
                          )
                        }
                        placeholder="Staff"
                      />
                    </td>

                    <td>
                      <input
                        className="order-input"
                        type="number"
                        min="1"
                        value={
                          row.cleanOrder ??
                          ''
                        }
                        onChange={e =>
                          patch(
                            row.roomId,
                            {
                              cleanOrder:
                                e.target.value
                                  ? Number(
                                      e.target.value
                                    )
                                  : null
                            }
                          )
                        }
                      />
                    </td>

                    <td className="check-cell">
                      <input
                        type="checkbox"
                        checked={
                          row.complete
                        }
                        onChange={e =>
                          toggleComplete(
                            row,
                            e.target.checked
                          )
                        }
                      />
                    </td>

                    <td className="check-cell">
                      <input
                        type="checkbox"
                        checked={
                          Boolean(
                            row.inspected
                          )
                        }
                        disabled={
                          !canInspect ||
                          !row.complete
                        }
                        onChange={e =>
                          toggleInspected(
                            row,
                            e.target.checked
                          )
                        }
                        title={
                          !canInspect
                            ? 'You do not have permission to inspect rooms.'
                            : !row.complete
                            ? 'Room must be complete before inspection.'
                            : 'Mark room inspected'
                        }
                      />
                    </td>

                    <td>
                      <select
                        value={
                          row.roomCondition
                        }
                        onChange={e =>
                          patch(
                            row.roomId,
                            {
                              roomCondition:
                                e.target.value
                            }
                          )
                        }
                      >
                        {conditionOptions.map(
                          value => (
                            <option
                              key={value}
                              value={value}
                            >
                              {value || '—'}
                            </option>
                          )
                        )}
                      </select>
                    </td>

                    <td>
                      <select
                        value={
                          row.nextShiftCondition
                        }
                        onChange={e =>
                          patch(
                            row.roomId,
                            {
                              nextShiftCondition:
                                e.target.value
                            }
                          )
                        }
                      >
                        {nextShiftOptions.map(
                          value => (
                            <option
                              key={value}
                              value={value}
                            >
                              {value || '—'}
                            </option>
                          )
                        )}
                      </select>
                    </td>

                    <td>
                      <input
                        value={
                          row.notes
                        }
                        onChange={e =>
                          patch(
                            row.roomId,
                            {
                              notes:
                                e.target.value
                            }
                          )
                        }
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
