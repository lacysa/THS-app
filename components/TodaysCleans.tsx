'use client'
import Link from 'next/link'
import { useCallback,useEffect,useMemo,useState } from 'react'
import { CheckCircle2, LockKeyhole, RefreshCw } from 'lucide-react'
type Room={roomId:string;roomName:string;assignedTo:string;cleanOrder:number|null;complete:boolean;readyForInspection:boolean;inspected:boolean;reservationStatus:string;serviceType:string;roomCondition:string;checkIssueOpen:boolean;notes?:string}
const currentDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const isWaiting=(r:Room)=>['checkout','out/in'].includes((r.reservationStatus||'').toLowerCase())&&!/^out\b/i.test(r.serviceType||'')
const inspectionHref=(roomId:string,date:string)=>'/housekeeping?view=inspections&date='+encodeURIComponent(date)+'&inspectionRoom='+encodeURIComponent(roomId)
export default function TodaysCleans({mode='cleans'}:{mode?:'cleans'|'refreshes'}){
 const [date,setDate]=useState(currentDate)
 const [rows,setRows]=useState<Room[]>([])
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState('')
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 const [staffName,setStaffName]=useState('')
 const [manager,setManager]=useState(false)
 const load=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true);setError('')
  try{
   const [response,me]=await Promise.all([fetch('/api/housekeeping/day?scope=mine&date='+encodeURIComponent(date),{cache:'no-store'}),fetch('/api/me',{cache:'no-store'})])
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load your rooms.')
   setRows(data.rows||[])
   const self=await me.json().catch(()=>({}))
   setStaffName(String(self.access?.name||self.access?.preferredName||''))
   setManager(Boolean(self.access?.isAdmin || (self.access?.capabilities||[]).some((c:string)=>['manager','general_manager','operations_manager','owner'].includes(c))))
  }catch(e:any){setError(e.message||'Unable to load your rooms.')}finally{if(!silent)setLoading(false)}
 },[date])
 useEffect(()=>{
  void load()
  const onRefresh=()=>{if(document.visibilityState==='visible')void load(true)}
  window.addEventListener('ths:live-data-refresh',onRefresh)
  window.addEventListener('focus',onRefresh)
  const interval=window.setInterval(onRefresh,15000)
  return ()=>{window.removeEventListener('ths:live-data-refresh',onRefresh);window.removeEventListener('focus',onRefresh);window.clearInterval(interval)}
 },[load])
 const available=useMemo(()=>mode==='refreshes'?rows.filter(r=>r.reservationStatus.trim().toLowerCase()==='stayover'&&!r.assignedTo.trim()&&['','RF','REFRESH'].includes(r.serviceType.trim().toUpperCase())):[],[rows,mode])
 const mine=useMemo(()=>rows.filter(r=>{const refresh=r.reservationStatus.trim().toLowerCase()==='stayover' && /^(RF|REFRESH)$/i.test((r.serviceType||'').trim());if(mode==='refreshes'&&!refresh)return false;if(mode==='cleans'&&r.reservationStatus.trim().toLowerCase()==='stayover')return false;const assigned=(r.assignedTo||'').split(',').map(n=>n.trim().toLowerCase()).filter(Boolean);const full=staffName.trim().toLowerCase();return assigned.length>0 && (manager || Boolean(full&&assigned.some(n=>n===full||n===full.split(' ')[0])))}),[rows,staffName,mode,manager])
 const ordered=useMemo(()=>mine.slice().sort((a,b)=>(a.cleanOrder??999)-(b.cleanOrder??999)||a.roomName.localeCompare(b.roomName)),[mine])
 const pending=ordered.filter(r=>!r.complete)
 const nextOrdered=pending.filter(r=>!manager&&r.cleanOrder!=null).sort((a,b)=>(a.cleanOrder??999)-(b.cleanOrder??999))[0]
 const locked=(r:Room)=>!manager&&mode==='cleans'&&!!nextOrdered&&r.cleanOrder!=null&&r.cleanOrder> (nextOrdered.cleanOrder??0) 
 async function claim(room:Room){
  setBusy(room.roomId);setMessage('');setError('')
  try{
   const response=await fetch('/api/housekeeping/claim-refresh',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serviceDate:date,roomId:room.roomId})})
   const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Unable to claim refresh.')
   setMessage(room.roomName+' · RF requested and assigned to you.');await load()
  }catch(e:any){setError(e.message||'Unable to claim refresh.');await load()}finally{setBusy('')}
 }
 async function begin(room:Room){
  setBusy(room.roomId);setMessage('');setError('')
  try{
   const response=await fetch('/api/housekeeping/day',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({serviceDate:date,roomId:room.roomId,patch:{roomCondition:'Cleaning'}})})
   const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Could not start cleaning.')
   setMessage(room.roomName+' · cleaning started.');await load()
  }catch(e:any){setError(e.message||'Unable to start cleaning.')}finally{setBusy('')}
 }
 async function finish(room:Room){
  setBusy(room.roomId);setMessage('');setError('')
  try{
   const response=await fetch('/api/housekeeping/day',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({serviceDate:date,roomId:room.roomId,patch:{complete:true}})})
   const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Could not finish the room.')
   setMessage(room.roomName+(mode==='refreshes'?' refresh completed.':' sent for inspection.'));await load()
  }catch(e:any){setError(e.message||'Unable to save the room.')}finally{setBusy('')}
 }
 return <div className="ths-cleans">
  <header className="ths-cleans-hero"><div><small>THE HOTEL SAUGATUCK · HOUSEKEEPING</small><h1>{mode==='refreshes'?"Today's Refreshes":"Today's Cleans"}</h1><p>{mode==='refreshes'?'Assigned stayover refreshes, separate from full room cleans.':'Assigned full cleans, in cleaning order.'}</p></div><div className="ths-cleans-actions"><input aria-label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)}/><button onClick={()=>void load()} title="Refresh" aria-label="Refresh rooms"><RefreshCw size={17}/></button></div></header>
  <div className="ths-cleans-summary"><strong>{ordered.filter(r=>r.complete).length} of {ordered.length}</strong> {mode==='refreshes'?' refreshes finished':' rooms finished'}</div>
  {message&&<p role="status" className="ths-cleans-message">{message}</p>}{error&&<p role="alert" className="ths-cleans-error">{error}</p>}
  {mode==='refreshes'&&!loading&&<section aria-label="Available stayover refreshes" style={{marginBottom:20}}><h2 style={{fontSize:18,margin:'8px 0 12px'}}>Available stayovers</h2>{available.length===0?<p className="ths-cleans-empty">No unassigned stayovers available to claim.</p>:<div className="ths-refresh-claim-list">{available.map(room=><div key={room.roomId} className="ths-refresh-claim-row"><strong>{room.roomName}</strong><button type="button" disabled={Boolean(busy)} onClick={()=>void claim(room)}>{busy===room.roomId?'Claiming…':'Start RF'}</button></div>)}</div>}</section>}
  {loading?<p>Loading assignments…</p>:ordered.length===0?<div className="ths-cleans-empty">{mode==='refreshes'?'No stayover refreshes assigned for this date.':'No full room cleans assigned for this date.'} If you expect rooms, ask management to check the day's assignments.</div>:<div className="ths-cleans-grid">{ordered.map(r=>{
   const waiting=isWaiting(r),orderLocked=locked(r),done=r.complete
   const failed=r.checkIssueOpen,passed=r.inspected&&!failed
   const inProgress=!done&&r.roomCondition.trim().toLowerCase()==='cleaning'
   const cardTone=failed?'inspection-failed':passed||done?'done':inProgress?'in-progress':waiting||orderLocked?'locked':'available'
   return <article className={'ths-clean-card '+cardTone+(manager?' inspection-entry':'')} key={r.roomId}>
    {passed?<div className="ths-inspection-flag passed"><CheckCircle2 size={16}/> Inspection passed</div>:failed?<div className="ths-inspection-flag failed">Inspection failed · correction required</div>:null}
    <div className="ths-clean-head"><div><small>{mode==='refreshes'?'STAYOVER REFRESH':r.cleanOrder!=null?'CLEAN '+r.cleanOrder:'ROOM ASSIGNMENT'}</small><h2>{manager?<Link className="ths-inspection-link" href={inspectionHref(r.roomId,date)} aria-label={'Open '+r.roomName+' in Inspections'}>{r.roomName} <span aria-hidden="true">↗</span></Link>:r.roomName}</h2></div>{passed?<span className="ths-clean-ready passed">Passed</span>:failed?<span className="ths-clean-ready failed">Needs correction</span>:done?<span className="ths-clean-ready finished">Finished</span>:inProgress?<span className="ths-clean-ready in-progress">In progress</span>:waiting||orderLocked?<LockKeyhole size={22}/>:<span className="ths-clean-ready">Ready</span>}</div>
    {manager&&<p className="ths-clean-detail"><strong>Assigned: {r.assignedTo}</strong></p>}
    <p className="ths-clean-detail">{r.reservationStatus} {r.serviceType?'· '+r.serviceType:''}</p>
    {r.notes&&<p className="ths-clean-notes">{r.notes}</p>}
    <p className="ths-clean-status">{failed?(done?'Correction submitted · awaiting reinspection':'Inspection failed · correction needed'):passed?'Inspection passed':done?(mode==='refreshes'?'Refresh complete':'Finished · sent for inspection'):waiting?'Waiting for guest OUT and room strip':orderLocked?'Finish your earlier numbered room first':inProgress?'Cleaning in progress':'Ready to clean'}</p>
    {!done&&!waiting&&!orderLocked&&<button type="button" disabled={busy===r.roomId} onClick={()=>void (inProgress||r.reservationStatus.toLowerCase()==='stayover'?finish(r):begin(r))}>{busy===r.roomId?'Saving…':mode==='refreshes'?'Mark refresh complete':inProgress?'Finished · Send for inspection':'Begin cleaning'}</button>}
   </article>
  })}</div>}
  <style jsx>{`
   .ths-refresh-claim-list{display:grid;gap:9px}.ths-refresh-claim-row{display:flex;align-items:center;justify-content:space-between;gap:15px;background:#fff;border:1px solid #dce5e9;border-radius:12px;padding:12px 15px}.ths-refresh-claim-row button{background:#34566a;color:white;border:0;border-radius:9px;padding:10px 16px;font-weight:700;cursor:pointer;white-space:nowrap}.ths-refresh-claim-row button:disabled{opacity:.55}
   .ths-cleans{max-width:1100px;margin:auto;padding:20px 18px 64px;color:#263b47}
   .ths-cleans-hero{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;padding:24px;border-radius:20px;background:linear-gradient(115deg,#e2f5f4,#edf3fd,#e9e1fb)}
   .ths-cleans-hero small,.ths-clean-head small{letter-spacing:.1em;font-size:11px;font-weight:800;color:#67818e}.ths-cleans-hero h1{font-size:clamp(25px,4vw,34px);margin:7px 0}.ths-cleans-hero p{margin:0;color:#66808b}.ths-cleans-actions{display:flex;gap:8px}.ths-cleans-actions input,.ths-cleans-actions button{background:white;border:1px solid #d4dfe5;border-radius:12px;padding:12px;color:#263b47}
   .ths-cleans-summary{padding:20px 4px;font-size:15px}.ths-cleans-summary strong{font-size:23px}.ths-cleans-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px}.ths-clean-card{background:white;border:1px solid #dde6e9;border-radius:18px;padding:20px;box-shadow:0 5px 20px #142a3d08}.ths-clean-card.done{background:#e0f3e8;border-color:#b7dbc7}.ths-clean-card.in-progress{background:#fff5d5;border-color:#e8d596}.ths-clean-card.inspection-failed{background:#fff0dc;border-color:#e9b77d}.ths-clean-card.locked{background:#f4f5f8}.ths-clean-head{display:flex;justify-content:space-between;align-items:center}.ths-clean-head h2{font-size:22px;margin:7px 0}.ths-clean-detail,.ths-clean-status{font-size:14px;color:#607684}.ths-clean-ready{background:#dbefe5;border-radius:20px;padding:7px 12px;color:#226650;font-weight:700;white-space:nowrap;font-size:13px}.ths-clean-ready.in-progress{background:#f6e3a4;color:#735510}.ths-clean-ready.finished,.ths-clean-ready.passed{background:#c9e8d5;color:#206048}.ths-clean-ready.failed{background:#f7d2a9;color:#874514}.ths-inspection-flag{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;letter-spacing:.02em;margin:0 0 13px}.ths-inspection-flag.passed{color:#206048}.ths-inspection-flag.failed{color:#874514}.ths-clean-notes{padding:12px;background:#f2f6fb;border-radius:10px;font-size:14px}.ths-clean-card.inspection-entry{position:relative;cursor:pointer}.ths-clean-card.inspection-entry:hover{border-color:#91b6c6;box-shadow:0 7px 24px #142a3d18}.ths-inspection-link{color:inherit;text-decoration:none}.ths-inspection-link span{font-size:.72em;color:#66808b}.ths-inspection-link::after{content:'';position:absolute;inset:0;border-radius:18px}.ths-clean-card.inspection-entry:focus-within{outline:2px solid #567a99;outline-offset:3px}.ths-clean-card.inspection-entry button{position:relative;z-index:1}.ths-clean-card button{width:100%;min-height:48px;border:0;border-radius:12px;color:white;background:#344f69;font-weight:750;cursor:pointer}.ths-clean-card button:disabled{opacity:.5}.ths-cleans-message,.ths-cleans-error,.ths-cleans-empty{padding:14px;border-radius:12px;background:#e5f1fa}.ths-cleans-error{background:#fbe8eb;color:#972c4c}
   @media(max-width:650px){.ths-cleans{padding:12px 10px 45px}.ths-cleans-hero{padding:18px}.ths-cleans-grid{grid-template-columns:1fr}.ths-clean-card{padding:17px}}
  `}</style>
 </div>
}
