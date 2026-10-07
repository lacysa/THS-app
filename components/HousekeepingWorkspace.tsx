'use client'

import { useState } from 'react'
import { LayoutGrid, Table2 } from 'lucide-react'
import HousekeepingBoard from '@/components/HousekeepingBoard'
import RoomBoard from '@/components/RoomBoard'

export default function HousekeepingWorkspace(){
  const [view,setView]=useState<'cards'|'table'>('cards')

  return <div className="housekeeping-workspace">
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

    <div className="housekeeping-workspace-note">
      Both views use the same daily room records. Switching views reloads the same Housekeeping source of truth.
    </div>

    {view==='cards'?<RoomBoard/>:<HousekeepingBoard/>}
  </div>
}
