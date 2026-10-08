'use client'
import { useEffect, useState } from 'react'
type View='staffing'|'access'
export default function StaffViewSwitcher({staffing,access}:{staffing:React.ReactNode;access:React.ReactNode}){
 const [view,setView]=useState<View>('staffing')
 useEffect(()=>{try{const saved=window.sessionStorage.getItem('ths-staff-view');if(saved && ["staffing","access"].includes(saved))setView(saved as View)}catch{}},[])
 function selectView(next:View){setView(next);try{window.sessionStorage.setItem('ths-staff-view',next)}catch{}}

 return <div className="ths-switcher-page">
  <div className="ths-view-switcher" role="group" aria-label="Staff page view">
   <div><strong>Staff workspace</strong><small>Choose what you want to manage</small></div>
   <div className="ths-view-buttons"><button type="button" aria-pressed={view==='staffing'} className={view==='staffing'?'active':''} onClick={()=>selectView('staffing')}>Daily staffing</button><button type="button" aria-pressed={view==='access'} className={view==='access'?'active':''} onClick={()=>selectView('access')}>Staff access</button></div>
  </div>
  <div className="ths-view-content">{view==='staffing'?staffing:access}</div>
 </div>
}
