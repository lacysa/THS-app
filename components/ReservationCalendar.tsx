'use client'
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react'
import {CalendarDays,ChevronLeft,ChevronRight,LayoutGrid,Rows3,RefreshCw,Trash2} from 'lucide-react'
import OpsRoomHub from '@/components/OpsRoomHub'
import ReservationsBoard from '@/components/ReservationsBoard'

type ReservationRow=Parameters<typeof ReservationsBoard>[0]['rows'][number]
type Cell={reservationId:string;date:string;roomId:string;status:string;guest:string;arrival:string;departure:string;blocked:boolean;condition:string;lateArrival:boolean}
type Data={roomStatuses?:{date:string;roomId:string;condition:string;status:string;blocked:boolean}[];start:string;canRemove:boolean;days:string[];rooms:{id:string;name:string}[];cells:Cell[];holds:{date:string;roomId:string}[];notes:{date:string;roomId:string;text:string}[]}
function shift(day:string,n:number){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function pretty(day:string){return new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'))}
function occupied(c:Cell){return Boolean(c.guest&&c.arrival&&c.departure&&c.date>=c.arrival&&c.date<c.departure)}
export default function ReservationCalendar({serviceDate}:{serviceDate:string}){
  const [start,setStart]=useState(()=>shift(serviceDate,-2))
  const [focusedDate,setFocusedDate]=useState(serviceDate)
  const [scrollMode,setScrollMode]=useState<'focus'|'beginning'>('focus')
  const [scrollRequest,setScrollRequest]=useState(0)
  const scrollRef=useRef<HTMLDivElement|null>(null)
  const [data,setData]=useState<Data|null>(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [activeRoom,setActiveRoom]=useState<{roomId:string;date:string;reservationId?:string}|null>(null)
  const [reload,setReload]=useState(0)
  const [layout,setLayout]=useState<'grid'|'cards'>('grid')
  const [cardRows,setCardRows]=useState<ReservationRow[]>([])
  const [cardsForDate,setCardsForDate]=useState('')
  const [cardsLoading,setCardsLoading]=useState(false)
  const [cardsError,setCardsError]=useState('')
  const [removeTarget,setRemoveTarget]=useState<{id:string;guest:string;room:string;arrival:string;departure:string}|null>(null)
  const [removeBusy,setRemoveBusy]=useState(false)
  const [removeError,setRemoveError]=useState('')
  const pressTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const pressStart=useRef<{x:number;y:number}|null>(null)
  const suppressNextTap=useRef(false)
  function stopLongPress(){
    if(pressTimer.current!==null){clearTimeout(pressTimer.current);pressTimer.current=null}
    pressStart.current=null
  }
  function requestRemoval(bar:Cell,room:string){
    if(!data?.canRemove)return
    setRemoveError('')
    setRemoveTarget({id:bar.reservationId,guest:bar.guest,room,arrival:bar.arrival,departure:bar.departure})
  }
  async function removeReservation(){
    if(!removeTarget||removeBusy)return
    setRemoveBusy(true);setRemoveError('')
    try{
      const response=await fetch('/api/reservations/remove',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({id:removeTarget.id})
      })
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error||'Could not remove reservation')
      setRemoveTarget(null)
      setActiveRoom(null)
      setReload(n=>n+1)
      window.dispatchEvent(new CustomEvent('ths:live-data-refresh'))
    }catch(error:any){
      setRemoveError(String(error?.message||error))
    }finally{setRemoveBusy(false)}
  }
  useEffect(()=>{
    let active=true
    setLoading(true);setError('')
    fetch('/api/reservations/calendar?start='+encodeURIComponent(start),{cache:'no-store'})
      .then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load calendar');return d as Data})
      .then(d=>{if(active){setData(d)}})
      .catch(e=>{if(active){setData(null);setError(String(e.message||e))}})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[start,reload])
  useEffect(()=>{
    if(layout!=='cards')return
    let active=true
    const controller=new AbortController()
    setCardsLoading(true)
    setCardsError('')
    fetch('/api/reservations/calendar/cards?date='+encodeURIComponent(focusedDate),{cache:'no-store',signal:controller.signal})
      .then(async response=>{
        const result=await response.json()
        if(!response.ok)throw new Error(result.error||'Could not load reservation cards')
        return result as {date:string;rows:ReservationRow[]}
      })
      .then(result=>{if(active){setCardRows(result.rows||[]);setCardsForDate(result.date)}})
      .catch(error=>{if(active){setCardsForDate('');setCardsError(String(error?.message||error))}})
      .finally(()=>{if(active)setCardsLoading(false)})
    return()=>{active=false;controller.abort()}
  },[layout,focusedDate,reload])
  function focusOnDay(day:string){
    setFocusedDate(day)
    setStart(shift(day,-2))
    setScrollMode('focus')
    setScrollRequest(n=>n+1)
  }
  function viewHistory(){
    setFocusedDate(serviceDate)
    setStart(shift(serviceDate,-6))
    setScrollMode('beginning')
    setScrollRequest(n=>n+1)
  }
  useLayoutEffect(()=>{
    // Only reposition when opening the calendar or explicitly changing its date window.
    // A background data refresh or room save must not move a manually scrolled view.
    if(!data||data.start!==start||!scrollRef.current)return
    const scroller=scrollRef.current
    const roomHeader=scroller.querySelector<HTMLElement>('.ths-calendar-corner')
    const target=Array.from(scroller.querySelectorAll<HTMLElement>('.ths-calendar-day')).find(el=>el.dataset.date===focusedDate)
    scroller.scrollLeft=scrollMode==='beginning'?0:Math.max(0,(target?.offsetLeft||0)-(roomHeader?.offsetWidth||0))
  },[data?.start,start,focusedDate,scrollMode,scrollRequest,layout])
  const cells=useMemo(()=>new Map((data?.cells||[]).map(c=>[c.date+'|'+c.roomId,c])),[data])
  const notes=useMemo(()=>new Map((data?.notes||[]).map(n=>[n.date+'|'+n.roomId,n])),[data])
  const roomStatuses=useMemo(()=>new Map((data?.roomStatuses||[]).map(item=>[item.date+'|'+item.roomId,item])),[data])
  const holds=useMemo(()=>new Set((data?.holds||[]).map(h=>h.date+'|'+h.roomId)),[data])
  return <div className="ths-calendar">
    <div className="ths-calendar-toolbar">
      <div><strong>Ops</strong><small>7-day window · 2 previous days by default</small></div>
      <div className="ths-calendar-controls">
        <button type="button" title="Previous week" aria-label="Previous week" onClick={()=>focusOnDay(shift(focusedDate,-7))}><ChevronLeft size={18}/></button>
        <button type="button" onClick={()=>focusOnDay(serviceDate)}>Today</button>
        <button type="button" title="Next week" aria-label="Next week" onClick={()=>focusOnDay(shift(focusedDate,7))}><ChevronRight size={18}/></button>
        <button type="button" aria-label="Refresh calendar" onClick={()=>setReload(n=>n+1)}><RefreshCw size={16}/></button>
      </div>
    </div>
    <div className="ths-calendar-date"><CalendarDays size={17}/><input aria-label="Focus date" type="date" value={focusedDate} onChange={e=>{if(e.target.value)focusOnDay(e.target.value)}}/><div className="ths-calendar-shortcuts"><button type="button" aria-pressed={start===shift(serviceDate,-2)} onClick={()=>focusOnDay(serviceDate)}>Daily ops</button><button type="button" aria-pressed={start===shift(serviceDate,-6)} onClick={viewHistory}>Past 7 days</button></div></div>
    <div className="ths-calendar-view-switch" role="group" aria-label="Calendar display">
      <button type="button" aria-pressed={layout==='grid'} onClick={()=>setLayout('grid')}><Rows3 size={16}/> Timeline</button>
      <button type="button" aria-pressed={layout==='cards'} onClick={()=>setLayout('cards')}><LayoutGrid size={16}/> Day cards</button>
    </div>
    <p className="ths-calendar-help">{layout==='grid'?'Daily ops shows the previous 2 days, today, and the next 4. Past 7 days shows the last 6 days plus today. Swipe sideways to browse. Each teal bar represents an imported guest stay across its booked nights. Hatched dates represent room holds. Managers: press and hold a reservation bar to remove a cancelled booking.':'Detailed reservation cards for the selected day, including arrivals, stayovers, checkouts and OUT/IN rooms. Tap a card to open its room details.'}</p>
    {layout==='grid'&&error&&<div role="alert" className="ths-ops-empty">{error}</div>}
    {layout==='grid'&&loading&&!data&&<div className="ths-ops-empty">Loading calendar…</div>}
    {layout==='grid'?(data&&<div ref={scrollRef} className="ths-calendar-scroll" tabIndex={0} aria-label="Scrollable seven-day reservation calendar"><div className="ths-calendar-grid" style={{gridTemplateColumns:'118px repeat(7, minmax(118px, 1fr))'}}>
      <div className="ths-calendar-corner">Room</div>
      {data.days.map(day=><div data-date={day} className={day===serviceDate?'ths-calendar-day today':'ths-calendar-day'} key={day}>{pretty(day)}</div>)}
      {data.rooms.map(room=>{
        const matching=data.cells.filter(c=>c.roomId===room.id)
        const stays=new Map<string,Cell>()
        for(const c of matching)if(occupied(c)&&c.reservationId&&!stays.has(c.reservationId))stays.set(c.reservationId,c)
        const bars=[...stays.values()].map(c=>{
          const first=data.days.findIndex(day=>day>=c.arrival&&day<c.departure)
          const last=data.days.findLastIndex(day=>day>=c.arrival&&day<c.departure)
          return {...c,first,last}
        }).filter(c=>c.first>=0&&c.last>=c.first)
        // Color each booked date from its own saved room condition. A single
        // multi-night reservation may pass through several different conditions.
        const conditionColor=(value:string,blocked:boolean)=>{
          if(blocked)return '#e1e5ed'
          const v=value.toLowerCase().trim()
          if(!v)return '#edf2f5' // no room-condition data; not assumed ready
          if(v.includes('dirty'))return '#f7deda'
          if(v.includes('cleaning')||v.includes('in progress'))return '#fff0c8'
          if(v.includes('check')||v.includes('inspect'))return '#eee4f8'
          if(v.includes('ready')||v.includes('clean'))return '#d7efe4'
          if(v.includes('occupied'))return '#e1ecfa'
          if(v.includes('block'))return '#e1e5ed'
          return '#edf2f5'
        }
        const stayBackground=(bar:typeof bars[number])=>{
          const visible=data.days.slice(bar.first,bar.last+1)
          const segments=visible.flatMap((day,index)=>{
            const state=roomStatuses.get(day+'|'+room.id)
            const blocked=holds.has(day+'|'+room.id)||Boolean(state?.blocked)
            const fill=conditionColor(state?.condition||'',blocked)
            const left=(index/visible.length*100).toFixed(4)
            const right=((index+1)/visible.length*100).toFixed(4)
            return [fill+' '+left+'%',fill+' '+right+'%']
          })
          return 'linear-gradient(to right, '+segments.join(', ')+')'
        }
        return <div className="ths-calendar-row" key={room.id} style={{display:'contents'}}>
          <div className="ths-calendar-room">{room.name}</div>
          <div className="ths-calendar-band">
            {data.days.map((day,dayIndex)=>{
              const c=cells.get(day+'|'+room.id)
              const blocked=holds.has(day+'|'+room.id)||Boolean(c?.blocked)
              const note=notes.get(day+'|'+room.id)
              const roomStatus=roomStatuses.get(day+'|'+room.id)
              const condition=roomStatus?.condition?.trim()||''
              const statusText=blocked?'Blocked':condition||''
              const compactStatus=statusText.replace(/^Vacant \((Clean|Dirty)\)$/i,'$1').replace(/^Ready for Room Check$/i,'Needs check')
              const coveredByStay=[...stays.values()].some(stay=>day>=stay.arrival&&day<stay.departure)
              return <div key={day} data-service-date={day} style={{gridColumn:dayIndex+1,gridRow:1}} className={'ths-calendar-day-bg '+(blocked?'blocked':c?'imported':'unknown')}>
                <button type="button" className={'ths-calendar-empty-slot'+(note&&!coveredByStay?' has-note':'')+(statusText&&!coveredByStay?' has-status':'')} title={[room.name,pretty(day),!coveredByStay?statusText:'',!coveredByStay?note?.text:''].filter(Boolean).join(' · ')} aria-label={['Open '+room.name+' on '+pretty(day),!coveredByStay?statusText:'',!coveredByStay?note?.text:''].filter(Boolean).join(' · ')} onClick={()=>setActiveRoom({roomId:room.id,date:day})}>
                  {!coveredByStay&&statusText&&<span className="ths-calendar-status-chip" title={statusText}>{compactStatus}</span>}
                  {note&&!coveredByStay&&<span className="ths-calendar-note-text" title={note.text}>{note.text}</span>}
                </button>
              </div>
            })}
            {bars.map(bar=><button key={bar.reservationId} type="button" className="ths-calendar-stay ths-calendar-stay-condition" style={{gridColumn:`${bar.first+1} / ${bar.last+2}`,backgroundImage:stayBackground(bar)}} title={bar.guest+' · '+bar.arrival+' to '+bar.departure+(data.canRemove?' · Hold to remove':'')}
              onPointerDown={event=>{
                if(!data.canRemove||event.button!==0)return
                stopLongPress();suppressNextTap.current=false
                pressStart.current={x:event.clientX,y:event.clientY}
                pressTimer.current=setTimeout(()=>{pressTimer.current=null;pressStart.current=null;suppressNextTap.current=true;requestRemoval(bar,room.name)},650)
              }}
              onPointerMove={event=>{
                const origin=pressStart.current
                if(origin&&(Math.abs(event.clientX-origin.x)>12||Math.abs(event.clientY-origin.y)>12))stopLongPress()
              }}
              onPointerUp={stopLongPress}
              onPointerCancel={stopLongPress}
              onPointerLeave={stopLongPress}
              onContextMenu={event=>{if(!data.canRemove)return;event.preventDefault();stopLongPress();suppressNextTap.current=true;requestRemoval(bar,room.name)}}
              onKeyDown={event=>{if(data.canRemove&&(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))){event.preventDefault();requestRemoval(bar,room.name)}}}
              onClick={event=>{
              if(suppressNextTap.current){suppressNextTap.current=false;return}
              // A multi-night bar is one visual element: derive the operational date
              // from the precise day column tapped, not today's or the first stay day.
              const band=event.currentTarget.parentElement
              const rect=band?.getBoundingClientRect()
              const clickedIndex=event.detail>0&&rect?.width
                ? Math.min(bar.last,Math.max(bar.first,Math.floor((event.clientX-rect.left)/(rect.width/data.days.length))))
                : Math.max(bar.first,data.days.findIndex(day=>day===serviceDate&&day>=bar.arrival&&day<bar.departure))
              setActiveRoom({roomId:room.id,date:data.days[clickedIndex]||bar.date,reservationId:bar.reservationId})
            }}>
              <span className="ths-calendar-stay-text"><strong>{bar.guest}</strong><small>{bar.arrival} → {bar.departure}</small></span>
            </button>)}
          </div>
        </div>
      })}
    </div></div>):<section className="ths-calendar-reservation-cards" aria-label={'Reservation cards for '+pretty(focusedDate)}>
      <div className="ths-calendar-cards-heading"><strong>{pretty(focusedDate)}</strong><span>{cardsForDate===focusedDate?cardRows.length+' reservations':'Reservations'}</span></div>
      {cardsLoading&&<div className="ths-ops-empty" role="status">Loading reservation cards…</div>}
      {cardsError&&<div className="ths-ops-empty" role="alert">{cardsError}</div>}
      {!cardsLoading&&!cardsError&&cardsForDate===focusedDate&&(cardRows.length?
        <ReservationsBoard
          key={focusedDate}
          serviceDate={focusedDate}
          rows={cardRows}
          view="overview"
          hideViewSwitch
          onManageRoom={roomId=>{
            const row=cardRows.find(item=>item.roomId===roomId)
            const stay=row?.arriving||row?.staying||row?.primary||row?.departing
            setActiveRoom({roomId,date:focusedDate,reservationId:stay?.id||undefined})
          }}
        />:<div className="ths-ops-empty">No imported guest reservations for this date. Use Timeline to view available room slots and holds.</div>)}
    </section>}
    {activeRoom&&<OpsRoomHub key={activeRoom.roomId+'|'+activeRoom.date+'|'+(activeRoom.reservationId||'')} roomId={activeRoom.roomId} date={activeRoom.date} reservationId={activeRoom.reservationId} onClose={()=>setActiveRoom(null)} onUpdate={()=>setReload(n=>n+1)}/>}
    {removeTarget&&<div className="ths-calendar-remove-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!removeBusy)setRemoveTarget(null)}}>
      <section className="ths-calendar-remove-dialog" role="dialog" aria-modal="true" aria-labelledby="ths-calendar-remove-title">
        <div className="ths-calendar-remove-title"><span className="ths-calendar-remove-icon"><Trash2 size={21}/></span><div><small>Manager action</small><h3 id="ths-calendar-remove-title">Remove reservation?</h3></div></div>
        <p>Remove <strong>{removeTarget.guest}</strong> from <strong>{removeTarget.room}</strong> ({removeTarget.arrival} → {removeTarget.departure})?</p>
        <p className="ths-calendar-remove-note">This removes the booking from THS Ops, not the PMS. The reservation is kept in history, and importing the same report will not restore it. Existing breakfast orders are not deleted.</p>
        {removeError&&<p className="ths-calendar-remove-error" role="alert">{removeError}</p>}
        <div className="ths-calendar-remove-actions">
          <button type="button" disabled={removeBusy} onClick={()=>setRemoveTarget(null)}>Keep reservation</button>
          <button type="button" disabled={removeBusy} onClick={()=>void removeReservation()}><Trash2 size={16}/>{removeBusy?'Removing…':'Remove from Ops'}</button>
        </div>
      </section>
    </div>}
    <p className="ths-calendar-caveat">This view reflects imported reservations, not live PMS inventory or rates. Blank cells are not confirmed availability. Removing a booking here does not cancel it in the PMS or delete breakfast orders.</p>
  </div>
}
