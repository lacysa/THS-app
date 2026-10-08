'use client'

import { useEffect,useRef,useState } from 'react'

function todayDetroit(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}

export default function DepartmentBoard({department,label}:{department:'laundry'|'lobby';label:string}) {
  const [date,setDate]=useState(todayDetroit())
  const [note,setNote]=useState('')
  const [state,setState]=useState('idle')
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null)

  useEffect(()=>{(async()=>{const r=await fetch(`/api/department-notes?department=${department}&date=${date}`,{cache:'no-store'});const d=await r.json().catch(()=>({}));if(r.ok)setNote(d.note||'')})()},[department,date])

  function change(value:string){
    setNote(value);setState('saving');if(timer.current)clearTimeout(timer.current)
    timer.current=setTimeout(async()=>{const r=await fetch('/api/department-notes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({department,date,note:value})});setState(r.ok?'saved':'error')},650)
  }

  return <div className="department-board">
    <div className="module-toolbar">
      <div><div className="module-kicker">{label}</div><h1>{label} Daily</h1><p>Daily handoff notes for your department.</p></div>
      <label className="date-control">Date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
    </div>
    <section className="card department-note-card">
      <div className="department-note-head"><h2>Shift notes</h2><span className={`save-chip ${state}`}>{state==='saving'?'Saving…':state==='saved'?'Saved ✓':state==='error'?'Save failed':'Autosaves'}</span></div>
      <textarea value={note} onChange={e=>change(e.target.value)} placeholder={department==='laundry'?'Laundry status, linen shortages, machine issues, carryover…':'Lobby setup, guest-facing issues, restock needs, handoff…'}/>
    </section>
  </div>
}
