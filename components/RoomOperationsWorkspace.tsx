'use client'

import {useEffect,useMemo,useState} from 'react'
import {ArrowLeft,ChevronRight,Search,SlidersHorizontal,X} from 'lucide-react'
import ReservationsBoard from '@/components/ReservationsBoard'
import UnifiedRoomsBoard from '@/components/UnifiedRoomsBoard'
import ReservationCalendar from '@/components/ReservationCalendar'

type ReservationRow=Parameters<typeof ReservationsBoard>[0]['rows'][number]
type View='rooms'|'tasks'|'guests'|'calendar'
type Category='all'|'Arrival'|'Stayover'|'Checkout'|'Out/In'

function reservationType(row:ReservationRow){
  const value=String(row.operationalStatus||row.status||'').toLowerCase()
  if(value.includes('out/in'))return 'Out/In'
  if(value.includes('checkout'))return 'Checkout'
  if(value.includes('stayover'))return 'Stayover'
  if(value.includes('arrival'))return 'Arrival'
  return row.status||'Vacant'
}
function roomCondition(row:ReservationRow){
  const value=String(row.roomCondition||'').trim()
  return value||((row.complete&&row.inspected)?'Ready':'Not confirmed')
}
function guestName(row:ReservationRow){
  return row.arriving?.guest_name||row.staying?.guest_name||row.primary?.guest_name||row.departing?.guest_name||''
}
function conditionTone(condition:string){
  const value=condition.toLowerCase()
  if(/dirty|issue|blocked/.test(value))return 'warning'
  if(/ready|clean/.test(value))return 'ready'
  if(/occupied/.test(value))return 'occupied'
  return 'neutral'
}

export default function RoomOperationsWorkspace({serviceDate,rows,canEdit,canManageRooms}:{serviceDate:string;rows:ReservationRow[];canEdit:boolean;canManageRooms:boolean}){
  const [view,setView]=useState<View>(canManageRooms?'rooms':'guests')
  const [selectedRoom,setSelectedRoom]=useState('')
  const [category,setCategory]=useState<Category>('all')
  const [query,setQuery]=useState('')
  const [conditionsOnly,setConditionsOnly]=useState(false)
  const [liveRows,setLiveRows]=useState<ReservationRow[]>(rows)
  useEffect(()=>{setLiveRows(rows)},[rows])
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
            const updates=new Map<string,Partial<ReservationRow>>(result.rooms.map((room:ReservationRow)=>[room.roomId,room]))
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
    return {all:liveRows.length,Arrival:count('Arrival'),Stayover:count('Stayover'),Checkout:count('Checkout'),'Out/In':count('Out/In')}
  },[liveRows])
  const filtered=useMemo(()=>liveRows.filter(row=>{
    if(category!=='all'&&reservationType(row)!==category)return false
    if(conditionsOnly&&!/dirty|issue|blocked|not confirmed/i.test(roomCondition(row))&&!row.checkIssueOpen)return false
    return !query.trim()||[row.roomName,guestName(row),row.roomNotes||''].some(value=>String(value).toLowerCase().includes(query.trim().toLowerCase()))
  }),[liveRows,category,conditionsOnly,query])

  function switchView(next:View){setView(next);setSelectedRoom('')}
  return <div className="ths-unified-operations ths-operations-simplified">
    <nav className="ths-ops-nav" aria-label="Room Operations views">
      <button type="button" aria-pressed={view==='rooms'} className={view==='rooms'?'active':''} onClick={()=>switchView('rooms')}>Rooms</button>
      {canManageRooms&&<button type="button" aria-pressed={view==='tasks'} className={view==='tasks'?'active':''} onClick={()=>switchView('tasks')}>Tasks</button>}
      <button type="button" aria-pressed={view==='guests'} className={view==='guests'?'active':''} onClick={()=>switchView('guests')}>Guests</button>
      <button type="button" aria-pressed={view==='calendar'} className={view==='calendar'?'active':''} onClick={()=>switchView('calendar')}>Calendar</button>
    </nav>
    {view==='rooms'&&<>
      <div className="ths-ops-stats" aria-label="Reservation activity">
        {(['Arrival','Stayover','Checkout','Out/In'] as const).map(type=><button key={type} type="button" aria-pressed={category===type} onClick={()=>setCategory(category===type?'all':type)}><strong>{counts[type]}</strong><span>{type==='Arrival'?'Arrivals':type==='Stayover'?'Stayovers':type==='Checkout'?'Checkouts':'Out / In'}</span></button>)}
      </div>
      <div className="ths-ops-list-heading">
        <strong>Rooms <span>{filtered.length} of {counts.all}</span></strong>
        <button type="button" className={conditionsOnly?'active':''} aria-pressed={conditionsOnly} onClick={()=>setConditionsOnly(value=>!value)}><SlidersHorizontal size={16}/> Needs attention</button>
      </div>
      <label className="ths-ops-search"><Search size={18}/><input aria-label="Find a room or guest" placeholder="Find room or guest" value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<button type="button" aria-label="Clear search" onClick={()=>setQuery('')}><X size={16}/></button>}</label>
      <div className="ths-ops-room-list">
        {filtered.map(row=>{
          const type=reservationType(row)
          const condition=roomCondition(row)
          const name=guestName(row)
          return <button className="ths-ops-room-row" type="button" key={row.roomId} onClick={()=>{if(canManageRooms)setSelectedRoom(row.roomId);else switchView('guests')}} aria-label={`Open ${row.roomName}, ${type}, ${condition}`}>
            <span className="ths-ops-room-info">
              <span className="ths-ops-room-name">{row.roomName}<span className="ths-ops-activity">{type}</span></span>
              <span className="ths-ops-guest">{name||'No guest assigned'}</span>
              <span className="ths-ops-tags">{row.breakfastTag&&<span>Breakfast</span>}{row.lateArrival&&<span>Late arrival</span>}{row.checkIssueOpen&&<span className="alert">Inspection issue</span>}{row.roomNotes&&<span>Room note</span>}{row.serviceType?.toUpperCase()==='RF'&&<span>Refresh</span>}</span>
            </span>
            <span className="ths-ops-row-end"><span className={`ths-ops-condition ${conditionTone(condition)}`}>{condition}</span><ChevronRight size={18}/></span>
          </button>
        })}
        {!filtered.length&&<div className="ths-ops-empty">No rooms match these filters. Clear the search or select another category.</div>}
      </div>
    </>}
    {view==='calendar'&&<ReservationCalendar serviceDate={serviceDate} onOpenRoom={canManageRooms?setSelectedRoom:undefined}/>}
    {view==='tasks'&&canManageRooms&&<section className="ths-ops-work-area"><UnifiedRoomsBoard initialDate={serviceDate}/></section>}
    {view==='guests'&&<section className="ths-ops-work-area"><ReservationsBoard serviceDate={serviceDate} rows={rows} canEdit={canEdit} hideViewSwitch view={canEdit?'edit':'overview'}/></section>}
    {selectedRoom&&(view==='rooms'||view==='calendar')&&canManageRooms&&<div className="ths-ops-panel-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setSelectedRoom('')}}><section className="ths-ops-detail-panel" role="dialog" aria-modal="true" aria-label="Manage room">
      <div className="ths-ops-panel-header"><button type="button" onClick={()=>setSelectedRoom('')}><ArrowLeft size={18}/> Rooms</button><strong>{liveRows.find(r=>r.roomId===selectedRoom)?.roomName||'Room details'}</strong><button type="button" aria-label="Close room details" onClick={()=>setSelectedRoom('')}><X size={20}/></button></div>
      <div className="ths-ops-panel-body"><UnifiedRoomsBoard key={selectedRoom} initialDate={serviceDate} initialRoomId={selectedRoom}/></div>
    </section></div>}
  </div>
}
