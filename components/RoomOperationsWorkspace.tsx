'use client'
import {useEffect,useMemo,useState,useTransition} from 'react'
import {useRouter} from 'next/navigation'
import Link from 'next/link'
import { derivedLiveCondition, roomServiceTask } from '@/lib/room-state'
import {CalendarDays,ChevronRight,Search,SlidersHorizontal,X} from 'lucide-react'
import type ReservationsBoard from '@/components/ReservationsBoard'
import OpsRoomHub from '@/components/OpsRoomHub'
import { NON_DESKTOP_WORKSPACE_MEDIA } from '@/lib/layout-breakpoints'

type ReservationRow=Parameters<typeof ReservationsBoard>[0]['rows'][number]
type Category='all'|'Arrival'|'Stayover'|'Checkout'|'Out/In'|'Vacant'
type OpsRow=ReservationRow&{expectedArrivalTime?:string|null;cleanOrder?:number|null;tubCleanDue?:boolean;tubCleanCompleted?:boolean;tubAssignedTo?:string}
function reservationType(row:ReservationRow){
 const value=String(row.operationalStatus||row.status||'').toLowerCase()
 if(value.includes('out/in'))return 'Out/In'
 if(value.includes('checkout'))return 'Checkout'
 if(value.includes('stayover'))return 'Stayover'
 if(value.includes('arrival'))return 'Arrival'
 return row.operationalStatus||row.status||'Vacant'
}
function roomOutLabel(row:ReservationRow){
 const match=/^OUT(?:-([A-Z]{2,4}))?$/i.exec(String(row.serviceType||'').trim())
 return match?'OUT'+(match[1]?'·'+match[1].toUpperCase():''):''
}
function roomCondition(row:ReservationRow){
 // Live condition is a derived fact, not an indication that someone manually
 // confirmed the status. A missing condition never overrides an active stay.
 const status=reservationType(row)
 const derived=derivedLiveCondition({
  reservationStatus:status,
  serviceType:row.serviceType,
  stripHold:row.stripHold,
  roomCondition:row.roomCondition,
  complete:row.complete,
  inspected:row.inspected,
  checkIssueOpen:row.checkIssueOpen,
  haSignedBy:row.haChecked?'ha':null,
  fohSignedBy:row.fohChecked?'foh':null
 })
 return derived||'Not recorded'
}
function activeGuest(row:ReservationRow,day:string){
 const options=[row.arriving,row.staying,row.primary]
 return options.find(stay=>{
  if(!stay)return false
  const s=stay as {arrival_date?:string|null;checkout_date?:string|null}
  return Boolean(s.arrival_date&&s.checkout_date&&day>=s.arrival_date&&day<s.checkout_date)
 })||null
}
// Normalize imported, manager-entered and note-based times into the same display format.
function parseArrivalClock(raw?:string|null):string|null{
 const value=String(raw||'').trim()
 const match=/^(\\d{1,2})(?::(\\d{2}))?(?::\\d{2})?\\s*(a\\.?m\\.?|p\\.?m\\.?)?$/i.exec(value)
 if(!match)return null
 let hour=Number(match[1])
 const minute=Number(match[2]||0)
 const period=String(match[3]||'').replace(/\\./g,'').toLowerCase()
 if(minute>59||hour>23||hour<0||((period==='am'||period==='pm')&&(hour<1||hour>12)))return null
 if(period)hour=hour%12+(period==='pm'?12:0)
 const displayHour=hour%12||12
 return displayHour+(minute?':'+String(minute).padStart(2,'0'):'')+(hour>=12?'pm':'am')
}
function arrivalNoteTime(guest:ReturnType<typeof activeGuest>):string|null{
 if(!guest)return null
 // Only use a time explicitly associated with arriving/check-in, not meal or activity times.
 const notes=[guest.innkeeper_notes,guest.guest_comments]
 for(const note of notes){
  const text=String(note||'')
  const match=/(?:\\b(?:arrival|arriving|check[ -]?in|eta|expected arrival)\\b)(?:\\s+(?:time|around|approximately|approx\\.?|about|is|at|by))?\\s*[:=–-]?\\s*(\\d{1,2}(?::\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)/i.exec(text)
  if(match){
   const time=parseArrivalClock(match[1])
   if(time)return time
  }
 }
 return null
}
function arrivalServiceLabel(type:string,row:OpsRow,guest:ReturnType<typeof activeGuest>){
 if(type!=='Arrival'&&type!=='Out/In')return type
 const time=arrivalNoteTime(guest)||parseArrivalClock(row.expectedArrivalTime)||parseArrivalClock(guest?.check_in_time)||'4pm'
 return type+' ('+time+')'
}
function shiftDate(day:string,days:number){
 const date=new Date(day+'T12:00:00Z')
 date.setUTCDate(date.getUTCDate()+days)
 return date.toISOString().slice(0,10)
}
function hasUnassignedService(row:ReservationRow){
 const task=roomServiceTask({
  reservationStatus:row.operationalStatus||row.status,
  serviceType:row.serviceType,
  roomCondition:row.roomCondition,
  stripHold:row.stripHold
 })
 return (task==='full'||task==='refresh')&&!row.complete&&!row.assignedTo?.trim()
}
function conditionTone(condition:string){
 const value=condition.toLowerCase()
 if(/dirty|issue|blocked/.test(value))return 'warning'
 if(/cleaning|in progress/.test(value))return 'cleaning'
 if(/ready|vacant \(clean\)/.test(value))return 'ready'
 if(/occupied/.test(value))return 'occupied'
 return 'neutral'
}
export default function RoomOperationsWorkspace({serviceDate,todayDate,rows,canManageRooms}:{serviceDate:string;todayDate:string;rows:ReservationRow[];canEdit:boolean;canManageRooms:boolean}){
 const router=useRouter()
 const [isChangingDate,startDateTransition]=useTransition()
 const [dateInput,setDateInput]=useState(serviceDate)
 const [selected,setSelected]=useState<{roomId:string;reservationId?:string}|null>(null)
 const [category,setCategory]=useState<Category>('all')
 const [showFilters,setShowFilters]=useState(false)
 const [query,setQuery]=useState('')
 const [conditionsOnly,setConditionsOnly]=useState(false)
 const [displayMode,setDisplayMode]=useState<'table'|'cards'>('cards')
 const [isCompact,setIsCompact]=useState(false)
 useEffect(()=>{
  const media=window.matchMedia(NON_DESKTOP_WORKSPACE_MEDIA)
  const sync=()=>{
   const compact=media.matches
   setIsCompact(compact)
   try{
    // Separate preferences prevent choosing Table on desktop from overriding the mobile default.
    const saved=window.localStorage.getItem(compact?'ths-room-ops-view-mobile':'ths-room-ops-view-desktop')
     ||(!compact?window.localStorage.getItem('ths-room-ops-view'):null)
    setDisplayMode(saved==='table'||saved==='cards'?saved:(compact?'cards':'table'))
   }catch{
    setDisplayMode(compact?'cards':'table')
   }
  }
  sync()
  media.addEventListener('change',sync)
  return()=>media.removeEventListener('change',sync)
 },[])
 function chooseDisplayMode(mode:'table'|'cards'){
  setDisplayMode(mode)
  try{window.localStorage.setItem(isCompact?'ths-room-ops-view-mobile':'ths-room-ops-view-desktop',mode)}catch{}
 }

 const [liveRows,setLiveRows]=useState<OpsRow[]>(rows)
 useEffect(()=>{setLiveRows(rows)},[rows])
 useEffect(()=>{setDateInput(serviceDate)},[serviceDate])
 function chooseDate(date:string){
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z')))return
  setDateInput(date)
  if(date===serviceDate)return
  setSelected(null)
  startDateTransition(()=>router.replace('/reservations?date='+encodeURIComponent(date),{scroll:false}))
 }
 useEffect(()=>{
  let active=true
  const refresh=async()=>{
   if(document.visibilityState==='hidden')return
   try{
    const response=await fetch('/api/reservations/live-rooms?date='+encodeURIComponent(serviceDate),{cache:'no-store'})
    if(!response.ok)return
    const result=await response.json()
    if(active&&Array.isArray(result.rooms)){
     setLiveRows(previous=>{
      const updates=new Map<string,Partial<OpsRow>>(result.rooms.map((room:OpsRow)=>[room.roomId,room]))
      return previous.map(row=>({...row,...(updates.get(row.roomId)||{})}))
     })
    }
   }catch{}
  }
  window.addEventListener('ths:live-data-refresh',refresh)
  void refresh()
  return()=>{active=false;window.removeEventListener('ths:live-data-refresh',refresh)}
 },[serviceDate])
 const counts=useMemo(()=>{
  const count=(type:Category)=>liveRows.filter(row=>reservationType(row)===type).length
  return {all:liveRows.length,Arrival:count('Arrival')+count('Out/In'),Stayover:count('Stayover'),Checkout:count('Checkout'),'Out/In':count('Out/In'),Vacant:count('Vacant')}
 },[liveRows])
 const filtered=useMemo(()=>liveRows.filter(row=>{
  if(category!=='all'&&!(category==='Arrival'?['Arrival','Out/In'].includes(reservationType(row)):reservationType(row)===category))return false
  if(conditionsOnly&&!/dirty|issue|blocked|not confirmed/i.test(roomCondition(row))&&!row.checkIssueOpen&&!hasUnassignedService(row))return false
  const guest=activeGuest(row,serviceDate)?.guest_name||''
  return !query.trim()||[row.roomName,guest,row.roomNotes||'',row.assignedTo||''].some(value=>String(value).toLowerCase().includes(query.trim().toLowerCase()))
 }),[liveRows,category,conditionsOnly,query,serviceDate])
 return <div className={'ths-unified-operations ths-operations-simplified'+(isChangingDate?' is-date-loading':'')}>
   <div className="ths-calendar-date ths-room-operations-date" aria-label="Choose room operations date">
    <CalendarDays size={18} aria-hidden="true"/>
    <input aria-label="Room operations date" type="date" value={dateInput} disabled={isChangingDate} onChange={event=>chooseDate(event.target.value)}/>
    <div className="ths-calendar-shortcuts" role="group" aria-label="Navigate dates">
     <button type="button" disabled={isChangingDate} onClick={()=>chooseDate(shiftDate(serviceDate,-1))}>Previous day</button>
     <button type="button" disabled={isChangingDate} aria-pressed={serviceDate===todayDate} onClick={()=>chooseDate(todayDate)}>Today</button>
     <button type="button" disabled={isChangingDate} onClick={()=>chooseDate(shiftDate(serviceDate,1))}>Next day</button>
    </div>
    {isChangingDate&&<span className="ths-room-operations-date-loading" role="status">Updating rooms…</span>}
   </div>
   <div style={{display:'flex',justifyContent:'flex-end',margin:'10px 0 6px'}}>
    <button type="button" aria-expanded={showFilters} aria-controls="room-operations-filters" onClick={()=>setShowFilters(v=>!v)} style={{display:'inline-flex',alignItems:'center',gap:7,padding:'8px 12px',border:'1px solid #d7e5e9',borderRadius:10,background:showFilters||category!=='all'?'#e0f2ef':'#fff',color:'#315a67',fontWeight:700,fontSize:12,cursor:'pointer'}}>
     <SlidersHorizontal size={15}/> Filter{category!=='all'?' · '+(category==='Arrival'?'Arrivals':category):''}
    </button>
   </div>
   {showFilters&&<div id="room-operations-filters" className="ths-ops-stats" aria-label="Filter by daily room activity">
    {(['Arrival','Stayover','Checkout','Out/In','Vacant'] as const).map(type=><button key={type} type="button" aria-pressed={category===type} onClick={()=>setCategory(category===type?'all':type)}><strong>{counts[type]}</strong><span>{type==='Arrival'?'Arrivals':type==='Stayover'?'Stayovers':type==='Checkout'?'Checkouts':type==='Vacant'?'Vacant':'Out / In'}</span></button>)}
   </div>}
   <div className="ths-ops-list-heading">
    <strong>Rooms <span>{filtered.length} of {counts.all}</span></strong>
    <div role="group" aria-label="Room display" style={{display:'flex',gap:6,marginLeft:'auto'}}>
     <button type="button" className={displayMode==='table'?'active':''} aria-pressed={displayMode==='table'} onClick={()=>chooseDisplayMode('table')}>Table</button>
     <button type="button" className={displayMode==='cards'?'active':''} aria-pressed={displayMode==='cards'} onClick={()=>chooseDisplayMode('cards')}>Cards</button>
    </div>
    <button type="button" className={conditionsOnly?'active':''} aria-pressed={conditionsOnly} onClick={()=>setConditionsOnly(value=>!value)}><SlidersHorizontal size={16}/> Needs attention</button>
    {canManageRooms&&<Link className="ths-ops-assignments-link" href={'/housekeeping/assignments?date='+encodeURIComponent(serviceDate)}>Staff assignments</Link>}
   </div>
   <label className="ths-ops-search"><Search size={18}/><input aria-label="Find room or guest" placeholder="Find room or guest" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" aria-label="Clear search" onClick={()=>setQuery('')}><X size={16}/></button>}</label>
   {displayMode==='table'&&<div className="ths-ops-table-scroll" style={{overflowX:'auto',width:'100%',WebkitOverflowScrolling:'touch',borderRadius:16,border:'1px solid #dce5e9',background:'white'}}>
    <table className="ths-ops-full-table" style={{width:'100%',borderCollapse:'collapse',minWidth:910,textAlign:'left',fontSize:14}}>
     <thead><tr style={{background:'#f0f6f8'}}>
      {['Room','Service','Guest','Housekeeper','Live condition','Details'].map(label=><th key={label} scope="col" style={{padding:'12px 14px',whiteSpace:'nowrap',borderBottom:'1px solid #dce5e9'}}>{label}</th>)}
     </tr></thead>
     <tbody>{filtered.map(row=>{
      const type=reservationType(row)
      const condition=roomCondition(row)
      const guest=activeGuest(row,serviceDate)
      const open=()=>setSelected({roomId:row.roomId,reservationId:guest?.id||undefined})
      return <tr key={row.roomId} tabIndex={0} role="button" aria-label={`Open ${row.roomName} room interactions`} onClick={open} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}}} style={{borderBottom:'1px solid #e7edf0',cursor:'pointer'}}>
       <th scope="row" style={{padding:'12px 14px',whiteSpace:'nowrap'}}><span className="ths-ops-room-name-with-out">{row.roomName}{roomOutLabel(row)&&<sup className="ths-ops-out-sup" title="Room marked OUT; tip collection initials shown if available" aria-label={'Room marked '+roomOutLabel(row)}>{roomOutLabel(row)}</sup>}</span></th>
       <td style={{padding:'12px 14px',whiteSpace:'nowrap'}}>{arrivalServiceLabel(type,row,guest)}{String(row.serviceType||'').toUpperCase()==='RF'?' · RF':''}</td>
       <td style={{padding:'12px 14px'}}>{guest?.guest_name||'—'}</td>
       <td style={{padding:'12px 14px',whiteSpace:'nowrap'}}>{row.assignedTo?.trim()||'—'}{row.assignedTo?.trim()&&row.cleanOrder!=null&&<sup style={{marginLeft:1,fontWeight:700}}>{row.cleanOrder}</sup>}</td>
       <td style={{padding:'12px 14px'}}><span className={`ths-ops-condition ${conditionTone(condition)}`}>{condition}</span></td>
       <td style={{padding:'12px 14px',minWidth:180}}>
        <span className="ths-ops-tags">
         {row.breakfastTag&&<span>Breakfast</span>}
         {row.lateArrival&&<span>Late arrival</span>}
         {row.checkIssueOpen&&<span className="alert">Inspection issue</span>}
        {row.tubCleanDue&&<span className="alert">Tub only{row.tubAssignedTo?` · ${row.tubAssignedTo}`:" · Unassigned"}</span>}
        {row.tubCleanCompleted&&<span>Tub cleaned</span>}
         {row.roomNotes&&<span>Room note</span>}
         {/OUT-([A-Z]{2,4})/i.test(String(row.serviceType||''))&&<span>Tips · {String(row.serviceType).split('-')[1]}</span>}
        </span>
        {row.roomNotes?.trim()&&<div className="ths-ops-note-preview" title={row.roomNotes} aria-label={'Room note: '+row.roomNotes}>{row.roomNotes}</div>}
       </td>
      </tr>
     })}</tbody>
    </table>
    {!filtered.length&&<div className="ths-ops-empty">No rooms match these filters.</div>}
   </div>}
   {displayMode==='cards'&&<div className="ths-ops-room-list">
    {filtered.map(row=>{
     const type=reservationType(row)
     const condition=roomCondition(row)
     const guest=activeGuest(row,serviceDate)
     const service=String(row.serviceType||'').trim().toUpperCase()
     return <button className="ths-ops-room-row ths-ops-room-card" type="button" key={row.roomId} onClick={()=>setSelected({roomId:row.roomId,reservationId:guest?.id||undefined})}>
      <span className="ths-ops-room-info">
       <span className="ths-ops-card-top">
        <span className="ths-ops-room-name">{row.roomName}{roomOutLabel(row)&&<sup className="ths-ops-out-sup" title="Room marked OUT; initials if recorded" aria-label={'Room marked '+roomOutLabel(row)}>{roomOutLabel(row)}</sup>}<span className="ths-ops-activity">{arrivalServiceLabel(type,row,guest)}{service==='RF'?' · RF':''}</span></span>
        <span className="ths-ops-card-condition"><span className={`ths-ops-condition ${conditionTone(condition)}`}>{condition}</span><ChevronRight size={18} aria-hidden="true"/></span>
       </span>
       <span className="ths-ops-card-summary">
        <span className="ths-ops-card-field"><span className="ths-ops-card-label">Guest</span><span className="ths-ops-card-value">{guest?.guest_name||'No active reservation'}</span></span>
        <span className="ths-ops-card-field"><span className="ths-ops-card-label">Housekeeper</span><span className="ths-ops-card-value">{row.assignedTo?.trim()||'Unassigned'}{row.assignedTo?.trim()&&row.cleanOrder!=null&&<sup style={{marginLeft:1,fontWeight:700}}>{row.cleanOrder}</sup>}</span></span>
       </span>
       <span className="ths-ops-tags">
        {row.breakfastTag&&<span>Breakfast</span>}
        {row.lateArrival&&<span>Late arrival</span>}
        {row.checkIssueOpen&&<span className="alert">Inspection issue</span>}
        {hasUnassignedService(row)&&<span className="ths-ops-housekeeper-unassigned">Needs assignment</span>}
        {row.tubCleanDue&&<span className="alert">Tub only{row.tubAssignedTo?` · ${row.tubAssignedTo}`:' · Unassigned'}</span>}
        {service==='RF'&&<span>Refresh</span>}
        {/^OUT(?:-[A-Z]{2,4})?$/i.test(service)&&<span>OUT</span>}
        {/^OUT-([A-Z]{2,4})$/i.test(service)&&<span>Tips collected · {service.split('-')[1]}</span>}
       </span>
       {row.roomNotes?.trim()&&<span className="ths-ops-card-note" title={row.roomNotes}><strong>Room note</strong><span>{row.roomNotes}</span></span>}
      </span>
     </button>
    })}
    {!filtered.length&&<div className="ths-ops-empty">No rooms match these filters. Clear search or select another category.</div>}
   </div>}
   {selected&&<OpsRoomHub roomId={selected.roomId} date={serviceDate} reservationId={selected.reservationId} onClose={()=>setSelected(null)}/>}
  </div>
}
