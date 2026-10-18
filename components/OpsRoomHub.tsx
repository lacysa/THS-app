'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {AlertTriangle,Ban,Check,ChevronDown,ChevronRight,Clock3,DoorOpen,Pencil,Save,Wallet,X} from 'lucide-react'
import OpsActivityLog from '@/components/OpsActivityLog'
import {derivedLiveCondition,isCheckoutAwaitingOut} from '@/lib/room-state'

type Stay={id:string;reservation_number:string|null;guest_name:string|null;guest_phone:string|null;arrival_date:string|null;checkout_date:string|null;occupancy:number|null;rate_plan:string|null;check_in_time:string|null;products_raw:string|null;dietary_restrictions:string|null;guest_comments:string|null;innkeeper_notes:string|null;reason_for_visit:string|null}
type Daily={assigned_to:string|null;notes:string|null;reservation_status:string|null;service_type:string|null;clean_order:number|null;room_condition:string|null;strip_hold:string|null;complete:boolean|null;ready_for_inspection:boolean|null;inspected:boolean|null;inspection_signed_by?:string|null;inspected_at:string|null;check_issue_open:boolean|null;check_issue_note:string|null;breakfast_tag:boolean|null;late_arrival:boolean|null;housekeeper_attested_by:string|null;refresh_completed_initials:string|null}
type ServiceDetails={late_checkout?:boolean;expected_arrival_time:string|null;actual_arrival_time:string|null;late_checkout_time:string|null;tray_returned_at:string|null;tub_clean_requested_at:string|null;tub_clean_completed_at:string|null;tub_clean_assigned_to?:string|null}
type PackageOption={id:string;name:string;available:boolean}
type Data={correctionHistory?:{id:string;type:string;note:string;at:string}[];room:{id:string;name:string};date:string;daily:Daily|null;stay:Stay|null;permissions:{canManage:boolean;canInspect:boolean};inspectionEligible:boolean;inspectionReady:boolean;staffNames:string[];mentionableStaff:{name:string;userId:string}[];lastAssigned:{name:string;date:string}|null;lastCleaned:{name:string;date:string;serviceDate:string}|null;packageOptions:PackageOption[];manualPackageIds:string[];importedPackageIds:string[];managerInitials:string;pmsActivity:string;serviceDetails:ServiceDetails|null;autoTubDue:boolean;vacancyDays:number;tubCleanDue:boolean}
type View='room'|'guest'|'log'
type Editor='condition'|'activity'|'housekeeper'|'inspection'|'service'|'out'|'tip_envelope'|'packages'|'room_notes'|'clean_order'|'tub_assignee'|null
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
export default function OpsRoomHub({roomId,date,reservationId,onClose,onUpdate,initialView='room',initialAction='all',initialEditor=null}:{roomId:string;date:string;reservationId?:string;onClose:()=>void;onUpdate?:()=>void;initialView?:View;initialAction?:string;initialEditor?:Editor}){
 const [data,setData]=useState<Data|null>(null)
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [reload,setReload]=useState(0)
 const [sections,setSections]=useState<Record<View,boolean>>({room:initialView==='room',guest:initialView==='guest',log:initialView==='log'})
 const toggleSection=(key:View)=>{setSections({room:key==='room',guest:key==='guest',log:key==='log'});setActiveEditor(null)}
 const [activeEditor,setActiveEditor]=useState<Editor>(initialEditor)
 const [roomNotes,setRoomNotes]=useState('')
 const [mentionSearch,setMentionSearch]=useState<string|null>(null)
 const roomNoteInput=useRef<HTMLTextAreaElement|null>(null)
 const mentionStart=useRef(-1)
 const [issueNote,setIssueNote]=useState('')
 const [approval,setApproval]=useState<{signed:boolean;initials:string}|null>(null)
 const [manualPackageDraft,setManualPackageDraft]=useState<string[]>([])
 const [roomOrder,setRoomOrder]=useState('')
 const [times,setTimes]=useState({expectedArrivalTime:'',actualArrivalTime:'',lateCheckoutTime:''})
 const refresh=useCallback(()=>setReload(n=>n+1),[])
 useEffect(()=>{let active=true;fetch('/api/ops/inspection-signoff?date='+encodeURIComponent(date),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{if(active)setApproval(v?.rooms?.[roomId]||null)}).catch(()=>{});return()=>{active=false}},[date,roomId,reload])
 async function approveInspection(){if(busy)return;setBusy(true);setError('');try{const r=await fetch('/api/ops/inspection-signoff',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date,roomId})});const value=await r.json();if(!r.ok)throw new Error(value.error||'Unable to sign off');refresh();window.dispatchEvent(new CustomEvent('ths:live-data-refresh'))}catch(e:any){setError(String(e.message||e))}finally{setBusy(false)}}
 useEffect(()=>{setSections({room:initialView==='room',guest:initialView==='guest',log:initialView==='log'});setActiveEditor(initialEditor);setMessage('')},[roomId,date,reservationId])
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
 // Keep an open room popup consistent with edits made on other boards. Never
 // replace an in-progress note, edit form, or unsaved action with a poll.
 useEffect(()=>{
  const handle=(event:Event)=>{
   const eventDate=(event as CustomEvent<{date?:string}>).detail?.date
   if(eventDate&&eventDate!==date)return
   if(!busy&&!activeEditor&&document.visibilityState==='visible')refresh()
  }
  window.addEventListener('ths:live-data-refresh',handle)
  return()=>window.removeEventListener('ths:live-data-refresh',handle)
 },[date,busy,activeEditor,refresh])

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
  const todayNew=/(?:^|\s)@today\b/i.test(roomNotes)&&!/(?:^|\s)@today\b/i.test(previous)
  if(!tagged.length&&!allNew&&!todayNew)return
  try{
   const response=await fetch('/api/ops/mentions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roomId,date,note:roomNotes,userIds:tagged,everyone:allNew,today:todayNew})})
   const value=await response.json().catch(()=>({}))
   if(!response.ok)throw new Error(value.error||'Mention notification failed')
   setMessage('Room notes saved · '+value.count+' staff notification'+(value.count===1?'':'s')+' sent')
   window.dispatchEvent(new CustomEvent('ths:notifications-refresh'))
  }catch(e:any){setError('Room notes saved, but @mention delivery failed: '+String(e.message||e))}
 }
 const mentionMatches=mentionSearch===null?[]:[{name:'everyone',userId:'__everyone__'},{name:'today',userId:'__today__'},...(data?.mentionableStaff||[])].filter(s=>s.name.toLocaleLowerCase().includes(mentionSearch.toLocaleLowerCase())).slice(0,50)
 const daily=data?.daily
 const liveCondition=daily?derivedLiveCondition({
  reservationStatus:daily.reservation_status,
  serviceType:daily.service_type,
  stripHold:daily.strip_hold,
  roomCondition:daily.room_condition,
  complete:daily.complete,
  readyForInspection:daily.ready_for_inspection,
  inspected:daily.inspected,
  checkIssueOpen:daily.check_issue_open
 }):'Not recorded'
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
 async function toggleLateCheckout(){
  await run('/api/ops/room-details',{roomId,date,action:'lateCheckoutTag',enabled:!Boolean(data?.serviceDetails?.late_checkout)},'Late checkout updated')
 }
 async function serviceAction(action:'trayReturned'|'trayReset'|'tubRequest'|'tubComplete'|'tubReopen'){
  await run('/api/ops/room-details',{roomId,date,action},action==='tubComplete'?'Tub cleaning recorded':action==='tubRequest'?'Tub cleaning requested':action==='tubReopen'?'Tub cleaning reopened':action==='trayReturned'?'Breakfast tray return recorded':'Tray return cleared')
 }
 async function assignTubOnly(name:string){
  if(!data?.tubCleanDue||!canManage)return
  if(await run('/api/ops/room-details',{roomId,date,action:'tubAssign',assignedTo:name},name?'Tub-only clean assigned to '+name:'Tub-only assignment cleared'))setActiveEditor(null)
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
 async function setCleaningOrder(order:number|null){
  if(!daily||!canManage||busy)return
  if(await run('/api/housekeeping/day',{serviceDate:date,roomId,patch:{cleanOrder:order}},order===null?'Cleaning order cleared':'Cleaning order set to '+order))setActiveEditor(null)
 }
 async function assignHousekeeper(name:string){
  if(!daily||!canManage)return
  if(await run('/api/housekeeping/day',{serviceDate:date,roomId,patch:{assignedTo:name}},name?'Housekeeper assigned':'Assignment cleared'))setActiveEditor(null)
 }
 async function inspect(decision:'pass'|'fail'|'fixed'){
  if((decision==='fail'||decision==='fixed')&&!issueNote.trim()){setError(decision==='fixed'?'Describe what was fixed before marking the correction complete.':'Describe the housekeeping issue before failing the inspection.');return}
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
  <section className="ops-hub-sheet ops-hub-compact" role="dialog" aria-modal="true" aria-label="Room operations hub">
   <header className="ops-hub-head">
    <div><small>Ops · {dateLabel(date)}</small><h2>{data?.room.name||'Room operations'}</h2><span>{data?.stay?.guest_name||'No reservation'}{data?.stay?.reservation_number?' · #'+data.stay.reservation_number:''}</span></div>
    <button type="button" aria-label="Close room operations" onClick={onClose}><X size={20}/></button>
   </header>
   <div className="ops-hub-content">
    {loading&&<p className="ops-hub-muted">Loading room details…</p>}
    {error&&<p className="ops-hub-error" role="alert">{error}</p>}
    {message&&!loading&&<p className="ops-hub-success" role="status"><Check size={16}/>{message}</p>}
    {data&&<>
     <style>{`
      .ops-hub-compact .ops-hub-content{padding-top:10px}
      .ops-hub-compact .ops-hub-accordion{border:0;background:transparent;box-shadow:none}
      .ops-hub-compact .ops-hub-accordion-inner{padding:4px 0 12px}
      .ops-hub-compact .ops-hub-priority{padding:10px 12px;border-radius:13px}
      .ops-hub-compact .ops-hub-subheading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;font-size:13px;color:#2c5261}
      .ops-hub-compact .ops-hub-subheading small{font-size:11px;color:#66818a}
      .ops-hub-compact .ops-hub-primary-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .ops-hub-compact .ops-hub-primary-tile{min-height:54px!important;padding:9px 11px!important;border-radius:10px!important}
      .ops-hub-compact .ops-hub-primary-tile>span:first-child{font-size:10px}
      .ops-hub-compact .ops-hub-primary-tile strong{font-size:13px!important}
      .ops-hub-compact .ops-hub-primary-tile small{font-size:10px}
      .ops-hub-compact .ops-hub-context{margin-top:8px;gap:6px}
      .ops-hub-compact .ops-hub-context>span{font-size:11px}
      .ops-hub-compact .ops-hub-quick-actions{display:flex;flex-wrap:wrap;gap:7px}
      .ops-hub-compact .ops-hub-quick-action{width:auto!important;flex:1 1 96px;min-width:88px;max-width:150px;min-height:45px!important;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:5px;padding:8px!important;border-radius:10px!important}
      .ops-hub-compact .ops-hub-quick-icon{display:flex;align-items:center;margin:0!important}
      .ops-hub-compact .ops-hub-quick-icon svg{width:15px;height:15px}
      .ops-hub-compact .ops-hub-quick-name{font-size:11px!important}
      .ops-hub-compact .ops-hub-quick-action small{display:none}
      .ops-hub-compact .ops-hub-quick-section{margin-top:12px}
      .ops-hub-compact .ops-hub-quick-editor{margin:10px 0;padding:12px;border-radius:12px}
      .ops-hub-compact .ops-hub-choices{display:flex;flex-wrap:wrap;gap:6px}
      .ops-hub-compact .ops-hub-choices button{width:auto;min-width:fit-content;padding:8px 11px}
      .ops-hub-compact .ops-hub-inspection-actions{padding:10px 12px!important;margin:8px 0!important}
      .ops-hub-compact .ops-hub-context-control{display:inline-flex;align-items:center;gap:4px;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
      .ops-hub-compact .ops-hub-context-control:disabled{cursor:default;opacity:1}
      .ops-hub-compact .ops-hub-context-control:not(:disabled):focus-visible{outline:2px solid #598f99;outline-offset:3px;border-radius:3px}
      .ops-hub-compact .ops-hub-prominent-note{padding:10px 12px}
      @media(max-width:540px){.ops-hub-compact .ops-hub-primary-cards{grid-template-columns:1fr}.ops-hub-compact .ops-hub-quick-action{flex-basis:100px}}
     `}</style>
     <nav aria-label="Room workspace sections" style={{display:'flex',gap:8,padding:'8px 2px 14px',flexWrap:'wrap'}}>
      {([{key:'room',label:'Room & tasks'},{key:'guest',label:'Guest & stay'},{key:'log',label:'History'}] as const).filter(item=>item.key!=='guest'||Boolean(data.stay)).map(item=>
       <button key={item.key} type="button" aria-current={sections[item.key]?'page':undefined} onClick={()=>toggleSection(item.key)} style={{flex:'1 1 145px',borderRadius:12,padding:'12px 10px',border:sections[item.key]?'2px solid #598f99':'1px solid #d9e5e8',background:sections[item.key]?'#e0f2f1':'#fff',color:'#253f4d',fontWeight:700,cursor:'pointer'}}>{item.label}</button>
      )}
     </nav>
     <section className="ops-hub-accordion">

      {sections.room&&<div className="ops-hub-accordion-inner">
      <div className="ops-hub-priority">
       <div className="ops-hub-subheading"><strong>Room readiness</strong><small>Tap a value to change it</small></div>
       <div className="ops-hub-primary-cards">
       <button type="button" className={'ops-hub-primary-tile '+'ops-hub-field ops-hub-action-card'+(activeEditor==='condition'?' is-selected':'')} disabled={!canManage||!daily||busy||isStayover||isCheckoutAwaitingOut({reservationStatus:daily?.reservation_status,serviceType:daily?.service_type})} onClick={()=>setActiveEditor(v=>v==='condition'?null:'condition')}>
        <span>Condition</span><span className="ops-hub-action-value"><strong>{present(liveCondition)}</strong>{canManage&&daily&&<Pencil size={15}/>}</span>
       </button>
       <div className="ops-hub-housekeeper-slot" style={{position:'relative',minWidth:0}}>
        <button type="button" className={'ops-hub-primary-tile '+'ops-hub-field ops-hub-action-card'+(activeEditor==='housekeeper'?' is-selected':'')} style={{width:'100%',paddingRight:65}} disabled={!canManage||!daily||busy} onClick={()=>setActiveEditor(v=>v==='housekeeper'?null:'housekeeper')}>
         <span>Housekeeper</span><span className="ops-hub-action-value"><strong>{cleanerDisplay}{currentHousekeeper&&daily?.clean_order!=null&&<sup style={{fontSize:'0.75em',marginLeft:1,verticalAlign:'super'}}>{daily.clean_order}</sup>}</strong>{canManage&&daily&&<Pencil size={15}/>}</span>
         {isStayover
          ? <small className="ops-hub-last-assigned">{data.lastCleaned?`Last completed clean: ${data.lastCleaned.name||'Cleaner unknown'} · ${shortDate(data.lastCleaned.date)}`:'Last completed clean not recorded'}</small>
          : data.lastAssigned&&<small className="ops-hub-last-assigned">Previously assigned: {data.lastAssigned.name} · {shortDate(data.lastAssigned.date)}</small>}
        </button>
        {canManage&&daily&&currentHousekeeper&&<button type="button" aria-label="Change cleaning order" title="Change cleaning order" disabled={busy} onClick={()=>setActiveEditor(v=>v==='clean_order'?null:'clean_order')} style={{position:'absolute',right:7,top:9,zIndex:1,borderRadius:8,border:'1px solid #d0dfe3',padding:'6px 8px',fontSize:11,fontWeight:700,background:activeEditor==='clean_order'?'#dceeed':'#fff',color:'#325967'}}>
         {daily.clean_order==null?'Order':daily.clean_order}
        </button>}
       </div>
       </div>
       <div className="ops-hub-context">
        <span><button type="button" className="ops-hub-context-control" disabled={!canManage||!daily||busy} onClick={()=>setActiveEditor(v=>v==='activity'?null:'activity')} aria-label={'Edit activity, currently '+present(daily?.reservation_status)}><strong>Activity</strong> {present(daily?.reservation_status)}{canManage&&daily&&<Pencil size={12}/>}</button></span>
        <span><strong>Inspection</strong> {daily?.inspected?'Passed':daily?.check_issue_open?'Issue open':data.inspectionEligible?'Pending':'Not required'}</span>
        {data.vacancyDays>0&&<span><strong>Vacant</strong> {data.vacancyDays} consecutive day{data.vacancyDays===1?'':'s'} · condition tracked separately</span>}
        {data.tubCleanDue&&<span><strong>Tub clean</strong> {data.serviceDetails?.tub_clean_assigned_to?'Assigned to '+data.serviceDetails.tub_clean_assigned_to:'Needs assignment'}</span>}
        {data.serviceDetails?.tub_clean_completed_at&&<span className="ops-hub-context-positive"><Check size={12}/> Tub cleaned</span>}
        {data.serviceDetails?.tray_returned_at&&<span className="ops-hub-context-positive"><Check size={12}/> Tray returned</span>}
        <span className={daily?.breakfast_tag?'ops-hub-context-positive':''}><button type="button" className="ops-hub-context-control" disabled={!canManage||!daily||busy} onClick={()=>void toggleTag('breakfastTag')} aria-pressed={Boolean(daily?.breakfast_tag)} aria-label={daily?.breakfast_tag?'Remove breakfast tag':'Add breakfast tag'}>{daily?.breakfast_tag&&<Check size={12}/>} Breakfast {daily?.breakfast_tag?'included':'not tagged'}{canManage&&daily&&<Pencil size={12}/>}</button></span>
        {selectedPackageNames.length>0&&<span className="ops-hub-context-package"><strong>Packages</strong> {selectedPackageNames.join(', ')}</span>}
       </div>
      </div>
      {daily&&data.inspectionEligible&&<div className="ops-hub-inspection-actions" role="group" aria-label="Room inspection decisions" style={{margin:'12px 0',padding:14,border:'1px solid #d9e6e8',borderRadius:14,background:'#f7fbfc'}}>
       <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap',marginBottom:10}}>
        <strong>Room inspection</strong>
        <small>{daily.inspected?'Passed':daily.check_issue_open?'Correction required':data.inspectionReady?'Ready for check':'Awaiting completion'}</small>
       </div>
       {(data.correctionHistory||[]).length>0&&<div style={{marginBottom:10,padding:'9px 11px',background:'#fff',border:'1px solid #dce6e9',borderRadius:10}}>
        <strong style={{fontSize:12}}>Correction notes</strong>
        {(data.correctionHistory||[]).slice(0,6).map(item=><div key={item.id} style={{marginTop:7,fontSize:12,lineHeight:1.4}}>
         <strong>{item.type==='fixed'?'Fix recorded':item.type==='found'?'Issue found':item.type.replaceAll('_',' ')}</strong>
         <span style={{color:'#657785',marginLeft:6}}>{new Date(item.at).toLocaleString('en-US',{timeZone:'America/Detroit',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</span>
         <div style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{item.note}</div>
        </div>)}
       </div>}
       {canManage&&daily.inspected&&!daily.check_issue_open&&<div style={{display:'flex',gap:7,alignItems:'center',flexWrap:'wrap',marginBottom:9}}>
        <span className="ops-hub-good">{approval?.signed?'Management signed · '+(approval.initials||'✓'):'Awaiting management sign-off'}</span>
        {!approval?.signed&&<button type="button" className="ops-hub-secondary" disabled={busy} onClick={()=>void approveInspection()}>Sign off · {data.managerInitials||'Management'}</button>}
       </div>}
       {canInspect? <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {daily.check_issue_open&&!data.inspectionReady
         ? <button type="button" className="ops-hub-secondary" disabled={busy} onClick={()=>setActiveEditor('inspection')}><Check size={16}/> Enter fix notes</button>
         : <>
           <button type="button" className="ops-hub-primary" disabled={busy||Boolean(daily.inspected)||!data.inspectionReady} onClick={()=>void inspect('pass')}><Check size={16}/> {daily.inspected?'Inspection passed':'Pass inspection'}</button>
           <button type="button" className="ops-hub-secondary" disabled={busy||(!canManage&&(Boolean(daily.inspected)||!data.inspectionReady))} onClick={()=>setActiveEditor(v=>v==='inspection'?null:'inspection')}><AlertTriangle size={16}/> Fail inspection</button>
          </>}
       </div>:<small className="ops-hub-muted">Inspection actions are available to authorized team members.</small>}
       {!daily.inspected&&!data.inspectionReady&&!daily.check_issue_open&&<small className="ops-hub-muted">The room must be submitted for inspection before it can pass or fail.</small>}
      </div>}
      {activeEditor&&daily&&<section className="ops-hub-quick-editor" aria-label="Room card editor">
       <div className="ops-hub-quick-head"><strong>{({condition:'Change condition',activity:'Change activity',housekeeper:'Assign housekeeper',tub_assignee:'Assign tub-only cleaning',inspection:'Room inspection',service:'Choose service',out:'OUT status',tip_envelope:'Tip envelope collection',packages:'Room packages',clean_order:'Cleaning order',room_notes:'Room notes'} as Record<string,string>)[activeEditor]}</strong><button type="button" aria-label="Close editor" onClick={()=>setActiveEditor(null)}><X size={17}/></button></div>
       {activeEditor==='condition'&&canManage&&<div className="ops-hub-choices">{conditions.map(value=><button type="button" key={value} disabled={busy} aria-pressed={daily.room_condition===value} className={daily.room_condition===value?'is-current':''} onClick={()=>void changeCondition(value)}><span>{value}</span>{daily.room_condition===value&&<Check size={16}/>}</button>)}</div>}
       {activeEditor==='activity'&&canManage&&<><div className="ops-hub-choices">{activities.map(value=><button type="button" key={value} disabled={busy} aria-pressed={daily.reservation_status===value} className={daily.reservation_status===value?'is-current':''} onClick={()=>void changeActivity(value)}><span>{value}</span>{daily.reservation_status===value&&<Check size={16}/>}</button>)}</div><small>Operational status only; the PMS booking is unchanged.</small></>}
       {activeEditor==='tub_assignee'&&canManage&&data.tubCleanDue&&<div className="ops-hub-inline-form">
        <p className="ops-hub-muted">Choose the person responsible for the tub only. This does not change the assigned room cleaner, completion history, inspection, or full-clean counts.</p>
        <div className="ops-hub-choices">{['',...(data.staffNames||[])].map(name=><button type="button" key={name||'tub-unassigned'} disabled={busy} aria-pressed={(data.serviceDetails?.tub_clean_assigned_to||'')===name} className={(data.serviceDetails?.tub_clean_assigned_to||'')===name?'is-current':''} onClick={()=>void assignTubOnly(name)}><span>{name||'Unassigned'}</span>{(data.serviceDetails?.tub_clean_assigned_to||'')===name&&<Check size={16}/>}</button>)}</div>
        <button type="button" className="ops-hub-secondary" disabled={busy} onClick={()=>void serviceAction('tubComplete')}><Check size={15}/> Mark tub cleaned</button>
       </div>}
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
        {activeEditor==='clean_order'&&canManage&&<div className="ops-hub-inline-form" aria-label="Set cleaning order">
         <small className="ops-hub-muted">Choose this room's cleaning order for {currentHousekeeper||'the assigned housekeeper'}. Saves immediately.</small>
         <div className="ops-hub-choices" role="group" aria-label="Cleaning sequence">
          {[1,2,3,4,5,6,7,8].map(n=><button type="button" key={n} disabled={busy} aria-pressed={daily.clean_order===n} className={daily.clean_order===n?'is-current':''} onClick={()=>void setCleaningOrder(n)}>{n}</button>)}
          <button type="button" disabled={busy||daily.clean_order==null} onClick={()=>void setCleaningOrder(null)}>Clear</button>
         </div>
        </div>}
       {activeEditor==='room_notes'&&canManage&&<div className="ops-hub-inline-form"><textarea ref={roomNoteInput} rows={3} aria-label="Room notes" value={roomNotes} disabled={busy} onChange={e=>{setRoomNotes(e.target.value);updateMentionQuery(e.target.value,e.target.selectionStart)}} onClick={e=>updateMentionQuery(roomNotes,e.currentTarget.selectionStart)} placeholder="Type @ to mention a staff member"/>{mentionSearch!==null&&<div className="ops-hub-mention-picker" role="listbox" aria-label="Mention a staff member">{mentionMatches.length?mentionMatches.map(person=><button type="button" role="option" aria-selected={false} key={person.userId||person.name} onClick={()=>selectMention(person)}>@{person.name}{!person.userId?' · no app login':''}</button>):<span>No matching active staff account</span>}</div>}<button type="button" className="ops-hub-primary" disabled={busy||roomNotes===String(daily.notes||'')} onClick={()=>void saveRoomNotes()}><Save size={15}/>Save room notes</button></div>}
       {activeEditor==='inspection'&&<div className="ops-hub-inspection-actions">
        {daily.inspected&&<p className="ops-hub-good"><Check size={16}/>Passed inspection</p>}
        {!data.inspectionEligible&&<p className="ops-hub-muted">No inspection required for this date.</p>}
        {data.inspectionEligible&&canInspect&&(daily.check_issue_open&&!data.inspectionReady
         ? <><p className="ops-hub-muted">Correction still open. Document exactly what was corrected.</p><label className="ops-hub-label">Fix notes<textarea rows={3} value={issueNote} disabled={busy} onChange={e=>setIssueNote(e.target.value)} placeholder="Describe the cleaning or repair completed"/></label><button type="button" className="ops-hub-secondary" disabled={busy||!issueNote.trim()} onClick={()=>void inspect('fixed')}>Save fix notes & mark corrected</button></>
         : <><button type="button" className="ops-hub-primary" disabled={busy||Boolean(daily.inspected)} onClick={()=>void inspect('pass')}><Check size={16}/>{daily.inspected?'Already passed':'Pass inspection'}</button><label className="ops-hub-label">Found an issue?<textarea rows={2} value={issueNote} disabled={busy} onChange={e=>setIssueNote(e.target.value)} placeholder="Describe what needs correction"/></label><button type="button" className="ops-hub-secondary" disabled={busy||!issueNote.trim()} onClick={()=>void inspect('fail')}><AlertTriangle size={16}/> Flag issue</button></>)}
        {data.inspectionEligible&&!canInspect&&<p className="ops-hub-muted">Room-check permission required.</p>}
       </div>}
      </section>}
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
       <span className="ops-hub-overline">Services & quick actions</span>
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
       <button type="button" className={'ops-hub-quick-action'+(data.tubCleanDue?' selected':'')+(data.serviceDetails?.tub_clean_completed_at?' ops-hub-complete-card':'')} disabled={!canManage||!daily||busy||blocked} onClick={()=>data.tubCleanDue?setActiveEditor(v=>v==='tub_assignee'?null:'tub_assignee'):void serviceAction(data.serviceDetails?.tub_clean_completed_at?'tubReopen':'tubRequest')}>
        <span className="ops-hub-quick-icon">🛁</span><span className="ops-hub-quick-name">Tub clean</span><small>{data.serviceDetails?.tub_clean_completed_at?'Done · reopen':data.tubCleanDue?(data.serviceDetails?.tub_clean_assigned_to?'Tub only · '+data.serviceDetails.tub_clean_assigned_to:'Assign tub only'):'Request'}</small>
       </button>
       <button type="button" className={'ops-hub-quick-action'+(data.serviceDetails?.tray_returned_at?' ops-hub-complete-card':'')} disabled={!canManage||!daily||busy} onClick={()=>void serviceAction(data.serviceDetails?.tray_returned_at?'trayReset':'trayReturned')}>
        <span className="ops-hub-quick-icon"><Check size={18}/></span><span className="ops-hub-quick-name">Breakfast tray</span><small>{data.serviceDetails?.tray_returned_at?'Returned · undo':'Mark returned'}</small>
       </button>
       </div>
       <div className="ops-hub-secondary-actions" aria-label="Additional room actions" style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:9}}>
        {canManage&&<button type="button" className="ops-hub-secondary" disabled={busy||!daily} onClick={()=>setActiveEditor(v=>v==='room_notes'?null:'room_notes')}>Room notes{daily?.notes?.trim()?' · Added':''}</button>}
        {canManage&&<button type="button" className="ops-hub-secondary" disabled={busy||!daily} onClick={()=>setActiveEditor(v=>v==='packages'?null:'packages')}>Packages{selectedPackageNames.length?' · '+selectedPackageNames.length:''}</button>}
        {canManage&&<button type="button" className="ops-hub-secondary" disabled={busy||!daily} onClick={()=>setActiveEditor(v=>v==='service'?null:'service')}>Service · {daily?.service_type||'None'}</button>}
       </div>
      </div>
      <div className="ops-hub-quick-section" style={{display:'flex',gap:9,flexWrap:'wrap',alignItems:'center',marginTop:10}}>
       <label style={{display:'flex',gap:7,alignItems:'center',flexWrap:'wrap',fontSize:12,fontWeight:700,color:'#365f6d'}}>
        Expected arrival
        <input type="time" aria-label="Expected arrival" value={times.expectedArrivalTime} disabled={!canManage||!daily||busy} onChange={e=>setTimes(current=>({...current,expectedArrivalTime:e.target.value}))} style={{width:142,maxWidth:'100%',border:'1px solid #d6e4e8',padding:'7px 8px',borderRadius:9,background:'#fff',color:'#233d49'}}/>
       </label>
       {canManage&&daily&&<button type="button" className="ops-hub-secondary" disabled={busy||times.expectedArrivalTime===(data.serviceDetails?.expected_arrival_time?.slice(0,5)||'')} onClick={()=>void saveTiming()} style={{padding:'7px 11px'}}><Save size={14}/> Save</button>}
       <button type="button" disabled={!canManage||!daily||busy} onClick={()=>void toggleLateCheckout()} aria-pressed={Boolean(data.serviceDetails?.late_checkout)} className={'ops-hub-secondary'+(data.serviceDetails?.late_checkout?' selected':'')} style={{padding:'7px 11px',borderColor:data.serviceDetails?.late_checkout?'#71afa0':undefined,background:data.serviceDetails?.late_checkout?'#e4f5ee':undefined}}>
        {data.serviceDetails?.late_checkout&&<Check size={14}/>} Late checkout
       </button>
      </div>
      {!daily&&<p className="ops-hub-muted">No operational record exists for this date. Management controls become available once the room day is scheduled.</p>}
     </div>}
     </section>
     {data.stay&&<section className="ops-hub-accordion">

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

      {sections.log&&<div className="ops-hub-accordion-inner"><OpsActivityLog serviceDate={date} roomId={roomId} compact initialAction={initialAction}/></div>}
     </section>
    </>}
   </div>
  </section>
 </div>
}
