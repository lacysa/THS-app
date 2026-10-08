'use client'

import {useState} from 'react'
import ReservationsBoard from '@/components/ReservationsBoard'
import UnifiedRoomsBoard from '@/components/UnifiedRoomsBoard'

type ReservationRow=Parameters<typeof ReservationsBoard>[0]['rows'][number]

export default function RoomOperationsWorkspace({serviceDate,rows,canEdit,canManageRooms}:{serviceDate:string;rows:ReservationRow[];canEdit:boolean;canManageRooms:boolean}){
  const [tab,setTab]=useState<'rooms'|'overview'|'edit'>(canManageRooms?'rooms':'overview')
  const [manageRoomId,setManageRoomId]=useState('')
  const [showAllRoomTasks,setShowAllRoomTasks]=useState(false)
  return <div className="ths-unified-operations">
    {canManageRooms&&<nav className="ths-operations-tabs" aria-label="Room Operations sections">
      <div><strong>Room Operations</strong><small>One workspace for room readiness, guest stays and management controls.</small></div>
      <div className="ths-operations-tab-buttons" role="group" aria-label="Choose workspace">
        <button type="button" aria-pressed={tab==='rooms'} className={tab==='rooms'?'active':''} onClick={()=>{setTab('rooms');setManageRoomId('');setShowAllRoomTasks(false)}}>Rooms & housekeeping</button>
        <button type="button" aria-pressed={tab==='overview'} className={tab==='overview'?'active':''} onClick={()=>setTab('overview')}>Reservation overview</button>
        {canEdit&&<button type="button" aria-pressed={tab==='edit'} className={tab==='edit'?'active':''} onClick={()=>setTab('edit')}>Edit reservations</button>}
      </div>
    </nav>}
    {tab==='rooms'&&canManageRooms
      ? manageRoomId||showAllRoomTasks
        ? <section className="ths-operational-room-detail">
            <button type="button" className="ths-back-to-cards" onClick={()=>{setManageRoomId('');setShowAllRoomTasks(false);window.dispatchEvent(new CustomEvent('ths:live-data-refresh'))}}>← Back to room cards</button>
            <UnifiedRoomsBoard key={manageRoomId||'all-rooms'} initialDate={serviceDate} initialRoomId={manageRoomId||undefined}/>
          </section>
        : <section className="ths-rooms-card-overview">
            <div className="ths-room-overview-tools"><span>Rooms, guest stays and live readiness. Select Manage room to edit or complete tasks.</span><button type="button" onClick={()=>setShowAllRoomTasks(true)}>All 17 rooms & tasks</button></div>
            <ReservationsBoard serviceDate={serviceDate} rows={rows} canEdit={canEdit} hideViewSwitch showRoomActions onManageRoom={setManageRoomId} view="overview"/>
          </section>
      : <ReservationsBoard serviceDate={serviceDate} rows={rows} canEdit={canEdit} hideViewSwitch view={tab==='edit'?'edit':'overview'} onViewChange={next=>setTab(next)}/>}
  </div>
}
