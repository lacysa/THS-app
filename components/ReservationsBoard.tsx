'use client'

import { CalendarDays, ChevronLeft, ChevronRight, DoorOpen, Package, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { derivedLiveCondition, roomNextAction, roomWorkflowLabel } from '@/lib/room-state'

type Stay={
  id?:string
  guest_phone?:string|null
  rate_plan?:string|null
  occupancy?:number|null
  guest_name?:string|null
  door_code?:string|null
  arrival_date?:string|null
  checkout_date?:string|null
  check_in_time?:string|null
  products_raw?:string|null
  dietary_restrictions?:string|null
  guest_comments?:string|null
  innkeeper_notes?:string|null
  reason_for_visit?:string|null
}

type Row={
  roomId:string
  roomName:string
  status:string
  primary:Stay|null
  arriving:Stay|null
  staying:Stay|null
  departing:Stay|null
  serviceType?:string
  roomCondition?:string
  nextShiftCondition?:string
  complete?:boolean
  inspected?:boolean
  fohChecked?:boolean
  haChecked?:boolean
  housekeeperAttested?:boolean
  checkIssueOpen?:boolean
  operationalStatus?:string
  lateArrival?:boolean
  stripHold?:string
}

function addDay(value:string,amount:number){
  const d=new Date(value+'T12:00:00Z')
  d.setUTCDate(d.getUTCDate()+amount)
  return d.toISOString().slice(0,10)
}

function pretty(value:string){
  const d=new Date(value+'T12:00:00')
  return new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(d)
}

function cleanDiet(value?:string|null){
  const text=String(value||'').trim()
  return text && !/^(no|none|n\/a|no dietary restrictions)$/i.test(text) ? text : ''
}

function statusClass(value:string){
  return 'reservation-status-'+String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')
}

export default function ReservationsBoard({serviceDate,rows,canEdit=false}:{serviceDate:string;rows:Row[];canEdit?:boolean}){
  const router=useRouter()
  const [view,setView]=useState<'overview'|'edit'>('overview')
  useEffect(()=>{if(!canEdit)return;try{if(window.sessionStorage.getItem('ths-reservations-view')==='edit')setView('edit')}catch{}},[canEdit])
  function changeView(next:'overview'|'edit'){setView(next);try{window.sessionStorage.setItem('ths-reservations-view',next)}catch{}}
  const [edits,setEdits]=useState<Record<string,Partial<Row>>>({})
  const [liveRooms,setLiveRooms]=useState<Record<string,Partial<Row>>>({})
  const refreshing=useRef(false)
  useEffect(()=>{
    let mounted=true
    const refresh=async()=>{
      if(refreshing.current||document.visibilityState!=='visible')return
      refreshing.current=true
      try{
        const response=await fetch('/api/reservations/live-rooms?date='+encodeURIComponent(serviceDate),{cache:'no-store'})
        if(!response.ok)return
        const data=await response.json()
        if(mounted)setLiveRooms(Object.fromEntries((data.rooms||[]).map((r:Row)=>[r.roomId,r])))
      }catch{}finally{refreshing.current=false}
    }
    window.addEventListener('ths:live-data-refresh',refresh)
    void refresh()
    return()=>{mounted=false;window.removeEventListener('ths:live-data-refresh',refresh)}
  },[serviceDate])
  const [reservationEdits,setReservationEdits]=useState<Record<string,Partial<Stay>>>({})
  const [reservationSaving,setReservationSaving]=useState<Record<string,boolean>>({})
  const [reservationFeedback,setReservationFeedback]=useState<Record<string,string>>({})
  const [reservationPanel,setReservationPanel]=useState<string>('')
  function stayField(stay:Stay,field:keyof Stay){return String(reservationEdits[stay.id||'']?.[field]??stay[field]??'')}
  async function saveStay(stay:Stay){
    if(!stay.id||reservationSaving[stay.id])return
    const patch=reservationEdits[stay.id]||{}
    setReservationSaving(p=>({...p,[stay.id!]:true}))
    setReservationFeedback(p=>({...p,[stay.id!]:''}))
    try{
      const response=await fetch('/api/reservations/stay',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:stay.id,patch})})
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error||'Save failed')
      Object.assign(stay,result.stay)
      setReservationEdits(p=>{const n={...p};delete n[stay.id!];return n})
      setReservationFeedback(p=>({...p,[stay.id!]:'Saved ✓'}))
    }catch(error:any){setReservationFeedback(p=>({...p,[stay.id!]:error?.message||'Save failed'}))}
    finally{setReservationSaving(p=>({...p,[stay.id!]:false}))}
  }
  const [saving,setSaving]=useState<Record<string,boolean>>({})
  const [feedback,setFeedback]=useState<Record<string,string>>({})
  const shown=rows.map(row=>({...row,...(liveRooms[row.roomId]||{}),...(edits[row.roomId]||{})}))
  async function editRoom(row:Row,patch:Partial<Row>){
    if(!canEdit || saving[row.roomId])return
    const next={...edits[row.roomId],...patch}
    setEdits(current=>({...current,[row.roomId]:next}))
    setSaving(current=>({...current,[row.roomId]:true}))
    setFeedback(current=>({...current,[row.roomId]:''}))
    const apiPatch:any={}
    if('operationalStatus' in patch)apiPatch.reservationStatus=patch.operationalStatus
    if('roomCondition' in patch)apiPatch.roomCondition=patch.roomCondition
    if('stripHold' in patch)apiPatch.stripHold=patch.stripHold
    if('lateArrival' in patch)apiPatch.lateArrival=patch.lateArrival
    try{
      const response=await fetch('/api/housekeeping/day',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({serviceDate,roomId:row.roomId,patch:apiPatch})})
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error||'Could not save room')
      if(result.row)setEdits(current=>({...current,[row.roomId]:{...current[row.roomId],operationalStatus:result.row.reservationStatus,lateArrival:result.row.lateArrival,stripHold:result.row.stripHold,roomCondition:result.row.roomCondition}}))
      setLiveRooms(current=>({...current,[row.roomId]:{...current[row.roomId],...(result.row?{operationalStatus:result.row.reservationStatus,stripHold:result.row.stripHold,roomCondition:result.row.roomCondition}:patch)}}))
      setEdits(current=>{const next={...current};delete next[row.roomId];return next})
      setFeedback(current=>({...current,[row.roomId]:'Saved'}))
    }catch(error:any){
      setEdits(current=>{const copy={...current};delete copy[row.roomId];return copy})
      setFeedback(current=>({...current,[row.roomId]:error?.message||'Save failed'}))
    }finally{setSaving(current=>({...current,[row.roomId]:false}))}
  }
  const [statusFilter,setStatusFilter]=useState<'All'|'Arrival'|'Stayover'|'Checkout'|'Out/In'>('All')

  const displayStatus=(row:Row):'Arrival'|'Stayover'|'Checkout'|'Out/In'=>{
    if(row.arriving&&row.departing) return 'Out/In'
    if(row.arriving) return 'Arrival'
    if(row.departing) return 'Checkout'
    return 'Stayover'
  }

  const counts={
    arrivals:shown.filter(r=>['Arrival','Out/In'].includes(displayStatus(r))).length,
    stayovers:shown.filter(r=>displayStatus(r)==='Stayover').length,
    checkouts:shown.filter(r=>displayStatus(r)==='Checkout').length,
    outIn:shown.filter(r=>displayStatus(r)==='Out/In').length
  }

  const setDate=(value:string)=>router.push('/reservations?date='+encodeURIComponent(value))
  const filteredRows=statusFilter==='All'
    ? shown
    : statusFilter==='Arrival'
      ? shown.filter(row=>['Arrival','Out/In'].includes(displayStatus(row)))
      : shown.filter(row=>displayStatus(row)===statusFilter)

  return <div className="reservations-page">
    <div className="reservations-view-switch"><div><strong>Reservations workspace</strong><small>View synced stays or edit operational room status</small></div><div className="reservations-view-buttons"><button type="button" className={view==='overview'?'active':''} aria-pressed={view==='overview'} onClick={()=>changeView('overview')}>Overview</button>{canEdit&&<button type="button" className={view==='edit'?'active':''} aria-pressed={view==='edit'} onClick={()=>changeView('edit')}>Edit rooms</button>}</div></div>
    <section className="reservations-hero">
      <div>
        <div className="reservations-kicker">Front office operations</div>
        <h1>Reservations</h1>
        <p>{pretty(serviceDate)}</p>
      </div>
      <div className="reservations-date-controls">
        <button onClick={()=>setDate(addDay(serviceDate,-1))} aria-label="Previous day"><ChevronLeft size={18}/></button>
        <label><CalendarDays size={16}/><input type="date" value={serviceDate} onChange={e=>setDate(e.target.value)}/></label>
        <button onClick={()=>setDate(addDay(serviceDate,1))} aria-label="Next day"><ChevronRight size={18}/></button>
      </div>
    </section>

    {view==='edit'&&canEdit&&<section className="reservations-edit-panel"><div className="reservations-edit-intro"><strong>Edit guest reservations</strong><span>Choose a reservation to update its guest details and innkeeper notes. Changes save without refreshing this page.</span></div><div className="reservations-edit-grid">{shown.flatMap(row=>[row.arriving,row.staying,row.departing,row.primary].filter((stay):stay is Stay=>Boolean(stay?.id)).filter((stay,index,all)=>all.findIndex(v=>v.id===stay.id)===index).map(stay=><div className="reservations-edit-item" key={row.roomId+stay.id}><div className="reservations-edit-room"><strong>{row.roomName} · {stay.guest_name||'Guest'}</strong><small>{stay.arrival_date} to {stay.checkout_date}</small></div><button type="button" className="reservations-edit-block" onClick={()=>setReservationPanel(reservationPanel===stay.id?'':stay.id||'')}>{reservationPanel===stay.id?'Close editor':'Edit reservation'}</button>{reservationPanel===stay.id&&<div className="ths-reservation-guest-editor">
      {([['guest_name','Guest name'],['guest_phone','Phone number'],['door_code','Door code'],['rate_plan','Rate plan'],['check_in_time','Check-in time'],['products_raw','Packages / products'],['dietary_restrictions','Dietary restrictions'],['reason_for_visit','Reason for visit'],['guest_comments','Guest comments'],['innkeeper_notes','Innkeeper notes']] as Array<[keyof Stay,string]>).map(([field,label])=><label key={field}>{label}{['guest_comments','innkeeper_notes','products_raw'].includes(field)?<textarea value={stayField(stay,field)} onChange={e=>setReservationEdits(p=>({...p,[stay.id!]:{...p[stay.id!],[field]:e.target.value}}))}/>:<input value={stayField(stay,field)} onChange={e=>setReservationEdits(p=>({...p,[stay.id!]:{...p[stay.id!],[field]:e.target.value}}))}/>}</label>)}
      <button type="button" className="reservations-edit-block" disabled={reservationSaving[stay.id!]||!Object.keys(reservationEdits[stay.id!]||{}).length} onClick={()=>void saveStay(stay)}>{reservationSaving[stay.id!]?'Saving…':'Save reservation'}</button>
      <small role="status">{reservationFeedback[stay.id!]||''}</small>
      <small>Room assignment and stay dates remain tied to Reservation Sync and are not changed by this editor.</small>
    </div>}</div>))}</div></section>}

    {view==='overview'&&<section className="reservations-snapshot">
      <div className="reservations-snapshot-head">
        <div><span>Daily reservation snapshot</span><strong>{rows.length} occupied / changing rooms</strong></div>
        <small>Live from the latest Reservation Sync import</small>
      </div>
      <div className="reservations-summary-grid">
        <div><span>Arrivals</span><strong>{counts.arrivals}</strong></div>
        <div><span>Stayovers</span><strong>{counts.stayovers}</strong></div>
        <div><span>Checkouts</span><strong>{counts.checkouts}</strong></div>
        <div><span>Out / In</span><strong>{counts.outIn}</strong></div>
      </div>
    </section>}

    {view==='edit'&&canEdit&&<section className="reservations-edit-panel"><div className="reservations-edit-intro"><strong>Daily room overrides</strong><span>Change today’s operational room status or maintenance hold. Guest bookings and synced reservation records remain unchanged.</span></div><div className="reservations-edit-grid">{shown.map(row=><div className="reservations-edit-item" key={row.roomId}><div className="reservations-edit-room"><strong>{row.roomName}</strong><small>{row.status} · synced reservation</small></div><label>Operational status<select disabled={saving[row.roomId]} value={row.operationalStatus||row.status} onChange={e=>void editRoom(row,{operationalStatus:e.target.value})}>{['Arrival','Out/In','Checkout','Stayover','Vacant','Dirty','Blocked'].map(s=><option key={s} value={s}>{s}</option>)}</select></label><label>Room condition<select disabled={saving[row.roomId]} value={row.roomCondition||''} onChange={e=>void editRoom(row,{roomCondition:e.target.value,stripHold:e.target.value==='Blocked'?'Hold':''})}>{['','Occupied','Vacant (Clean)','Vacant (Dirty)','Cleaning','Ready for Room Check','Ready','Blocked'].map(s=><option key={s} value={s}>{s||'Not set'}</option>)}</select></label><label className="reservations-late-toggle"><input type="checkbox" checked={Boolean(row.lateArrival)} disabled={saving[row.roomId]} onChange={e=>void editRoom(row,{lateArrival:e.target.checked})}/> Late arrival</label><button className="reservations-edit-block" disabled={saving[row.roomId]} type="button" onClick={()=>void editRoom(row,{stripHold:row.stripHold?'':'Hold'})}>{row.stripHold?'Release hold':'Maintenance hold'}</button><small role="status">{saving[row.roomId]?'Saving…':feedback[row.roomId]||''}</small></div>)}</div>{shown.length===0&&<p>No synced rooms for this date.</p>}</section>}

    {view==='overview'&&shown.length>0 && <section className="reservations-filter-bar" aria-label="Filter reservations by status">
      {[
        {key:'All',label:'All',count:rows.length},
        {key:'Arrival',label:'Arrivals',count:counts.arrivals},
        {key:'Stayover',label:'Stayovers',count:counts.stayovers},
        {key:'Checkout',label:'Checkouts',count:counts.checkouts},
        {key:'Out/In',label:'Out / In',count:counts.outIn}
      ].map(option=><button
        key={option.key}
        type="button"
        className={`reservations-filter-btn ${statusFilter===option.key?'active':''} ${statusClass(option.key)}`}
        onClick={()=>setStatusFilter(option.key as typeof statusFilter)}
        aria-pressed={statusFilter===option.key}
      >
        <span>{option.label}</span>
        <strong>{option.count}</strong>
      </button>)}
    </section>}

    {view==='overview' && (shown.length===0 ? <section className="reservations-empty">No occupied or changing rooms are currently synced for this date.</section> :
      filteredRows.length===0 ? <section className="reservations-empty">No {statusFilter.toLowerCase()} rooms are synced for this date.</section> :
      <section className="reservations-grid">
        {filteredRows.map(row=>{
          const status=displayStatus(row)
          const isCheckoutOnly=status==='Checkout'
          const stay=status==='Out/In'
            ? (row.arriving||row.primary)
            : status==='Arrival'
              ? (row.arriving||row.primary)
              : status==='Stayover'
                ? (row.staying||row.primary)
                : null
          const dietary=cleanDiet(stay?.dietary_restrictions)
          const outMarked=/^OUT-[A-Z]{2,4}$/i.test(String(row.serviceType||'').trim())
          const roomState={
            reservationStatus:row.operationalStatus||status,
            stripHold:row.stripHold,
            serviceType:row.serviceType,
            complete:row.complete,
            inspected:row.inspected,
            fohSignedBy:row.fohChecked?'foh':null,
            haSignedBy:row.haChecked?'ha':null,
            housekeeperAttested:row.housekeeperAttested,
            checkIssueOpen:row.checkIssueOpen,
            roomCondition:row.roomCondition
          }
          const operationalState=derivedLiveCondition(roomState)
          const readyForNextArrival=roomWorkflowLabel(roomState)==='Ready for guest' || ['ready for guest','vacant (clean)'].includes(operationalState.toLowerCase())
          return <article className={'reservation-card '+statusClass(status)} key={row.roomId}>
            <div className="reservation-card-head">
              <div><strong>{row.roomName}</strong><span>{status}</span>{row.lateArrival&&<span className="reservations-late-badge">Late arrival</span>}</div>
              {!isCheckoutOnly && stay?.door_code && <div className="reservation-door"><DoorOpen size={15}/><b>{stay.door_code}</b></div>}
            </div>

            <div className="reservation-live-room-state">
              <span>Room status</span>
              <strong>{operationalState}</strong>
              <small>{roomNextAction(roomState)}</small>
            </div>

            {status==='Out/In' && <div className="reservation-outin">
              <div><span>OUT</span><strong>{row.departing?.guest_name||'—'}</strong></div>
              <div><span>IN</span><strong>{row.arriving?.guest_name||'—'}</strong></div>
            </div>}

            {isCheckoutOnly ? <div className={`reservation-checkout-only ${readyForNextArrival||outMarked?'is-ready':'is-waiting'}`}>
              <span>Checkout room</span>
              <strong>{readyForNextArrival?'Ready for next arrival':outMarked?'Ready for turnover':'Awaiting OUT + initials'}</strong>
              <small>{readyForNextArrival
                ? 'Clean and final-checked. No additional turnover is needed unless the room condition changes.'
                : outMarked
                  ? `Marked ${String(row.serviceType||'').toUpperCase()} · ready for housekeeping turnover.`
                  : 'Housekeeping must mark the room OUT and initial it before turnover begins.'}</small>
            </div> : stay && <div className="reservation-card-body">
              <div className="reservation-pair"><span>Guest</span><strong>{stay.guest_name||'—'}</strong></div>
              <div className="reservation-pair"><span>Stay</span><strong>{stay.arrival_date||'—'} → {stay.checkout_date||'—'}</strong></div>
              <div className="reservation-pair"><span>Check-in</span><strong>{stay.check_in_time||'—'}</strong></div>
              {stay.products_raw&&<div className="reservation-detail"><Package size={14}/><div><span>Packages / products</span><strong>{stay.products_raw}</strong></div></div>}
              {stay.innkeeper_notes&&<div className="reservation-note"><span>Innkeeper</span><p>{stay.innkeeper_notes}</p></div>}
              {stay.guest_comments&&<div className="reservation-note"><span>Guest comment</span><p>{stay.guest_comments}</p></div>}
              {dietary&&<div className="reservation-note dietary"><span>Dietary</span><p>{dietary}</p></div>}
            </div>}
          </article>
        })}
      </section>
    )}
  </div>
}
