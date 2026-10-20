'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import Link from 'next/link'
import {AlertTriangle,BedDouble,CheckCircle2,ChevronRight,ClipboardCheck,RefreshCw} from 'lucide-react'
import {getStaffSession} from '@/lib/client/staff-session'
import {roomWorkflowLabel,roomWorkflowState,isStayoverRoom,isRefreshRoom,type RoomLike} from '@/lib/room-state'

type StaffRoom=RoomLike&{
 roomId:string;roomName:string;assignedTo:string;cleanOrder?:number|null
 notes?:string;deepClean?:{assignedTo:string;completed:boolean}|null
 tubIsMine?:boolean;serviceType?:string;reservationStatus?:string
 checkIssueNote?:string
}
type Counters={complete:number;correction:number;inspection:number}
function todayHotel(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function mine(row:StaffRoom,name:string){
 const who=name.trim().toLowerCase()
 return Boolean(who)&&(
  String(row.assignedTo||'').split(',').some(person=>person.trim().toLowerCase()===who)||
  String(row.deepClean?.assignedTo||'').trim().toLowerCase()===who||
  row.tubIsMine===true
 )
}
export default function HousekeepingStaffDashboard(){
 const [date,setDate]=useState(todayHotel)
 const [name,setName]=useState('Your')
 const [rows,setRows]=useState<StaffRoom[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [lastUpdated,setLastUpdated]=useState('')
 const load=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true)
  try{
   const [session,response]=await Promise.all([
    getStaffSession(),
    fetch('/api/housekeeping/day?date='+encodeURIComponent(date),{cache:'no-store'})
   ])
   const payload=await response.json().catch(()=>({}))
   if(!response.ok)throw new Error(payload.error||'Unable to load assigned rooms')
   const staff=String(session?.access?.name||session?.access?.preferredName||'').trim()
   setName(String(session?.access?.preferredName||staff||'Your').split(' ')[0])
   const items=Array.isArray(payload.rows)?payload.rows as StaffRoom[]:[]
   setRows(items.filter(room=>mine(room,staff)&&(!isStayoverRoom(room)||isRefreshRoom(room))))
   setError('')
   setLastUpdated(new Intl.DateTimeFormat('en-US',{timeZone:'America/Detroit',hour:'numeric',minute:'2-digit'}).format(new Date()))
  }catch(e:any){if(!silent)setError(e?.message||'Unable to load rooms')}
  finally{if(!silent)setLoading(false)}
 },[date])
 useEffect(()=>{
  void load()
  const timer=window.setInterval(()=>{
   if(document.visibilityState==='visible')void load(true)
  },10000)
  return()=>window.clearInterval(timer)
 },[load])
 const stats=useMemo<Counters>(()=>{
  const result={complete:0,correction:0,inspection:0}
  for(const room of rows){
   const state=roomWorkflowState(room)
   if(state==='ready'||(isRefreshRoom(room)&&room.complete))result.complete++
   else if(state==='correction')result.correction++
   else if(state==='inspection'||state==='final')result.inspection++
  }
  return result
 },[rows])
 const taskRows=useMemo(()=>rows.filter(r=>roomWorkflowState(r)!=='ready'&&!(isRefreshRoom(r)&&r.complete)).sort((a,b)=>(a.cleanOrder??999)-(b.cleanOrder??999)||a.roomName.localeCompare(b.roomName)),[rows])
 const dateQuery='&date='+encodeURIComponent(date)
 return <div className="hsk-home">
  <header className="hsk-home-hero">
   <div>
    <div className="hsk-home-kicker">THE HOTEL SAUGATUCK · HOUSEKEEPING</div>
    <h1>{name==='Your'?'Your':'Hi, '+name} · Today’s work</h1>
    <p>See your assignments, check your progress, and open the rooms that need attention.</p>
   </div>
   <div className="hsk-home-toolbar">
    <label>Shift date<input type="date" value={date} onChange={event=>setDate(event.target.value)} /></label>
    <button type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/>Refresh</button>
   </div>
  </header>
  {error&&<p role="alert" className="hsk-home-error">{error}</p>}
  <section className="hsk-home-stats" aria-label="Your room progress">
   {([
    {key:'complete',label:'Rooms complete',value:stats.complete,description:'Finished rooms and refreshes',icon:CheckCircle2},
    {key:'correction',label:'Needs correction',value:stats.correction,description:'Corrections to fix',icon:AlertTriangle},
    {key:'inspection',label:'Awaiting checks',value:stats.inspection,description:'Ready for inspection',icon:ClipboardCheck}
   ] as const).map(item=><Link className={'hsk-home-stat '+item.key} href={'/housekeeping?filter='+item.key+dateQuery} key={item.key}>
    <item.icon size={20} aria-hidden="true"/>
    <strong>{item.value}</strong>
    <span>{item.label}</span>
    <small>{item.description} <ChevronRight size={14}/></small>
   </Link>)}
  </section>
  <section className="hsk-home-worklist">
   <div className="hsk-home-section-header">
    <div><h2>My assigned rooms</h2><p>{rows.length} assigned room{rows.length===1?'':'s'} on this date · updates automatically</p></div>
    <Link href={'/housekeeping?filter=all'+dateQuery}>Open Housekeeping <ChevronRight size={15}/></Link>
   </div>
   {loading?<p className="hsk-home-empty">Loading your rooms…</p>:rows.length===0?<p className="hsk-home-empty">No active room assignments found for this date.</p>:<>
    {taskRows.length===0?<p className="hsk-home-done"><CheckCircle2 size={19}/>Your assigned room work is complete. Nicely done.</p>:
     <div className="hsk-home-rooms">{taskRows.map(room=><Link key={room.roomId} href={'/housekeeping?room='+encodeURIComponent(room.roomId)+dateQuery} className="hsk-home-room">
      <span className="hsk-home-room-icon"><BedDouble size={17}/></span>
      <span><strong>{room.roomName}</strong><small>{room.checkIssueOpen?'Correction: '+(room.checkIssueNote||'Review the issue'):roomWorkflowLabel(room)}</small></span>
      <ChevronRight size={18}/>
     </Link>)}</div>}
   </>}
  </section>
  {lastUpdated&&<p className="hsk-home-updated">Last refreshed {lastUpdated}, Michigan time. Data refreshes while this page is open.</p>}
 </div>
}
