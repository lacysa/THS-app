'use client'

import { useEffect, useRef, useState } from 'react'

export default function BookingMenuNote({
  bookingId,
  initialNote=''
}:{
  bookingId:string
  initialNote?:string
}) {
  const [note,setNote] = useState(initialNote)
  const [state,setState] = useState<'idle'|'saving'|'saved'|'error'>('idle')
  const first = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null)

  useEffect(()=>{
    if (first.current) {
      first.current = false
      return
    }
    if (timer.current) clearTimeout(timer.current)
    setState('saving')
    timer.current = setTimeout(async()=>{
      try {
        const r = await fetch('/api/staff/menu-note',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({bookingId,note})
        })
        if (!r.ok) throw new Error()
        setState('saved')
      } catch {
        setState('error')
      }
    },650)
    return ()=>{ if(timer.current) clearTimeout(timer.current) }
  },[note,bookingId])

  return (
    <div className="menu-note-editor">
      <div className="menu-note-head">
        <strong>Room / menu note</strong>
        <span className={`menu-note-state ${state}`}>
          {state==='saving'?'Saving…':state==='saved'?'Saved ✓':state==='error'?'Save failed':'Autosaves'}
        </span>
      </div>
      <textarea
        value={note}
        onChange={e=>setNote(e.target.value)}
        placeholder="Add a note for this room/menu…"
      />
    </div>
  )
}
