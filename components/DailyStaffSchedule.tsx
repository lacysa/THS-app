'use client'

import { useEffect, useMemo, useState } from 'react'
import { Save } from 'lucide-react'

type ScheduleRow={
  id:string
  name:string
  jobTitle:string
  workMode:'unscheduled'|'onsite'|'remote'|'time_off'|'unavailable'
  shiftStart:string
  shiftEnd:string
  roleLabel:string
  notes:string
}

function todayLocal(){
  const d=new Date()
  const y=d.getFullYear()
  const m=String(d.getMonth()+1).padStart(2,'0')
  const day=String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
}

export default function DailyStaffSchedule(){
  const [date,setDate]=useState(todayLocal())
  const [rows,setRows]=useState<ScheduleRow[]>([])
  const [loading,setLoading]=useState(true)
  const [savingId,setSavingId]=useState('')
  const [message,setMessage]=useState('')
  const [expandedId,setExpandedId]=useState('')
  const [staffFilter,setStaffFilter]=useState<'onsite'|'all'>('onsite')

  async function load(){
    setLoading(true)
    setMessage('')
    const r=await fetch(`/api/staff-schedule?date=${encodeURIComponent(date)}`,{cache:'no-store'})
    const d=await r.json().catch(()=>({}))
    if(!r.ok){
      setMessage(d.error||'Could not load daily staffing.')
      setLoading(false)
      return
    }
    setRows(d.staff||[])
    setLoading(false)
  }

  useEffect(()=>{ void load() },[date])

  function patch(id:string,update:Partial<ScheduleRow>){
    setRows(current=>current.map(row=>row.id===id?{...row,...update}:row))
  }

  async function save(row:ScheduleRow){
    setSavingId(row.id)
    setMessage('')
    const r=await fetch('/api/staff-schedule',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        date,
        staff_member_id:row.id,
        work_mode:row.workMode,
        shift_start:row.workMode==='onsite'||row.workMode==='remote' ? row.shiftStart||null : null,
        shift_end:row.workMode==='onsite'||row.workMode==='remote' ? row.shiftEnd||null : null,
        role_label:row.roleLabel,
        notes:row.notes
      })
    })
    const d=await r.json().catch(()=>({}))
    if(!r.ok) setMessage(d.error||'Could not save staffing.')
    else setMessage(`${row.name} saved.`)
    setSavingId('')
  }

  const onSite=useMemo(()=>rows.filter(row=>row.workMode==='onsite'),[rows])
  const shownRows=useMemo(()=>staffFilter==='onsite'?rows.filter(row=>row.workMode==='onsite'):rows,[rows,staffFilter])

  return <section className="daily-staff-editor">
    <header>
      <div>
        <span>DAILY STAFFING</span>
        <h2>Who&apos;s on site?</h2>
        <p>On-site staff appear first in Housekeeping assignment lists. Remote, time off, and unavailable staff are excluded.</p>
      </div>
      <div className="daily-staff-editor-date">
        <label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
        <strong>{onSite.length} on site</strong>
      </div>
    </header>

    <div className="staffing-compact-toolbar"><span>Manage schedule</span><div role="group" aria-label="Filter staff"><button type="button" className={staffFilter==='onsite'?'active':''} onClick={()=>setStaffFilter('onsite')}>On site ({onSite.length})</button><button type="button" className={staffFilter==='all'?'active':''} onClick={()=>setStaffFilter('all')}>All staff ({rows.length})</button></div></div>
    {message&&<div className="daily-staff-editor-message">{message}</div>}

    {loading
      ? <div className="daily-staff-editor-empty">Loading staffing…</div>
      : <div className="daily-staff-editor-list">
          {shownRows.map(row=>{
            const hasTimes=row.workMode==='onsite'||row.workMode==='remote'
            return <div className={`daily-staff-editor-row mode-${row.workMode} ${expandedId===row.id?'staffing-expanded':''}`} key={row.id}>
              <div className="daily-staff-editor-person">
                <strong>{row.name}</strong>
                <small>{row.jobTitle||'Staff'}</small>
              </div>

              <button type="button" className="staffing-row-toggle" aria-expanded={expandedId===row.id} onClick={()=>setExpandedId(id=>id===row.id?'':row.id)}><span>{row.workMode==='onsite'?'On site':row.workMode.replace('_',' ')}</span><span>{expandedId===row.id?'Hide details':'Edit shift'} ▾</span></button>
              <div className="staffing-row-fields">
              <label>
                <span>Status</span>
                <select value={row.workMode} onChange={e=>patch(row.id,{workMode:e.target.value as ScheduleRow['workMode']})}>
                  <option value="unscheduled">Unscheduled</option>
                  <option value="onsite">On site</option>
                  <option value="remote">Remote</option>
                  <option value="time_off">Time off</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </label>

              <label>
                <span>Role today</span>
                <input value={row.roleLabel} onChange={e=>patch(row.id,{roleLabel:e.target.value})} placeholder="Housekeeping, FOH, Kitchen…"/>
              </label>

              <label>
                <span>Start</span>
                <input type="time" value={row.shiftStart} disabled={!hasTimes} onChange={e=>patch(row.id,{shiftStart:e.target.value})}/>
              </label>

              <label>
                <span>End</span>
                <input type="time" value={row.shiftEnd} disabled={!hasTimes} onChange={e=>patch(row.id,{shiftEnd:e.target.value})}/>
              </label>

              <button type="button" className="daily-staff-editor-save" onClick={()=>void save(row)} disabled={savingId===row.id}>
                <Save size={14}/>{savingId===row.id?'Saving…':'Save'}
              </button>
              </div>
            </div>
          })}
        </div>}
  </section>
}
