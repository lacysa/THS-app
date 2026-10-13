'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {AlertTriangle,Ban,Check,ChevronDown,ChevronRight,Clock3,DoorOpen,Pencil,Save,SlidersHorizontal,Wallet,X} from 'lucide-react'
import OpsActivityLog from '@/components/OpsActivityLog'

type Stay={id:string;reservation_number:string|null;guest_name:string|null;guest_phone:string|null;arrival_date:string|null;checkout_date:string|null;occupancy:number|null;rate_plan:string|null;check_in_time:string|null;products_raw:string|null;dietary_restrictions:string|null;guest_comments:string|null;innkeeper_notes:string|null;reason_for_visit:string|null}
type Daily={assigned_to:string|null;notes:string|null;reservation_status:string|null;service_type:string|null;clean_order:number|null;room_condition:string|null;strip_hold:string|null;complete:boolean|null;ready_for_inspection:boolean|null;inspected:boolean|null;inspected_at:string|null;check_issue_open:boolean|null;check_issue_note:string|null;breakfast_tag:boolean|null;late_arrival:boolean|null;housekeeper_attested_by:string|null;refresh_completed_initials:string|null}
type ServiceDetails={expected_arrival_time:string|null;actual_arrival_time:string|null;late_checkout_time:string|null;tray_returned_at:string|null;tub_clean_requested_at:string|null;tub_clean_completed_at:string|null}
type PackageOption={id:string;name:string;available:boolean}
type Data={room:{id:string;name:string};date:string;daily:Daily|null;stay:Stay|null;permissions:{canManage:boolean;canInspect:boolean};inspectionEligible:boolean;inspectionReady:boolean;staffNames:string[];mentionableStaff:{name:string;userId:string}[];lastAssigned:{name:string;date:string}|null;lastCleaned:{name:string;date:string;serviceDate:string}|null;packageOptions:PackageOption[];manualPackageIds:string[];importedPackageIds:string[];managerInitials:string;pmsActivity:string;serviceDetails:ServiceDetails|null;autoTubDue:boolean;vacancyDays:number;tubCleanDue:boolean}
type View='room'|'guest'|'log'
type Editor='condition'|'activity'|'housekeeper'|'inspection'|'service'|'out'|'tip_envelope'|'packages'|'room_notes'|'clean_order'|null
const conditions=['Occupied','Vacant (Clean)','Vacant (Dirty)','Cleaning','Ready for Room Check','Ready','Blocked']
const activities=['Arrival','Stayover','Checkout','Out/In','Vacant','Dirty','Blocked']
function present(value:unknown){return String(value??'').trim()||'Not recorded'}
function dateLabel(value:string){return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'))}
function shortDate(value:string){return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'))}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="ops-hub-field"><span>{label}</span><strong>{children}</strong></div>}
type EditableGuestField='guest_name'|'guest_phone'|'occupancy'|'rate_plan'|'check_in_time'|'dietary_restrictions'|'reason_for_visit'|'guest_comments'|'innkeeper_notes'
function GuestCard({label,value,field,canEdit,busy,onSave,large=false}:{label:string;value:string|number|null|undefined;field:EditableGuestField;canEdit:boolean;busy:boolean;large?:boolean;onSave:(field:EditableGuestField,value:string)=>Promise<boolean>}){
 const [editing,setEditing]=useState(false)
 const [draft,setDraft]=useState(String(value??''))
 useEffect(()=>{if(!editing)setDraft(String(value??''))},[value,editing])
 const save=async()=>{if(await onSave(field,draft))setEditing(false)}
 return <div className={'ops-hub-guest-card'+(large?' wide':'')+(editing?' is-editing':'')}>
  <button type="button" className="ops-hub-guest-card-trigger" disabled={!canEdit||busy} onClick={()=>{setDraft(String(value??''));setEditing(v=>!v)}} aria-expanded={editing}>
   <span>{label}</span>
   <strong>{String(value??'').trim()||'Not recorded'}</strong>
   {canEdit&&<Pencil size={15}/>}
  </button>
  {editing&&canEdit&&<div className="ops-hub-guest-card-editor">
   {large?<textarea rows={3} aria-label={'Edit '+label} value={draft} maxLength={6000} disabled={busy} onChange={e=>setDraft(e.target.value)}/>:<input aria-label={'Edit '+label} type={field==='occupancy'?'number':field==='guest_phone'?'tel':'text'} min={field==='occupancy'?1:undefined} max={field==='occupancy'?20:undefined} maxLength={6000} value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)}/>}
   <div className="ops-hub-inline-actions"><button type="button" disabled={busy||draft===String(value??'')} onClick={()=>void save()}><Save size={14}/>Save</button><button type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancel</button></div>
  </div>}
 </div>
}
export default function OpsRoomHub({roomId,date,reservationId,onClose,onUpdate}:{roomId:string;date:string;reservationId?:string;onClose:()=>void;onUpdate?:()=>void}){
 const [data,setData]=useState<Data|null>(null)
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [reload,setReload]=useState(0)
 const [sections,setSections]=useState<Record<View,boolean>>({room:true,guest:false,log:false})
 const toggleSection=(key:View)=>setSections(current=>({...current,[key]:!current[key]}))
 const [activeEditor,setActiveEditor]=useState<Editor>(null)
 const [showDetails,setShowDetails]=useState(false)
 const roomDetailsRef=useRef<HTMLDivElement|null>(null)
 useEffect(()=>{
  if(showDetails)roomDetailsRef.current?.scrollIntoView({behavior:'smooth',block:'start'})
 },[showDetails])
 const [roomNotes,setRoomNotes]=useState('')
 const [mentionSearch,setMentionSearch]=useState<string|null>(null)
 const roomNoteInput=useRef<HTMLTextAreaElement|null>(null)
 const mentionStart=useRef(-1)
 const [issueNote,setIssueNote]=useState('')
 const [manualPackageDraft,setManualPackageDraft]=useState<string[]>([])
 const [roomOrder,setRoomOrder]=useState('')
 const [times,setTimes]=useState({expectedArrivalTime:'',actualArrivalTime:'',lateCheckoutTime:''})
 const refresh=useCallback(()=>setReload(n=>n+1),[])
 useEffect(()=>{setSections({room:true,guest:false,log:false});setActiveEditor(null);setShowDetails(false);setMessage('')},[roomId,date,reservationId])
 useEffect(()=>{
  const controller=new AbortController()
  if(!data)setLoading(true)
  setError('')
  fetch('/api/ops/room?roomId='+encodeURIComponent(roomId)+'&date='+encodeURIComponent(date)+(reservationId?'&reservationId='+encodeURIComponent(reservationId):''),{cache:'no-store',signal:controller.signal})
   .then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.error||'Could not load room');return value as Data})
   .then(value=>{if(!controller.signal.aborted){setData(value);setRoomNotes(value.daily?.notes||'');setManualPackageDraft(value.manualPackageIds||[]);setRoomOrder(value.daily?.clean_order==null?'':String(value.daily.clean_order));setTimes({expectedArrivalTime:value.serviceDetails?.expected_arrival_time?.slice(0,5)||'',actualArrivalTime:value.serviceDetails?.actual_arrival_time?.slice(0,5)||'',lateCheckoutTime:value.serviceDetails?.late_checkout_time?.slice(0,5)||''})}})
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
 const updateMentionQuery=(value:string,caret:number)=>{
  const prefix=value.slice(0,caret)
  const match=prefix.match(/(?:^|\\s)@([\\p{L}\\p{N} .'-]{0,40})$/u)
  if(!match){setMentionSearch(null);mentionStart.current=-1;return}
  const term=match[1]
  // A completed @name followed by whitespace is no longer a search.
  if(term.includes('  ')){setMentionSearch(null);return}
  mentionStart.current=caret-term.length-1
  setMentionSearch(term)
 }
 const selectMention=(member:{name:string;userId:string})=>{
  const caret=roomNoteInput.current?.selectionStart??roomNotes.length
  const start=mentionStart.current
  if(start<0)return
  const next=roomNotes.slice(0,start)+'@'+member.name+' '+roomNotes.slice(caret)
  setRoomNotes(next);setMentionSearch(null)
  requestAnimationFrame(()=>{roomNoteInput.current?.focus();roomNoteInput.current?.setSelectionRange(start+member.name.length+2,start+member.name.length+2)})
 }
 const saveRoomNotes=async()=>{
  if(!daily)return
  const previous=String(daily.notes||'')
  const ok=await run('/api/housekeeping/day',{serviceDate:date,roomId,patch:{notes:roomNotes}},'Room notes saved')
  if(!ok)return
  setActiveEditor(null);setMentionSearch(null)
  const previouslyMentioned=new Set((data?.mentionableStaff||[]).filter(s=>previous.toLocaleLowerCase().includes('@'+s.name.toLocaleLowerCase())).map(s=>s.userId))
  const tagged=(data?.mentionableStaff||[]).filter(s=>s.userId&&roomNotes.toLocaleLowerCase().includes('@'+s.name.toLocaleLowerCase())&&!previouslyMentioned.has(s.userId)).map(s=>s.userId)
  const allNew=/(?:^|\s)@everyone\b/i.test(roomNotes)&&!/(?:^|\s)@everyone\b/i.test(previous)
  if(!tagged.length&&!allNew)return
  try{
   const response=await fetch('/api/ops/mentions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roomId,date,note:roomNotes,userIds:tagged,everyone:allNew})})
   const value=await response.json().catch(()=>({}))
   if(!response.ok)throw new Error(value.error||'Mention notification failed')
   setMessage('Room notes saved · '+value.count+' staff notification'+(value.count===1?'':'s')+' sent')
   window.dispatchEvent(new CustomEvent('ths:notifications-refresh'))
  }catch(e:any){setError('Room notes saved, but @mention delivery failed: '+String(e.message||e))}
 }
 const mentionMatches=mentionSearch===null?[]:[{name:'everyone',userId:'__everyone__'},...(data?.mentionableStaff||[])].filter(s=>s.name.toLocaleLowerCase().includes(mentionSearch.toLocaleLowerCase())).slice(0,50)
 const daily=data?.daily
 const isStayover=String(daily?.reservation_status||'').trim().toLowerCase()==='stayover'
 const currentHousekeeper=String(daily?.assigned_to||'').trim()
 const cleanerDisplay=currentHousekeeper||'Unassigned'
 const canManage=Boolean(data?.permissions.canManage)
 const canInspect=Boolean(data?.permissions.canInspect)
 const blocked=Boolean(daily?.strip_hold?.toLowerCase().includes('hold')||daily?.reservation_status?.toLowerCase()==='blocked'||daily?.room_condition==='Blocked')
 const serviceCode=String(daily?.service_type||'').trim().toUpperCase()
 const markedOut=/^OUT(?:-[A-Z]{2,4})?$/.test(serviceCode)
 const envelopeInitials=/^OUT-([A-Z]{2,4})$/.exec(serviceCode)?.[1]||''
 const envelopeCollected=Boolean(envelopeInitials)
 const selectedPackageNames=[...new Set([...(data?.importedPackageIds||[]),...(data?.manualPackageIds||[])])].map(id=>data?.packageOptions.find(p=>p.id===id)?.name).filter((name):name is string=>Boolean(name))
 const needsCorrection=Boolean(daily?.check_issue_open)
 const inspectionDue=Boolean(data?.inspectionEligible&&!daily?.inspected&&(daily?.complete||daily?.ready_for_inspection))
 const awaitingClean=Boolean(daily&&!blocked&&!isStayover&&!daily.complete&&(
   /dirty|cleaning/i.test(String(daily.room_condition||''))||markedOut
 ))
 const refreshPending=Boolean(isStayover&&serviceCode==='RF'&&!daily?.complete)
 const refreshInitials=String(daily?.refresh_completed_initials||'').trim().toUpperCase()
 const attentionTitle=needsCorrection?'Housekeeping correction needed':
   blocked?'Room blocked':
   inspectionDue?'Ready for inspection':
   awaitingClean?'Cleaning not completed':
   refreshPending?'Refresh requested':''
 const attentionDescription=needsCorrection?present(daily?.check_issue_note):
   blocked?'This room is held from normal service.':
   inspectionDue?'Review the room and record the final inspection.':
   awaitingClean?'The room clean has not been marked complete.':
   refreshPending?'The requested refresh has not been marked complete.':''

 async function saveTiming(){
  await run('/api/ops/room-details',{roomId,date,action:'times',expectedArrivalTime:times.expectedArrivalTime||null,actualArrivalTime:times.actualArrivalTime||null,lateCheckoutTime:times.lateCheckoutTime||null},'Room timing saved')
 }
 async function serviceAction(action:'trayReturned'|'trayReset'|'tubRequest'|'tubComplete'|'tubReopen'){
  await run('/api/ops/room-details',{roomId,date,action},action==='tubComplete'?'Tub cleaning recorded':action==='tubRequest'?'Tub cleaning requested':action==='tubReopen'?'Tub cleaning reopened':action==='trayReturned'?'Breakfast tray return recorded':'Tray return cleared')
 }
 async function advanceCondition(){
  if(!daily||!canManage||busy||blocked||isStayover)return
  const current=String(daily.room_condition||'').toLowerCase()
  if(current==='dirty'||current==='vacant (dirty)')await changeCondition('Cleaning')
  else if(current==='cleaning')await run('/api/housekeeping/day',{serviceDate:date,roomId,patch:{complete:true}},'Room queued for inspection')
  else if(current==='ready for room check'&&!daily.inspected)setActiveEditor('inspection')
 }
 async function changeCondition(condition:string){
  if(!daily||!canManage)return
  const patch:Record<string,unknown>={roomCondition:condition}
  if(condition==='Blocked')patch.stripHold='Hold'
  else if(blocked){patch.stripHold='';if(daily.reservation_status==='Blocked')patch.reservationStatus=data?.pmsActivity==='Blocked'?'Vacant':(data?.pmsActivity||'Vacant')}
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
 async function saveGuestField(field:EditableGuestField,value:string){
  if(!data?.stay||!canManage)return false
  if(field==='occupancy'){
   const count=Number(value)
   if(!Number.isInteger(count)||count<1||count>20){setError('Guest count must be between 1 and 20.');return false}
  }
  return await run('/api/reservations/stay',{id:data.stay.id,patch:{[field]:field==='occupancy'?Number(value):value}},'Guest information saved')
 }
 async function toggleTag(kind:'lateArrival'|'stripHold'|'breakfastTag'){
  if(!daily||!canManage)return
  const isBlocked=blocked
  const patch=kind==='lateArrival'?{lateArrival:!daily.late_arrival}:
   kind==='stripHold'?(isBlocked?{stripHold:'',...(daily.reservation_status==='Blocked'?{reservationStatus:data?.pmsActivity==='Blocked'?'Vacant':(data?.pmsActivity||'Vacant')}:{})}:{stripHold:'Hold'}):
   {breakfastTag:!daily.breakfast_tag}
  await run('/api/housekeeping/day',{serviceDate:date,roomId,patch},'Room tag updated')
 }
 async function setService(code:string){
  if(!daily||!canManage)return
  if(code==='RF'&&!isStayover){setError('Refresh service is only available on stayover rooms.');return}
  // Re-selecting OUT must never erase the manager's existing tip collection initials.
  if(code==='OUT'&&markedOut){setActiveEditor(null);return}
  if(await run('/api/housekeeping/day',{serviceDate:date,roomId,patch:{serviceType:code}},'Service updated'))setActiveEditor(null)
 }
 async function markOut(){
  if(!daily||!canManage||busy||markedOut||blocked)return
  if(await run('/api/housekeeping/day',{serviceDate:date,roomId,patch:{serviceType:'OUT'}},'Room marked OUT'))setActiveEditor(null)
 }
 async function clearOut(){
  if(!daily||!canManage||busy||!markedOut)return
  if(await run('/api/housekeeping/day',{serviceDate:date,roomId,patch:{serviceType:''}},'OUT removed from room'))setActiveEditor(null)
 }
 async function markRefreshComplete(){
  if(!daily||!canManage||busy||!isStayover||serviceCode!=='RF'||daily.complete||blocked)return
  await run('/api/housekeeping/day',{
   serviceDate:date,roomId,
   patch:{complete:true,readyForInspection:false,roomCondition:'Occupied'}
  },'Refresh marked complete')
 }
 async function markEnvelopeCollected(){
  if(!daily||!canManage||busy||envelopeCollected)return
  if(!markedOut){setError('Mark the room OUT before confirming tip-envelope collection.');return}
  const initials=String(data?.managerInitials||'').trim().toUpperCase()
  if(!/^[A-Z]{2,4}$/.test(initials)){setError('Your manager initials could not be determined. Please check your staff profile.');return}
  if(await run('/api/housekeeping/day',{serviceDate:date,roomId,patch:{serviceType:'OUT-'+initials}},'Tip envelope recorded as collected by '+initials))setActiveEditor(null)
 }
 async function clearEnvelopeCollected(){
  if(!daily||!canManage||!envelopeCollected||busy)return
  if(await run('/api/housekeeping/day',{serviceDate:date,roomId,patch:{serviceType:'OUT'}},'Tip envelope collection cleared; room remains OUT'))setActiveEditor(null)
 }
 async function savePackages(){
  if(!daily||!canManage)return
  if(await run('/api/housekeeping/day',{serviceDate:date,roomId,patch:{packageIds:manualPackageDraft}},'Room packages saved'))setActiveEditor(null)
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
     <section className="ops-hub-accordion">
      <button type="button" className="ops-hub-accordion-toggle" aria-expanded={sections.room} onClick={()=>toggleSection('room')}>
       <span><SlidersHorizontal size={17}/><strong>Room & checks</strong><small>{present(daily?.room_condition)} · {currentHousekeeper||'Housekeeper unassigned'}</small></span>
       <ChevronDown size={19} className={sections.room?'expanded':''}/>
      </button>
      {sections.room&&<div className="ops-hub-accordion-inner">
      <div className="ops-hub-priority">
       <div className="ops-hub-primary-cards">
       <button type="button" className={'ops-hub-primary-tile '+'ops-hub-field ops-hub-action-card'+(activeEditor==='condition'?' is-selected':'')} disabled={!canManage||!daily||busy} onClick={()=>setActiveEditor(v=>v==='condition'?null:'condition')}>
        <span>Condition</span><span className="ops-hub-action-value"><strong>{present(daily?.room_condition)}</strong>{canManage&&daily&&<Pencil size={15}/>}</span>
       </button>
       <button type="button" className={'ops-hub-primary-tile '+'ops-hub-field ops-hub-action-card'+(activeEditor==='housekeeper'?' is-selected':'')} disabled={!canManage||!daily||busy} onClick={()=>setActiveEditor(v=>v==='housekeeper'?null:'housekeeper')}>
        <span>Housekeeper</span><span className="ops-hub-action-value"><strong>{cleanerDisplay}</strong>{canManage&&daily&&<Pencil size={15}/>}</span>
        {isStayover
         ? <small className="ops-hub-last-assigned">{data.lastCleaned?`Last completed clean: ${data.lastCleaned.name||'Cleaner unknown'} · ${shortDate(data.lastCleaned.date)}`:'Last completed clean not recorded'}</small>
         : data.lastAssigned&&<small className="ops-hub-last-assigned">Previously assigned: {data.lastAssigned.name} · {shortDate(data.lastAssigned.date)}</small>}
       </button>
       </div>
       <div className="ops-hub-context">
        <span><strong>Activity</strong> {present(daily?.reservation_status)}</span>
        <span><strong>Inspection</strong> {daily?.inspected?'Passed':daily?.check_issue_open?'Issue open':data.inspectionEligible?'Pending':'Not required'}</span>
        {data.vacancyDays>0&&<span><strong>Vacant</strong> {data.vacancyDays} consecutive day{data.vacancyDays===1?'':'s'} · condition tracked separately</span>}
        {data.tubCleanDue&&<span><strong>Tub clean</strong> Needed</span>}
        {data.serviceDetails?.tub_clean_completed_at&&<span className="ops-hub-context-positive"><Check size={12}/> Tub cleaned</span>}
        {data.serviceDetails?.tray_returned_at&&<span className="ops-hub-context-positive"><Check size={12}/> Tray returned</span>}
        {daily?.breakfast_tag&&<span className="ops-hub-context-positive"><Check size={12}/> Breakfast included</span>}
        {selectedPackageNames.length>0&&<span className="ops-hub-context-package"><strong>Packages</strong> {selectedPackageNames.join(', ')}</span>}
       </div>
      </div>
      {attentionTitle&&<div className={'ops-hub-next-action'+(needsCorrection?' needs-correction':blocked?' is-blocked':'')}>
       <div className="ops-hub-next-heading"><AlertTriangle size={17}/><strong>{attentionTitle}</strong></div>
       <p>{attentionDescription}</p>
       {inspectionDue&&canInspect&&<button type="button" onClick={()=>setActiveEditor('inspection')} disabled={busy}>Open inspection <ChevronRight size={16}/></button>}
       {needsCorrection&&canInspect&&<button type="button" onClick={()=>setActiveEditor('inspection')} disabled={busy}>Review correction <ChevronRight size={16}/></button>}
      </div>}
      {!!daily?.notes?.trim()&&<button type="button" className="ops-hub-prominent-note" disabled={!canManage||busy} onClick={()=>setActiveEditor('room_notes')} aria-label={canManage?'Edit room note':'Room note'}>
       <div><span>Room note</span><p>{daily.notes}</p></div>
       {canManage&&<Pencil size={17} className="ops-hub-note-pencil"/>}
      </button>}
      {canManage&&daily&&!blocked&&!isStayover&&/^(dirty|vacant \(dirty\)|cleaning|ready for room check)$/i.test(String(daily.room_condition||''))&&<button type="button" className="ops-hub-secondary" disabled={busy} onClick={()=>void advanceCondition()}>{/dirty/i.test(String(daily.room_condition||''))?'Start cleaning':String(daily.room_condition).toLowerCase()==='cleaning'?'Finished cleaning · send to inspection':'Open room inspection'} <ChevronRight size={15}/></button>}
      <div className="ops-hub-quick-section">
       <span className="ops-hub-overline">Quick actions</span>
       <div className="ops-hub-quick-actions">
       <button type="button" className={'ops-hub-quick-action '+'ops-hub-field ops-hub-action-card'+(markedOut?' ops-hub-complete-card':'')+(activeEditor==='out'?' is-selected':'')} disabled={!canManage||!daily||busy||(blocked&&!markedOut)||((isStayover||serviceCode==='RF')&&!markedOut)} onClick={()=>markedOut?setActiveEditor(v=>v==='out'?null:'out'):void markOut()} aria-label={markedOut?'Room marked OUT; tap to manage OUT':'Mark room OUT'}>
        <span className="ops-hub-quick-icon"><DoorOpen size={18}/></span><span className="ops-hub-quick-name">OUT</span><small>{markedOut?'Marked':'Mark room'}</small>{markedOut&&<Check size={14} className="ops-hub-quick-check"/>}
       </button>
       <button type="button" className={'ops-hub-quick-action '+'ops-hub-field ops-hub-action-card'+(envelopeCollected?' ops-hub-complete-card':'')+(activeEditor==='tip_envelope'?' is-selected':'')} disabled={!canManage||!daily||busy} onClick={()=>setActiveEditor(v=>v==='tip_envelope'?null:'tip_envelope')} aria-label={envelopeCollected?'Tip envelope collected by '+envelopeInitials:'Tip envelope not collected'}>
        <span className="ops-hub-quick-icon"><Wallet size={18}/></span><span className="ops-hub-quick-name">Tips</span><small>{envelopeCollected?'Collected · '+envelopeInitials:'Not collected'}</small>{envelopeCollected&&<Check size={14} className="ops-hub-quick-check"/>}
       </button>
       {isStayover&&serviceCode==='RF'&&<button type="button" className={'ops-hub-quick-action'+(daily?.complete?' ops-hub-complete-card':'')} aria-pressed={Boolean(daily?.complete)} disabled={!canManage||!daily||busy||blocked||Boolean(daily?.complete)} onClick={()=>void markRefreshComplete()} aria-label={daily?.complete?'Refresh complete':'Mark refresh complete'}>
        <span className="ops-hub-quick-icon"><Check size={18}/></span><span className="ops-hub-quick-name">{daily?.complete?'RF complete'+(refreshInitials?'-'+refreshInitials:''):'RF complete'}</span><small>{daily?.complete?'Completed':'Tap to complete'}</small>
       </button>}
       <button type="button" className={'ops-hub-quick-action'+(daily?.late_arrival?' selected':'')} aria-pressed={Boolean(daily?.late_arrival)} disabled={!canManage||!daily||busy} onClick={()=>void toggleTag('lateArrival')}>
        <span className="ops-hub-quick-icon"><Clock3 size={18}/></span><span className="ops-hub-quick-name">Late arrival</span>{daily?.late_arrival&&<Check size={15} className="ops-hub-quick-check"/>}
       </button>
       <button type="button" className={'ops-hub-quick-action'+(blocked?' selected warning':'')} aria-pressed={blocked} disabled={!canManage||!daily||busy} onClick={()=>void toggleTag('stripHold')}>
        <span className="ops-hub-quick-icon"><Ban size={18}/></span><span className="ops-hub-quick-name">Block room</span>{blocked&&<Check size={15} className="ops-hub-quick-check"/>}
       </button>
       <button type="button" className={'ops-hub-quick-action'+(data.tubCleanDue?' selected':'')+(data.serviceDetails?.tub_clean_completed_at?' ops-hub-complete-card':'')} disabled={!canManage||!daily||busy||blocked} onClick={()=>void serviceAction(data.serviceDetails?.tub_clean_completed_at?'tubReopen':data.tubCleanDue?'tubComplete':'tubRequest')}>
        <span className="ops-hub-quick-icon">🛁</span><span className="ops-hub-quick-name">Tub clean</span><small>{data.serviceDetails?.tub_clean_completed_at?'Done · reopen':data.tubCleanDue?'Needed · mark done':'Request'}</small>
       </button>
       <button type="button" className={'ops-hub-quick-action'+(data.serviceDetails?.tray_returned_at?' ops-hub-complete-card':'')} disabled={!canManage||!daily||busy} onClick={()=>void serviceAction(data.serviceDetails?.tray_returned_at?'trayReset':'trayReturned')}>
        <span className="ops-hub-quick-icon"><Check size={18}/></span><span className="ops-hub-quick-name">Breakfast tray</span><small>{data.serviceDetails?.tray_returned_at?'Returned · undo':'Mark returned'}</small>
       </button>
       </div>
      </div>
      <div className="ops-hub-quick-section">
       <span className="ops-hub-overline">Room timing</span>
       <div className="ops-hub-detail-cards">
        {([{key:'expectedArrivalTime',label:'Expected arrival'},{key:'actualArrivalTime',label:'Actual arrival'},{key:'lateCheckoutTime',label:'Late checkout'}] as const).map(item=><label className="ops-hub-field" key={item.key}><span>{item.label}</span><input type="time" aria-label={item.label} value={times[item.key]} disabled={!canManage||!daily||busy} onChange={e=>setTimes(current=>({...current,[item.key]:e.target.value}))}/></label>)}
       </div>
       {canManage&&daily&&<button type="button" className="ops-hub-secondary" disabled={busy||(['expectedArrivalTime','actualArrivalTime','lateCheckoutTime'] as const).every(key=>times[key]===(data.serviceDetails?.[key==='expectedArrivalTime'?'expected_arrival_time':key==='actualArrivalTime'?'actual_arrival_time':'late_checkout_time']?.slice(0,5)||''))} onClick={()=>void saveTiming()}><Save size={15}/> Save room times</button>}
       <small className="ops-hub-muted">Arrival and checkout times are operational notes, not changes to the PMS reservation.</small>
      </div>
      <section className="ops-hub-details-section">
       <button type="button" className="ops-hub-details-toggle" onClick={()=>setShowDetails(v=>!v)} aria-expanded={showDetails}>
        <span><SlidersHorizontal size={18}/> More room details</span>
        <ChevronDown size={18} className={showDetails?'expanded':''}/>
       </button>
       {showDetails&&<div ref={roomDetailsRef} className="ops-hub-details-inner">
        <div className="ops-hub-detail-cards">
       <button type="button" className={'ops-hub-detail-tile '+'ops-hub-field ops-hub-action-card'+(activeEditor==='activity'?' is-selected':'')} disabled={!canManage||!daily||busy} onClick={()=>setActiveEditor(v=>v==='activity'?null:'activity')}>
        <span>Activity</span><span className="ops-hub-action-value"><strong>{present(daily?.reservation_status)}</strong>{canManage&&daily&&<Pencil size={15}/>}</span>
       </button>
       <button type="button" className={'ops-hub-detail-tile '+'ops-hub-field ops-hub-action-card'+(activeEditor==='inspection'?' is-selected':'')} disabled={!daily||busy} onClick={()=>setActiveEditor(v=>v==='inspection'?null:'inspection')}>
        <span>Inspection</span><span className="ops-hub-action-value"><strong>{daily?.inspected?'Passed':daily?.check_issue_open?'Issue open':data.inspectionEligible?'Pending':'Not required'}</strong>{daily&&<ChevronDown size={16}/>}</span>
       </button>
       <button type="button" className={'ops-hub-detail-tile '+'ops-hub-field ops-hub-action-card'+(activeEditor==='service'?' is-selected':'')} disabled={!canManage||!daily||busy} onClick={()=>setActiveEditor(v=>v==='service'?null:'service')}>
        <span>Service</span><span className="ops-hub-action-value"><strong>{serviceCode==='RF'&&daily?.complete?'RF complete'+(refreshInitials?'-'+refreshInitials:''):markedOut?'OUT':daily?.service_type||'No service'}</strong>{canManage&&daily&&<Pencil size={15}/>}</span>
       </button>
       <button type="button" className={'ops-hub-detail-tile '+'ops-hub-field ops-hub-action-card'+(activeEditor==='packages'?' is-selected':'')} disabled={!canManage||!daily||busy} onClick={()=>setActiveEditor(v=>v==='packages'?null:'packages')}>
        <span>Packages</span><span className="ops-hub-action-value"><strong>{[...new Set([...(data.importedPackageIds||[]),...(data.manualPackageIds||[])])].map(id=>data.packageOptions.find(p=>p.id===id)?.name).filter(Boolean).join(', ')||'None selected'}</strong>{canManage&&daily&&<Pencil size={15}/>}</span>
       </button>
       <button type="button" className={'ops-hub-detail-tile '+'ops-hub-field ops-hub-action-card'+(activeEditor==='clean_order'?' is-selected':'')} disabled={!canManage||!daily||busy} onClick={()=>setActiveEditor(v=>v==='clean_order'?null:'clean_order')}>
        <span>Clean order</span><span className="ops-hub-action-value"><strong>{daily?.clean_order??'Not assigned'}</strong>{canManage&&daily&&<Pencil size={15}/>}</span>
       </button>
       <button type="button" className={'ops-hub-detail-tile '+'ops-hub-field ops-hub-action-card'+(activeEditor==='room_notes'?' is-selected':'')} disabled={!canManage||!daily||busy} onClick={()=>setActiveEditor(v=>v==='room_notes'?null:'room_notes')}>
        <span>Room notes</span><span className="ops-hub-action-value"><strong>{daily?.notes?.trim()||'No notes'}</strong>{canManage&&daily&&<Pencil size={15}/>}</span>
       </button>
        </div>
        <div className="ops-hub-extra-tags">
         <button type="button" aria-pressed={Boolean(daily?.breakfast_tag)} disabled={!canManage||!daily||busy} onClick={()=>void toggleTag('breakfastTag')} className={daily?.breakfast_tag?'selected':''}>{daily?.breakfast_tag&&<Check size={15}/>} Breakfast {daily?.breakfast_tag?'included':'tag'}</button>
        </div>
       </div>}
      </section>
      {activeEditor&&daily&&<section className="ops-hub-quick-editor" aria-label="Room card editor">
       <div className="ops-hub-quick-head"><strong>{({condition:'Change condition',activity:'Change activity',housekeeper:'Assign housekeeper',inspection:'Room inspection',service:'Choose service',out:'OUT status',tip_envelope:'Tip envelope collection',packages:'Room packages',clean_order:'Cleaning order',room_notes:'Room notes'} as Record<string,string>)[activeEditor]}</strong><button type="button" aria-label="Close editor" onClick={()=>setActiveEditor(null)}><X size={17}/></button></div>
       {activeEditor==='condition'&&canManage&&<div className="ops-hub-choices">{conditions.map(value=><button type="button" key={value} disabled={busy} aria-pressed={daily.room_condition===value} className={daily.room_condition===value?'is-current':''} onClick={()=>void changeCondition(value)}><span>{value}</span>{daily.room_condition===value&&<Check size={16}/>}</button>)}</div>}
       {activeEditor==='activity'&&canManage&&<><div className="ops-hub-choices">{activities.map(value=><button type="button" key={value} disabled={busy} aria-pressed={daily.reservation_status===value} className={daily.reservation_status===value?'is-current':''} onClick={()=>void changeActivity(value)}><span>{value}</span>{daily.reservation_status===value&&<Check size={16}/>}</button>)}</div><small>Operational status only; the PMS booking is unchanged.</small></>}
       {activeEditor==='housekeeper'&&canManage&&<><div className="ops-hub-choices">{['',...(data.staffNames||[])].map(value=><button type="button" key={value||'unassigned'} disabled={busy} aria-pressed={(daily.assigned_to||'')===value} className={(daily.assigned_to||'')===value?'is-current':''} onClick={()=>void assignHousekeeper(value)}><span>{value||'Unassigned'}</span>{(daily.assigned_to||'')===value&&<Check size={16}/>}</button>)}</div>{isStayover&&<small>Historical cleaner and date are retained. Assigning staff does not mark a clean complete.</small>}</>}
       {activeEditor==='out'&&canManage&&<div className="ops-hub-inline-form">
        <p className="ops-hub-muted">{envelopeCollected?'Envelope collection is currently recorded under '+envelopeInitials+'. Clearing OUT will also remove its collected indicator.':'The room is marked OUT. You can clear it if this was a mistake.'}</p>
        <button type="button" className="ops-hub-secondary" disabled={busy} onClick={()=>void clearOut()}>Remove OUT{envelopeCollected?' and envelope mark':''}</button>
       </div>}
       {activeEditor==='tip_envelope'&&canManage&&<div className="ops-hub-inline-form">
        {!markedOut?<p className="ops-hub-muted">Mark the room OUT first, then confirm management collected the tip envelope.</p>:
         envelopeCollected?<><p className="ops-hub-good"><Check size={16}/> Collected by management · {envelopeInitials}</p><button type="button" className="ops-hub-secondary" disabled={busy} onClick={()=>void clearEnvelopeCollected()}>Undo collection mark (keep room OUT)</button></>:
         <><p className="ops-hub-muted">Only mark this collected after the envelope has physically been collected by management.</p><button type="button" className="ops-hub-primary" disabled={busy||!/^[A-Z]{2,4}$/.test(data.managerInitials||'')} onClick={()=>void markEnvelopeCollected()}><Check size={16}/> Envelope collected · {data.managerInitials||'Manager'}</button>{!/^[A-Z]{2,4}$/.test(data.managerInitials||'')&&<p className="ops-hub-error">Manager initials are unavailable. Check your staff profile.</p>}</>}
       </div>}
       {activeEditor==='service'&&canManage&&<div className="ops-hub-choices">{[{label:'No service',value:''},{label:'OUT',value:'OUT'},{label:'Refresh · RF',value:'RF'}].map(item=><button type="button" key={item.label} disabled={busy||(item.value==='RF'&&!isStayover)} aria-pressed={(daily.service_type||'')===item.value} className={(daily.service_type||'')===item.value?'is-current':''} onClick={()=>void setService(item.value)}><span>{item.label}</span>{(daily.service_type||'')===item.value&&<Check size={16}/>}</button>)}</div>}
       {activeEditor==='packages'&&canManage&&<><div className="ops-hub-package-options">{data.packageOptions.filter(p=>p.available||data.importedPackageIds.includes(p.id)||manualPackageDraft.includes(p.id)).map(p=>{
         const isImported=data.importedPackageIds.includes(p.id)
         const checked=isImported||manualPackageDraft.includes(p.id)
         return <label key={p.id}><input type="checkbox" checked={checked} disabled={busy||isImported} onChange={e=>setManualPackageDraft(current=>e.target.checked?[...new Set([...current,p.id])]:current.filter(id=>id!==p.id))}/><span>{p.name}</span>{isImported&&<small>From PMS</small>}</label>
       })}</div><button type="button" className="ops-hub-primary" disabled={busy||JSON.stringify([...manualPackageDraft].sort())===JSON.stringify([...(data.manualPackageIds||[])].sort())} onClick={()=>void savePackages()}><Save size={15}/> Save selected packages</button><small>Multiple selections allowed. Imported packages cannot be removed here.</small></>}
       {activeEditor==='clean_order'&&canManage&&<div className="ops-hub-inline-form"><input aria-label="Cleaning order" type="number" inputMode="numeric" min="1" value={roomOrder} disabled={busy} onChange={e=>setRoomOrder(e.target.value)}/><button type="button" className="ops-hub-primary" disabled={busy} onClick={()=>void run('/api/housekeeping/day',{serviceDate:date,roomId,patch:{cleanOrder:roomOrder.trim()?Number(roomOrder):null}},'Cleaning order updated').then(ok=>{if(ok)setActiveEditor(null)})}>Save order</button></div>}
       {activeEditor==='room_notes'&&canManage&&<div className="ops-hub-inline-form"><textarea ref={roomNoteInput} rows={3} aria-label="Room notes" value={roomNotes} disabled={busy} onChange={e=>{setRoomNotes(e.target.value);updateMentionQuery(e.target.value,e.target.selectionStart)}} onClick={e=>updateMentionQuery(roomNotes,e.currentTarget.selectionStart)} placeholder="Type @ to mention a staff member"/>{mentionSearch!==null&&<div className="ops-hub-mention-picker" role="listbox" aria-label="Mention a staff member">{mentionMatches.length?mentionMatches.map(person=><button type="button" role="option" aria-selected={false} key={person.userId||person.name} onClick={()=>selectMention(person)}>@{person.name}{!person.userId?' · no app login':''}</button>):<span>No matching active staff account</span>}</div>}<button type="button" className="ops-hub-primary" disabled={busy||roomNotes===String(daily.notes||'')} onClick={()=>void saveRoomNotes()}><Save size={15}/>Save room notes</button></div>}
       {activeEditor==='inspection'&&<div className="ops-hub-inspection-actions">
        {daily.inspected&&<p className="ops-hub-good"><Check size={16}/>Passed inspection</p>}
        {!data.inspectionEligible&&<p className="ops-hub-muted">No inspection required for this date.</p>}
        {data.inspectionEligible&&canInspect&&(daily.check_issue_open&&!data.inspectionReady
         ? <><p className="ops-hub-muted">Correction still open.</p><button type="button" className="ops-hub-secondary" disabled={busy} onClick={()=>void inspect('fixed')}>Mark correction fixed</button></>
         : <><button type="button" className="ops-hub-primary" disabled={busy||Boolean(daily.inspected)} onClick={()=>void inspect('pass')}><Check size={16}/>{daily.inspected?'Already passed':'Pass inspection'}</button><label className="ops-hub-label">Found an issue?<textarea rows={2} value={issueNote} disabled={busy} onChange={e=>setIssueNote(e.target.value)} placeholder="Describe what needs correction"/></label><button type="button" className="ops-hub-secondary" disabled={busy||!issueNote.trim()} onClick={()=>void inspect('fail')}><AlertTriangle size={16}/> Flag issue</button></>)}
        {data.inspectionEligible&&!canInspect&&<p className="ops-hub-muted">Room-check permission required.</p>}
       </div>}
      </section>}
      {!daily&&<p className="ops-hub-muted">No operational record exists for this date. Management controls become available once the room day is scheduled.</p>}
     </div>}
     </section>
     {data.stay&&<section className="ops-hub-accordion">
      <button type="button" className="ops-hub-accordion-toggle" aria-expanded={sections.guest} onClick={()=>toggleSection('guest')}>
       <span><DoorOpen size={17}/><strong>Guest & reservation</strong><small>{data.stay.guest_name||'Guest'} · Arrival {data.stay.arrival_date||'Not recorded'}</small></span>
       <ChevronDown size={19} className={sections.guest?'expanded':''}/>
      </button>
      {sections.guest&&<div className="ops-hub-accordion-inner ops-hub-guest">
      <div className="ops-hub-kpis">
       <div className="ops-hub-field"><span>Arrival</span><strong>{present(data.stay.arrival_date)}</strong></div>
       <div className="ops-hub-field"><span>Departure</span><strong>{present(data.stay.checkout_date)}</strong></div>
       <div className="ops-hub-field"><span>Breakfast</span><strong>{daily?.breakfast_tag?'Included / tagged':'Not tagged'}</strong></div>
       <div className="ops-hub-field"><span>Reservation</span><strong>{present(data.stay.reservation_number)}</strong></div>
      </div>
      <div className="ops-hub-guest-grid">
       {([
        {field:'guest_name',label:'Guest name'},
        {field:'guest_phone',label:'Phone'},
        {field:'occupancy',label:'Number of guests'},
        {field:'check_in_time',label:'Check-in time'},
        {field:'rate_plan',label:'Rate plan'},
        {field:'reason_for_visit',label:'Reason for visit',large:true},
        {field:'dietary_restrictions',label:'Dietary requests',large:true},
        {field:'guest_comments',label:'Guest comments',large:true},
        {field:'innkeeper_notes',label:'Innkeeper notes',large:true}
       ] as Array<{field:EditableGuestField;label:string;large?:boolean}>).map(item=><GuestCard key={item.field} field={item.field} label={item.label} value={data.stay?.[item.field]} large={item.large} canEdit={canManage} busy={busy} onSave={saveGuestField}/>)}
      </div>
      {data.stay.products_raw&&<div className="ops-hub-section"><h3>Imported products and requests</h3><p className="ops-hub-note">{data.stay.products_raw}</p></div>}
      {!canManage&&<p className="ops-hub-muted">Guest information is view only. Manager permission is required to change it.</p>}
      <p className="ops-hub-muted">Reservation dates are view only because changing them requires reservation-calendar relinking. Room packages and service can be managed from Room & checks.</p>
      </div>}
     </section>}
     <section className="ops-hub-accordion">
      <button type="button" className="ops-hub-accordion-toggle" aria-expanded={sections.log} onClick={()=>toggleSection('log')}>
       <span><Clock3 size={17}/><strong>Room activity</strong><small>Assignments, inspections, corrections and notes</small></span>
       <ChevronDown size={19} className={sections.log?'expanded':''}/>
      </button>
      {sections.log&&<div className="ops-hub-accordion-inner"><OpsActivityLog serviceDate={date} roomId={roomId} compact/></div>}
     </section>
    </>}
   </div>
  </section>
 </div>
}
