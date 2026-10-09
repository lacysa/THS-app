'use client'
import {useState} from 'react'
import {CalendarDays,ClipboardList} from 'lucide-react'
import ReservationCalendar from '@/components/ReservationCalendar'
import OpsActivityLog from '@/components/OpsActivityLog'

export default function OpsWorkspace({serviceDate}:{serviceDate:string}){
 const [view,setView]=useState<'calendar'|'log'>('calendar')
 const [openedLog,setOpenedLog]=useState(false)
 const switchView=(v:'calendar'|'log')=>{if(v==='log')setOpenedLog(true);setView(v)}
 return <div className="ops-workspace">
  <nav className="ops-workspace-nav" aria-label="Ops views">
   <button type="button" aria-pressed={view==='calendar'} onClick={()=>switchView('calendar')}><CalendarDays size={18}/> Calendar</button>
   <button type="button" aria-pressed={view==='log'} onClick={()=>switchView('log')}><ClipboardList size={18}/> Activity Log</button>
  </nav>
  <div style={{display:view==='calendar'?'block':'none'}}><ReservationCalendar serviceDate={serviceDate}/></div>
  {openedLog&&<div style={{display:view==='log'?'block':'none'}}><OpsActivityLog serviceDate={serviceDate}/></div>}
 </div>
}
