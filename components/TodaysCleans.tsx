'use client'
import Link from 'next/link'
import { useCallback,useEffect,useMemo,useState } from 'react'
import { CheckCircle2, LockKeyhole, RefreshCw } from 'lucide-react'
type Room={roomId:string;roomName:string;assignedTo:string;cleanOrder:number|null;complete:boolean;readyForInspection:boolean;inspected:boolean;reservationStatus:string;serviceType:string;roomCondition:string;checkIssueOpen:boolean;notes?:string;correctionHistory?:{id:string;type:string;note:string;at:string}[];stripStatus?:string;stripHold?:string;hasDailyRecord?:boolean;tubCleanDue?:boolean;tubAssignedTo?:string}
type StaffOption={id:string;name:string;roleLabel:string;onSite:boolean}
const needsFullClean=(r:Room)=>{
 const status=(r.reservationStatus||'').trim().toLowerCase()
 const condition=(r.roomCondition||'').trim().toLowerCase()
 const service=(r.serviceType||'').trim().toUpperCase()
 if(r.complete||r.inspected||r.readyForInspection||r.tubCleanDue&&['vacant (clean)','ready','ready for room check','ready'].includes(condition))return false
 if(['vacant (clean)','ready','ready for guest','ready for room check','room ready'].includes(condition))return false
 if(status==='blocked'||(r.stripHold||'').toLowerCase().includes('hold')||condition==='blocked'||status==='stayover')return false
 if(['checkout','out/in','dirty'].includes(status)||/^OUT(?:-[A-Z]{2,4})?$/.test(service))return /dirty|cleaning/.test(condition)||(!r.complete&&!r.inspected&&status==='out/in')
 if(['vacant','arrival'].includes(status)&&/dirty|cleaning/.test(condition))return true
 return status==='vacant'&&!r.complete&&!['vacant (clean)','ready','ready for guest','ready for room check'].includes(condition)
}
const currentDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const isWaiting=(r:Room)=>['checkout','out/in'].includes((r.reservationStatus||'').toLowerCase())&&!/^out\b/i.test(r.serviceType||'')
// The badge communicates the room's guest/occupancy status, not whether a
// housekeeper is allowed to begin work. Workflow status is shown separately.
function guestStatusLabel(room:Room){
 const status=String(room.reservationStatus||'').trim().toLowerCase()
 const service=String(room.serviceType||'').trim().toUpperCase()
 if(status==='checkout'||status==='out/in')return /^OUT\b/.test(service)?'OUT':'Awaiting OUT'
 if(status==='vacant')return 'Vacant'
 if(status==='arrival')return 'Arrival'
 if(status==='stayover')return 'Occupied'
 if(status==='blocked')return 'Blocked'
 return room.reservationStatus?.trim()||'Not recorded'
}
const inspectionHref=(roomId:string,date:string)=>'/housekeeping?view=inspections&date='+encodeURIComponent(date)+'&inspectionRoom='+encodeURIComponent(roomId)
export default function TodaysCleans({mode='cleans',initialDate,initialRoomId}:{mode?:'cleans'|'refreshes';initialDate?:string;initialRoomId?:string}){
 const [date,setDate]=useState(initialDate||currentDate)
 const [rows,setRows]=useState<Room[]>([])
 const [staffOptions,setStaffOptions]=useState<StaffOption[]>([])
 const [readOnly,setReadOnly]=useState(false)
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState('')
 const [startedTasks,setStartedTasks]=useState<Record<string,boolean>>({})
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 const [staffName,setStaffName]=useState('')
 const [blankets,setBlankets]=useState<Record<string,{changedAt:string;changedBy:string}>>({})
 const [manager,setManager]=useState(false)
 const [hospitalityAssistant,setHospitalityAssistant]=useState(false)
 const [cleansView,setCleansView]=useState<'team'|'mine'>('team')
 const load=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true);setError('')
  try{
   const me=await fetch('/api/me',{cache:'no-store'})
   const self=await me.json().catch(()=>({}))
   const caps:string[]=self.access?.capabilities||[]
   const canSeeTeam=Boolean(self.access?.isAdmin||caps.some(c=>['manager','general_manager','operations_manager','owner','hospitality_assistant'].includes(c)))
   const response=await fetch('/api/housekeeping/day?'+(canSeeTeam?'':'scope=mine&')+'date='+encodeURIComponent(date),{cache:'no-store'})
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load your rooms.')
   setRows(data.rows||[])
   if(mode==='cleans'){const br=await fetch('/api/housekeeping/blankets?date='+encodeURIComponent(date),{cache:'no-store'});if(br.ok){const bd=await br.json();setBlankets(bd.rooms||{})}}
   setStaffOptions(data.staffOptions||[])
   setReadOnly(Boolean(self.access?.isPreviewMode))
   setHospitalityAssistant(caps.includes('hospitality_assistant'))
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
 const ownRoom=(r:Room)=>{const names=String(r.assignedTo||'').split(',').map(n=>n.trim().toLowerCase());const name=staffName.trim().toLowerCase();return Boolean(name&&names.some(n=>n===name||n===name.split(' ')[0]))}
 const teamDisplay=mode==='cleans'&&manager&&cleansView==='team'
 const mine=useMemo(()=>rows.filter(r=>{
  const status=(r.reservationStatus||'').trim().toLowerCase()
  const refresh=status==='stayover' && /^(RF|REFRESH)$/i.test((r.serviceType||'').trim())
  if(mode==='refreshes'){if(!refresh)return false}
  else if(!needsFullClean(r)||r.stripStatus==='needed')return false
  const assigned=(r.assignedTo||'').split(',').map(n=>n.trim().toLowerCase()).filter(Boolean)
  const full=staffName.trim().toLowerCase()
  const team=manager&&cleansView==='team'
  return team||Boolean(full&&assigned.some(n=>n===full||n===full.split(' ')[0]))
 }),[rows,staffName,mode,manager,hospitalityAssistant,cleansView])
 const housekeepingStaff=useMemo(()=>staffOptions.filter(p=>/housekeep|runner/i.test(p.roleLabel||'')),[staffOptions])

 const taskRows=useMemo(()=>{
  if(mode!=='cleans')return mine.map(r=>({...r,taskKind:'clean' as const}))
  const showTeam=manager&&cleansView==='team'
  const same=(assigned:string)=>assigned.split(',').some(n=>{const part=n.trim().toLowerCase();const staff=staffName.trim().toLowerCase();return Boolean(part&&staff&&(part===staff||part===staff.split(' ')[0]))})
  const result:Array<Room&{taskKind:'clean'|'strip'|'tub'}>=[]
  for(const r of rows){
   const strip=r.stripStatus==='needed'
   const tub=Boolean(r.tubCleanDue)
   const tubAssigned=String(r.tubAssignedTo||'').trim()
   if(strip&&(showTeam||same(r.assignedTo||'')))result.push({...r,taskKind:'strip'})
   if(tub&&!needsFullClean(r)&&(showTeam?true:Boolean(tubAssigned&&same(tubAssigned))))result.push({...r,taskKind:'tub'})
   if(needsFullClean(r)&&!strip&&(showTeam||same(r.assignedTo||'')))result.push({...r,taskKind:'clean'})
  }
  return result
 },[rows,mine,mode,manager,hospitalityAssistant,cleansView,staffName])
 const ordered=useMemo(()=>taskRows.slice().sort((a,b)=>(a.cleanOrder??999)-(b.cleanOrder??999)||a.roomName.localeCompare(b.roomName)),[taskRows])
 const selectedRoom=initialRoomId?rows.find(row=>row.roomId===initialRoomId):null
 const pending=ordered.filter(r=>r.taskKind!=='clean'||!r.complete)
 const nextOrdered=pending.filter(r=>!manager&&r.cleanOrder!=null).sort((a,b)=>(a.cleanOrder??999)-(b.cleanOrder??999))[0]
 const locked=(r:Room)=>!teamDisplay&&!manager&&mode==='cleans'&&!!nextOrdered&&r.cleanOrder!=null&&r.cleanOrder> (nextOrdered.cleanOrder??0) 
 async function assignRoom(room:Room,name:string){
  setBusy(room.roomId);setError('');setMessage('')
  try{
   const response=await fetch('/api/housekeeping/day',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({serviceDate:date,roomId:room.roomId,patch:{assignedTo:name}})})
   const data=await response.json().catch(()=>({}))
   if(!response.ok)throw new Error(data.error||'Could not assign room.')
   setMessage(room.roomName+(name?' assigned to '+name:' is unassigned.'))
   await load(true)
  }catch(e:any){setError(e.message||'Could not assign room.')}finally{setBusy('')}
 }
 async function markBlanket(room:Room){setBusy(room.roomId);setError('');setMessage('');try{const response=await fetch('/api/housekeeping/blankets',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({date,roomId:room.roomId})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Could not record blanket change.');setMessage(room.roomName+' · weekly blanket replacement confirmed and recorded.');await load(true)}catch(e:any){setError(e.message||'Unable to save blanket change.')}finally{setBusy('')}}
 async function markTub(room:Room){setBusy(room.roomId);setError('');setMessage('');try{const response=await fetch('/api/ops/room-details',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({date,roomId:room.roomId,action:'tubComplete'})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Could not complete tub clean.');setMessage(room.roomName+' · tub cleaned, room condition unchanged.');await load(true)}catch(e:any){setError(e.message||'Unable to record tub clean.')}finally{setBusy('')}}
 async function markStripped(room:Room){
  setBusy(room.roomId);setMessage('');setError('')
  try{
   const response=await fetch('/api/housekeeping/strip-task',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({serviceDate:date,roomId:room.roomId,action:'complete'})})
   const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Could not confirm strip.')
   setMessage(room.roomName+' · stripped and recorded.');await load()
  }catch(e:any){setError(e.message||'Could not record room strip.')}finally{setBusy('')}
 }
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
  <header className="ths-cleans-hero"><div><small>THE HOTEL SAUGATUCK · HOUSEKEEPING</small><h1>{mode==='refreshes'?"Today's Refreshes":"Today's Cleans"}</h1><p>{mode==='refreshes'?'Assigned stayover refreshes, separate from full room cleans.':'Room cleans, strips, tub cleans and weekly blanket changes in one workflow.'}</p></div><div className="ths-cleans-actions"><input aria-label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)}/><button onClick={()=>void load()} title="Refresh" aria-label="Refresh rooms"><RefreshCw size={17}/></button></div></header>
  {mode==='cleans'&&initialRoomId&&!loading&&<section className="ths-cleans-deep-link" aria-label="Selected room correction history">
   {selectedRoom?<><h2>{selectedRoom.roomName} · {date}</h2>
    {selectedRoom.checkIssueOpen&&<p><strong>Correction needed:</strong> Review the inspector's notes below before resubmitting this room.</p>}
    {selectedRoom.correctionHistory?.length?<div className="ths-cleans-correction-history">
     {selectedRoom.correctionHistory.map(item=><div key={item.id}>
      <strong>{item.type==='fixed'?'Fix recorded':'Inspection issue'}</strong><p>{item.note}</p>
     </div>)}
    </div>:<p>No inspection or fix notes were recorded for this room on this date.</p>}
   </>:<p>This room is not among your assigned rooms for {date}. Open the original notification to review any notes addressed to you.</p>}
  </section>}
  {mode==='cleans'&&manager&&<nav className="ths-cleans-tabs" aria-label="Today's cleans views"><button type="button" className={cleansView==='team'?'active':''} aria-current={cleansView==='team'?'page':undefined} onClick={()=>setCleansView('team')}>All Cleans</button><button type="button" className={cleansView==='mine'?'active':''} aria-current={cleansView==='mine'?'page':undefined} onClick={()=>setCleansView('mine')}>My Cleans</button></nav>}
  <div className="ths-cleans-summary"><strong>{ordered.filter(r=>r.taskKind==='clean'&&r.complete).length} of {ordered.length}</strong> {mode==='refreshes'?' refreshes finished':" tasks finished"}{mode==='cleans'&&teamDisplay&&<span> · {ordered.filter(r=>!r.complete&&!r.assignedTo.trim()).length} awaiting assignment</span>}</div>
  {message&&<p role="status" className="ths-cleans-message">{message}</p>}{error&&<p role="alert" className="ths-cleans-error">{error}</p>}
  {mode==='refreshes'&&!loading&&<section aria-label="Available stayover refreshes" style={{marginBottom:20}}><h2 style={{fontSize:18,margin:'8px 0 12px'}}>Available stayovers</h2>{available.length===0?<p className="ths-cleans-empty">No unassigned stayovers available to claim.</p>:<div className="ths-refresh-claim-list">{available.map(room=><div key={room.roomId} className="ths-refresh-claim-row"><strong>{room.roomName}</strong><button type="button" disabled={Boolean(busy)} onClick={()=>void claim(room)}>{busy===room.roomId?'Claiming…':'Start RF'}</button></div>)}</div>}</section>}
  {loading?<p>Loading assignments…</p>:ordered.length===0?<div className="ths-cleans-empty">{mode==='refreshes'?'No stayover refreshes assigned for this date.':'No assigned room, strip or tub tasks for this date.'} If you expect rooms, ask management to check the day's assignments.</div>:<div className="ths-cleans-grid">{ordered.map(r=>{
   const task=r.taskKind,waiting=task==='clean'&&isWaiting(r),orderLocked=task==='clean'&&locked(r),done=task==='clean'&&r.complete
   const failed=r.checkIssueOpen,passed=r.inspected&&!failed
   const inProgress=task==='clean'&&!done&&r.roomCondition.trim().toLowerCase()==='cleaning'
   const canWorkRoom=manager||(task==='tub'?Boolean(r.tubAssignedTo&&r.tubAssignedTo.trim().toLowerCase()===staffName.trim().toLowerCase()):ownRoom(r))
   const cardTone=task==='tub'||task==='strip'?'available':failed?'inspection-failed':passed||done?'done':inProgress?'in-progress':waiting||orderLocked?'locked':'available'
   return <article className={'ths-clean-card '+cardTone+((manager||hospitalityAssistant)?' inspection-entry':'')} key={task+':'+r.roomId}>
    {task==='clean'&&passed?<div className="ths-inspection-flag passed"><CheckCircle2 size={16}/> Inspection passed</div>:failed?<div className="ths-inspection-flag failed">Inspection failed · correction required</div>:null}
    <div className="ths-clean-head"><div><small>{mode==='refreshes'?'STAYOVER REFRESH':task==='tub'?'TUB CLEAN':task==='strip'?'ROOM STRIP':r.cleanOrder!=null?'CLEAN '+r.cleanOrder:'ROOM ASSIGNMENT'}</small><h2>{(manager||hospitalityAssistant)?<Link className="ths-inspection-link" href={inspectionHref(r.roomId,date)} aria-label={'Open '+r.roomName+' in Inspections'}>{r.roomName} <span aria-hidden="true">↗</span></Link>:r.roomName}</h2></div>{task==='tub'?<span className="ths-clean-ready awaiting">Tub due</span>:task==='strip'?<span className="ths-clean-ready awaiting">Strip due</span>:passed?<span className="ths-clean-ready passed">Passed</span>:failed?<span className="ths-clean-ready failed">Needs correction</span>:done?<span className="ths-clean-ready finished">Finished</span>:inProgress?<span className="ths-clean-ready in-progress">In progress</span>:waiting?<span className="ths-clean-ready awaiting"><LockKeyhole size={14}/> Awaiting OUT</span>:orderLocked?<span className="ths-clean-ready queued"><LockKeyhole size={14}/> Queued</span>:<span className={'ths-clean-ready occupancy'+(guestStatusLabel(r)==='OUT'?' out':'')}>{guestStatusLabel(r)}</span>}</div>
    {(manager||hospitalityAssistant)&&<p className="ths-clean-detail"><strong>Assigned: {task==='tub'?(r.tubAssignedTo||'Unassigned'):r.assignedTo||'Unassigned'}</strong></p>}
    {mode==='cleans'&&manager&&teamDisplay&&!done&&task==='clean'&&<label className="ths-inline-assign">Assign housekeeper<select aria-label={'Assign '+r.roomName+' to housekeeper'} value={r.assignedTo||''} disabled={readOnly||Boolean(busy)} onChange={e=>void assignRoom(r,e.target.value)}><option value="">Unassigned</option>{housekeepingStaff.filter(p=>p.onSite||p.name===r.assignedTo).map(p=><option key={p.id} value={p.name}>{p.name}{p.onSite?' · on shift':''}</option>)}</select></label>}
    <p className="ths-clean-detail">{r.reservationStatus} {r.serviceType?'· '+r.serviceType:''}</p>
    {r.notes&&<p className="ths-clean-notes">{r.notes}</p>}
    {r.correctionHistory?.length? <div className="ths-cleans-correction-history"><strong>Inspection issues &amp; fixes</strong>{r.correctionHistory.map(item=><div key={item.id}><strong>{item.type==='fixed'?'Fix recorded':'Inspection issue'}</strong><p>{item.note}</p></div>)}</div>:null}
    {mode==='cleans'&&!(task==='tub'?r.tubAssignedTo:r.assignedTo)?.trim()&&<p className="ths-clean-detail"><strong>Needs housekeeping assignment</strong></p>}
    <p className="ths-clean-status">{task==='tub'?'Tub clean due · room stays clean':task==='strip'?'Strip requested · ready to strip':failed?(done?'Correction submitted · awaiting reinspection':'Inspection failed · correction needed'):passed?'Inspection passed':done?(mode==='refreshes'?'Refresh complete':'Finished · sent for inspection'):waiting?'Waiting for guest OUT and room strip':orderLocked?'Finish your earlier numbered room first':inProgress?'Cleaning in progress':'Ready to clean'}</p>

    {mode==='cleans'&&<div className="ths-blanket-inline" style={{borderColor:blankets[r.roomId]?'#79b996':'#dfc17b',background:blankets[r.roomId]?'#edf8ef':'#fff7e6'}}><span>{blankets[r.roomId]?'Blankets replaced this week · confirmed '+new Date(blankets[r.roomId].changedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'America/Detroit'}):'Weekly blanket replacement not yet confirmed'}</span>{!blankets[r.roomId]&&canWorkRoom&&<button type="button" disabled={readOnly||Boolean(busy)} onClick={()=>void markBlanket(r)}>Confirm blankets replaced</button>}</div>}
    {canWorkRoom&&!(hospitalityAssistant&&teamDisplay)&&!readOnly&&!orderLocked&&r.hasDailyRecord!==false&&(
      task==='strip'?<button type="button" disabled={Boolean(busy)} onClick={()=>startedTasks['strip:'+r.roomId]?void markStripped(r):setStartedTasks(v=>({...v,['strip:'+r.roomId]:true}))}>{busy===r.roomId?'Saving…':startedTasks['strip:'+r.roomId]?'Mark Strip Complete':'Begin Strip'}</button>:
      task==='tub'?<button type="button" disabled={Boolean(busy)} onClick={()=>startedTasks['tub:'+r.roomId]?void markTub(r):setStartedTasks(v=>({...v,['tub:'+r.roomId]:true}))}>{busy===r.roomId?'Saving…':startedTasks['tub:'+r.roomId]?'Mark Tub Complete':'Begin Tub'}</button>:
      !done&&!waiting&&Boolean(r.assignedTo.trim())?<button type="button" disabled={Boolean(busy)} onClick={()=>void (inProgress||r.reservationStatus.toLowerCase()==='stayover'?finish(r):begin(r))}>{busy===r.roomId?'Saving…':mode==='refreshes'?'Mark refresh complete':inProgress?'Finished · Send for inspection':'Begin cleaning'}</button>:null
    )}

   </article>
  })}</div>}
  <style jsx>{`
   .ths-cleans-deep-link{background:#eff7fb;border:1px solid #afcfde;border-radius:14px;padding:15px;margin:12px 0}
   .ths-cleans-deep-link h2{margin:0 0 9px;font-size:17px;color:#244e68}
   .ths-cleans-deep-link>p{font-size:13px;color:#506e82;line-height:1.5}
   .ths-cleans-correction-history{display:grid;gap:8px;padding:10px 12px;border:1px solid #d8e6ed;border-radius:10px;margin:10px 0;background:#fff}
   .ths-cleans-correction-history>strong{font-size:13px;color:#355d73}
   .ths-cleans-correction-history>div{padding:7px 3px;border-top:1px solid #e4edf1;font-size:12px}
   .ths-cleans-correction-history>div strong{color:#375f77}
   .ths-cleans-correction-history>div p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;margin:5px 0 0;color:#4a6579}
   .ths-blanket-inline{display:flex;flex-wrap:wrap;align-items:center;gap:8px;justify-content:space-between;border:1px solid;border-radius:10px;padding:9px;margin:10px 0;font-size:12px;font-weight:700}.ths-blanket-inline button{width:auto;min-height:34px;padding:7px 11px}
   .ths-cleans-tabs{display:flex;gap:6px;margin:16px 0 6px;padding:4px;background:#e7f0f5;border-radius:13px;width:fit-content}.ths-cleans-tabs button{border:0;background:transparent;padding:10px 18px;border-radius:10px;font-weight:750;color:#365669;cursor:pointer}.ths-cleans-tabs button.active{background:white;box-shadow:0 2px 8px #203a491c;color:#173a50}
   .ths-refresh-claim-list{display:grid;gap:9px}.ths-refresh-claim-row{display:flex;align-items:center;justify-content:space-between;gap:15px;background:#fff;border:1px solid #dce5e9;border-radius:12px;padding:12px 15px}.ths-refresh-claim-row button{background:#34566a;color:white;border:0;border-radius:9px;padding:10px 16px;font-weight:700;cursor:pointer;white-space:nowrap}.ths-refresh-claim-row button:disabled{opacity:.55}
   .ths-cleans{max-width:1100px;margin:auto;padding:20px 18px 64px;color:#263b47}
   .ths-cleans-hero{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;padding:24px;border-radius:20px;background:linear-gradient(115deg,#e2f5f4,#edf3fd,#e9e1fb)}
   .ths-cleans-hero small,.ths-clean-head small{letter-spacing:.1em;font-size:11px;font-weight:800;color:#67818e}.ths-cleans-hero h1{font-size:clamp(25px,4vw,34px);margin:7px 0}.ths-cleans-hero p{margin:0;color:#66808b}.ths-cleans-actions{display:flex;gap:8px}.ths-cleans-actions input,.ths-cleans-actions button{background:white;border:1px solid #d4dfe5;border-radius:12px;padding:12px;color:#263b47}
   .ths-inline-assign{display:grid;gap:6px;font-size:12px;font-weight:750;color:#36586b;margin:12px 0}.ths-inline-assign select{width:100%;min-height:42px;background:#fff;border:1px solid #cbdde7;border-radius:10px;padding:9px;color:#263b47}.ths-clean-assign{display:block;margin-top:12px;padding:12px;border-radius:12px;text-align:center;background:#e3eff6;color:#294d64;font-weight:750;text-decoration:none}.ths-clean-assign:hover{text-decoration:underline}
   .ths-strip-section{margin:15px 0 22px}.ths-strip-section h2{font-size:19px;margin:0 0 5px}.ths-strip-section p{font-size:13px;margin:0 0 11px;color:#617885}.ths-strip-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,275px),1fr));gap:10px}.ths-strip-card{display:flex;flex-direction:column;gap:8px;padding:15px;border:1px solid #d2dfea;border-radius:13px;background:#f8fbfd}.ths-strip-card small{color:#617783}.ths-strip-card button{border:0;background:#35566b;color:#fff;font-weight:750;border-radius:9px;padding:12px;cursor:pointer}.ths-strip-card button:disabled{opacity:.6}
   .ths-cleans-summary{padding:20px 4px;font-size:15px}.ths-cleans-summary strong{font-size:23px}.ths-cleans-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px}.ths-clean-card{background:white;border:1px solid #dde6e9;border-radius:18px;padding:20px;box-shadow:0 5px 20px #142a3d08}.ths-clean-card.done{background:#e0f3e8;border-color:#b7dbc7}.ths-clean-card.in-progress{background:#fff5d5;border-color:#e8d596}.ths-clean-card.inspection-failed{background:#fff0dc;border-color:#e9b77d}.ths-clean-card.locked{background:#f4f5f8}.ths-clean-head{display:flex;justify-content:space-between;align-items:center}.ths-clean-head h2{font-size:22px;margin:7px 0}.ths-clean-detail,.ths-clean-status{font-size:14px;color:#607684}.ths-clean-ready{background:#dbefe5;border-radius:20px;padding:7px 12px;color:#226650;font-weight:700;white-space:nowrap;font-size:13px}.ths-clean-ready.occupancy{background:#e6eff5;color:#31586d}.ths-clean-ready.occupancy.out{background:#dbeaf5;color:#315a78}.ths-clean-ready.awaiting{display:inline-flex;align-items:center;gap:5px;background:#fff0cf;color:#876320}.ths-clean-ready.queued{display:inline-flex;align-items:center;gap:5px;background:#edf0f4;color:#536776}.ths-clean-ready.in-progress{background:#f6e3a4;color:#735510}.ths-clean-ready.finished,.ths-clean-ready.passed{background:#c9e8d5;color:#206048}.ths-clean-ready.failed{background:#f7d2a9;color:#874514}.ths-inspection-flag{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800;letter-spacing:.02em;margin:0 0 13px}.ths-inspection-flag.passed{color:#206048}.ths-inspection-flag.failed{color:#874514}.ths-clean-notes{padding:12px;background:#f2f6fb;border-radius:10px;font-size:14px}.ths-clean-card.inspection-entry{position:relative;cursor:pointer}.ths-clean-card.inspection-entry:hover{border-color:#91b6c6;box-shadow:0 7px 24px #142a3d18}.ths-inspection-link{color:inherit;text-decoration:none}.ths-inspection-link span{font-size:.72em;color:#66808b}.ths-inspection-link::after{content:'';position:absolute;inset:0;border-radius:18px}.ths-clean-card.inspection-entry:focus-within{outline:2px solid #567a99;outline-offset:3px}.ths-clean-card.inspection-entry button{position:relative;z-index:1}.ths-clean-card button{width:100%;min-height:48px;border:0;border-radius:12px;color:white;background:#344f69;font-weight:750;cursor:pointer}.ths-clean-card button:disabled{opacity:.5}.ths-cleans-message,.ths-cleans-error,.ths-cleans-empty{padding:14px;border-radius:12px;background:#e5f1fa}.ths-cleans-error{background:#fbe8eb;color:#972c4c}
   @media(max-width:650px){.ths-cleans{padding:12px 10px 45px}.ths-cleans-hero{padding:18px}.ths-cleans-grid{grid-template-columns:1fr}.ths-clean-card{padding:17px}}
  `}</style>
 </div>
}
