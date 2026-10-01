'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid, ConciergeBell, UtensilsCrossed, ClipboardList, FileText,
  BedDouble, Wrench, FolderKanban, Settings, LogOut, Bell, Search, ShieldCheck
} from 'lucide-react'

type ModuleRow = {
  module_key:string; title:string; label:string|null; href:string|null; active:boolean;
  enabled:boolean; published:boolean; status:string; sort_order:number
}

type Access = { canPreviewUnpublished:boolean; permissions:string[]; theme:'light'|'blue'|'dark'; roleName:string|null; isAdmin:boolean }

const iconMap:any = {
  dashboard:LayoutGrid, front_desk:ConciergeBell, kitchen:UtensilsCrossed,
  menu_manager:ClipboardList, breakfast_menu_manager:ClipboardList,
  daily_overview:FileText, housekeeping:BedDouble, room_checks:ShieldCheck,
  projects:FolderKanban, maintenance:Wrench, breakfast_guest:UtensilsCrossed
}

const permissionByModule:Record<string,string|undefined> = {dashboard:'dashboard.view',front_desk:'breakfast.front_desk.view',kitchen:'breakfast.kitchen.view',menu_manager:'breakfast.menu_manager.view',breakfast_menu_manager:'breakfast.menu_manager.view',daily_overview:'breakfast.read_only.view',housekeeping:'housekeeping.dashboard.view',room_checks:'room_checks.view',projects:'projects.view',maintenance:'projects.view',breakfast_guest:undefined}

const hrefFallback:Record<string,string> = {
  dashboard:'/dashboard', front_desk:'/front-desk', kitchen:'/kitchen',
  menu_manager:'/breakfast/menu-manager', breakfast_menu_manager:'/breakfast/menu-manager',
  daily_overview:'/breakfast/overview', housekeeping:'/housekeeping', room_checks:'/room-checks',
  projects:'/projects', maintenance:'/maintenance', breakfast_guest:'/breakfast'
}

export default function StaffShell({title,children}:{title:string;children:React.ReactNode}) {
  const pathname = usePathname()
  const [access,setAccess] = useState<Access|null>(null)
  const [modules,setModules] = useState<ModuleRow[]>([])

  useEffect(()=>{
    fetch('/api/me').then(r=>r.ok?r.json():null).then(d=>{
      if(!d) return
      setAccess(d.access)
      setModules(d.modules || [])
      document.documentElement.dataset.theme = d.access?.theme || 'blue'
    }).catch(()=>{})
  },[])

  const nav = useMemo(()=>modules
    .filter(m=>m.active!==false && m.enabled!==false)
    .filter(m=>m.published!==false || access?.canPreviewUnpublished)
    .filter(m=>{ const p=permissionByModule[m.module_key]; return !p || access?.isAdmin || access?.permissions?.includes(p) })
    .filter(m=>m.module_key !== 'breakfast_menu_manager')
    .sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)),[modules,access])

  return (
    <main className="ops-app staff-ops-app">
      <aside className="ops-sidebar staff-ops-sidebar">
        <Link className="ops-logo" href="/dashboard">
          <div className="ops-logo-mark">THS</div>
          <div><strong>The Hotel</strong><span>Saugatuck</span></div>
        </Link>

        <nav className="ops-nav staff-ops-nav">
          {nav.map(item=>{
            const Icon = iconMap[item.module_key] || LayoutGrid
            const href = hrefFallback[item.module_key] || item.href || '#'
            const active = pathname===href
            const preview = item.published===false
            return <Link key={item.module_key} href={href} className={active?'active':''}>
              <Icon size={20}/><span>{item.label||item.title}</span>{preview&&<em className="preview-badge">Preview</em>}
            </Link>
          })}
        </nav>

        <div className="ops-sidebar-bottom">
          <button type="button" onClick={()=>window.location.assign("/settings")}><Settings size={19}/><span>Settings</span></button>
          <form action="/auth/signout" method="post">
            <button type="submit"><LogOut size={19}/><span>Sign out</span></button>
          </form>
        </div>
      </aside>

      <section className="ops-main staff-ops-main">
        <header className="ops-topbar staff-ops-topbar">
          <div className="staff-page-title"><span>The Hotel Saugatuck</span><strong>{title}</strong></div>
          <div className="staff-topbar-spacer" />
          <div className="ops-search staff-global-search"><Search size={19}/><input placeholder="Search this workspace" disabled /></div>
          <button className="ops-icon-btn" aria-label="Notifications"><Bell size={20}/></button>
        </header>
        <div className="ops-content staff-page-content">{children}</div>
      </section>
    </main>
  )
}
