'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ClipboardPenLine, MessageSquareText, X } from 'lucide-react'

function prettyDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return 'Today'
 return new Intl.DateTimeFormat('en-US',{timeZone:'America/Detroit',weekday:'long',month:'long',day:'numeric'}).format(new Date(value+'T12:00:00-04:00'))
}

export default function StaffShiftNote(){
 const [open,setOpen]=useState(false)
 const [note,setNote]=useState('')
 const [savedNote,setSavedNote]=useState('')
 const [date,setDate]=useState('')
 const [busy,setBusy]=useState(false)
 const [message,setMessage]=useState('')
 const [error,setError]=useState('')
 const textareaRef=useRef<HTMLTextAreaElement>(null)
 const dirty=note!==savedNote

 useEffect(()=>{
  if(!open)return
  const onKeyDown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();attemptClose()}
  }
  document.addEventListener('keydown',onKeyDown)
  const previousOverflow=document.body.style.overflow
  document.body.style.overflow='hidden'
  return()=>{
   document.removeEventListener('keydown',onKeyDown)
   document.body.style.overflow=previousOverflow
  }
 // Only subscribe on opening; close always uses the latest note via the button.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[open,dirty,busy])

 function attemptClose(){
  if(busy)return
  if(dirty&&!window.confirm('Discard your unsaved shift note changes?'))return
  setOpen(false)
 }

 async function load(){
  setOpen(true);setBusy(true);setMessage('');setError('')
  try{
   const response=await fetch('/api/staff-shift-note',{cache:'no-store'})
   const data=await response.json()
   if(!response.ok)throw Error(data.error||'Could not load your shift note')
   setNote(data.content||'')
   setSavedNote(data.content||'')
   setDate(data.date||'')
   requestAnimationFrame(()=>textareaRef.current?.focus())
  }catch(e:any){setError(e?.message||'Could not load your note')}
  finally{setBusy(false)}
 }

 async function save(){
  if(busy)return
  setBusy(true);setMessage('');setError('')
  try{
   const response=await fetch('/api/staff-shift-note',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({content:note})
   })
   const data=await response.json()
   if(!response.ok)throw Error(data.error||'Could not save your note')
   setSavedNote(note.trim())
   setNote(note.trim())
   setMessage('Saved to the manager shift report.')
  }catch(e:any){setError(e?.message||'Unable to save your shift note')}
  finally{setBusy(false)}
 }

 return <div className="staff-note-entry">
  <button type="button" className="staff-note-trigger" onClick={()=>void load()}>
   <MessageSquareText size={17} aria-hidden="true"/>
   <span>My shift note</span>
   <small>Pass something along to management</small>
  </button>

  {open&&<div className="staff-note-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)attemptClose()}}>
   <section className="staff-note-modal" role="dialog" aria-modal="true" aria-labelledby="staff-note-title" aria-describedby="staff-note-subtitle">
    <header className="staff-note-modal-head">
     <div className="staff-note-header-copy">
      <span className="staff-note-kicker">THE HOTEL SAUGATUCK · STAFF HANDOFF</span>
      <h2 id="staff-note-title">My shift note</h2>
      <p id="staff-note-subtitle">Record anything management should know about your shift.</p>
     </div>
     <button type="button" className="staff-note-close" aria-label="Close shift note" onClick={attemptClose} disabled={busy}><X size={18}/></button>
    </header>

    <div className="staff-note-modal-body">
     <div className="staff-note-date"><ClipboardPenLine size={16}/><strong>{prettyDate(date)}</strong><span>Daily shift report</span></div>
     <label className="staff-note-label" htmlFor="staff-note-content">Shift notes</label>
     <textarea ref={textareaRef} id="staff-note-content" aria-label="Shift notes" placeholder="Add an observation, guest issue, housekeeping update, or anything that should be passed along…" value={note} maxLength={4000} rows={7} disabled={busy} onChange={event=>{setNote(event.target.value);setMessage('')}}/>
     <div className="staff-note-helper"><span>Visible to management in the daily shift report</span><span>{note.length.toLocaleString()} / 4,000</span></div>
     {error&&<p className="staff-note-error" role="alert">{error}</p>}
     {message&&<p className="staff-note-saved" role="status"><Check size={14}/>{message}</p>}
    </div>

    <footer className="staff-note-modal-footer">
     <button type="button" className="staff-note-cancel" onClick={attemptClose} disabled={busy}>Close</button>
     <button type="button" className="staff-note-save" onClick={()=>void save()} disabled={busy||!dirty}>
      <Check size={16}/>{busy?'Saving…':dirty?'Save shift note':'Saved'}
     </button>
    </footer>
   </section>
  </div>}
 </div>
}
