'use client'

import { useEffect,useState } from 'react'
import { LayoutGrid, SlidersHorizontal, Table2, X } from 'lucide-react'
import HousekeepingBoard from '@/components/HousekeepingBoard'
import RoomBoard from '@/components/RoomBoard'

type CleanLimit={id:string;name:string;jobTitle:string;fullRoomCleanLimit:number}

export default function HousekeepingWorkspace(){
  const [view,setView]=useState<'cards'|'table'>('cards')
  const [limits,setLimits]=useState<CleanLimit[]>([])
  const [canManageLimits,setCanManageLimits]=useState(false)
  const [limitsOpen,setLimitsOpen]=useState(false)
  const [limitMessage,setLimitMessage]=useState('')

  async function loadLimits(){
    const r=await fetch('/api/housekeeping/clean-limits',{cache:'no-store'})
    if(r.status===403||r.status===401){
      setCanManageLimits(false)
      return
    }
    const d=await r.json().catch(()=>({}))
    if(!r.ok) return
    setLimits(d.staff||[])
    setCanManageLimits(true)
  }

  useEffect(()=>{void loadLimits()},[])

  async function saveLimit(staffMemberId:string,limit:number){
    setLimitMessage('Saving…')
    const r=await fetch('/api/housekeeping/clean-limits',{
      method:'PATCH',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({staffMemberId,limit})
    })
    const d=await r.json().catch(()=>({}))
    if(!r.ok){
      setLimitMessage(d.error||'Could not update full clean limit.')
      return
    }
    setLimits(current=>current.map(item=>item.id===staffMemberId?{...item,fullRoomCleanLimit:limit}:item))
    setLimitMessage('Saved.')
    window.setTimeout(()=>setLimitMessage(''),1200)
  }

  return <div className="housekeeping-workspace">
    <div className="housekeeping-workspace-top">
      <div className="housekeeping-workspace-switch" role="tablist" aria-label="Housekeeping view">
      <button
        type="button"
        role="tab"
        aria-selected={view==='cards'}
        className={view==='cards'?'active':''}
        onClick={()=>setView('cards')}
      >
        <LayoutGrid size={15}/>
        Room Board
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view==='table'}
        className={view==='table'?'active':''}
        onClick={()=>setView('table')}
      >
        <Table2 size={15}/>
        Housekeeping Board
      </button>
      </div>

      {canManageLimits&&<button type="button" className="housekeeping-limit-button" onClick={()=>setLimitsOpen(true)}>
        <SlidersHorizontal size={15}/>
        Full clean limits
      </button>}
    </div>

    <div className="housekeeping-workspace-note">
      Both views use the same daily room records. Switching views reloads the same Housekeeping source of truth.
    </div>

    {view==='cards'?<RoomBoard/>:<HousekeepingBoard/>}

    {limitsOpen&&<div className="housekeeping-limit-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setLimitsOpen(false)}}>
      <section className="housekeeping-limit-panel" role="dialog" aria-modal="true" aria-label="Housekeeper full room clean limits">
        <header>
          <div>
            <span>Housekeeping capacity</span>
            <h2>Full room clean limits</h2>
            <p>Default is 2 full cleans per shift. Checkout and Out/In rooms count toward this limit.</p>
          </div>
          <button type="button" onClick={()=>setLimitsOpen(false)} aria-label="Close"><X size={18}/></button>
        </header>

        {limitMessage&&<div className="housekeeping-limit-message">{limitMessage}</div>}

        <div className="housekeeping-limit-list">
          {limits.map(person=><div className="housekeeping-limit-row" key={person.id}>
            <div>
              <strong>{person.name}</strong>
              <small>{person.jobTitle||'Staff'}</small>
            </div>
            <label>
              Max full cleans
              <input
                type="number"
                min="0"
                max="10"
                value={person.fullRoomCleanLimit}
                onChange={e=>{
                  const value=Math.max(0,Math.min(10,Number(e.target.value)||0))
                  setLimits(current=>current.map(item=>item.id===person.id?{...item,fullRoomCleanLimit:value}:item))
                }}
                onBlur={()=>void saveLimit(person.id,person.fullRoomCleanLimit)}
              />
            </label>
          </div>)}
        </div>
      </section>
    </div>}
  </div>
}
