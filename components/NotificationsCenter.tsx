'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {Archive,ArchiveRestore,ArrowUpRight,Bell,Check,CheckCheck,RefreshCw} from 'lucide-react'
import {getStaffSession} from '@/lib/client/staff-session'
import {notificationDate,notificationHref,notificationKind,type RoomNotification} from '@/lib/notification-links'

type View='inbox'|'unread'|'archived'
type Counts={inbox:number;unread:number;archived:number}
const emptyCounts={inbox:0,unread:0,archived:0}
export default function NotificationsCenter({initialFocus}:{initialFocus?:string}){
 const [view,setView]=useState<View>('inbox')
 const [items,setItems]=useState<RoomNotification[]>([])
 const [counts,setCounts]=useState<Counts>(emptyCounts)
 const [focus,setFocus]=useState<RoomNotification|null>(null)
 const [canOpenRooms,setCanOpenRooms]=useState(false)
 const [loading,setLoading]=useState(true)
 const [busyId,setBusyId]=useState('')
 const [message,setMessage]=useState('')
 const [showAll,setShowAll]=useState(false)

 async function refresh(next:View=view){
  setLoading(true);setMessage('')
  try{
   const r=await fetch('/api/notifications?view='+next+'&limit=200',{cache:'no-store'})
   const data=await r.json().catch(()=>({}))
   if(!r.ok)throw new Error(data.error||'Unable to load notifications')
   setItems(data.notifications||[])
   setCounts(data.counts||emptyCounts)
   setShowAll((data.notifications||[]).length>=200)
  }catch(err:any){setMessage(err?.message||'Could not load notifications')}
  finally{setLoading(false)}
 }
 useEffect(()=>{
  void getStaffSession().then(session=>{
   setCanOpenRooms(Boolean(session?.modules?.some((mod:any)=>mod.module_key==='housekeeping'&&mod.enabled!==false)))
  }).catch(()=>{})
 },[])
 useEffect(()=>{void refresh(view)},[view])
 useEffect(()=>{
  if(!initialFocus)return
  void fetch('/api/notifications?id='+encodeURIComponent(initialFocus),{cache:'no-store'})
   .then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Notification no longer available');setFocus(data.notification)})
   .catch((error:Error)=>setMessage(error.message))
 },[initialFocus])

 async function update(id:string,action:'read'|'archive'|'unarchive'|'markAllRead'){
  setBusyId(id||action);setMessage('')
  try{
   const r=await fetch('/api/notifications',{method:'PATCH',headers:{'content-type':'application/json'},
    body:JSON.stringify(action==='markAllRead'?{markAllRead:true}:{id,action})})
   const data=await r.json().catch(()=>({}))
   if(!r.ok)throw Error(data.error||'Could not update notification')
   if(action==='read'){
    const now=new Date().toISOString()
    setItems(current=>view==='unread'?current.filter(item=>item.id!==id):current.map(item=>item.id===id?{...item,read_at:now}:item))
    setFocus(current=>current?.id===id?{...current,read_at:now}:current)
    setCounts(current=>({...current,unread:Math.max(0,current.unread-1)}))
   }else{
    await refresh(view)
    if(focus?.id===id)setFocus(null)
   }
  }catch(err:any){setMessage(err?.message||'Unable to update notification')}
  finally{setBusyId('')}
 }
 async function open(n:RoomNotification){
  if(!n.read_at)await update(n.id,'read')
  const href=notificationHref(n,canOpenRooms)
  // Same-origin and entirely determined by a typed room id/date or our detail route.
  window.location.assign(href)
 }
 const selected=focus
 return <main className="ths-notifications-page">
  <div className="ths-notifications-hero">
   <div>
    <span className="ths-notifications-kicker">STAFF COMMUNICATION</span>
    <h1>Notifications</h1>
    <p>Room corrections, @mentions, and operational updates in one place.</p>
   </div>
   <button type="button" className="ths-notifications-refresh" onClick={()=>void refresh(view)} disabled={loading}><RefreshCw size={16}/>Refresh</button>
  </div>
  <div className="ths-notifications-summary">
   <div><Bell size={18}/><span>Unread</span><strong>{counts.unread}</strong></div>
   <div><CheckCheck size={18}/><span>In inbox</span><strong>{counts.inbox}</strong></div>
   <div><Archive size={18}/><span>Archived</span><strong>{counts.archived}</strong></div>
  </div>
  <div className="ths-notifications-tools">
   <div className="ths-notifications-tabs" role="group" aria-label="Notification filters">
    {(['inbox','unread','archived'] as View[]).map(key=><button key={key} type="button" aria-pressed={view===key} className={view===key?'active':''} onClick={()=>{setView(key);setFocus(null)}}>{key==='inbox'?'Inbox':key==='unread'?'Unread':'Archived'} <span>{counts[key]}</span></button>)}
   </div>
   {counts.unread>0&&<button type="button" className="ths-notifications-mark-all" disabled={busyId!==''} onClick={()=>void update('','markAllRead')}><CheckCheck size={15}/>Mark all read</button>}
  </div>
  {message&&<div role="alert" className="ths-notifications-error">{message}</div>}
  {selected&&<section className="ths-notifications-selected" aria-label="Selected notification">
   <div className="ths-notifications-selected-heading"><div><span>{notificationKind(selected)}</span><h2>{selected.title}</h2></div><button type="button" onClick={()=>setFocus(null)}>Close</button></div>
   <p>{selected.message}</p>
   <div className="ths-notifications-metadata">
    <span>{notificationDate(selected.created_at)}</span>
    {selected.service_date&&<span>Room date: {selected.service_date}</span>}
   </div>
   <div className="ths-notifications-actions">
    {canOpenRooms&&selected.room_id&&selected.service_date&&<button type="button" onClick={()=>void open(selected)}><ArrowUpRight size={15}/>Open room details</button>}
    {selected.archived_at?<button type="button" className="secondary" onClick={()=>void update(selected.id,'unarchive')}><ArchiveRestore size={15}/>Restore to inbox</button>
    :<button type="button" className="secondary" onClick={()=>void update(selected.id,'archive')}><Archive size={15}/>Archive notification</button>}
   </div>
  </section>}
  <div className="ths-notifications-explanation">Opening an alert marks it read. Archiving removes it from your inbox without deleting its history. A room correction stays open until it is resolved in the room workflow.</div>
  <section className="ths-notifications-list" aria-label={view+' notifications'}>
   {loading&&<p className="ths-notifications-empty">Loading notifications…</p>}
   {!loading&&!items.length&&<p className="ths-notifications-empty">{view==='archived'?'No archived notifications.':view==='unread'?'You’re all caught up.':'Your inbox is clear.'}</p>}
   {!loading&&items.map(n=><article className={'ths-notification-row '+(n.read_at?'is-read':'is-unread')} key={n.id}>
     <div className="ths-notification-main">
      <div className="ths-notification-type"><span className="ths-notification-status-dot"/>{notificationKind(n)}</div>
      <h3>{n.title}</h3>
      <p>{n.message}</p>
      <small>{notificationDate(n.created_at)}{n.service_date?' · Room date: '+n.service_date:''}</small>
     </div>
     <div className="ths-notification-buttons">
      <button type="button" className="ths-notification-open" onClick={()=>void open(n)} disabled={busyId===n.id}><ArrowUpRight size={15}/>{canOpenRooms&&n.room_id&&n.service_date?'Open room':'View details'}</button>
      {!n.read_at&&<button type="button" onClick={()=>void update(n.id,'read')} disabled={Boolean(busyId)}><Check size={15}/>Mark read</button>}
      {n.archived_at?<button type="button" onClick={()=>void update(n.id,'unarchive')} disabled={Boolean(busyId)}><ArchiveRestore size={15}/>Restore</button>
      :<button type="button" onClick={()=>void update(n.id,'archive')} disabled={Boolean(busyId)}><Archive size={15}/>Archive</button>}
     </div>
    </article>)}
   {showAll&&<p className="ths-notifications-cap">Showing the most recent 200 notifications in this section.</p>}
  </section>
  <p className="ths-notifications-footer"><Link href="/dashboard">Return to Dashboard</Link></p>
 </main>
}
