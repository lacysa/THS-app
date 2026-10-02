'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { LayoutGrid, UtensilsCrossed, ConciergeBell, ClipboardList, BedDouble, Wrench, FolderKanban, ShieldCheck, Search, LogOut, Settings, Bell, ChevronRight, ScrollText } from 'lucide-react'

type ModuleRow={module_key:string;title:string;label:string|null;department:string;href:string|null;status:string;sort_order:number;active:boolean;enabled:boolean;published:boolean}
const icons:any={dashboard:LayoutGrid,front_desk:ConciergeBell,kitchen:UtensilsCrossed,menu_manager:ClipboardList,breakfast_menu_manager:ClipboardList,daily_overview:ClipboardList,housekeeping:BedDouble,room_checks:ShieldCheck,projects:FolderKanban,maintenance:Wrench,shift_reports:ScrollText,breakfast_guest:UtensilsCrossed}
const hrefFallback:Record<string,string>={dashboard:'/dashboard',front_desk:'/front-desk',kitchen:'/kitchen',menu_manager:'/breakfast/menu-manager',breakfast_menu_manager:'/breakfast/menu-manager',daily_overview:'/breakfast/overview',housekeeping:'/housekeeping',room_checks:'/room-checks',projects:'/projects',maintenance:'/maintenance',shift_reports:'/shift-reports',breakfast_guest:'/breakfast'}
const descriptions:Record<string,string>={front_desk:'Delivery times, scheduled rooms, missing menus, and breakfast reservations.',kitchen:'Live breakfast tickets, dietary restrictions, condiments, and order status.',menu_manager:'Build and edit the guest breakfast menu directly inside the app.',daily_overview:'Read-only daily breakfast overview.',housekeeping:'Room assignments, cleaning progress, inspections, and daily room operations.',room_checks:'Inspect completed rooms, approve guest-ready status, and send rooms back for reclean.',projects:'Operational projects, assignments, notes, due dates, and progress tracking.',maintenance:'Room-first work orders grouped by guest room or property area.',shift_reports:'Daily shift report, room notes, handoff, manager notes, and print/PDF history.',breakfast_guest:'Open the guest-facing breakfast scheduler.'}

export default function DashboardGrid({displayName='Staff',modules=[],canPreviewUnpublished=false,theme='blue'}:{displayName?:string;modules?:ModuleRow[];canPreviewUnpublished?:boolean;theme?:'light'|'blue'|'dark'}) {
  const [search,setSearch]=useState('')
  useEffect(()=>{ document.documentElement.dataset.theme = theme },[theme])
  const visible=useMemo(()=>modules.filter(m=>m.active!==false&&m.enabled!==false&&(m.published!==false||canPreviewUnpublished)).filter(m=>m.module_key!=='dashboard'&&m.module_key!=='breakfast_menu_manager').filter(m=>`${m.title} ${m.department}`.toLowerCase().includes(search.toLowerCase())),[modules,canPreviewUnpublished,search])
  return <main className="ops-app">
    <aside className="ops-sidebar">
      <div className="ops-logo"><div className="ops-logo-mark">THS</div><div><strong>The Hotel</strong><span>Saugatuck</span></div></div>
      <nav className="ops-nav"><Link className="active" href="/dashboard"><LayoutGrid size={20}/><span>All Services</span></Link></nav>
      <div className="ops-sidebar-bottom"><button type="button" onClick={()=>window.location.assign("/settings")}><Settings size={19}/><span>Settings</span></button><form action="/auth/signout" method="post"><button type="submit"><LogOut size={19}/><span>Sign out</span></button></form></div>
    </aside>
    <section className="ops-main">
      <header className="ops-topbar"><div className="ops-search"><Search size={20}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search services" /></div><div className="ops-top-actions"><button className="ops-icon-btn"><Bell size={20}/></button><div className="ops-avatar">{displayName.charAt(0).toUpperCase()}</div><div className="ops-user-copy"><strong>{displayName}</strong><span>Staff</span></div></div></header>
      <div className="ops-content"><div className="ops-heading-row"><div><div className="ops-kicker">The Hotel Saugatuck</div><h1>Services</h1><p>Open live tools and preview upcoming modules when your account has access.</p></div></div>
      <div className="ops-card-grid">{visible.map(m=>{const Icon=icons[m.module_key]||LayoutGrid;const href=hrefFallback[m.module_key]||m.href||'#';const preview=m.published===false;return <Link key={m.module_key} className="ops-card" href={href}><div className="ops-card-icon"><Icon size={29}/></div><div className="ops-card-eyebrow">{m.department||'Operations'}</div><h2>{m.label||m.title}</h2><p>{descriptions[m.module_key]||'Operations module.'}</p><div className="ops-card-footer"><span className={`ops-status ${preview?'coming-soon':'live'}`}>{preview?'Preview':'Open'}</span><ChevronRight size={19}/></div></Link>})}</div>
      </div>
    </section>
  </main>
}
