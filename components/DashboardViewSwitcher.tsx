'use client'
import { useEffect, useState } from 'react'
export default function DashboardViewSwitcher({today,operations}:{today:React.ReactNode;operations:React.ReactNode}){
 const [view,setView]=useState<'today'|'operations'>('operations')
 useEffect(()=>{try{const saved=window.sessionStorage.getItem('ths-dashboard-view');if(saved && ["today","operations"].includes(saved))setView(saved as 'today'|'operations')}catch{}},[])
 function selectView(next:'today'|'operations'){setView(next);try{window.sessionStorage.setItem('ths-dashboard-view',next)}catch{}}

 return <div className="ths-switcher-page">
  <div className="ths-view-switcher" role="group" aria-label="Dashboard view">
   <div><strong>Dashboard view</strong><small>One workspace at a time</small></div>
   <div className="ths-view-buttons"><button type="button" className={view==='today'?'active':''} aria-pressed={view==='today'} onClick={()=>selectView('today')}>Today</button><button type="button" className={view==='operations'?'active':''} aria-pressed={view==='operations'} onClick={()=>selectView('operations')}>Operations</button></div>
  </div>
  <div className="ths-view-content">{view==='today'?today:operations}</div>
 </div>
}
