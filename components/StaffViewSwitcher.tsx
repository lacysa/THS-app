'use client'
import { useState } from 'react'
type View='staffing'|'access'
export default function StaffViewSwitcher({staffing,access}:{staffing:React.ReactNode;access:React.ReactNode}){
 const [view,setView]=useState<View>('staffing')
 return <div className="ths-switcher-page">
  <div className="ths-view-switcher" role="group" aria-label="Staff page view">
   <div><strong>Staff workspace</strong><small>Choose what you want to manage</small></div>
   <div className="ths-view-buttons"><button type="button" aria-pressed={view==='staffing'} className={view==='staffing'?'active':''} onClick={()=>setView('staffing')}>Daily staffing</button><button type="button" aria-pressed={view==='access'} className={view==='access'?'active':''} onClick={()=>setView('access')}>Staff access</button></div>
  </div>
  <div className="ths-view-content">{view==='staffing'?staffing:access}</div>
 </div>
}
