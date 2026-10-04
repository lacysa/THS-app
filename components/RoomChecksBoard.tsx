'use client'

import { useEffect,useMemo,useState } from 'react'
import { Check,ChevronDown,ChevronRight,RefreshCw,X } from 'lucide-react'

type Item={id:string;zone:string;label:string;passed:boolean|null;note:string}
type Room={roomId:string;roomName:string;reservationStatus:string;serviceType:string;assignedTo:string;complete:boolean;issueOpen:boolean;issueNote:string;inspected:boolean;items:Item[]}
function todayDetroit(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}

export default function RoomChecksBoard(){
  const [date,setDate]=useState(todayDetroit())
  const [rooms,setRooms]=useState<Room[]>([])
  const [open,setOpen]=useState<Record<string,boolean>>({})
  const [loading,setLoading]=useState(true)
  const [message,setMessage]=useState('')

  async function load(resetOpen=false){
    setLoading(true);setMessage('')
    const r=await fetch(`/api/room-checks?date=${date}`,{cache:'no-store'});const d=await r.json().catch(()=>({}))
    if(!r.ok){setMessage(d.error||'Could not load room checks.');setLoading(false);return}
    setRooms(d.rooms||[])
    if(resetOpen) setOpen({})
    setLoading(false)
  }
  useEffect(()=>{void load(true)},[date])

  async function setResult(room:Room,item:Item,passed:boolean){
    setRooms(current=>current.map(r=>r.roomId===room.roomId?{...r,items:r.items.map(i=>i.id===item.id?{...i,passed}:i)}:r))
    const next=rooms.find(r=>r.roomId===room.roomId)?.items.find(i=>i.id===item.id)
    const r=await fetch('/api/room-checks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date,roomId:room.roomId,itemId:item.id,passed,note:next?.note??item.note})})
    const d=await r.json().catch(()=>({}))
    if(!r.ok){setMessage(d.error||'Could not save room check.');await load();return}
    await load()
  }
  function updateNote(roomId:string,itemId:string,note:string){setRooms(current=>current.map(r=>r.roomId===roomId?{...r,items:r.items.map(i=>i.id===itemId?{...i,note}:i)}:r))}

  const counts=useMemo(()=>({rooms:rooms.length,passed:rooms.filter(r=>r.inspected&&!r.issueOpen).length,issues:rooms.filter(r=>r.issueOpen).length}),[rooms])

  return <div className="room-checks-page">
    <div className="module-toolbar">
      <div><div className="module-kicker">Housekeeping Quality</div><h1>Room Checks</h1><p>Checkout and out/in rooms requiring final inspection.</p></div>
      <div className="toolbar-actions"><label className="date-control">Date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button className="ops-secondary-btn" onClick={()=>void load(true)}><RefreshCw size={15}/>Refresh</button></div>
    </div>
    <div className="room-check-summary"><span>{counts.rooms} rooms</span><span>{counts.passed} passed</span><span className={counts.issues?'warning':''}>{counts.issues} need correction</span></div>
    {message&&<div className="module-message">{message}</div>}
    {loading?<div className="module-empty">Loading room checks…</div>:rooms.length===0?<div className="module-empty">No checkout or out/in rooms are on the board for this date.</div>:
      <div className="room-check-list">{rooms.map(room=>{
        const done=room.items.filter(i=>i.passed!==null).length
        const failed=room.items.filter(i=>i.passed===false).length
        const expanded=Boolean(open[room.roomId])
        const zones=[...new Set(room.items.map(i=>i.zone))]
        return <section className={`room-check-card ${room.issueOpen?'has-issue':''}`} key={room.roomId}>
          <button className="room-check-header" onClick={()=>setOpen(cur=>({...cur,[room.roomId]:!expanded}))}>
            <div>{expanded?<ChevronDown size={18}/>:<ChevronRight size={18}/>}<span><strong>{room.roomName}</strong><small>{room.reservationStatus}{room.assignedTo?` · HSK: ${room.assignedTo}`:''}</small></span></div>
            <span className={failed?'room-check-status fail':room.inspected?'room-check-status pass':'room-check-status'}>{failed?`${failed} issue${failed===1?'':'s'}`:room.inspected?'Passed ✓':`${done}/${room.items.length}`}</span>
          </button>
          {expanded&&<div className="room-check-body">
            {room.issueOpen&&<div className="room-check-alert"><strong>Correction required</strong><span>{room.issueNote}</span></div>}
            {zones.map(zone=><div className="room-check-zone" key={zone}><h3>{zone}</h3>
              {room.items.filter(i=>i.zone===zone).map(item=><div className={`room-check-item ${item.passed===true?'pass':item.passed===false?'fail':''}`} key={item.id}>
                <div className="room-check-copy"><strong>{item.label}</strong>{item.passed===false&&<input
  value={item.note}
  onChange={e=>updateNote(room.roomId,item.id,e.target.value)}
  onBlur={()=>void setResult(room,{...item,note:room.items.find(i=>i.id===item.id)?.note||item.note},false)}
  placeholder="What needs to be corrected?"
/>}</div>
                <div className="room-check-actions">
                  <button aria-label="Pass" className={item.passed===true?'active pass':''} onClick={()=>void setResult(room,item,true)}><Check size={17}/><span>Pass</span></button>
                  <button aria-label="Needs correction" className={item.passed===false?'active fail':''} onClick={()=>void setResult(room,item,false)}><X size={17}/><span>Fix</span></button>
                </div>
              </div>)}
            </div>)}
          </div>}
        </section>
      })}</div>
    }
  </div>
}
