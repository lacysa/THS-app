'use client'
import {useEffect,useMemo,useState} from 'react'
import {ChevronRight,Search,SlidersHorizontal,X} from 'lucide-react'
import type ReservationsBoard from '@/components/ReservationsBoard'
import OpsRoomHub from '@/components/OpsRoomHub'

type ReservationRow=Parameters<typeof ReservationsBoard>[0]['rows'][number]
type Category='all'|'Arrival'|'Stayover'|'Checkout'|'Out/In'
function reservationType(row:ReservationRow){
 const value=String(row.operationalStatus||row.status||'').toLowerCase()
 if(value.includes('out/in'))return 'Out/In'
 if(value.includes('checkout'))return 'Checkout'
 if(value.includes('stayover'))return 'Stayover'
 if(value.includes('arrival'))return 'Arrival'
 return row.operationalStatus||row.status||'Vacant'
}
function roomCondition(row:ReservationRow){
 const value=String(row.roomCondition||'').trim()
 return value||((row.complete&&row.inspected)?'Ready':'Not confirmed')
}
function activeGuest(row:ReservationRow,day:string){
 const options=[row.arriving,row.staying,row.primary]
 return options.find(stay=>{
  if(!stay)return false
  const s=stay as {arrival_date?:string|null;checkout_date?:string|null}
  return Boolean(s.arrival_date&&s.checkout_date&&day>=s.arrival_date&&day<s.checkout_date)
 })||null
}
function conditionTone(condition:string){
 const value=condition.toLowerCase()
 if(/dirty|issue|blocked/.test(value))return 'warning'
 if(/ready|clean/.test(value))return 'ready'
 if(/occupied/.test(value))return 'occupied'
 return 'neutral'
}
export default function RoomOperationsWorkspace({serviceDate,rows}:{serviceDate:string;rows:ReservationRow[];canEdit:boolean;canManageRooms:boolean}){
 const [selected,setSelected]=useState<{roomId:string;reservationId?:string}|null>(null)
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
  const guest=activeGuest(row,serviceDate)?.guest_name||''
  return !query.trim()||[row.roomName,guest,row.roomNotes||''].some(value=>String(value).toLowerCase().includes(query.trim().toLowerCase()))
 }),[liveRows,category,conditionsOnly,query,serviceDate])
 return <div className="ths-unified-operations ths-operations-simplified">
   <div className="ths-ops-stats" aria-label="Daily room activity">
    {(['Arrival','Stayover','Checkout','Out/In'] as const).map(type=><button key={type} type="button" aria-pressed={category===type} onClick={()=>setCategory(category===type?'all':type)}><strong>{counts[type]}</strong><span>{type==='Arrival'?'Arrivals':type==='Stayover'?'Stayovers':type==='Checkout'?'Checkouts':'Out / In'}</span></button>)}
   </div>
   <div className="ths-ops-list-heading">
    <strong>Rooms <span>{filtered.length} of {counts.all}</span></strong>
    <button type="button" className={conditionsOnly?'active':''} aria-pressed={conditionsOnly} onClick={()=>setConditionsOnly(value=>!value)}><SlidersHorizontal size={16}/> Needs attention</button>
   </div>
   <label className="ths-ops-search"><Search size={18}/><input aria-label="Find room or guest" placeholder="Find room or guest" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" aria-label="Clear search" onClick={()=>setQuery('')}><X size={16}/></button>}</label>
   <div className="ths-ops-room-list">
    {filtered.map(row=>{
     const type=reservationType(row)
     const condition=roomCondition(row)
     const guest=activeGuest(row,serviceDate)
     return <button className="ths-ops-room-row" type="button" key={row.roomId} onClick={()=>setSelected({roomId:row.roomId,reservationId:guest?.id||undefined})} aria-label={`Open ${row.roomName}, ${type}, ${condition}`}>
      <span className="ths-ops-room-info">
       <span className="ths-ops-room-name">{row.roomName}<span className="ths-ops-activity">{type}</span></span>
       <span className="ths-ops-guest">{guest?.guest_name||'No active reservation'}</span>
       <span className="ths-ops-tags">{row.breakfastTag&&<span>Breakfast</span>}{row.lateArrival&&<span>Late arrival</span>}{row.checkIssueOpen&&<span className="alert">Inspection issue</span>}{row.roomNotes&&<span>Room note</span>}{String(row.serviceType||'').toUpperCase()==='RF'&&<span>Refresh</span>}</span>
      </span>
      <span className="ths-ops-row-end"><span className={`ths-ops-condition ${conditionTone(condition)}`}>{condition}</span><ChevronRight size={18}/></span>
     </button>
    })}
    {!filtered.length&&<div className="ths-ops-empty">No rooms match these filters. Clear search or select another category.</div>}
   </div>
   {selected&&<OpsRoomHub roomId={selected.roomId} date={serviceDate} reservationId={selected.reservationId} onClose={()=>setSelected(null)} onUpdate={()=>window.dispatchEvent(new CustomEvent('ths:live-data-refresh'))}/>}
  </div>
}
