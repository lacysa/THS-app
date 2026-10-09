'use client'
import {useEffect,useMemo,useState} from 'react'
import {AlertCircle,Check,CheckCircle2,ClipboardList,Plus,RefreshCw,X} from 'lucide-react'

type Entry={id:string;roomId:string|null;roomName:string;serviceDate:string;eventType:string;message:string;status:string;at:string;actor:string;source:string}
type Room={id:string;name:string}
type Filter='all'|'open'|'guest'|'housekeeping'
const labels:Record<string,string>={
  guest_request:'Guest request',housekeeping_issue:'Housekeeping issue',team_note:'Team note',out_marked:'Room OUT',out_cleared:'OUT cleared',tip_envelope_collected:'Tips collected',tip_envelope_cleared:'Tip mark removed',
  assignment_changed:'Staff assignment',assignment_snapshot:'Staff assigned',refresh_requested:'Refresh requested',
  refresh_completed:'Refresh completed',refresh_snapshot:'Scheduled refresh',clean_completed:'Room cleaned',
  inspection_passed:'Inspection passed',issue_reported:'Inspection issue',issue_resolved:'Correction resolved',
  correction_found:'Issue reported',correction_fixed:'Correction fixed',condition_changed:'Room condition',
  room_note:'Room note'
}
function shift(day:string,n:number){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function asLocalTime(s:string){const d=new Date(s);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Detroit'}).format(d)}
export default function OpsActivityLog({serviceDate,roomId,compact=false}:{serviceDate:string;roomId?:string;compact?:boolean}){
 const [end,setEnd]=useState(serviceDate)
 const [entries,setEntries]=useState<Entry[]>([])
 const [rooms,setRooms]=useState<Room[]>([])
 const [roomFilter,setRoomFilter]=useState(roomId||'')
 const [filter,setFilter]=useState<Filter>('all')
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 const [reload,setReload]=useState(0)
 const [writing,setWriting]=useState(false)
 const [category,setCategory]=useState('guest_request')
 const [note,setNote]=useState('')
 const [busy,setBusy]=useState(false)
 useEffect(()=>{setRoomFilter(roomId||'')},[roomId])
 useEffect(()=>{
  const controller=new AbortController()
  setLoading(true);setError('')
  const start=shift(end,-6)
  const url='/api/ops/log?start='+encodeURIComponent(start)+'&end='+encodeURIComponent(end)+(roomId?'&roomId='+encodeURIComponent(roomId):'')
  fetch(url,{cache:'no-store',signal:controller.signal})
   .then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error||'Unable to load activity');return body as {items:Entry[];rooms:Room[]}})
   .then(d=>{if(!controller.signal.aborted){setEntries(d.items);setRooms(d.rooms)}})
   .catch(e=>{if(!controller.signal.aborted)setError(String(e.message||e))})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[end,roomId,reload])
 const visible=useMemo(()=>entries.filter(e=>{
  if(roomFilter&&e.roomId!==roomFilter)return false
  if(filter==='open')return e.status==='open'
  if(filter==='guest')return ['guest_request','housekeeping_issue','team_note','room_note'].includes(e.eventType)
  if(filter==='housekeeping')return !['guest_request','team_note','room_note'].includes(e.eventType)
  return true
 }),[entries,roomFilter,filter])
 const openCount=entries.filter(e=>e.status==='open'&&(!roomFilter||e.roomId===roomFilter)).length
 async function saveRequest(){
  if(busy||!note.trim())return
  setBusy(true);setError('');setMessage('')
  try{
   const response=await fetch('/api/ops/log',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roomId:roomFilter||null,serviceDate:end,eventType:category,message:note.trim()})})
   const result=await response.json().catch(()=>({}))
   if(!response.ok)throw new Error(result.error||'Unable to save note')
   setWriting(false);setNote('');setMessage('Entry recorded');setReload(n=>n+1)
  }catch(e:any){setError(String(e.message||e))}
  finally{setBusy(false)}
 }
 async function markDone(entry:Entry){
  if(busy)return
  setBusy(true);setError('');setMessage('')
  try{
   const response=await fetch('/api/ops/log',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:entry.id,status:'done'})})
   const result=await response.json().catch(()=>({}))
   if(!response.ok)throw new Error(result.error||'Unable to resolve request')
   setEntries(prev=>prev.map(e=>e.id===entry.id?{...e,status:'done'}:e))
   setMessage('Request marked complete')
  }catch(e:any){setError(String(e.message||e))}
  finally{setBusy(false)}
 }
 return <section className={'ops-activity'+(compact?' compact':'')} aria-label="Ops activity log">
  <header className="ops-activity-heading">
   <div><h2>{compact?'Room activity':'Activity Log'}</h2><p>Cleaning history, staff assignments, refreshes and guest requests</p></div>
   <div className="ops-activity-heading-buttons">
    <button type="button" aria-label="Refresh activity" disabled={loading} onClick={()=>setReload(n=>n+1)}><RefreshCw size={17}/></button>
    <button type="button" className="ops-activity-new" onClick={()=>setWriting(v=>!v)}><Plus size={16}/>{writing?'Cancel':'Add entry'}</button>
   </div>
  </header>
  <div className="ops-activity-controls">
   <label>Through <input type="date" aria-label="Log end date" value={end} onChange={e=>{if(e.target.value)setEnd(e.target.value)}}/></label>
   {!roomId&&<label>Room <select aria-label="Filter log by room" value={roomFilter} onChange={e=>setRoomFilter(e.target.value)}><option value="">All rooms</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
  </div>
  <div className="ops-activity-filters" role="group" aria-label="Log filters">
   {(['all','open','guest','housekeeping'] as Filter[]).map(f=><button type="button" key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f==='all'?'All':f==='open'?'Open'+(openCount?' · '+openCount:''):f==='guest'?'Requests & notes':'Housekeeping'}</button>)}
  </div>
  {writing&&<form className="ops-activity-form" onSubmit={e=>{e.preventDefault();void saveRequest()}}>
   <div className="ops-activity-form-title"><strong>Record a request or note</strong><button type="button" aria-label="Close entry form" onClick={()=>setWriting(false)}><X size={16}/></button></div>
   <label>Type <select value={category} onChange={e=>setCategory(e.target.value)}><option value="guest_request">Guest request</option><option value="housekeeping_issue">Housekeeping issue</option><option value="team_note">Team note</option></select></label>
   {!roomFilter&&category!=='team_note'&&<p className="ops-activity-help">Select a room above before logging a guest request or housekeeping issue.</p>}
   <label>Details <textarea rows={3} maxLength={800} required value={note} onChange={e=>setNote(e.target.value)} placeholder="What was requested or needs follow-up?"/></label>
   <button type="submit" className="ops-activity-submit" disabled={busy||!note.trim()||(!roomFilter&&category!=='team_note')}>{busy?'Saving…':'Save entry'}</button>
  </form>}
  {message&&<p className="ops-activity-success" role="status"><Check size={15}/>{message}</p>}
  {error&&<p className="ops-activity-error" role="alert"><AlertCircle size={16}/>{error}</p>}
  {loading&&<p className="ops-activity-placeholder">Loading activity…</p>}
  {!loading&&visible.length===0&&<p className="ops-activity-placeholder">No activity recorded for this selection.</p>}
  <div className="ops-activity-list">
   {visible.map(entry=><article className={'ops-activity-item'+(entry.status==='open'?' is-open':'')} key={entry.id}>
    <div className="ops-activity-item-top"><span className="ops-activity-kind">{entry.status==='open'?<AlertCircle size={14}/>:<ClipboardList size={14}/>} {labels[entry.eventType]||entry.eventType.replaceAll('_',' ')}</span><time>{asLocalTime(entry.at)}</time></div>
    <strong>{entry.roomName}</strong>
    <p>{entry.message}</p>
    <div className="ops-activity-item-bottom"><span>{entry.actor}{entry.source==='daily_snapshot'?' · Daily record':entry.source==='existing_record'?' · Previous record':''}</span>{entry.status==='open'&&entry.source==='manual'?<button type="button" disabled={busy} onClick={()=>void markDone(entry)}><CheckCircle2 size={15}/> Resolve</button>:entry.status==='done'?<span className="ops-activity-done"><Check size={13}/> Resolved</span>:null}</div>
   </article>)}
  </div>
  <p className="ops-activity-footnote">Earlier staff assignments come from daily records, not a full change history. New housekeeping changes are logged automatically. Activity is separate from PMS reservations and breakfast orders.</p>
 </section>
}
