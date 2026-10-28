'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Bold, CheckCircle2, Eye, FileText, List, Printer, RefreshCw, Save, Underline } from 'lucide-react'
import { createPortal } from 'react-dom'
import {normalizeDessertEntries,resolveDessertAssignments,type DessertEntry} from '@/lib/shift-desserts'

type AutoData = {
  breakfastDate:string
  housekeeping:any[]
  housekeepingFixes?:{id:string;roomName:string;note:string;resolved:boolean;assignedTo:string;fixNote?:string}[]
  housekeepingObservations?:{roomId:string;roomName:string;note:string;lastUpdatedBy:string}[]
  breakfast:any[]
  maintenance:any[]
  roomNotes:any[]
  todayStaff:any[]
  tomorrowStaff:any[]
  tomorrowHousekeeping:any[]
  tomorrowDessertRooms:any[]
}

type Report = {
  id:string
  report_date:string
  shift:string
  status:'draft'|'finalized'
  tonights_dessert?:string
  dessert_assignments?:DessertEntry[]
  guest_notes:string
  staff_notes:string
  supplies_notes:string
  tomorrow_notes:string
  general_notes:string
  management_notes:string
  finalized_at:string|null
  note_authors?:{
    guest?:{id:string;name:string;initials:string}|null
    staff?:{id:string;name:string;initials:string}|null
    supplies?:{id:string;name:string;initials:string}|null
    tomorrow?:{id:string;name:string;initials:string}|null
    general?:{id:string;name:string;initials:string}|null
    management?:{id:string;name:string;initials:string}|null
    maintenance?:{id:string;name:string;initials:string}|null
  }
}

type HandoffCategory = 'urgent' | 'followUp' | 'guestRequest' | 'informational' | 'completed'
type HandoffItem = {key:string;title:string;detail:string;category:HandoffCategory}

const handoffCategories:{id:HandoffCategory;label:string}[] = [
  {id:'urgent',label:'Urgent'},
  {id:'followUp',label:'Follow-up'},
  {id:'guestRequest',label:'Guest requests'},
  {id:'informational',label:'Operational updates'},
  {id:'completed',label:'Completed work'}
]

// Classification changes presentation only. Original notes and work-order statuses are
// never rewritten, and ambiguous messages remain informational rather than becoming
// invented tasks. Explicit outstanding work takes precedence over completed milestones.
function classifyHandoffDetail(detail:string):HandoffCategory {
  const text=detail.toLowerCase().replace(/\s+/g,' ').trim()
  if (/\b(?:urgent|asap|emergency|immediate(?:ly)?|safety hazard|flood(?:ing)?|no heat|no hot water)\b/.test(text)
      && !/\b(?:not urgent|non-urgent|no emergency)\b/.test(text)) return 'urgent'
  if (/\b(?:still needs?|needs? (?:to be|repair|cleaning|attention)|pending|awaiting|outstanding|follow[- ]?up|not ready|dirty|blocked|on hold|in progress|open item|item.{0,18}open|repair needed)\b/.test(text)) return 'followUp'
  if (/\b(?:asked for|guest (?:asked|requested)|requested (?:clean|fresh|extra|new|additional)|special request|guest request|would like)\b/.test(text)) return 'guestRequest'
  if (/\b(?:no rf requested|no refresh requested|no service requested|declined (?:an? )?(?:rf|refresh)|did not request (?:rf|refresh))\b/.test(text)) return 'informational'
  if (/\b(?:completed?|finished|inspected|cleaned|collected|resolved|fixed|provided|delivered|sent|restocked|received|done)\b/.test(text)) return 'completed'
  if (/\b(?:open|hold|needs?|requires?|repair|schedule|waiting|due)\b/.test(text)) return 'followUp'
  return 'informational'
}

function todayDetroit() {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
}

function authorName(value:string) {
  return String(value||'').trim().replace(/\s+/g,' ') || 'Staff'
}


// Restrict saved formatting to plain-text markers: **bold**, __underlined__, and
// "- " bullets. Render with React text nodes; never inject user-supplied HTML.
function formattedInline(value:string,prefix:string,depth=0):ReactNode[]{
 if(depth>5)return [value]
 const result:ReactNode[]=[]
 const pattern=/(\*\*(.+?)\*\*|__(.+?)__)/g
 let match:RegExpExecArray|null,last=0,index=0
 while((match=pattern.exec(value))!==null){
  if(match.index>last)result.push(value.slice(last,match.index))
  const inside=formattedInline(match[2]||match[3],prefix+index,depth+1)
  result.push(match[2]?<strong key={prefix+'b'+index}>{inside}</strong>:<u key={prefix+'u'+index}>{inside}</u>)
  last=pattern.lastIndex;index++
 }
 if(last<value.length)result.push(value.slice(last))
 return result
}
function FormattedNote({value}:{value:string}){
 const lines=String(value||'').split(/\r?\n/)
 const blocks:ReactNode[]=[]
 for(let i=0;i<lines.length;){
  if(/^\s*[-*•]\s+/.test(lines[i])){
   const children:ReactNode[]=[]
   while(i<lines.length&&/^\s*[-*•]\s+/.test(lines[i])){
    children.push(<li key={i}>{formattedInline(lines[i].replace(/^\s*[-*•]\s+/,''),'li'+i)}</li>);i++
   }
   blocks.push(<ul key={'ul'+i}>{children}</ul>)
  }else if(lines[i].trim()){blocks.push(<p key={i}>{formattedInline(lines[i],'p'+i)}</p>);i++}
  else{blocks.push(<div key={i} className="shift-note-blank" aria-hidden="true"/>);i++}
 }
 return <div className="shift-formatted-note">{blocks}</div>
}
function NoteEditor({label,value,onChange,disabled,placeholder}:{label:string;value:string;onChange:(value:string)=>void;disabled:boolean;placeholder:string}){
 const input=useRef<HTMLTextAreaElement>(null)
 const lastSelection=useRef({start:0,end:0})
 const [showPreview,setShowPreview]=useState(false)
 function rememberSelection(){
  const el=input.current
  if(el)lastSelection.current={start:el.selectionStart,end:el.selectionEnd}
 }
 function apply(kind:'bold'|'underline'|'bullets'){
  const el=input.current;if(!el||disabled)return
  // Tapping a toolbar icon on mobile can blur the textarea; retain its actual selection.
  const start=Math.min(lastSelection.current.start,value.length)
  const end=Math.min(lastSelection.current.end,value.length)
  let result=value,selStart=start,selEnd=end
  if(kind==='bullets'){
   const first=value.lastIndexOf('\n',Math.max(0,start-1))+1
   const pos=value.indexOf('\n',end),last=pos<0?value.length:pos
   const lines=value.slice(first,last).split('\n')
   const remove=lines.every(line=>/^\s*-\s/.test(line))
   const text=lines.map(line=>remove?line.replace(/^(\s*)-\s/,'$1'):'- '+line).join('\n')
   result=value.slice(0,first)+text+value.slice(last);selStart=first;selEnd=first+text.length
  }else{
   const mark=kind==='bold'?'**':'__'
   result=value.slice(0,start)+mark+value.slice(start,end)+mark+value.slice(end)
   selStart=start+mark.length;selEnd=end+mark.length
  }
  lastSelection.current={start:selStart,end:selEnd}
  onChange(result)
  requestAnimationFrame(()=>{
   if(!input.current)return
   input.current.focus({preventScroll:true})
   input.current.setSelectionRange(selStart,selEnd)
  })
 }
 return <div className="shift-rich-editor">
  <div className="shift-rich-toolbar" role="toolbar" aria-label={label+' formatting'}>
   <span className="shift-rich-toolbar-label" aria-hidden="true">Format</span>
   <div className="shift-rich-tools" role="group" aria-label="Text formatting">
    <button type="button" disabled={disabled} aria-label="Bold selected words" title="Bold" onMouseDown={e=>e.preventDefault()} onClick={()=>apply('bold')}><Bold size={17}/></button>
    <button type="button" disabled={disabled} aria-label="Underline selected words" title="Underline" onMouseDown={e=>e.preventDefault()} onClick={()=>apply('underline')}><Underline size={17}/></button>
    <button type="button" disabled={disabled} aria-label="Add or remove bullets" title="Bullets" onMouseDown={e=>e.preventDefault()} onClick={()=>apply('bullets')}><List size={17}/></button>
   </div>
   <button type="button" className="shift-rich-preview-toggle" aria-pressed={showPreview} aria-label={showPreview?'Hide formatted preview':'Show formatted preview'} title={showPreview?'Hide preview':'Preview formatting'} disabled={!value.trim()} onClick={()=>setShowPreview(v=>!v)}><Eye size={16}/><span>{showPreview?'Hide':'Preview'}</span></button>
  </div>
  <textarea ref={input} aria-label={label} rows={3} value={value} disabled={disabled} placeholder={placeholder} onChange={e=>{onChange(e.target.value);rememberSelection()}} onSelect={rememberSelection} onKeyUp={rememberSelection} onClick={rememberSelection}/>
  {showPreview&&value.trim()&&<div className="shift-rich-preview"><span>Formatted preview</span><FormattedNote value={value}/></div>}
 </div>
}

export default function ShiftReportBoard() {
  const [printMounted,setPrintMounted] = useState(false)
  useEffect(()=>{setPrintMounted(true)},[])
  const [date,setDate] = useState(todayDetroit())
  const [shift,setShift] = useState('Daily')
  const [tab,setTab] = useState<'report'|'room-notes'|'handoff'|'management'>('report')
  const [report,setReport] = useState<Report|null>(null)
  const [auto,setAuto] = useState<AutoData>({breakfastDate:'',housekeeping:[],breakfast:[],maintenance:[],roomNotes:[],todayStaff:[],tomorrowStaff:[],tomorrowHousekeeping:[],tomorrowDessertRooms:[]})
  const [canManage,setCanManage] = useState(false)
  const [currentStaffName,setCurrentStaffName] = useState('Staff')
  const [currentStaffInitials,setCurrentStaffInitials] = useState('Staff')
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [message,setMessage] = useState('')
  const [rooms,setRooms] = useState<any[]>([])
  const [roomNotes,setRoomNotes] = useState<any[]>([])
  const [noteRoomId,setNoteRoomId] = useState('')
  const [noteType,setNoteType] = useState<'daily'|'persistent'>('daily')
  const [noteText,setNoteText] = useState('')
  const [includeNote,setIncludeNote] = useState(true)
  const [draft,setDraft] = useState({guestNotes:'',staffNotes:'',suppliesNotes:'',tomorrowNotes:'',generalNotes:'',managementNotes:'',maintenanceNotes:'',tonightsDessert:''})
  const [dessertEntries,setDessertEntries]=useState<DessertEntry[]>([])
  const [dessertName,setDessertName]=useState('')
  const [dessertRoomIds,setDessertRoomIds]=useState<string[]>([])
  const [editingDessertId,setEditingDessertId]=useState('')
  const [dessertSaving,setDessertSaving]=useState(false)


  type StaffNote={section:string;staff_member_id:string;content:string;name:string;initials:string}
  const [staffNotes,setStaffNotes]=useState<StaffNote[]>([])
  const [myStaffId,setMyStaffId]=useState('')
  const [myNotes,setMyNotes]=useState<Record<string,string>>({})
  const [notesReady,setNotesReady]=useState(false)
  const [noteStatus,setNoteStatus]=useState('Saved')
  const currentNotesRef=useRef<Record<string,string>>({})
  const pendingNotesRef=useRef(new Set<string>())
  const saveTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null)
  const loadTokenRef=useRef(0)
  const noteSections=['guest','staff','supplies','tomorrow','general','maintenance','management']
  const localKey=(id:string,part:string)=>'ths-shift-draft:'+id+':'+date+':'+shift+':'+part
  async function savePersonalNotes() {
    if(!myStaffId||!pendingNotesRef.current.size)return
    const sections=[...pendingNotesRef.current]
    setNoteStatus('Saving…')
    let errors=false
    for(const section of sections){
      const content=currentNotesRef.current[section]||''
      try{
        const res=await fetch('/api/shift-report-notes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date,shift,section,content})})
        if(!res.ok)throw new Error('Save failed')
        if(content===currentNotesRef.current[section]){
          pendingNotesRef.current.delete(section)
          localStorage.removeItem(localKey(myStaffId,section))
        }
        setStaffNotes(old=>[...old.filter(x=>!(x.section===section&&x.staff_member_id===myStaffId)),{section,staff_member_id:myStaffId,content,name:currentStaffName,initials:currentStaffInitials}])
      }catch{errors=true}
    }
    setNoteStatus(errors?'Not saved to server — copy kept on this device':pendingNotesRef.current.size?'Unsaved changes':'Saved')
  }
  function editPersonalNote(section:string,content:string){
    currentNotesRef.current={...currentNotesRef.current,[section]:content}
    setMyNotes(currentNotesRef.current)
    pendingNotesRef.current.add(section)
    localStorage.setItem(localKey(myStaffId,section),JSON.stringify({content,at:Date.now()}))
    setNoteStatus('Unsaved changes')
    if(saveTimerRef.current)clearTimeout(saveTimerRef.current)
    saveTimerRef.current=setTimeout(()=>void savePersonalNotes(),1500)
  }
  useEffect(()=>{
    const token=++loadTokenRef.current
    setNotesReady(false)
    setMyStaffId('')
    pendingNotesRef.current.clear()
    if(saveTimerRef.current)clearTimeout(saveTimerRef.current)
    void (async()=>{
      try{
        const res=await fetch('/api/shift-report-notes?date='+encodeURIComponent(date)+'&shift='+encodeURIComponent(shift),{cache:'no-store'})
        const data=await res.json()
        if(!res.ok)throw new Error(data.error||'Unable to load notes')
        if(token!==loadTokenRef.current)return
        const id=String(data.currentStaffId||'')
        const notes:StaffNote[]=data.entries||[]
        const mine:Record<string,string>={}
        for(const section of noteSections){
          const remote=notes.find(x=>x.section===section&&x.staff_member_id===id)?.content||''
          const cached=localStorage.getItem(localKey(id,section))
          if(cached!==null){
            try {mine[section]=JSON.parse(cached).content??remote} catch {mine[section]=remote}
            if(mine[section]!==remote)pendingNotesRef.current.add(section)
            else localStorage.removeItem(localKey(id,section))
          }else mine[section]=remote
        }
        currentNotesRef.current=mine
        setMyNotes(mine);setMyStaffId(id);setStaffNotes(notes);setNotesReady(true)
        setNoteStatus(pendingNotesRef.current.size?'Unsaved changes':'Saved')
      }catch(e:any){if(token===loadTokenRef.current)setNoteStatus(e?.message||'Unable to load notes')}
    })()
    return ()=>{loadTokenRef.current++;if(saveTimerRef.current)clearTimeout(saveTimerRef.current)}
  },[date,shift])
  useEffect(()=>{
    if(notesReady&&myStaffId&&pendingNotesRef.current.size){
      if(saveTimerRef.current)clearTimeout(saveTimerRef.current)
      saveTimerRef.current=setTimeout(()=>void savePersonalNotes(),1500)
    }
  },[notesReady,myStaffId])

  async function load() {
    setLoading(true); setMessage('')
    try {
      const [reportRes,notesRes] = await Promise.all([
        fetch(`/api/shift-reports?date=${encodeURIComponent(date)}&shift=${encodeURIComponent(shift)}`,{cache:'no-store'}),
        fetch(`/api/room-notes?date=${encodeURIComponent(date)}`,{cache:'no-store'})
      ])
      const rd = await reportRes.json().catch(()=>({}))
      const nd = await notesRes.json().catch(()=>({}))
      if (!reportRes.ok) throw new Error(rd.error || 'Could not load shift report.')
      if (!notesRes.ok) throw new Error(nd.error || 'Could not load room notes.')
      setReport(rd.report || null)
      setDessertEntries(normalizeDessertEntries(rd.report?.dessert_assignments,rd.report?.tonights_dessert))
      setDessertName('')
      setDessertRoomIds([])
      setEditingDessertId('')
      setAuto(rd.auto || {breakfastDate:'',housekeeping:[],breakfast:[],maintenance:[],roomNotes:[],todayStaff:[],tomorrowStaff:[],tomorrowHousekeeping:[],tomorrowDessertRooms:[]})
      setCanManage(Boolean(rd.access?.canManageReport))
      setCurrentStaffName(rd.access?.currentStaffName || 'Staff')
      setCurrentStaffInitials(rd.access?.currentStaffInitials || rd.access?.currentStaffName || 'Staff')
      const r = rd.report || {}
      setDraft({
        guestNotes:r.guest_notes || '', staffNotes:r.staff_notes || '', suppliesNotes:r.supplies_notes || '',
        tomorrowNotes:r.tomorrow_notes || '', generalNotes:r.general_notes || '', managementNotes:r.management_notes || '', maintenanceNotes:'',
        tonightsDessert:r.tonights_dessert || ''
      })
      setRooms(nd.rooms || [])
      setRoomNotes(nd.notes || [])
    } catch(e:any) { setMessage(e?.message || 'Could not load shift report.') }
    finally { setLoading(false) }
  }

  useEffect(()=>{ void load() },[date,shift])

  const dessertDetails=resolveDessertAssignments(dessertEntries,(auto.tomorrowDessertRooms||[]).map((room:any)=>({
    roomId:String(room.roomId),roomName:String(room.roomName)
  })))
  const allocatedDessertRooms=new Set(dessertDetails.flatMap(item=>item.rooms.map(r=>r.roomId)))
  const dessertUnassigned=(auto.tomorrowDessertRooms||[]).filter((room:any)=>!allocatedDessertRooms.has(String(room.roomId)))
  const locked = report?.status === 'finalized'
  function selectDessertForEdit(entry:DessertEntry){
    setDessertName(entry.name)
    setDessertRoomIds([...entry.roomIds])
    setEditingDessertId(entry.id)
    document.getElementById('tonights-dessert')?.scrollIntoView({behavior:'smooth',block:'start'})
  }
  async function persistDesserts(entries:DessertEntry[]){
    if(!canManage||locked||dessertSaving)return
    setDessertSaving(true)
    try{
      const response=await fetch('/api/shift-reports/desserts',{
        method:'PUT',headers:{'content-type':'application/json'},
        body:JSON.stringify({date,shift,entries})
      })
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error||'Could not save dessert assignments.')
      setDessertEntries(result.entries||[])
      setReport(previous=>previous?{...previous,dessert_assignments:result.entries}:previous)
      setDessertName('')
      setDessertRoomIds([])
      setEditingDessertId('')
      setMessage('Dessert assignments saved. Front Desk and Daily Overview will show the updated list.')
      window.dispatchEvent(new CustomEvent('ths:live-data-refresh'))
    }catch(error:any){setMessage(String(error?.message||'Could not save dessert assignments.'))}
    finally{setDessertSaving(false)}
  }
  async function saveDessertAssignment(){
    const name=dessertName.trim()
    if(!name){setMessage('Enter a dessert name before saving.');return}
    const current=dessertEntries.filter(entry=>entry.id!==editingDessertId)
    // A room with a specific dessert is moved away from any earlier specific
    // dessert. An unselected (all-rooms) dessert remains the fallback.
    const selected=new Set(dessertRoomIds)
    const withoutConflicts=current.map(entry=>{
      if(!entry.roomIds.length)return entry
      return {...entry,roomIds:entry.roomIds.filter(id=>!selected.has(id))}
    }).filter(entry=>entry.roomIds.length>0||!current.find(v=>v.id===entry.id)?.roomIds.length)
    const next:DessertEntry={id:editingDessertId||crypto.randomUUID(),name,roomIds:[...selected]}
    // Only the most recent all-rooms entry is used as the default.
    const entries=next.roomIds.length===0?withoutConflicts.filter(e=>e.roomIds.length>0):withoutConflicts
    await persistDesserts([...entries,next])
  }
  async function deleteDessert(id:string){
    await persistDesserts(dessertEntries.filter(entry=>entry.id!==id))
  }

  async function saveReport(action:'save'|'finalize'|'reopen'='save') {
    if (!canManage) return
    setSaving(true); setMessage(action==='finalize'?'Finalizing…':'Saving…')
    try {
      const r = await fetch('/api/shift-reports',{
        method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({reportDate:date,shift,action,...draft})
      })
      const d = await r.json().catch(()=>({}))
      if (!r.ok) throw new Error(d.error || 'Could not save shift report.')
      setMessage(action==='finalize'?'Shift report finalized.':'Shift report saved.')
      await load()
    } catch(e:any) { setMessage(e?.message || 'Could not save shift report.') }
    finally { setSaving(false) }
  }

  async function addRoomNote() {
    if (!noteRoomId || !noteText.trim()) { setMessage('Choose a room and enter a note.'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/room-notes',{
        method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({roomId:noteRoomId,serviceDate:date,note:noteText,noteType,includeInShiftReport:includeNote})
      })
      const d = await r.json().catch(()=>({}))
      if (!r.ok) throw new Error(d.error || 'Could not add room note.')
      setNoteText(''); setMessage('Room note added.'); await load()
    } catch(e:any) { setMessage(e?.message || 'Could not add room note.') }
    finally { setSaving(false) }
  }

  async function resolveRoomNote(id:string, resolved:boolean) {
    const r = await fetch('/api/room-notes',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id,resolved})})
    if (r.ok) await load()
  }

  const summary = useMemo(()=>{
    const hk = auto.housekeeping || []
    const breakfast = auto.breakfast || []
    const maintenance = auto.maintenance || []
    const tomorrowHk = auto.tomorrowHousekeeping || []

    const isFullRoomClean = (row:any) => {
      const status=String(row.reservationStatus||'').trim().toLowerCase()
      return status==='checkout' || status==='out/in'
    }

    const isRefresh = (row:any) =>
      String(row.reservationStatus||'').trim().toLowerCase()==='stayover' &&
      String(row.serviceType||'').trim().toUpperCase()==='RF'

    const tomorrowCleans = tomorrowHk.filter(isFullRoomClean)
    const tomorrowRefreshes = tomorrowHk.filter(isRefresh)
    const scheduledBreakfast = [...new Map(breakfast.filter((r:any)=>r.status==='scheduled'&&!r.breakfastSkipped&&r.roomId).map((r:any)=>[String(r.roomId),r])).values()]
    const menusReceived = scheduledBreakfast.filter((r:any)=>r.menuSubmitted).length
    const menusMissing = scheduledBreakfast.filter((r:any)=>!r.menuSubmitted)

    return {
      completed:hk.filter((r:any)=>isFullRoomClean(r)&&r.complete).length,
      roomCleans:hk.filter(isFullRoomClean).length,
      refreshes:hk.filter(isRefresh).length,
      holds:hk.filter((r:any)=>String(r.stripHold||'').toLowerCase().includes('hold')).length,
      menusReceived,
      menusMissing,
      breakfastExpected:scheduledBreakfast.length,
      dessertsTonight:(auto.tomorrowDessertRooms || []).length,
      dessertRooms:auto.tomorrowDessertRooms || [],
      todayStaff:auto.todayStaff || [],
      tomorrowStaff:auto.tomorrowStaff || [],
      tomorrowCleans:tomorrowCleans.length,
      tomorrowRefreshes:tomorrowRefreshes.length,
      maintenanceOpen:maintenance.filter((r:any)=>r.status!=='complete'),
      maintenanceComplete:maintenance.filter((r:any)=>r.status==='complete')
    }
  },[auto])

  const handoffRoomNotes = roomNotes.filter(n=>!n.resolved)
  const handoffMaintenance = summary.maintenanceOpen

  const roomHandoff = useMemo(()=>{
    const byRoom = new Map<string,{roomId:string;roomName:string;details:string[]}>()
    const normalConditions = new Set(['','ready','vacant (clean)','occupied'])

    for (const row of (auto.housekeeping || [])) {
      const roomId=String(row.roomId||'')
      const roomName=String(row.roomName||'Room')
      const details:string[]=[]
      const reservation=String(row.reservationStatus||'').trim()
      const condition=String(row.roomCondition||'').trim()
      const next=String(row.nextShiftCondition||'').trim()
      const stripHold=String(row.stripHold||'').trim()
      const note=String(row.notes||'').trim()

      if (reservation.toLowerCase()==='blocked') details.push('Blocked')
      if (stripHold) details.push(stripHold)
      if (condition && !normalConditions.has(condition.toLowerCase())) details.push(condition)
      if (next && !normalConditions.has(next.toLowerCase())) details.push(`Next: ${next}`)
      if (note) details.push(note)

      if (details.length) byRoom.set(roomId,{roomId,roomName,details:[...new Set(details)]})
    }

    for (const note of handoffRoomNotes) {
      const roomId=String(note.room_id||note.roomId||'')
      const roomName=String(note.roomName||'Room')
      const text=String(note.note||'').trim()
      if (!text) continue
      const current=byRoom.get(roomId)||{roomId,roomName,details:[]}
      if (!current.details.includes(text)) current.details.push(text)
      byRoom.set(roomId,current)
    }

    return [...byRoom.values()]
  },[auto.housekeeping,handoffRoomNotes])

  const actionItems = useMemo(()=>{
    const items:HandoffItem[]=[]

    for (const room of roomHandoff) {
      // Categorize each room update separately so a completed clean never hides
      // an unrelated outstanding issue for the same room.
      room.details.forEach((detail,index)=>{
        items.push({
          key:`room-${room.roomId}-${index}`,
          title:room.roomName,
          detail,
          category:classifyHandoffDetail(detail)
        })
      })
    }

    if (summary.menusMissing.length) {
      items.push({
        key:'breakfast-missing',
        title:'Breakfast',
        detail:`${summary.menusMissing.length} missing menu${summary.menusMissing.length===1?'':'s'}: ${summary.menusMissing.map((r:any)=>r.roomName).join(', ')}`,
        category:'followUp'
      })
    }

    for (const item of summary.maintenanceOpen) {
      items.push({
        key:`maintenance-${item.id}`,
        title:String(item.roomName||item.area||'Property'),
        detail:`${String(item.title||'Maintenance item')} · ${String(item.status||'open').replace('_',' ')}`,
        category:String(item.priority||'').toLowerCase()==='urgent'?'urgent':'followUp'
      })
    }

    return items
  },[roomHandoff,summary.menusMissing,summary.maintenanceOpen])
  const handoffGroups = useMemo(()=>handoffCategories.map(group=>({
    ...group,
    items:actionItems.filter(item=>item.category===group.id)
  })).filter(group=>group.items.length>0),[actionItems])
  const printableHandoffGroups = handoffGroups.map(group=>({
    ...group,
    items:group.items.filter(item=>item.key!=='breakfast-missing' && !item.key.startsWith('room-') && !(item.key.startsWith('maintenance-') && summary.maintenanceOpen.some((m:any)=>item.key===`maintenance-${m.id}` && Boolean(m.roomName))))
  })).filter(group=>group.items.length>0)

  // Consolidate cross-department updates by physical room for printing.
  // Keep independent staff notes and their provenance, but suppress exact repeats.
  const printableRoomSections = (()=>{
    type Entry={department:string;text:string}
    const map=new Map<string,{roomName:string;entries:Entry[]}>()
    const add=(roomNameRaw:unknown,department:string,textRaw:unknown)=>{
      const roomName=String(roomNameRaw||'').trim()
      const text=String(textRaw||'').trim()
      if(!roomName||!text)return
      const key=roomName.toLocaleLowerCase()
      const room=map.get(key)||{roomName,entries:[]}
      // One occurrence per identical room update, regardless of which source echoed it.
      const normalize=(value:string)=>value.replace(/\\s+/g,' ').trim().toLocaleLowerCase()
      if(!room.entries.some(e=>normalize(e.text)===normalize(text)))room.entries.push({department,text})
      map.set(key,room)
    }
    for(const room of roomHandoff){
      for(const detail of room.details)add(room.roomName,'Room update',detail)
    }
    for(const item of auto.housekeepingObservations||[]){
      add(item.roomName,'Housekeeping / Hospitality',item.note)
    }
    for(const note of roomNotes.filter(n=>n.include_in_shift_report)){
      add(note.roomName,'Guest note',String(note.createdByInitials||authorName(note.createdByName)||'')+': '+String(note.note||''))
    }
    for(const item of summary.maintenanceOpen||[]){
      if(item.roomName)add(item.roomName,'Maintenance · open',item.title)
    }
    for(const item of summary.maintenanceComplete||[]){
      if(item.roomName && item.include_in_shift_report!==false)add(item.roomName,'Maintenance · completed',item.title)
    }
    for(const fix of auto.housekeepingFixes||[]){
      add(fix.roomName,fix.resolved?'Quality · fixed':'Quality · needs correction',fix.note||fix.issue||fix.description||'Inspection correction')
    }
    return [...map.values()].sort((a,b)=>a.roomName.localeCompare(b.roomName))
  })()

  function textarea(key:keyof typeof draft,label:string,placeholder:string,authorKey?:keyof NonNullable<Report['note_authors']>) {
    const section=String(authorKey||key.replace('Notes','')).toLowerCase()
    const prior=draft[key]||''
    const other=staffNotes.filter(e=>e.section===section&&e.staff_member_id!==myStaffId&&e.content.trim())
    return <div className="shift-note-entry"><strong className="shift-note-entry-label">{label}</strong>
      {prior&&<div className="shift-note-prior"><strong>{report?.note_authors?.[authorKey||'staff']?.initials || authorName(report?.note_authors?.[authorKey||'staff']?.name||'Previous')}:</strong><FormattedNote value={prior}/></div>}
      {other.map(e=><div className="shift-note-prior" key={e.staff_member_id}><strong>{e.initials || authorName(e.name)}:</strong><FormattedNote value={e.content}/></div>)}
      {notesReady&&myStaffId&&<div><span className="shift-note-author">{currentStaffInitials} · Your note</span>
        <NoteEditor label={label} value={myNotes[section]||''} onChange={value=>editPersonalNote(section,value)} disabled={locked||(section==='management'&&!canManage)} placeholder={placeholder}/>
      </div>}
    </div>
  }

  function authoredText(value:string,authorKey:keyof NonNullable<Report['note_authors']>) {
    const author=report?.note_authors?.[authorKey]
    return <>{author && <strong className="shift-note-prefix">{author.initials || authorName(author.name)}: </strong>}<FormattedNote value={value}/></>
  }

  // Include the individually autosaved notes from every account in the printable handoff.
  // The current editor's local value wins over the last saved copy so printing never
  // quietly drops a note that is still waiting for the debounce to finish.
  function printNotes(section:string,title:string,legacy:string,authorKey:keyof NonNullable<Report['note_authors']>) {
    const mine=notesReady&&myStaffId ? (myNotes[section]||'').trim() : ''
    const other=staffNotes.filter(n=>n.section===section&&n.content.trim()&&(!notesReady||n.staff_member_id!==myStaffId))
    if(!legacy.trim()&&!mine&&!other.length)return null
    return <section className="shift-print-section shift-print-note-section">
      <div className="shift-print-section-title"><h3>{title}</h3></div>
      <div className="shift-print-note-list">
        {legacy.trim()&&<div className="shift-print-note"><div className="shift-print-note-body">{authoredText(legacy,authorKey)}</div></div>}
        {other.map(n=><div className="shift-print-note" key={`print-note-${section}-${n.staff_member_id}`}>
          <strong>{n.initials || authorName(n.name)}:</strong> <div className="shift-print-note-body"><FormattedNote value={n.content}/></div>
        </div>)}
        {mine&&<div className="shift-print-note"><strong>{currentStaffInitials}:</strong> <div className="shift-print-note-body"><FormattedNote value={mine}/></div></div>}
      </div>
    </section>
  }

  // Render the printable handoff directly under <body>, away from the app shell.
  // iOS AirPrint paginates this as a document rather than a grid item inside the app.
  const printDocument = (
<div className="shift-print-document" role="document" aria-label="The Hotel Saugatuck shift report">
      <header className="shift-print-heading">
        <div className="shift-print-letterhead">
          <div className="shift-print-brand">
            <div className="shift-print-monogram">THS</div>
            <div className="shift-print-brand-name"><strong>THE HOTEL SAUGATUCK</strong><span>OPERATIONS &amp; GUEST EXPERIENCE</span></div>
          </div>
          <span className={`shift-print-status-pill ${locked?'is-final':'is-draft'}`}>{locked?'Finalized':'Draft'}</span>
        </div>
        <div className="shift-print-title-row">
          <div><span className="shift-print-eyebrow">DAILY OPERATIONS · {shift.toUpperCase()} SHIFT</span><h1>Shift Report</h1></div>
          <div className="shift-print-date"><span>REPORT DATE</span><strong>{new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</strong></div>
        </div>
        <div className="shift-print-byline"><span>Prepared by <strong>{currentStaffName}</strong></span><span>Management handoff · {date}</span></div>
      </header>

      <section className="shift-print-section shift-print-snapshot">
        <div className="shift-print-section-title">
          <h3>Today at a glance</h3><span>{date}</span>
        </div>
        <div className="shift-print-summary-grid shift-print-summary-six">
          <div><span>Staff on site</span><strong>{summary.todayStaff.length}</strong></div>
          <div><span>Room cleans</span><strong>{summary.roomCleans}</strong></div>
          <div><span>Completed</span><strong>{summary.completed}</strong></div>
          <div><span>Refreshes</span><strong>{summary.refreshes}</strong></div>
          <div><span>Menus received</span><strong>{summary.menusReceived}</strong></div>
          <div><span>Menus needed</span><strong>{summary.menusMissing.length}</strong></div>
          <div><span>Desserts tonight</span><strong>{summary.dessertsTonight}</strong></div>
        </div>
        {summary.todayStaff.length>0 && <p className="shift-print-narrative"><strong>On site</strong> {summary.todayStaff.map((s:any)=>`${s.name}${s.roleLabel?` (${s.roleLabel})`:''}`).join(', ')}</p>}
      </section>

      <section className="shift-print-section shift-print-dessert">
        <div className="shift-print-section-title">
          <h3>Tonight&apos;s Dessert</h3><span>{summary.dessertsTonight} {summary.dessertsTonight===1?'room':'rooms'} · breakfast {auto.breakfastDate}</span>
        </div>
        {dessertDetails.length
          ? dessertDetails.map(entry=><p key={entry.id} className="shift-print-narrative"><strong>{entry.name}</strong> · {entry.rooms.length} {entry.rooms.length===1?'room':'rooms'}: {entry.rooms.length?entry.rooms.map(room=>room.roomName).join(', '):'No eligible rooms assigned'}</p>)
          : <p className="shift-print-narrative">Dessert not recorded.</p>}
        {dessertUnassigned.length>0&&<p className="shift-print-narrative"><strong>No dessert assigned:</strong> {dessertUnassigned.map((room:any)=>room.roomName).join(', ')}</p>}
      </section>

      {printableHandoffGroups.length>0 && <section className="shift-print-section shift-print-attention">
        <div className="shift-print-section-title">
          <h3>Shift Highlights &amp; Handoff</h3><span>Management overview</span>
        </div>
        {printableHandoffGroups.map(group=><div key={`print-group-${group.id}`} className={`shift-print-handoff-group is-${group.id}`}>
          <div className="shift-handoff-group-label"><strong>{group.label}</strong><span>{group.items.length}</span></div>
          <div className="shift-print-action-rows">
            {group.items.map(item=><div key={`print-action-${item.key}`} className="shift-print-action-row">
              <strong>{item.title}</strong><span>{item.detail}</span>
            </div>)}
          </div>
        </div>)}
      </section>}

      {(auto.housekeepingFixes||[]).length>0 && <section className="shift-print-section shift-print-corrections">
        <div className="shift-print-section-title">
          <h3>Housekeeping corrections</h3>
          <span>{(auto.housekeepingFixes||[]).filter(f=>!f.resolved).length
            ? `${(auto.housekeepingFixes||[]).filter(f=>!f.resolved).length} open`
            : 'All fixed'}</span>
        </div>
        <div className="shift-print-corrections-list">
          {(auto.housekeepingFixes||[]).map(f=><div key={f.id} className="shift-print-correction">
            <div className="shift-print-correction-head">
              <strong>{f.roomName}</strong><span className="shift-print-assignee">{f.assignedTo||'Unassigned'}</span>
              <span className={`shift-print-fix-status ${f.resolved?'resolved':'open'}`}>{f.resolved?'Fixed':'Needs correction'}</span>
            </div>
            <p>{f.note}</p>
            {f.fixNote&&<p><strong>Fix recorded:</strong> {f.fixNote}</p>}
          </div>)}
        </div>
      </section>}

      {printableRoomSections.length>0&&<section className="shift-print-section shift-print-room-notes">
        <div className="shift-print-section-title"><h3>Room-by-room handoff</h3><span>{printableRoomSections.length} rooms</span></div>
        <div className="shift-print-room-grid">
          {printableRoomSections.map(room=><article className="shift-print-room-card" key={room.roomName}>
            <h4>{room.roomName}</h4>
            <div className="shift-print-room-entries">
              {room.entries.map((entry,index)=><div className="shift-print-room-entry" key={index}>
                <span className="shift-print-department">{entry.department}</span>
                <span className="shift-print-room-detail">{entry.text}</span>
              </div>)}
            </div>
          </article>)}
        </div>
      </section>}

      <section className="shift-print-section shift-print-maintenance">
        <div className="shift-print-section-title"><h3>Maintenance Handled Today</h3><span>{summary.maintenanceComplete.filter((m:any)=>m.include_in_shift_report!==false&&!m.roomName).length} property items</span></div>
        {summary.maintenanceComplete.filter((m:any)=>m.include_in_shift_report!==false&&!m.roomName).length
        ? <div className="shift-print-list">{summary.maintenanceComplete.filter((m:any)=>m.include_in_shift_report!==false&&!m.roomName).map((m:any)=><div className="shift-print-row" key={m.id}>
           <strong>{m.roomName||m.area||'Property'}</strong>
           <span>{m.title}{m.completedByName?' · Completed by '+m.completedByName:''}</span>
          </div>)}</div>
        : <p className="shift-print-narrative">No completed maintenance work orders recorded today.</p>}
      </section>
      {printNotes('maintenance','Additional maintenance notes','', 'maintenance')}
      <section className="shift-print-section shift-print-breakfast">
        <div className="shift-print-section-title">
          <h3>Breakfast outlook</h3><span>{auto.breakfastDate}</span>
        </div>
        <p className="shift-print-breakfast-line"><strong>{summary.menusReceived+summary.menusMissing.length}</strong> rooms expected <span>·</span>
          <strong>{summary.menusReceived}</strong> menus received <span>·</span>
          <strong>{summary.menusMissing.length}</strong> missing
        </p>
        {summary.menusMissing.length>0 && <p className="shift-print-missing"><strong>Still needed:</strong> {summary.menusMissing.map((r:any)=>r.roomName).join(', ')}</p>}
      </section>

      <section className="shift-print-section shift-print-tomorrow">
        <div className="shift-print-section-title">
          <h3>Tomorrow at a glance</h3><span>{auto.breakfastDate}</span>
        </div>
        <div className="shift-print-summary-grid shift-print-summary-six">
          <div><span>Staff scheduled</span><strong>{summary.tomorrowStaff.length}</strong></div>
          <div><span>Room cleans</span><strong>{summary.tomorrowCleans}</strong></div>
          <div><span>Refreshes</span><strong>{summary.tomorrowRefreshes}</strong></div>
          <div><span>Breakfast rooms</span><strong>{summary.breakfastExpected}</strong></div>
          <div><span>Menus received</span><strong>{summary.menusReceived}</strong></div>
          <div><span>Desserts tonight</span><strong>{summary.dessertsTonight}</strong></div>
        </div>
        {summary.tomorrowStaff.length>0 && <p className="shift-print-narrative"><strong>Scheduled</strong> {summary.tomorrowStaff.map((s:any)=>`${s.name}${s.roleLabel?` (${s.roleLabel})`:''}`).join(', ')}</p>}
      </section>

      {printNotes('guest','Additional guest notes',draft.guestNotes,'guest')}
      {printNotes('staff','Staff notes',draft.staffNotes,'staff')}
      {printNotes('supplies','Supplies / inventory',draft.suppliesNotes,'supplies')}
      {printNotes('tomorrow','Tomorrow / follow-up',draft.tomorrowNotes,'tomorrow')}
      {printNotes('general','General notes',draft.generalNotes,'general')}

      {canManage&&printNotes('management','Management notes',draft.managementNotes,'management')}
      <style>{`
        @media print {
          .shift-print-document .shift-print-room-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;align-items:start}
          .shift-print-document .shift-print-room-card{break-inside:avoid;page-break-inside:avoid;border:1px solid #dae2e6;border-radius:7px;padding:9px 10px;background:white}
          .shift-print-document .shift-print-room-card h4{margin:0 0 6px;font-size:11px;color:#243b4b}
          .shift-print-document .shift-print-room-entry{display:grid;grid-template-columns:82px minmax(0,1fr);gap:7px;padding:5px 0;border-top:1px solid #edf0f2;font-size:9px;line-height:1.35}
          .shift-print-document .shift-print-department{font-weight:700;color:#627c89}
          .shift-print-document .shift-print-room-detail{white-space:pre-wrap;overflow-wrap:anywhere}
          .shift-print-document .shift-print-room-notes{break-before:auto}
        }
        @media screen {
          .shift-print-room-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
          .shift-print-room-card{border:1px solid #d9e5ea;border-radius:9px;padding:12px}
          .shift-print-room-card h4{margin:0 0 7px}
          .shift-print-room-entry{display:grid;grid-template-columns:100px minmax(0,1fr);gap:8px;padding:7px 0;border-top:1px solid #e9edf0}
          .shift-print-department{font-weight:700;color:#547387}
          .shift-print-room-detail{white-space:pre-wrap;overflow-wrap:anywhere}
        }
      `}</style>
      <footer className="shift-print-footer"><span>THE HOTEL SAUGATUCK · INTERNAL OPERATIONS</span><span>{date} · {shift}</span></footer>
    </div>
  )

  return <div className="shift-page module-pretty-page">
    <section className="module-pretty-hero no-print">
      <div>
        <div className="module-kicker">Operations handoff</div>
        <h1>Shift Reports</h1>
        <p>Capture the day clearly, surface exceptions, and leave the next shift with the information they actually need.</p>
      </div>
      <div className="module-pretty-hero-stat">
        <span>Status</span>
        <strong>{report?.status || 'Draft'}</strong>
      </div>
    </section>

    <div className="shift-toolbar no-print module-pretty-toolbar">
      <div className="shift-toolbar-left">
        <label>Date <input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
        <label>Shift <select value={shift} onChange={e=>setShift(e.target.value)}><option>Daily</option><option>Morning</option><option>Evening</option></select></label>
        <span className={`shift-status ${report?.status || 'draft'}`}>{report?.status || 'New draft'}</span>
      </div>
      <div className="shift-toolbar-right">
        <button type="button" className="ops-secondary-btn shift-dessert-jump" onClick={()=>{
          setTab('report')
          window.setTimeout(()=>document.getElementById('tonights-dessert')?.scrollIntoView({behavior:'smooth',block:'start'}),0)
        }}>Tonight&apos;s Dessert</button>
        <button type="button" className="ops-secondary-btn" onClick={load}><RefreshCw size={15}/>Refresh</button>
        <button type="button" className="ops-secondary-btn" onClick={()=>window.print()}><Printer size={15}/>Print / Save PDF</button>
        {canManage && !locked && <button type="button" className="ops-secondary-btn" onClick={()=>saveReport('save')} disabled={saving}><Save size={15}/>{saving?'Saving…':'Save Draft'}</button>}
        {canManage && !locked && <button type="button" className="ops-primary-btn" onClick={()=>saveReport('finalize')} disabled={saving}><CheckCircle2 size={15}/>Finalize</button>}
        {canManage && locked && <button type="button" className="ops-secondary-btn" onClick={()=>saveReport('reopen')} disabled={saving}>Reopen report</button>}
      </div>
    </div>

    {message && <div className="module-message">{message}</div>}

    <div className="shift-tabs no-print">
      <button className={tab==='report'?'active':''} onClick={()=>setTab('report')}>Daily Shift Report</button>
      <button className={tab==='room-notes'?'active':''} onClick={()=>setTab('room-notes')}>Room Notes</button>
      <button className={tab==='handoff'?'active':''} onClick={()=>setTab('handoff')}>Shift Handoff</button>
      {canManage && <button className={tab==='management'?'active':''} onClick={()=>setTab('management')}>Management Notes</button>}
    </div>

    {printMounted && createPortal(printDocument,document.body)}

    {loading ? <div className="module-empty">Loading shift report…</div> : tab==='report' ? <div className="shift-report-flow">
      <section className="shift-section shift-snapshot-section shift-day-section">
        <div className="shift-day-heading">
          <div><span>TODAY</span><h3>{date}</h3></div>
          <small>Current staffing, housekeeping workload, and menu status</small>
        </div>
        <div className="shift-snapshot-grid">
          <div><span>Staff on site</span><strong>{summary.todayStaff.length}</strong></div>
          <div><span>Room cleans</span><strong>{summary.roomCleans}</strong></div>
          <div><span>Rooms completed</span><strong>{summary.completed}</strong></div>
          <div><span>Refreshes</span><strong>{summary.refreshes}</strong></div>
          <div><span>Menus received</span><strong>{summary.menusReceived}</strong></div>
          <div><span>Menus needed</span><strong>{summary.menusMissing.length}</strong></div>
          <div><span>Desserts tonight</span><strong>{summary.dessertsTonight}</strong></div>
        </div>
        {(auto.housekeepingFixes||[]).length>0 && <div className="shift-today-corrections">
          <div className="shift-today-corrections-head">
            <div>
              <span className="shift-today-corrections-kicker">ROOM OPERATIONS</span>
              <h4>Housekeeping corrections</h4>
              <p>Fixes recorded during today&apos;s room inspections</p>
            </div>
            <span className="shift-today-corrections-total">
              {(auto.housekeepingFixes||[]).some(f=>!f.resolved)
                ? `${(auto.housekeepingFixes||[]).filter(f=>!f.resolved).length} open`
                : 'All fixed'}
            </span>
          </div>
          <div className="shift-today-corrections-list">
            {(auto.housekeepingFixes||[]).map(f=><div className="shift-today-correction" key={f.id}>
              <div className="shift-today-correction-meta">
                <strong>{f.roomName}</strong>
                <span>{f.assignedTo||'Unassigned'}</span>
                <span className={f.resolved?'shift-today-correction-status resolved':'shift-today-correction-status open'}>{f.resolved?'Fixed':'Needs correction'}</span>
              </div>
              <p>{f.note}</p>
            {f.fixNote&&<p><strong>Fix recorded:</strong> {f.fixNote}</p>}
            </div>)}
          </div>
        </div>}
        {(auto.housekeepingObservations||[]).length>0&&<div className="shift-today-corrections">
          <div className="shift-today-corrections-head">
            <div><span className="shift-today-corrections-kicker">ROOM OPERATIONS</span>
              <h4>Housekeeping &amp; Hospitality room notes</h4>
              <p>Today's room observations, including Hospitality Assistant notes. These are not automatically failed inspections.</p>
            </div>
            <span className="shift-today-corrections-total">{(auto.housekeepingObservations||[]).length} notes</span>
          </div>
          <div className="shift-today-corrections-list">
            {(auto.housekeepingObservations||[]).map(item=><div key={'staff-note-'+item.roomId} className="shift-today-correction">
              <div className="shift-today-correction-meta"><strong>{item.roomName}</strong>
                <span>Room note</span>
                {item.lastUpdatedBy&&<span>Room record last updated by {item.lastUpdatedBy}</span>}
              </div>
              <p style={{whiteSpace:'pre-wrap'}}>{item.note}</p>
            </div>)}
          </div>
        </div>}
        {summary.todayStaff.length>0 && <div className="shift-staff-strip">
          {summary.todayStaff.map((person:any)=><span key={person.staffMemberId}><strong>{person.name}</strong><small>{person.roleLabel||'On site'}</small></span>)}
        </div>}
      </section>

      <section id="tonights-dessert" className="shift-section full shift-tonights-dessert">
        <div className="shift-dessert-section-head">
          <div>
            <span className="shift-dessert-eyebrow">EVENING HANDOFF</span>
            <h3>Tonight&apos;s Dessert</h3>
            <p>Prepare tonight for breakfast on {auto.breakfastDate}.</p>
          </div>
          <div className="shift-dessert-total"><strong>{summary.dessertsTonight}</strong><span>{summary.dessertsTonight===1?'room':'rooms'}</span></div>
        </div>
        <div className="shift-dessert-workspace">
          <div className="shift-dessert-compose">
            <div className="shift-dessert-pane-title">
              <h4>{editingDessertId?'Edit dessert':'Add a dessert'}</h4>
              <span>{editingDessertId?'Update the name or rooms':'Choose who receives it'}</span>
            </div>
            <label className="shift-dessert-input">Dessert being served
              <input type="text" maxLength={500} value={dessertName} disabled={!canManage||locked||dessertSaving} onChange={event=>setDessertName(event.target.value)} placeholder="e.g., Flourless chocolate torte" aria-label="Dessert being served"/>
            </label>
            <div className="shift-dessert-room-list">
              <strong>Assign to rooms</strong>
              <p className="shift-dessert-hint">Choose specific rooms, or leave all unchecked to serve every eligible room.</p>
              {summary.dessertRooms.length
                ? <div className="shift-dessert-room-chips" role="group" aria-label="Choose dessert rooms">{summary.dessertRooms.map((room:any)=>{
                  const selected=dessertRoomIds.includes(String(room.roomId))
                  return <button type="button" key={room.roomId} aria-pressed={selected} className={selected?'is-selected':''} disabled={!canManage||locked||dessertSaving} onClick={()=>setDessertRoomIds(current=>selected?current.filter(id=>id!==String(room.roomId)):[...current,String(room.roomId)])}>
                    <span aria-hidden="true" className="shift-dessert-chip-check">{selected?'✓':''}</span>
                    <span>{room.roomName}</span>
                  </button>
                })}</div>
                : <p>No dessert rooms scheduled.</p>}
            </div>
            {canManage&&!locked&&<div className="shift-dessert-form-actions">
              <button type="button" className="ops-primary-btn" disabled={dessertSaving||!dessertName.trim()} onClick={()=>void saveDessertAssignment()}>{dessertSaving?'Saving…':editingDessertId?'Update dessert':'Save dessert'}</button>
              {editingDessertId&&<button type="button" className="ops-secondary-btn" disabled={dessertSaving} onClick={()=>{setDessertName('');setDessertRoomIds([]);setEditingDessertId('')}}>Cancel edit</button>}
              {!editingDessertId&&<span className="shift-dessert-save-help">Save, then add another dessert if needed.</span>}
            </div>}
          </div>
          <div className="shift-dessert-saved-list">
            <div className="shift-dessert-pane-title">
              <h4>Saved desserts</h4>
              <span>{dessertDetails.length} {dessertDetails.length===1?'dessert':'desserts'}</span>
            </div>
            {dessertDetails.length?dessertDetails.map(entry=><div key={entry.id} className="shift-dessert-saved-row">
              <div className="shift-dessert-saved-content">
                <strong>{entry.name}</strong>
                <span>{entry.rooms.length?entry.rooms.map(room=>room.roomName).join(' · '):'No eligible rooms assigned'}</span>
                {entry.allRooms&&<small>Default for unassigned rooms</small>}
              </div>
              {canManage&&!locked&&<div className="shift-dessert-saved-actions">
                <button type="button" className="ops-secondary-btn" disabled={dessertSaving} onClick={()=>selectDessertForEdit(entry)}>Edit</button>
                <button type="button" className="ops-secondary-btn" disabled={dessertSaving} onClick={()=>void deleteDessert(entry.id)}>Remove</button>
              </div>}
            </div>):<p className="shift-dessert-empty">No desserts saved yet. Add your first dessert using the form.</p>}
            {dessertUnassigned.length>0&&<p className="shift-dessert-unassigned">Still unassigned: {dessertUnassigned.map((room:any)=>room.roomName).join(', ')}</p>}
          </div>
        </div>
      </section>

      <section className="shift-section shift-action-section">
        <h3>Shift Highlights &amp; Handoff</h3>
        <p className="shift-handoff-description">Key updates, requests, follow-ups, and completed work, organized automatically for the next shift.</p>
        {handoffGroups.length ? <div className="shift-handoff-groups">
          {handoffGroups.map(group=><div className={`shift-handoff-group is-${group.id}`} key={group.id}>
            <div className="shift-handoff-group-label"><strong>{group.label}</strong><span>{group.items.length}</span></div>
            <div className="shift-action-list">
              {group.items.map(item=><div className="shift-action-item" key={item.key}>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>)}
            </div>
          </div>)}
        </div> : <div className="shift-muted">No shift highlights recorded yet.</div>}
      </section>

      <section className="shift-section full shift-maintenance-today">
        <div className="shift-maintenance-header"><div><h3>Maintenance Handled Today</h3><p>Items completed on {date}; unfinished repairs remain in the handoff.</p></div>
         <span className="shift-maintenance-count">{summary.maintenanceComplete.filter((m:any)=>m.include_in_shift_report!==false).length} completed</span>
        </div>
        {summary.maintenanceComplete.filter((m:any)=>m.include_in_shift_report!==false).length
        ? <div className="shift-maintenance-list">{summary.maintenanceComplete.filter((m:any)=>m.include_in_shift_report!==false).map((m:any)=><div className="shift-maintenance-item" key={m.id}>
           <strong>{m.roomName||m.area||'Property'}</strong>
           <div><b>{m.title}</b>{m.description&&<p>{m.description}</p>}</div>
           <span>{m.completedByName?'Completed by '+m.completedByName:'Completed'}</span>
          </div>)}</div>
        : <p className="shift-muted">No completed maintenance work orders recorded for this date.</p>}
        <div className="shift-maintenance-extra">{textarea('maintenanceNotes','Additional maintenance handled','Record work handled outside a ticket, including location and resolution.','maintenance')}</div>
      </section>
      <section className="shift-section">
        <h3>Breakfast · {auto.breakfastDate}</h3>
        <div className="shift-breakfast-overview">
          <strong>{summary.menusReceived + summary.menusMissing.length} rooms expected</strong>
          <span>{summary.menusReceived} menus received · {summary.menusMissing.length} missing</span>
        </div>
        {summary.menusMissing.length>0 && <div className="shift-missing-menu-list">
          <strong>Missing menus</strong>
          <ul>{summary.menusMissing.map((r:any)=><li key={r.roomId}>{r.roomName}</li>)}</ul>
        </div>}
      </section>

      <section className="shift-section full">
        <h3>Room / Guest Notes</h3>
        {roomNotes.filter(n=>n.include_in_shift_report).length>0 && <div className="shift-list">
          {roomNotes.filter(n=>n.include_in_shift_report).map(n=><div key={n.id} className="shift-line">
            <span><strong>{n.roomName}</strong><br/><span className="shift-muted"><b>{n.createdByInitials || authorName(n.createdByName)}:</b> {n.note}</span></span>
            <span className="shift-badge">{n.note_type}</span>
          </div>)}
        </div>}
        {textarea('guestNotes','Guest issues / requests / recovery','Complaints, special requests, compensation, late arrivals, anything the next shift should know.','guest')}
      </section>

      <section className="shift-section"><h3>Staff Notes</h3>{textarea('staffNotes','Staff notes','Attendance, coverage changes, training, handoff information.','staff')}</section>
      <section className="shift-section"><h3>Supplies / Inventory</h3>{textarea('suppliesNotes','Supplies','Running low, ordered today, deliveries received.','supplies')}</section>
      <section className="shift-section"><h3>Tomorrow / Follow-up</h3>{textarea('tomorrowNotes','Tomorrow priorities','Room follow-up, breakfast outstanding, maintenance carryover, priority tasks.','tomorrow')}</section>
      <section className="shift-section"><h3>General Notes</h3>{textarea('generalNotes','General notes','Anything else that belongs in the daily record.','general')}</section>

      <section className="shift-section shift-snapshot-section shift-tomorrow-section">
        <div className="shift-day-heading">
          <div><span>TOMORROW</span><h3>{auto.breakfastDate}</h3></div>
          <small>Scheduled staffing, room workload, breakfast, and tonight&apos;s dessert prep</small>
        </div>
        <div className="shift-snapshot-grid">
          <div><span>Staff scheduled</span><strong>{summary.tomorrowStaff.length}</strong></div>
          <div><span>Room cleans</span><strong>{summary.tomorrowCleans}</strong></div>
          <div><span>Refreshes</span><strong>{summary.tomorrowRefreshes}</strong></div>
          <div><span>Breakfast rooms</span><strong>{summary.breakfastExpected}</strong></div>
          <div><span>Menus received</span><strong>{summary.menusReceived}</strong></div>
          <div><span>Desserts tonight</span><strong>{summary.dessertsTonight}</strong></div>
        </div>
        {summary.tomorrowStaff.length>0 && <div className="shift-staff-strip">
          {summary.tomorrowStaff.map((person:any)=><span key={person.staffMemberId}><strong>{person.name}</strong><small>{person.roleLabel||'Scheduled'}</small></span>)}
        </div>}
        <p className="shift-dessert-note">Desserts are counted from tomorrow&apos;s breakfast-inclusive room rates, not from menu submission timing.</p>
      </section>

      <section className="shift-section full"><h3>Management Notes</h3>{textarea('managementNotes','Manager-only notes','Attendance concerns, performance issues, guest compensation decisions, incidents, disciplinary matters, or other restricted notes.','management')}</section>
    </div> : tab==='room-notes' ? <div className="shift-section full">
      <h3>Room Notes</h3>
      <div className="room-note-form">
        <label>Room<select value={noteRoomId} onChange={e=>setNoteRoomId(e.target.value)}><option value="">Select room</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>Type<select value={noteType} onChange={e=>setNoteType(e.target.value as any)}><option value="daily">Daily</option><option value="persistent">Persistent</option></select></label>
        <label className="note-input">Note<input value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="What should the next shift or future staff know?"/></label>
        <label style={{display:'flex',alignItems:'center',gap:7,paddingBottom:12}}><input type="checkbox" checked={includeNote} onChange={e=>setIncludeNote(e.target.checked)} style={{width:'auto'}}/>Shift report</label>
        <button type="button" className="ops-primary-btn" onClick={addRoomNote} disabled={saving}>Add note</button>
      </div>
      <div className="room-note-list">{roomNotes.map(n=><div key={n.id} className="room-note"><strong>{n.roomName}</strong><span className="shift-badge">{n.note_type}</span><div>{n.note}<div className="shift-muted">Added by {n.createdByName}</div></div><button type="button" className="ops-secondary-btn" onClick={()=>resolveRoomNote(n.id,!n.resolved)}>{n.resolved?'Reopen':'Resolve'}</button></div>)}</div>
    </div> : tab==='handoff' ? <div className="handoff-column">
      <section className="handoff-card"><h3>Unresolved room issues</h3>{handoffRoomNotes.length ? handoffRoomNotes.map(n=><div key={n.id} className="shift-line"><span><strong>{n.roomName}</strong><br/><span className="shift-muted">{n.note}</span></span><span className="shift-badge">{n.note_type}</span></div>) : <div className="shift-muted">No unresolved room notes.</div>}</section>
      <section className="handoff-card"><h3>Outstanding breakfast menus · {auto.breakfastDate}</h3>{summary.menusMissing.length ? summary.menusMissing.map((r:any)=><div key={r.roomId} className="shift-line"><span>{r.roomName}</span><span className="shift-badge warn">Menu needed</span></div>) : <div className="shift-muted">No outstanding scheduled breakfast menus.</div>}</section>
      <section className="handoff-card"><h3>Open maintenance</h3>{handoffMaintenance.length ? handoffMaintenance.map((m:any)=><div key={m.id} className="shift-line"><span><strong>{m.roomName}</strong><br/><span className="shift-muted">{m.title}</span></span><span className={`shift-badge ${m.priority==='urgent'?'danger':''}`}>{m.status.replace('_',' ')}</span></div>) : <div className="shift-muted">No open maintenance work orders.</div>}</section>
      <section className="handoff-card"><h3>Tomorrow priorities</h3><div style={{whiteSpace:'pre-wrap'}}>{draft.tomorrowNotes || <span className="shift-muted">No priorities entered yet.</span>}</div></section>
    </div> : <div className="shift-section full">
      <h3>Management Notes</h3>
      {canManage ? <>{textarea('managementNotes','Manager-only notes','Attendance concerns, performance issues, guest compensation decisions, incidents, disciplinary matters, or other restricted notes.')}<p className="shift-muted">This field is only returned to manager-level users by the API.</p></> : <div className="manager-lock">Manager access required.</div>}
    </div>}
  </div>
}
