'use client'

import Link from 'next/link'
import {
  LayoutGrid,
  UtensilsCrossed,
  ConciergeBell,
  ClipboardList,
  BedDouble,
  Wrench,
  FolderKanban,
  ShieldCheck,
  FileText,
  ScrollText,
  Package,
  Building2,
  BookOpen
} from 'lucide-react'

type ModuleRow = {
  module_key:string
  title:string
  label:string|null
  department:string
  href:string|null
  status:string
  sort_order:number
  active:boolean
  enabled:boolean
  published:boolean
}

const icons:Record<string,any> = {
  front_desk:ConciergeBell,
  kitchen:UtensilsCrossed,
  menu_manager:ClipboardList,
  breakfast_menu_manager:ClipboardList,
  daily_overview:FileText,
  housekeeping:BedDouble,
  room_checks:ShieldCheck,
  projects:FolderKanban,
  maintenance:Wrench,
  shift_reports:ScrollText,
  breakfast_guest:UtensilsCrossed,
  laundry:Package,
  lobby:Building2,
  housekeeping_guide:BookOpen,
}

const hrefFallback:Record<string,string> = {
  front_desk:'/front-desk',
  kitchen:'/kitchen',
  menu_manager:'/breakfast/menu-manager',
  breakfast_menu_manager:'/breakfast/menu-manager',
  daily_overview:'/breakfast/overview',
  housekeeping:'/housekeeping',
  room_checks:'/room-checks',
  projects:'/projects',
  maintenance:'/maintenance',
  shift_reports:'/shift-reports',
  breakfast_guest:'/breakfast',
  laundry:'/laundry',
  lobby:'/lobby',
  housekeeping_guide:'/housekeeping/resources',
}

export default function DashboardGrid({modules=[]}:{modules?:ModuleRow[]}) {
  const visible = modules
    .filter(m => m.module_key !== 'dashboard' && m.module_key !== 'breakfast_menu_manager' && !m.module_key.endsWith('_inventory'))
    .sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))

  return (
    <div className="dashboard-services">
      <div className="dashboard-services-head">
        <div>
          <div className="ops-kicker">The Hotel Saugatuck</div>
          <h1>Services</h1>
          <p>Only the tools available to your account are shown here.</p>
        </div>
      </div>

      {visible.length===0 ? (
        <div className="ops-empty">No modules are available for this account.</div>
      ) : (
        <div className="service-pill-grid">
          {visible.map(m => {
            const Icon = icons[m.module_key] || LayoutGrid
            const href = hrefFallback[m.module_key] || m.href || '#'
            return (
              <Link className="service-pill" href={href} key={m.module_key}>
                <span className="service-pill-icon"><Icon size={18}/></span>
                <span className="service-pill-label">{m.label || m.title}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
