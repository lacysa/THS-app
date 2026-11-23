'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {Archive,ArchiveRestore,ArrowUpRight,Bell,Check,CheckCheck,RefreshCw} from 'lucide-react'
import {getStaffSession} from '@/lib/client/staff-session'
import {notificationDate,notificationHref,notificationKind,type RoomNotification} from '@/lib/notification-links'

type View='inbox'|'unread'|'archived'
type Kind='all'|'mentions'|'inspections'|'fixes'
type CorrectionEvent={id:string;type:string;note:string;at:string}
type Counts={inbox:number;unread:number;archived:number}
const emptyCounts={inbox:0,unread:0,archived:0}
export default function NotificationsCenter({initialFocus}:{initialFocus?:string}){
 const [view,setView]=useState<View>('inbox')
 const [kind,setKind]=useState<Kind>('all')
 const [items,setItems]=useState<RoomNotification[]>([])
 const [counts,setCounts]=useState<Counts>(emptyCounts)
 const [focus,setFocus]=useState<RoomNotification|null>(null)
 const [focusNotes,setFocusNotes]=useState<CorrectionEvent[]>([])
 const [canOpenRooms,setCanOpenRooms]=useState(false)
 const [loading,setLoading]=useState(true)
 const [busyId,setBusyId]=useState('')
 const [message,setMessage]=useState('')
 const [showAll,setShowAll]=useState(false)

 async function refresh(next:View=view,nextKind:Kind=kind){
  setLoading(true);setMessage('')
  try{
   const r=await fetch('/api/notifications?view='+next+'&kind='+nextKind+'&limit=200',{cache:'no-store'})
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
   const caps:string[]=session?.access?.capabilities||[]
   const permissions:string[]=session?.access?.permissions||[]
   // Module visibility is not route authorization: housekeeping-only accounts
   // are redirected from /housekeeping to Today's Cleans.
   setCanOpenRooms(Boolean(session?.access?.isAdmin||
    caps.some(c=>['manager','general_manager','operations_manager','owner','hospitality_assistant','room_checks','ha_signoff','ha_signoff_override'].includes(c))||
    permissions.includes('room_checks.perform')))
  }).catch(()=>{})
 },[])
 useEffect(()=>{void refresh(view,kind)},[view,kind])
 useEffect(()=>{
  if(initialFocus)void focusNotification(initialFocus)
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
 async function focusNotification(id:string){
  setMessage('')
  try{
   const response=await fetch('/api/notifications?id='+encodeURIComponent(id),{cache:'no-store'})
   const data=await response.json().catch(()=>({}))
   if(!response.ok)throw Error(data.error||'Unable to open notification')
   if(!data.notification.read_at)await update(id,'read')
   setFocus({...data.notification,read_at:data.notification.read_at||new Date().toISOString()})
   setFocusNotes(data.corrections||[])
  }catch(err:any){setMessage(err?.message||'Unable to open notification')}
 }
 async function open(n:RoomNotification){
  await focusNotification(n.id)
  window.scrollTo({top:0,behavior:'smooth'})
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
  <div className="ths-notifications-summary" role="group" aria-label="Notification inbox status">
   {([
    {key:'unread' as View,label:'Unread',count:counts.unread,icon:Bell},
    {key:'inbox' as View,label:'In inbox',count:counts.inbox,icon:CheckCheck},
    {key:'archived' as View,label:'Archived',count:counts.archived,icon:Archive}
   ]).map(item=><button key={item.key} type="button" className={view===item.key?'active':''}
    aria-pressed={view===item.key} aria-label={'Show '+item.label.toLowerCase()+' notifications'}
    onClick={()=>{setView(item.key);setFocus(null);setFocusNotes([])}}>
     <item.icon size={18}/><span>{item.label}</span><strong>{item.count}</strong>
    </button>)}
  </div>
  {counts.unread>0&&<div className="ths-notifications-tools">
   <button type="button" className="ths-notifications-mark-all" disabled={busyId!==''} onClick={()=>void update('','markAllRead')}><CheckCheck size={15}/>Mark all read</button>
  </div>}
  <div className="ths-notifications-kind-filter" role="group" aria-label="Notification type">
   {([{key:'all',label:'All types'},{key:'mentions',label:'Mentions'},{key:'inspections',label:'Inspections'},{key:'fixes',label:'Fixes & corrections'}] as {key:Kind;label:string}[]).map(option=>
    <button key={option.key} type="button" aria-pressed={kind===option.key} className={kind===option.key?'active':''}
     onClick={()=>{setKind(option.key);setFocus(null);setFocusNotes([])}}>{option.label}</button>)}
  </div>
  {message&&<div role="alert" className="ths-notifications-error">{message}</div>}
  {selected&&<section className="ths-notifications-selected" aria-label="Selected notification">
   <div className="ths-notifications-selected-heading"><div><span>{notificationKind(selected)}</span><h2>{selected.title}</h2></div><button type="button" onClick={()=>setFocus(null)}>Close</button></div>
   <p>{selected.message}</p>
   <div className="ths-notifications-metadata">
    <span>{notificationDate(selected.created_at)}</span>
    {selected.service_date&&<span>Room date: {selected.service_date}</span>}
   </div>
   {Boolean(selected.room_id&&selected.service_date&&(focusNotes.length||['housekeeping_correction','housekeeping_recheck_passed','housekeeping_fix_recorded','room_ready_for_inspection'].includes(selected.notification_type)))&&
    <div className="ths-notifications-history">
     <strong>Inspection issues &amp; recorded fix notes</strong>
     {focusNotes.length?focusNotes.map(note=><div key={note.id} className="ths-notifications-history-item">
      <div><b>{note.type==='fixed'?'Fix recorded':'Issue reported'}</b><small>{notificationDate(note.at)}</small></div>
      <p>{note.note}</p>
     </div>):<p>No separate inspection or fix notes were recorded for this room on this date.</p>}
    </div>}
   <div className="ths-notifications-actions">
    {canOpenRooms&&selected.room_id&&selected.service_date&&<button type="button" onClick={()=>window.location.assign(notificationHref(selected,true))}><ArrowUpRight size={15}/>Open dated room</button>}
    {selected.archived_at?<button type="button" className="secondary" onClick={()=>void update(selected.id,'unarchive')}><ArchiveRestore size={15}/>Restore to inbox</button>
    :<button type="button" className="secondary" onClick={()=>void update(selected.id,'archive')}><Archive size={15}/>Archive notification</button>}
   </div>
  </section>}
  <div className="ths-notifications-explanation">Opening an alert marks it read. Archiving removes it from your inbox without deleting its history. A room correction stays open until it is resolved in the room workflow.</div>
  <section className="ths-notifications-list" aria-label={view+' notifications'}>
   {loading&&<p className="ths-notifications-empty">Loading notifications…</p>}
   {!loading&&!items.length&&<p className="ths-notifications-empty">{kind!=='all'?'No '+(kind==='fixes'?'fix or correction':kind==='mentions'?'mention':'inspection')+' notifications in this section.':view==='archived'?'No archived notifications.':view==='unread'?'You’re all caught up.':'Your inbox is clear.'}</p>}
   {!loading&&items.map(n=><article className={'ths-notification-row '+(n.read_at?'is-read':'is-unread')} key={n.id}>
     <div className="ths-notification-main">
      <div className="ths-notification-type"><span className="ths-notification-status-dot"/>{notificationKind(n)}</div>
      <h3>{n.title}</h3>
      <p>{n.message}</p>
      <small>{notificationDate(n.created_at)}{n.service_date?' · Room date: '+n.service_date:''}</small>
     </div>
     <div className="ths-notification-buttons">
      <button type="button" className="ths-notification-open" onClick={()=>void open(n)} disabled={busyId===n.id}><ArrowUpRight size={15}/>View details</button>
      {!n.read_at&&<button type="button" onClick={()=>void update(n.id,'read')} disabled={Boolean(busyId)}><Check size={15}/>Mark read</button>}
      {n.archived_at?<button type="button" onClick={()=>void update(n.id,'unarchive')} disabled={Boolean(busyId)}><ArchiveRestore size={15}/>Restore</button>
      :<button type="button" onClick={()=>void update(n.id,'archive')} disabled={Boolean(busyId)}><Archive size={15}/>Archive</button>}
     </div>
    </article>)}
   {showAll&&<p className="ths-notifications-cap">Showing the most recent 200 matching notifications in this section.</p>}
  </section>
  <p className="ths-notifications-footer"><Link href="/dashboard">Return to Dashboard</Link></p>
 </main>
}
