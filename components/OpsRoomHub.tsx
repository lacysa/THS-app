'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {AlertTriangle,Check,ChevronDown,ClipboardCheck,Pencil,Save,X} from 'lucide-react'

type Stay={id:string;reservation_number:string|null;guest_name:string|null;guest_phone:string|null;arrival_date:string|null;checkout_date:string|null;occupancy:number|null;rate_plan:string|null;check_in_time:string|null;products_raw:string|null;dietary_restrictions:string|null;guest_comments:string|null;innkeeper_notes:string|null;reason_for_visit:string|null}
type Daily={assigned_to:string|null;notes:string|null;reservation_status:string|null;service_type:string|null;room_condition:string|null;strip_hold:string|null;complete:boolean|null;ready_for_inspection:boolean|null;inspected:boolean|null;inspected_at:string|null;check_issue_open:boolean|null;check_issue_note:string|null;breakfast_tag:boolean|null;late_arrival:boolean|null;housekeeper_attested_by:string|null}
type Data={room:{id:string;name:string};date:string;daily:Daily|null;stay:Stay|null;permissions:{canManage:boolean;canInspect:boolean};inspectionEligible:boolean;inspectionReady:boolean;staffNames:string[]}
type View='room'|'guest'
type Editor='condition'|'activity'|'housekeeper'|null
const conditions=['Occupied','Vacant (Clean)','Vacant (Dirty)','Cleaning','Ready for Room Check','Ready','Blocked']
const activities=['Arrival','Stayover','Checkout','Out/In','Vacant','Dirty','Blocked']
function present(value:unknown){return String(value??'').trim()||'Not recorded'}
function dateLabel(value:string){return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'))}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="ops-hub-field"><span>{label}</span><strong>{children}</strong></div>}
export default function OpsRoomHub({roomId,date,reservationId,onClose,onUpdate}:{roomId:string;date:string;reservationId?:string;onClose:()=>void;onUpdate?:()=>void}){
 const [data,setData]=useState<Data|null>(null)
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [reload,setReload]=useState(0)
 const [view,setView]=useState<View>('room')
 const [activeEditor,setActiveEditor]=useState<Editor>(null)
 const inspectionRef=useRef<HTMLElement|null>(null)
 const [roomNotes,setRoomNotes]=useState('')
 const [issueNote,setIssueNote]=useState('')
 const [guestEdits,setGuestEdits]=useState({guest_comments:'',innkeeper_notes:''})
 const refresh=useCallback(()=>setReload(n=>n+1),[])
 useEffect(()=>{setView('room');setActiveEditor(null);setMessage('')},[roomId,date,reservationId])
 useEffect(()=>{
  const controller=new AbortController()
  if(!data)setLoading(true)
  setError('')
  fetch('/api/ops/room?roomId='+encodeURIComponent(roomId)+'&date='+encodeURIComponent(date)+(reservationId?'&reservationId='+encodeURIComponent(reservationId):''),{cache:'no-store',signal:controller.signal})
   .then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.error||'Could not load room');return value as Data})
   .then(value=>{if(!controller.signal.aborted){setData(value);setRoomNotes(value.daily?.notes||'');setGuestEdits({guest_comments:value.stay?.guest_comments||'',innkeeper_notes:value.stay?.innkeeper_notes||''})}})
   .catch(e=>{if(!controller.signal.aborted)setError(String(e.message||'Could not load room'))})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[roomId,date,reservationId,reload])
 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()}
  document.addEventListener('keydown',key)
  return()=>document.removeEventListener('keydown',key)
 },[onClose])
 async function run(url:string,payload:unknown,success:string){
  if(busy)return false
  setBusy(true);setMessage('');setError('')
  try{
   const response=await fetch(url,{method:url.includes('/room-checks')?'POST':'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(payload)})
   const value=await response.json().catch(()=>({}))
   if(!response.ok)throw new Error(value.error||'Could not save changes')
   setMessage(success)
   // Reflect edits across other open modules without refreshing or moving the calendar.
   window.dispatchEvent(new CustomEvent('ths:live-data-refresh'))
   onUpdate?.()
   refresh()
   return true
  }catch(e:any){setError(String(e.message||'Could not save changes'));return false}
  finally{setBusy(false)}
 }
 const daily=data?.daily
 const canManage=Boolean(data?.permissions.canManage)
 const canInspect=Boolean(data?.permissions.canInspect)
 const blocked=Boolean(daily?.strip_hold?.toLowerCase().includes('hold')||daily?.reservation_status?.toLowerCase()==='blocked'||daily?.room_condition==='Blocked')
 async function changeCondition(condition:string){
  if(!daily||!canManage)return
  const patch:Record<string,unknown>={roomCondition:condition}
  if(condition==='Blocked')patch.stripHold='Hold'
  else if(blocked)patch.stripHold=''
  if(condition==='Vacant (Dirty)'||condition==='Cleaning')patch.complete=false
  if(await run('/api/housekeeping/day',{serviceDate:date,roomId,patch},'Room condition updated'))setActiveEditor(null)
 }
 async function changeActivity(status:string){
  if(!daily||!canManage)return
  const patch:Record<string,unknown>={reservationStatus:status}
  if(status==='Blocked')patch.stripHold='Hold'
  else if(blocked)patch.stripHold=''
  if(await run('/api/housekeeping/day',{serviceDate:date,roomId,patch},'Operational activity updated'))setActiveEditor(null)
 }
 async function assignHousekeeper(name:string){
  if(!daily||!canManage)return
  if(await run('/api/housekeeping/day',{serviceDate:date,roomId,patch:{assignedTo:name}},name?'Housekeeper assigned':'Assignment cleared'))setActiveEditor(null)
 }
 async function inspect(decision:'pass'|'fail'|'fixed'){
  if(decision==='fail'&&!issueNote.trim()){setError('Describe the housekeeping issue before failing the inspection.');return}
  await run('/api/room-checks',{date,roomId,decision,note:issueNote.trim()},decision==='pass'?'Inspection passed':decision==='fixed'?'Correction marked ready for reinspection':'Issue reported to housekeeping')
 }
 async function saveGuest(){
  if(!data?.stay||!canManage)return
  const patch:Record<string,string>={}
  for(const key of ['guest_comments','innkeeper_notes'] as const){
   if(guestEdits[key]!==String(data.stay[key]||''))patch[key]=guestEdits[key]
  }
  if(!Object.keys(patch).length)return
  await run('/api/reservations/stay',{id:data.stay.id,patch},'Guest notes saved')
 }
 return <div className="ops-hub-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section className="ops-hub-sheet" role="dialog" aria-modal="true" aria-label="Room operations hub">
   <header className="ops-hub-head">
    <div><small>Ops · {dateLabel(date)}</small><h2>{data?.room.name||'Room operations'}</h2><span>{data?.stay?.guest_name||'No reservation'}{data?.stay?.reservation_number?' · #'+data.stay.reservation_number:''}</span></div>
    <button type="button" aria-label="Close room operations" onClick={onClose}><X size={20}/></button>
   </header>
   <div className="ops-hub-content">
    {loading&&<p className="ops-hub-muted">Loading room details…</p>}
    {error&&<p className="ops-hub-error" role="alert">{error}</p>}
    {message&&!loading&&<p className="ops-hub-success" role="status"><Check size={16}/>{message}</p>}
    {data&&<>
     <nav className="ops-hub-tabs" aria-label="Room hub views"><button type="button" className={view==='room'?'active':''} onClick={()=>setView('room')}>Room & checks</button><button type="button" className={view==='guest'?'active':''} onClick={()=>setView('guest')} disabled={!data.stay}>Guest {data.stay?'& notes':''}</button></nav>
     {view==='room'&&<>
      <div className="ops-hub-kpis">
       <button type="button" className={'ops-hub-field ops-hub-action-card'+(activeEditor==='condition'?' is-selected':'')} disabled={!canManage||!daily||busy} aria-expanded={activeEditor==='condition'} onClick={()=>setActiveEditor(current=>current==='condition'?null:'condition')}>
        <span>Condition</span><span className="ops-hub-action-value"><strong>{present(daily?.room_condition)}</strong>{canManage&&daily&&<Pencil size={15}/>}</span>
       </button>
       <button type="button" className={'ops-hub-field ops-hub-action-card'+(activeEditor==='housekeeper'?' is-selected':'')} disabled={!canManage||!daily||busy} aria-expanded={activeEditor==='housekeeper'} onClick={()=>setActiveEditor(current=>current==='housekeeper'?null:'housekeeper')}>
        <span>Housekeeper</span><span className="ops-hub-action-value"><strong>{present(daily?.assigned_to)}</strong>{canManage&&daily&&<Pencil size={15}/>}</span>
       </button>
       <button type="button" className={'ops-hub-field ops-hub-action-card'+(activeEditor==='activity'?' is-selected':'')} disabled={!canManage||!daily||busy} aria-expanded={activeEditor==='activity'} onClick={()=>setActiveEditor(current=>current==='activity'?null:'activity')}>
        <span>Activity</span><span className="ops-hub-action-value"><strong>{present(daily?.reservation_status)}</strong>{canManage&&daily&&<Pencil size={15}/>}</span>
       </button>
       <button type="button" className="ops-hub-field ops-hub-action-card" disabled={!daily} onClick={()=>{setActiveEditor(null);inspectionRef.current?.scrollIntoView({behavior:'smooth',block:'start'})}}>
        <span>Inspection</span><span className="ops-hub-action-value"><strong>{daily?.inspected?'Passed':daily?.check_issue_open?'Issue open':data.inspectionEligible?'Pending':'Not required'}</strong>{daily&&<ChevronDown size={16}/>}</span>
       </button>
      </div>
      {canManage&&daily&&activeEditor&&<section className="ops-hub-quick-editor" aria-label="Quick room update">
       <div className="ops-hub-quick-head"><strong>{activeEditor==='condition'?'Change room condition':activeEditor==='activity'?'Change operational activity':'Assign housekeeper'}</strong><button type="button" aria-label="Close quick editor" onClick={()=>setActiveEditor(null)}><X size={17}/></button></div>
       <div className="ops-hub-choices" role="group" aria-label={activeEditor==='condition'?'Room condition choices':activeEditor==='activity'?'Operational activity choices':'Housekeeper choices'}>
        {activeEditor==='condition'&&conditions.map(value=><button type="button" key={value} disabled={busy} aria-pressed={daily.room_condition===value} className={daily.room_condition===value?'is-current':''} onClick={()=>void changeCondition(value)}><span>{value}</span>{daily.room_condition===value&&<Check size={16}/>}</button>)}
        {activeEditor==='activity'&&activities.map(value=><button type="button" key={value} disabled={busy} aria-pressed={daily.reservation_status===value} className={daily.reservation_status===value?'is-current':''} onClick={()=>void changeActivity(value)}><span>{value}</span>{daily.reservation_status===value&&<Check size={16}/>}</button>)}
        {activeEditor==='housekeeper'&&['',...(data.staffNames||[])].map(value=><button type="button" key={value||'unassigned'} disabled={busy} aria-pressed={(daily.assigned_to||'')===value} className={(daily.assigned_to||'')===value?'is-current':''} onClick={()=>void assignHousekeeper(value)}><span>{value||'Unassigned'}</span>{(daily.assigned_to||'')===value&&<Check size={16}/>}</button>)}
       </div>
       {activeEditor==='activity'&&<small>Operational status only. This does not edit the PMS reservation.</small>}
      </section>}
      {daily?.check_issue_open&&<div className="ops-hub-issue"><AlertTriangle size={18}/><div><strong>Housekeeping issue</strong><p>{present(daily.check_issue_note)}</p></div></div>}
      {!daily&&<p className="ops-hub-muted">No operational room record is available for this date. Changes cannot be saved until the room day has been created through the existing scheduling workflow.</p>}

      <section ref={inspectionRef} tabIndex={-1} className="ops-hub-section ops-hub-inspection">
       <h3><ClipboardCheck size={18}/> Room inspection</h3>
       {daily?.inspected&&<p className="ops-hub-good"><Check size={16}/> Passed {daily.inspected_at?'· '+new Date(daily.inspected_at).toLocaleString('en-US',{dateStyle:'short',timeStyle:'short'}):''}</p>}
       {!data.inspectionEligible&&<p className="ops-hub-muted">No inspection is required for this room on the selected date.</p>}
       {data.inspectionEligible&&canInspect&&<>
        {daily?.check_issue_open&&!data.inspectionReady
         ? <><p className="ops-hub-muted">Correction is open. Mark it fixed after the room has been corrected, then reinspect.</p><button type="button" disabled={busy} className="ops-hub-secondary" onClick={()=>void inspect('fixed')}>Mark correction fixed</button></>
         : <div className="ops-hub-inspection-actions">
          <button type="button" disabled={busy||Boolean(daily?.inspected)} className="ops-hub-primary" onClick={()=>void inspect('pass')}><Check size={16}/> {daily?.inspected?'Already passed':'Pass inspection'}</button>
          <label className="ops-hub-label">Found an issue?<textarea value={issueNote} onChange={e=>setIssueNote(e.target.value)} disabled={busy} placeholder="Describe what needs correction" rows={2}/></label>
          <button type="button" disabled={busy||!issueNote.trim()} className="ops-hub-secondary" onClick={()=>void inspect('fail')}><AlertTriangle size={16}/> Fail / flag issue</button>
         </div>}
       </>}
       {data.inspectionEligible&&!canInspect&&<p className="ops-hub-muted">Inspection actions require room-check permission.</p>}
      </section>
      <div className="ops-hub-section">
       <h3>Room notes</h3>
       {canManage&&daily?<><textarea value={roomNotes} onChange={e=>setRoomNotes(e.target.value)} disabled={busy} rows={3} aria-label="Room notes"/><button type="button" className="ops-hub-secondary" disabled={busy||roomNotes===String(daily.notes||'')} onClick={()=>void run('/api/housekeeping/day',{serviceDate:date,roomId,patch:{notes:roomNotes}},'Room notes saved')}><Save size={16}/> Save room notes</button></>:<p className="ops-hub-note">{present(daily?.notes)}</p>}
      </div>
     </>}
     {view==='guest'&&data.stay&&<div className="ops-hub-section ops-hub-guest">
      <div className="ops-hub-kpis">
       <Field label="Guest">{present(data.stay.guest_name)}</Field>
       <Field label="Phone">{data.stay.guest_phone?<a href={'tel:'+String(data.stay.guest_phone).replace(/[^+\d]/g,'')}>{data.stay.guest_phone}</a>:'Not recorded'}</Field>
       <Field label="Arrival">{present(data.stay.arrival_date)}</Field>
       <Field label="Departure">{present(data.stay.checkout_date)}</Field>
       <Field label="Guests">{data.stay.occupancy??'Not recorded'}</Field>
       <Field label="Rate plan">{present(data.stay.rate_plan)}</Field>
       <Field label="Check-in">{present(data.stay.check_in_time)}</Field>
       <Field label="Breakfast">{daily?.breakfast_tag?'Included / tagged':'Not tagged'}</Field>
      </div>
      {data.stay.products_raw&&<div><h3>Packages & requests</h3><p className="ops-hub-note">{data.stay.products_raw}</p></div>}
      {data.stay.dietary_restrictions&&<div><h3>Dietary requests</h3><p className="ops-hub-note">{data.stay.dietary_restrictions}</p></div>}
      <h3>Guest comments</h3>
      {canManage?<textarea rows={3} value={guestEdits.guest_comments} onChange={e=>setGuestEdits(v=>({...v,guest_comments:e.target.value}))} disabled={busy}/>:<p className="ops-hub-note">{present(data.stay.guest_comments)}</p>}
      <h3>Innkeeper notes</h3>
      {canManage?<><textarea rows={3} value={guestEdits.innkeeper_notes} onChange={e=>setGuestEdits(v=>({...v,innkeeper_notes:e.target.value}))} disabled={busy}/><button type="button" className="ops-hub-primary" disabled={busy||(guestEdits.guest_comments===String(data.stay.guest_comments||'')&&guestEdits.innkeeper_notes===String(data.stay.innkeeper_notes||''))} onClick={()=>void saveGuest()}><Save size={16}/> Save guest notes</button></>:<p className="ops-hub-note">{present(data.stay.innkeeper_notes)}</p>}
     </div>}
    </>}
   </div>
  </section>
 </div>
}
