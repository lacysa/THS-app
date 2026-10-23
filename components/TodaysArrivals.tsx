'use client'
import Link from 'next/link'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {CheckCircle2,ClipboardCheck,RefreshCw} from 'lucide-react'
import {roomCheckStage,isUnreadyCondition} from '@/lib/room-check-queue'

type ArrivalRoom={
 roomId:string;roomName:string;reservationStatus:string;roomCondition:string;
 assignedTo:string;inspected:boolean;issueOpen:boolean;issueNote:string;
 complete:boolean;readyForInspection:boolean;inspectionSubmitted:boolean;
 latestInspection?:{inspectorName:string;submittedAt:string;status:string}|null
}
const hotelToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
export default function TodaysArrivals(){
 const [date,setDate]=useState(hotelToday)
 const [rooms,setRooms]=useState<ArrivalRoom[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const load=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true)
  try{
   const response=await fetch('/api/room-checks?date='+encodeURIComponent(date),{cache:'no-store'})
   const result=await response.json().catch(()=>({}))
   if(!response.ok)throw new Error(result.error||'Unable to load arrival checks.')
   setRooms(Array.isArray(result.rooms)?result.rooms:[])
   setError('')
  }catch(e:any){setError(String(e?.message||'Unable to load arrival checks.'))}
  finally{if(!silent)setLoading(false)}
 },[date])
 useEffect(()=>{
  void load()
  const refresh=()=>{if(document.visibilityState==='visible')void load(true)}
  window.addEventListener('ths:live-data-refresh',refresh)
  window.addEventListener('focus',refresh)
  const id=window.setInterval(refresh,15000)
  return()=>{window.removeEventListener('ths:live-data-refresh',refresh);window.removeEventListener('focus',refresh);window.clearInterval(id)}
 },[load])
 const arrivals=useMemo(()=>rooms.filter(r=>String(r.reservationStatus).trim().toLowerCase()==='arrival').sort((a,b)=>a.roomName.localeCompare(b.roomName)),[rooms])
 const passed=arrivals.filter(r=>roomCheckStage({...r,checkIssueOpen:r.issueOpen,readyForInspection:r.inspectionSubmitted})==='passed').length
 return <section className="tha-wrap">
  <header className="tha-hero">
   <div><small>THE HOTEL SAUGATUCK · HOUSEKEEPING</small><h1>Today's Arrivals</h1><p>Final walkthroughs for previously cleaned arrival rooms. No checkout or new full clean required.</p></div>
   <div className="tha-date"><input type="date" aria-label="Arrival date" value={date} onChange={e=>setDate(e.target.value)}/><button type="button" aria-label="Refresh arrivals" onClick={()=>void load()}><RefreshCw size={18}/></button></div>
  </header>
  <div className="tha-summary"><strong>{passed} of {arrivals.length}</strong> arrival checks passed</div>
  {error&&<p role="alert" className="tha-error">{error}</p>}
  {loading?<p className="tha-empty">Loading arrival rooms…</p>:arrivals.length===0?<p className="tha-empty">No arrival rooms require a walkthrough for this date.</p>:
   <div className="tha-grid">{arrivals.map(room=>{
    const stage=roomCheckStage({...room,checkIssueOpen:room.issueOpen,readyForInspection:room.inspectionSubmitted})
    const complete=stage==='passed'
    const waiting=stage==='waiting'||isUnreadyCondition(room.roomCondition)
    const correcting=stage==='correction'
    const status=complete?'Passed':correcting?'Needs correction':waiting?'Not ready':'Walkthrough due'
    const href='/room-checks?date='+encodeURIComponent(date)+'&inspectionRoom='+encodeURIComponent(room.roomId)
    return <article key={room.roomId} className={'tha-card '+(complete?'passed':correcting?'correction':waiting?'waiting':'due')}>
     <div className="tha-head"><div><small>ARRIVAL · FINAL CHECK</small><h2>{room.roomName}</h2></div><span className="tha-pill">{status}</span></div>
     <p className="tha-detail">Room condition: <strong>{room.roomCondition||'Not recorded'}</strong></p>
     {room.assignedTo?.trim()&&<p className="tha-detail">Last assigned: <strong>{room.assignedTo}</strong></p>}
     {room.issueOpen&&room.issueNote&&<p className="tha-detail">Correction: {room.issueNote}</p>}
     {complete&&<p className="tha-verified"><CheckCircle2 size={16}/> Inspection passed{room.latestInspection?.inspectorName?' · '+room.latestInspection.inspectorName:''}</p>}
     {!complete&&<p className="tha-detail">{correcting?'Correction must be completed before reinspection.':waiting?'Room needs cleaning or a manager condition update before final inspection.':'Previously cleaned room: complete the final arrival inspection.'}</p>}
     <Link href={href} className="tha-action"><ClipboardCheck size={17}/>{complete?'View inspection':correcting?'Review correction':waiting?'View room inspection':'Final walkthrough'}</Link>
    </article>
   })}</div>}
  <style jsx>{`
   .tha-wrap{max-width:1100px;margin:auto;padding:20px 18px 65px;color:#263b47}
   .tha-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:24px;border-radius:20px;background:linear-gradient(115deg,#e2f5f4,#edf3fd,#e9e1fb)}
   .tha-hero small,.tha-head small{letter-spacing:.09em;color:#648090;font-weight:800;font-size:11px}.tha-hero h1{font-size:clamp(25px,4vw,34px);margin:7px 0}.tha-hero p{color:#607986;margin:0;max-width:560px}
   .tha-date{display:flex;gap:8px}.tha-date input,.tha-date button{padding:12px;border:1px solid #d4dfe5;border-radius:12px;background:white;color:#263b47}
   .tha-summary{padding:20px 4px;font-size:15px}.tha-summary strong{font-size:23px}
   .tha-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px}
   .tha-card{padding:20px;border-radius:18px;border:1px solid #dce5e9;background:white}
   .tha-card.passed{background:#e0f3e8;border-color:#b7dbc7}.tha-card.correction{background:#fff0dc;border-color:#e9b77d}.tha-card.waiting{background:#f3f5f8}.tha-card.due{background:#fffdf5;border-color:#e8dab2}
   .tha-head{display:flex;justify-content:space-between;gap:9px;align-items:center;flex-wrap:wrap}.tha-head h2{margin:7px 0;font-size:22px}.tha-pill{border-radius:24px;padding:7px 11px;font-size:12px;font-weight:750;background:#e6eff5;color:#31586d}
   .tha-card.passed .tha-pill{background:#c9e8d5;color:#206048}.tha-card.correction .tha-pill{background:#f7d2a9;color:#874514}
   .tha-detail{font-size:14px;color:#607684}.tha-verified{display:flex;align-items:center;gap:6px;color:#206048;font-size:13px;font-weight:750}
   .tha-error,.tha-empty{padding:16px;background:#e5f1fa;border-radius:12px}.tha-error{background:#fbe8eb;color:#972c4c}
   @media(max-width:650px){.tha-wrap{padding:12px 10px 45px}.tha-hero{padding:18px}.tha-grid{grid-template-columns:1fr}}
  `}</style>
  <style jsx global>{`.tha-action{margin-top:16px;display:flex;justify-content:center;align-items:center;gap:8px;background:#344f69;color:white;min-height:48px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:750;padding:12px}`}</style>
 </section>
}
