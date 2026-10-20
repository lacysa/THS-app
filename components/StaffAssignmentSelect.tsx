'use client'

import type { CSSProperties } from 'react'
import type { AssignmentStaff } from '@/lib/assignment-staff'

type Props = {
  staff: AssignmentStaff[]
  value: string
  onChange: (value: string) => void
  label: string
  disabled?: boolean
  housekeepingOnly?: boolean
  disableStaff?: (staff: AssignmentStaff) => boolean
  className?: string
  style?: CSSProperties
}

const unavailableStates = new Set(['called_off', 'no_call_no_show', 'time_off', 'unavailable'])

/** Native grouped select to keep staff assignments consistent on iPhone, iPad and desktop. */
export default function StaffAssignmentSelect({staff,value,onChange,label,disabled,housekeepingOnly=false,disableStaff,className,style}:Props) {
  const eligible = staff.filter(person => !housekeepingOnly || person.housekeepingEligible)
  const unavailable = eligible.filter(person => unavailableStates.has(person.scheduleState))
  const available = eligible.filter(person => !unavailableStates.has(person.scheduleState))
  const onsite = available.filter(person => person.onSite && person.housekeepingEligible)
  const otherScheduled = available.filter(person => person.onSite && !person.housekeepingEligible)
  const offsite = available.filter(person => !person.onSite)
  const missing = Boolean(value && !eligible.some(person => person.name === value))
  const options = (people:AssignmentStaff[]) => people.map(person => {
    const away = unavailableStates.has(person.scheduleState)
    const atLimit = Boolean(disableStaff?.(person)) && person.name !== value
    return <option key={person.id} value={person.name} disabled={(away && person.name !== value) || atLimit}>
      {person.name}{away ? ' · '+person.scheduleState.replaceAll('_',' ') : atLimit ? ' · full-clean limit reached' : !person.onSite ? ' · not on site' : !person.housekeepingEligible ? ' · '+(person.roleLabel||'other role') : ''}
    </option>
  })
  return <select aria-label={label} className={className} style={style} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
    <option value="">Unassigned</option>
    {missing && <option value={value}>{value} (existing assignment)</option>}
    {onsite.length > 0 && <optgroup label="Scheduled on site">{options(onsite)}</optgroup>}
    {otherScheduled.length > 0 && <optgroup label="Other scheduled staff">{options(otherScheduled)}</optgroup>}
    {offsite.length > 0 && <optgroup label="Other active staff (not scheduled on site)">{options(offsite)}</optgroup>}
    {unavailable.length > 0 && <optgroup label="Unavailable today (new assignments disabled)">{options(unavailable)}</optgroup>}
  </select>
}
