'use client'
import { useState } from 'react'
export default function StaffShiftNote(){
 const [open,setOpen]=useState(false),[note,setNote]=useState(''),[date,setDate]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 async function load(){
 setOpen(true);setBusy(true);setMessage('')
 try{const r=await fetch('/api/staff-shift-note',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Could not load note');setNote(d.content||'');setDate(d.date||'')}
 catch(e:any){setMessage(e.message)}finally{setBusy(false)}
 }
 async function save(){
 setBusy(true);setMessage('')
 try{const r=await fetch('/api/staff-shift-note',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({content:note})});const d=await r.json();if(!r.ok)throw Error(d.error||'Could not save');setMessage('Saved to the manager shift report.')}
 catch(e:any){setMessage(e.message)}finally{setBusy(false)}
 }
 return <div style={{marginBottom:12}}>
 <button type="button" onClick={()=>void load()}>My shift note</button>
 {open&&<section role="dialog" aria-label="My shift note" style={{position:'fixed',zIndex:9999,top:'15%',left:'max(10px,calc(50% - 250px))',width:'min(90%,500px)',boxSizing:'border-box',padding:20,borderRadius:12,background:'white',boxShadow:'0 10px 60px #777',color:'#203040'}}>
 <button type="button" onClick={()=>setOpen(false)} style={{float:'right'}}>Close</button>
 <h2>My shift note</h2><p>{date} — Record anything management should know.</p>
 <textarea aria-label="Shift note" value={note} rows={7} maxLength={4000} disabled={busy} onChange={e=>setNote(e.target.value)} style={{width:'100%',boxSizing:'border-box'}}/>
 <p role="status">{message}</p><button type="button" disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save note'}</button>
 </section>}
 </div>
}