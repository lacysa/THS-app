'use client'

import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {AlertTriangle,Check,ChevronDown,ChevronLeft,ChevronRight,ClipboardCheck,RefreshCw,ShieldCheck,X} from 'lucide-react'

type Correction={id:string;type:string;note:string;at:string}
type InspectionRoom={
  roomId:string
  roomName:string
  sortOrder:number
  reservationStatus:string
  serviceType:string
  roomCondition:string
  roomNotes:string
  assignedTo:string
  housekeeperName?:string|null
  complete:boolean
  readyForInspection:boolean
  inspectionSubmitted:boolean
  issueOpen:boolean
  issueNote:string
  inspected:boolean
  correctionHistory:Correction[]
  latestInspection?:{stage:string;status:string;submittedAt:string;inspectorName:string}|null
}
type QueueFilter='queue'|'corrections'|'passed'

function lower(value:unknown){return String(value||'').trim().toLowerCase()}
function cleanService(room:InspectionRoom){return /^OUT(?:-[A-Z]{2,4})?$/i.test(room.serviceType.trim())}
function isRecheck(room:InspectionRoom){
  return room.issueOpen&&room.complete&&room.inspectionSubmitted&&!room.inspected
}
function requiresInspection(room:InspectionRoom){
  if(room.inspected||room.issueOpen)return false
  const status=lower(room.reservationStatus)
  const condition=lower(room.roomCondition)
  if(['checkout','out/in'].includes(status)){
    return cleanService(room)&&room.complete&&room.inspectionSubmitted
  }
  // Arrival-only rooms can receive a normal readiness check even without a
  // full clean, but an unknown or physically dirty room is not inspectable.
  if(status==='arrival'&&!cleanService(room)){
    return room.inspectionSubmitted ||
      ['ready','room ready','vacant (clean)','ready for room check','ready for guest'].includes(condition)
  }
  // A vacant day is not automatically an inspection task. It must have been
  // explicitly submitted for a room check.
  return room.complete&&room.inspectionSubmitted
}
function formatTime(value:string|undefined|null){
  if(!value)return ''
  const parsed=new Date(value)
  if(Number.isNaN(parsed.getTime()))return ''
  return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Detroit'}).format(parsed)
}
function taskName(room:InspectionRoom){
  const status=room.reservationStatus.trim()
  if(room.issueOpen)return 'Recheck'
  if(status.toLowerCase()==='arrival')return 'Arrival'
  return status||'Room inspection'
}

export default function HousekeepingInspectionMode({date,onDateChange}:{date:string;onDateChange:(date:string)=>void}){
  const [rooms,setRooms]=useState<InspectionRoom[]>([])
  const [selectedId,setSelectedId]=useState('')
  const [filter,setFilter]=useState<QueueFilter>('queue')
  const [note,setNote]=useState('')
  const [showCorrectionForm,setShowCorrectionForm]=useState(false)
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [feedback,setFeedback]=useState('')
  const requestId=useRef(0)
  const busyRef=useRef(false)
  const mountedRef=useRef(true)

  const load=useCallback(async(silent=false)=>{
    const id=++requestId.current
    if(!silent)setLoading(true)
    try{
      const response=await fetch('/api/room-checks?date='+encodeURIComponent(date),{cache:'no-store'})
      const body=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(body.error||'Unable to load inspections.')
      if(id!==requestId.current||!mountedRef.current)return
      setRooms(Array.isArray(body.rooms)?body.rooms:[])
      setError('')
    }catch(err:any){
      if(id===requestId.current&&mountedRef.current)setError(err?.message||'Unable to load inspections.')
    }finally{
      if(id===requestId.current&&mountedRef.current)setLoading(false)
    }
  },[date])

  useEffect(()=>{
    mountedRef.current=true
    setRooms([])
    setSelectedId('')
    setFeedback('')
    setNote('')
    setShowCorrectionForm(false)
    void load()
    const onRefresh=()=>{if(!busyRef.current&&document.visibilityState==='visible')void load(true)}
    window.addEventListener('ths:live-data-refresh',onRefresh)
    window.addEventListener('focus',onRefresh)
    const interval=window.setInterval(onRefresh,15000)
    return()=>{
      mountedRef.current=false
      requestId.current++
      window.removeEventListener('ths:live-data-refresh',onRefresh)
      window.removeEventListener('focus',onRefresh)
      window.clearInterval(interval)
    }
  },[load])

  const ordered=useMemo(()=>[...rooms].sort((a,b)=>a.sortOrder-b.sortOrder||a.roomName.localeCompare(b.roomName)),[rooms])
  const rechecks=ordered.filter(isRecheck)
  const ready=ordered.filter(requiresInspection)
  const awaiting=ordered.filter(room=>room.issueOpen&&!isRecheck(room))
  const passed=ordered.filter(room=>room.inspected&&!room.issueOpen)
  const queue=[...rechecks,...ready]
  const shown=filter==='queue'?queue:filter==='corrections'?awaiting:passed
  const current=shown.find(room=>room.roomId===selectedId)||shown[0]
  const currentIndex=current?shown.findIndex(room=>room.roomId===current.roomId):-1

  useEffect(()=>{
    setNote('')
    setShowCorrectionForm(false)
  },[current?.roomId,filter,date])

  async function decide(room:InspectionRoom,decision:'pass'|'fail'){
    if(busyRef.current)return
    if(decision==='fail'&&!note.trim()){
      setError('Please describe what needs correcting before returning the room.')
      setShowCorrectionForm(true)
      return
    }
    busyRef.current=true
    setSaving(true)
    setError('')
    setFeedback('')
    try{
      const response=await fetch('/api/room-checks',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({date,roomId:room.roomId,decision,note:decision==='fail'?note.trim():''})
      })
      const body=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(body.error||'Could not save inspection.')
      setFeedback(room.roomName+(decision==='pass'?' passed inspection.':' returned for correction.'))
      setSelectedId('')
      setNote('')
      setShowCorrectionForm(false)
      await load(true)
      window.dispatchEvent(new CustomEvent('ths:live-data-refresh',{detail:{roomId:room.roomId,date}}))
    }catch(err:any){
      setError(err?.message||'Could not save inspection.')
    }finally{
      busyRef.current=false
      if(mountedRef.current)setSaving(false)
    }
  }

  return <section className="hki-workspace" aria-label="Inspection mode">
    <header className="hki-header">
      <div className="hki-header-copy">
        <span className="hki-eyebrow"><ShieldCheck size={16}/> INSPECTION MODE</span>
        <h1>Room Inspections</h1>
        <p>One room at a time. Pass it, or send a specific correction back to housekeeping.</p>
      </div>
      <div className="hki-header-actions">
        <label>Date<input type="date" value={date} onChange={event=>onDateChange(event.target.value)}/></label>
        <button type="button" aria-label="Refresh inspections" title="Refresh inspections" onClick={()=>void load()} disabled={saving}><RefreshCw size={19}/></button>
      </div>
    </header>

    <div className="hki-stats" aria-label="Inspection progress">
      <div><strong>{ready.length}</strong><span>Ready</span></div>
      <div><strong>{rechecks.length}</strong><span>Rechecks</span></div>
      <div><strong>{passed.length}</strong><span>Passed</span></div>
    </div>

    <div className="hki-queue-tools">
      <label className="hki-filter">Show
        <span className="hki-select-shell">
          <select value={filter} onChange={e=>{setFilter(e.target.value as QueueFilter);setSelectedId('');setError('');setFeedback('')}} aria-label="Inspection list">
            <option value="queue">To inspect ({queue.length})</option>
            <option value="corrections">Awaiting corrections ({awaiting.length})</option>
            <option value="passed">Passed today ({passed.length})</option>
          </select><ChevronDown size={16}/>
        </span>
      </label>
      {filter==='queue'&&queue.length>0&&<span className="hki-position">Room {currentIndex+1} of {queue.length}</span>}
    </div>

    {error&&<p className="hki-notice error" role="alert"><AlertTriangle size={17}/>{error}</p>}
    {feedback&&<p className="hki-notice success" role="status"><Check size={17}/>{feedback}</p>}
    {loading?<div className="hki-empty">Loading today's inspection queue…</div>:
     !current?<div className="hki-empty">
       <ClipboardCheck size={29}/>
       <strong>{filter==='queue'?'No rooms waiting for inspection':filter==='corrections'?'No corrections waiting on housekeeping':'No completed inspections yet'}</strong>
       <span>{filter==='queue'?'New submissions and completed corrections appear here automatically.':filter==='corrections'?'Rooms returned for correction will appear here.':'Passed inspections for this date will be listed here.'}</span>
       {filter!=='queue'&&<button type="button" onClick={()=>setFilter('queue')}>Back to inspection queue</button>}
     </div>:
     <article className="hki-room-card" key={current.roomId}>
       <div className="hki-room-top">
         <div>
           <span className="hki-room-eyebrow">{filter==='queue'?(isRecheck(current)?'REINSPECTION':'READY FOR INSPECTION'):filter==='corrections'?'AWAITING HOUSEKEEPING':'INSPECTION COMPLETE'}</span>
           <h2>{current.roomName}</h2>
         </div>
         <span className={'hki-type'+(isRecheck(current)?' recheck':'')}>{taskName(current)}</span>
       </div>
       <div className="hki-room-facts">
         <div><span>Housekeeper</span><strong>{current.assignedTo?.trim()||current.housekeeperName||'Unassigned'}</strong></div>
         <div><span>Room condition</span><strong>{current.roomCondition||'Not recorded'}</strong></div>
       </div>
       {current.roomNotes?.trim()&&<div className="hki-room-note"><strong>Room note</strong><p>{current.roomNotes.trim()}</p></div>}
       {isRecheck(current)&&<div className="hki-room-note correction"><strong>Previous correction</strong><p>{current.issueNote||current.correctionHistory?.find(event=>event.type==='found')?.note||'Review the correction history.'}</p></div>}
       {filter==='queue'&&<>
         <div className="hki-decision">
           <button type="button" className="hki-pass" disabled={saving} onClick={()=>void decide(current,'pass')}><Check size={21}/>{saving?'Saving…':'Pass inspection'}</button>
           <button type="button" className="hki-fail" disabled={saving} aria-expanded={showCorrectionForm} onClick={()=>{setShowCorrectionForm(value=>!value);setError('')}}><X size={20}/>Needs correction</button>
         </div>
         {showCorrectionForm&&<div className="hki-correction-form">
           <label>What needs to be corrected?
             <textarea rows={3} value={note} onChange={event=>setNote(event.target.value)} placeholder="Describe the issue clearly for the assigned housekeeper…" autoFocus/>
           </label>
           <div className="hki-correction-actions">
             <button type="button" className="hki-cancel" disabled={saving} onClick={()=>{setShowCorrectionForm(false);setNote('');setError('')}}>Cancel</button>
             <button type="button" className="hki-return" disabled={saving||!note.trim()} onClick={()=>void decide(current,'fail')}>{saving?'Saving…':'Send correction to housekeeping'}</button>
           </div>
         </div>}
       </>}
       {filter==='corrections'&&<div className="hki-waiting"><AlertTriangle size={18}/><span>Awaiting the housekeeper's correction and resubmission. This room will return to the inspection queue automatically.</span></div>}
       {filter==='passed'&&<div className="hki-done"><Check size={20}/>Inspection passed{current.latestInspection?.submittedAt?' · '+formatTime(current.latestInspection.submittedAt):''}</div>}
       {(current.latestInspection||current.correctionHistory?.length>0)&&<details className="hki-history">
         <summary>Inspection history <ChevronDown size={15}/></summary>
         {current.latestInspection&&<p>Last {current.latestInspection.stage==='recheck'?'recheck':'inspection'}: {current.latestInspection.status} · {current.latestInspection.inspectorName} · {formatTime(current.latestInspection.submittedAt)}</p>}
         {current.correctionHistory?.slice(0,12).map(event=><p key={event.id}><strong>{event.type==='fixed'?'Correction fixed':'Issue reported'}:</strong> {event.note} <small>{formatTime(event.at)}</small></p>)}
       </details>}
     </article>}

    {shown.length>1&&<div className="hki-nav">
      <button type="button" disabled={currentIndex<=0||saving} onClick={()=>setSelectedId(shown[currentIndex-1].roomId)}><ChevronLeft size={16}/>Previous</button>
      <label><span>Jump to room</span><select aria-label="Choose inspection room" value={current?.roomId||''} onChange={e=>setSelectedId(e.target.value)} disabled={saving}>
        {shown.map((room)=><option key={room.roomId} value={room.roomId}>{room.roomName}{isRecheck(room)?' · Recheck':''}</option>)}
      </select></label>
      <button type="button" disabled={currentIndex>=shown.length-1||saving} onClick={()=>setSelectedId(shown[currentIndex+1].roomId)}>Next<ChevronRight size={16}/></button>
    </div>}
    {filter==='queue'&&awaiting.length>0&&<button className="hki-awaiting-link" type="button" onClick={()=>{setFilter('corrections');setSelectedId('')}}>{awaiting.length} room{awaiting.length===1?'':'s'} still awaiting correction <ChevronRight size={15}/></button>}
  </section>
}
