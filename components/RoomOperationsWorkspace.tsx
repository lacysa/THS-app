'use client'

import {useState} from 'react'
import ReservationsBoard from '@/components/ReservationsBoard'
import UnifiedRoomsBoard from '@/components/UnifiedRoomsBoard'

type ReservationRow=Parameters<typeof ReservationsBoard>[0]['rows'][number]

export default function RoomOperationsWorkspace({serviceDate,rows,canEdit,canManageRooms}:{serviceDate:string;rows:ReservationRow[];canEdit:boolean;canManageRooms:boolean}){
  const [tab,setTab]=useState<'rooms'|'reservations'>(canManageRooms?'rooms':'reservations')
  return <div className="ths-unified-operations">
    {canManageRooms&&<nav className="ths-operations-tabs" aria-label="Room Operations sections">
      <div><strong>Room Operations</strong><small>One workspace for room readiness, guest stays and management controls.</small></div>
      <div className="ths-operations-tab-buttons" role="group" aria-label="Choose workspace">
        <button type="button" aria-pressed={tab==='rooms'} className={tab==='rooms'?'active':''} onClick={()=>setTab('rooms')}>Rooms & housekeeping</button>
        <button type="button" aria-pressed={tab==='reservations'} className={tab==='reservations'?'active':''} onClick={()=>setTab('reservations')}>Guest reservations</button>
      </div>
    </nav>}
    {tab==='rooms'&&canManageRooms?<UnifiedRoomsBoard initialDate={serviceDate}/>:<ReservationsBoard serviceDate={serviceDate} rows={rows} canEdit={canEdit}/>}
  </div>
}
