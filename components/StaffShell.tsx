'use client'

import { getStaffSession } from '@/lib/client/staff-session'
import { staffModuleLabel } from '@/lib/module-labels'
import { staffInitials } from '@/lib/staff-initials'
import {roomCheckStage} from '@/lib/room-check-queue'
import {notificationHref,type RoomNotification} from '@/lib/notification-links'
import StaffShiftNote from '@/components/StaffShiftNote'
import { NON_DESKTOP_WORKSPACE_MEDIA, TABLET_RAIL_MEDIA } from '@/lib/layout-breakpoints'

import Link from 'next/link'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutGrid,
  ConciergeBell,
  UtensilsCrossed,
  ClipboardList,
  ClipboardCheck,
  FileText,
  BedDouble,
  Wrench,
  FolderKanban,
  Settings,
  LogOut,
  Bell,
  Archive,
  Search,
  RefreshCw,
  CalendarDays,
  BarChart3,
  ShieldCheck,
  ScrollText,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  Building2,
  BookOpen,
  Menu,
  X,
  UsersRound,
  ChevronDown
} from 'lucide-react'

type ModuleRow = {
  module_key: string
  title: string
  label: string | null
  href: string | null
  active: boolean
  enabled: boolean
  published: boolean
  status: string
  sort_order: number
}

type Access = {
  userId: string
  name: string
  username?: string | null
  preferredName: string | null
  email: string | null
  phone: string | null
  jobTitle: string | null
  canPreviewUnpublished: boolean
  permissions: string[]
  capabilities?: string[]
  theme: 'light' | 'blue' | 'sage' | 'violet' | 'dark'
  roleName: string | null
  isAdmin: boolean
  isPreviewMode?: boolean
  previewOwnerUserId?: string | null
  requiresPasswordChange?: boolean
}

type NotificationRow = RoomNotification

const iconMap: Record<string, any> = {
  dashboard: LayoutGrid,
  front_desk: ConciergeBell,
  kitchen: UtensilsCrossed,
  menu_manager: ClipboardList,
  breakfast_menu_manager: ClipboardList,
  daily_overview: FileText,
  housekeeping: BedDouble,
  room_board: BedDouble,
  housekeeping_setup: ClipboardList,
  housekeeping_assignments: ClipboardList,
  room_checks: ShieldCheck,
  projects: FolderKanban,
  maintenance: Wrench,
  shift_reports: ScrollText,
  breakfast_guest: UtensilsCrossed,
  laundry: Package,
  lobby: Building2,
  housekeeping_guide: BookOpen,
  reservation_sync: RefreshCw,
  reservations: CalendarDays,
  ops: CalendarDays,
  housekeeping_quality: BarChart3,
  staff: UsersRound
}

const permissionByModule: Record<string, string | undefined> = {
  dashboard: 'dashboard.view',
  front_desk: 'breakfast.front_desk.view',
  kitchen: 'breakfast.kitchen.view',
  menu_manager: 'breakfast.menu_manager.view',
  breakfast_menu_manager: 'breakfast.menu_manager.view',
  daily_overview: 'breakfast.read_only.view',
  housekeeping: 'housekeeping.dashboard.view',
  room_board: 'housekeeping.dashboard.view',
  room_checks: 'room_checks.view',
  projects: 'projects.view',
  maintenance: undefined,
  shift_reports: undefined,
  breakfast_guest: undefined
}

const hrefFallback: Record<string, string> = {
  dashboard: '/dashboard',
  front_desk: '/front-desk',
  kitchen: '/kitchen',
  menu_manager: '/breakfast/menu-manager',
  breakfast_menu_manager: '/breakfast/menu-manager',
  daily_overview: '/breakfast/overview',
  housekeeping: '/housekeeping',
  room_board: '/room-board',
  housekeeping_setup: '/housekeeping/setup',
  housekeeping_assignments: '/housekeeping/assignments',
  room_checks: '/room-checks',
  projects: '/projects',
  maintenance: '/maintenance',
  shift_reports: '/shift-reports',
  breakfast_guest: '/breakfast',
  laundry: '/laundry',
  lobby: '/lobby',
  housekeeping_guide: '/housekeeping/resources',
  reservation_sync: '/reservation-sync',
  reservations: '/reservations',
  ops: '/ops',
  housekeeping_quality: '/housekeeping/quality',
  staff: '/staff'
}

type NavSectionKey='overview'|'breakfast'|'operations'|'housekeeping'|'administration'|'tools'
const activeNavSection=(route:string):NavSectionKey=>{
  if(route.startsWith('/housekeeping/quality')||route.startsWith('/staff'))return 'administration'
  if(route.startsWith('/breakfast')||route.startsWith('/front-desk')||route.startsWith('/kitchen'))return 'breakfast'
  if(route==='/housekeeping/today'||route.startsWith('/housekeeping/arrivals')||route.startsWith('/housekeeping/refreshes')||route.startsWith('/housekeeping/sidework'))return 'housekeeping'
  if(route.startsWith('/reservations')||route.startsWith('/room-checks')||route.startsWith('/reservation-sync')||route==='/housekeeping'||route.startsWith('/housekeeping/assignments')||route.startsWith('/ops'))return 'operations'
  if(route==='/dashboard'||route==='/notifications'||route.startsWith('/shift-reports'))return 'overview'
  return 'tools'
}
const initialNavOpen=(route:string):Record<NavSectionKey,boolean>=>({
  overview:true,
  breakfast:activeNavSection(route)==='breakfast',
  operations:activeNavSection(route)==='operations',
  housekeeping:activeNavSection(route)==='housekeeping',
  administration:activeNavSection(route)==='administration',
  tools:activeNavSection(route)==='tools'
})
const hotelDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Detroit',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())

const breakfastModules = new Set([
  'front_desk',
  'kitchen',
  'daily_overview',
  'breakfast_guest',
  'menu_manager'
])

const operationsModules = new Set([
  'housekeeping',
  'housekeeping_assignments',
  'room_board',
  'housekeeping_setup',
  'room_checks',
  'housekeeping_quality',
  'projects',
  'shift_reports',
  'maintenance',
  'laundry',
  'lobby',
  'housekeeping_guide',
  'reservation_sync',
  'reservations',
  'ops',
  'staff'
])



function notificationTime(value: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Detroit',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(value))
  } catch {
    return ''
  }
}

export default function StaffShell({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const [access, setAccess] = useState<Access | null>(null)
  const [modules, setModules] = useState<ModuleRow[]>([])
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [navOpen,setNavOpen]=useState<Record<NavSectionKey,boolean>>(()=>initialNavOpen(pathname))
  const [inspectionCounts,setInspectionCounts]=useState({ready:0,arrivals:0})

  const [notifications, setNotifications] =
    useState<NotificationRow[]>([])

  const [unreadCount, setUnreadCount] =
    useState(0)

  const [notificationsOpen, setNotificationsOpen] =
    useState(false)

  const [notificationsLoading, setNotificationsLoading] =
    useState(false)
  const notificationPanelRef=useRef<HTMLDivElement|null>(null)

  useEffect(() => {
    // Tablet landscape starts with an icon rail; desktop uses the saved preference.
    // Portrait/tablet drawer and phones never inherit a collapsed desktop sidebar.
    const tabletRail = window.matchMedia(TABLET_RAIL_MEDIA)
    const nonDesktop = window.matchMedia(NON_DESKTOP_WORKSPACE_MEDIA)
    const syncSidebarLayout = () => {
      let saved: string | null = null
      try { saved = window.localStorage.getItem('ths-sidebar-collapsed') } catch {}
      setSidebarCollapsed(tabletRail.matches ? saved !== '0' : nonDesktop.matches ? false : saved === '1')
      setMobileNavOpen(false)
    }
    syncSidebarLayout()
    tabletRail.addEventListener('change', syncSidebarLayout)
    nonDesktop.addEventListener('change', syncSidebarLayout)
    // Device rotation should never leave a navigation backdrop covering the work area.
    const cleanupSidebarLayout = () => {
      tabletRail.removeEventListener('change', syncSidebarLayout)
      nonDesktop.removeEventListener('change', syncSidebarLayout)
    }

    getStaffSession()
      .then(d => {
        if (!d) return

        setAccess(d.access)
        setModules(d.modules || [])

        document.documentElement.dataset.theme =
          d.access?.theme || 'blue'
      })
      .catch(() => {})
    return cleanupSidebarLayout
  }, [])

  useEffect(() => {
    setMobileNavOpen(false)
    setNotificationsOpen(false)
    // The current page must always be discoverable, even if its group was collapsed.
    const section=activeNavSection(pathname)
    setNavOpen(prev=>prev[section]?prev:{...prev,[section]:true})
  }, [pathname])

  useEffect(()=>{
    try{
      const saved=window.localStorage.getItem('ths-nav-sections')
      if(!saved)return
      const parsed=JSON.parse(saved)
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return
      setNavOpen(prev=>{
        const next={...prev}
        for(const key of Object.keys(next) as NavSectionKey[]){
          if(typeof parsed[key]==='boolean')next[key]=parsed[key]
        }
        next[activeNavSection(pathname)]=true
        return next
      })
    }catch{}
    // Restore once; later clicks update storage without full navigation.
  },[])

  const toggleNavSection=(key:NavSectionKey)=>{
    setNavOpen(prev=>{
      const next={...prev,[key]:!prev[key]}
      try{window.localStorage.setItem('ths-nav-sections',JSON.stringify(next))}catch{}
      return next
    })
  }

  useEffect(() => {
    if(access?.requiresPasswordChange && pathname !== '/settings') router.replace('/settings')
  }, [access?.requiresPasswordChange, pathname, router])

  async function loadNotifications(showLoading = false) {
    if (showLoading) {
      setNotificationsLoading(true)
    }

    try {
      const r = await fetch('/api/notifications?view=unread&limit=8', {
        cache: 'no-store'
      })

      const d = await r.json().catch(() => ({}))

      if (!r.ok) return

      setNotifications(d.notifications || [])
      setUnreadCount(Number(d.unread || 0))
    } finally {
      if (showLoading) {
        setNotificationsLoading(false)
      }
    }
  }

  useEffect(() => {
    let active=true
    let running=false
    let lastRefresh=0
    const refresh=async()=>{
      if(!active || document.visibilityState!=='visible' || running || Date.now()-lastRefresh<15000)return
      running=true
      lastRefresh=Date.now()
      try{await loadNotifications()}finally{running=false}
    }
    void refresh()
    const timer=window.setInterval(()=>{void refresh()},60000)
    const onVisible=()=>{if(document.visibilityState==='visible')void refresh()}
    document.addEventListener('visibilitychange',onVisible)
    return()=>{
      active=false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange',onVisible)
    }
  }, [])

  useEffect(()=>{
    if(!notificationsOpen)return
    const outside=(event:PointerEvent)=>{
      if(notificationPanelRef.current&&!notificationPanelRef.current.contains(event.target as Node))setNotificationsOpen(false)
    }
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setNotificationsOpen(false)}
    document.addEventListener('pointerdown',outside)
    document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}
  },[notificationsOpen])

  async function updateNotification(id:string,action:'read'|'archive'){
    const target=notifications.find(n=>n.id===id)
    if(!target)return false
    const r=await fetch('/api/notifications',{
      method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id,action})
    })
    if(!r.ok)return false
    setNotifications(current=>current.filter(item=>item.id!==id))
    if(!target.read_at)setUnreadCount(current=>Math.max(0,current-1))
    return true
  }

  async function openNotification(n:NotificationRow){
    if(!n.read_at){
      const ok=await updateNotification(n.id,'read')
      if(!ok)return
    }
    setNotificationsOpen(false)
    const canOpenRooms=modules.some(module=>module.module_key==='housekeeping'&&module.active!==false&&module.enabled!==false)
    // A room correction opens the dated room card; other roles see its
    // recipient-only detail in the notification center.
    window.location.assign(notificationHref(n,canOpenRooms))
  }

  async function markAllNotificationsRead() {
    if (unreadCount === 0) return

    const r = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        markAllRead: true
      })
    })

    if (!r.ok) return

    setNotifications([])

    setUnreadCount(0)
  }

  const maySeeInspections=Boolean(access&&(access.isAdmin||(access.permissions||[]).includes('room_checks.perform')||(access.capabilities||[]).some(cap=>['hospitality_assistant','room_checks','ha_signoff','ha_signoff_override','manager','general_manager','operations_manager','owner'].includes(cap))))

  useEffect(()=>{
    if(!maySeeInspections){setInspectionCounts({ready:0,arrivals:0});return}
    let active=true
    let inFlight=false
    let lastRefresh=0
    const refresh=async(force=false)=>{
      if(!active||inFlight||document.visibilityState==='hidden')return
      if(!force&&Date.now()-lastRefresh<15000)return
      inFlight=true
      lastRefresh=Date.now()
      try{
        const response=await fetch('/api/room-checks?date='+encodeURIComponent(hotelDay()),{cache:'no-store'})
        if(!response.ok)throw new Error('Inspection queue unavailable')
        const data=await response.json()
        if(!active)return
        let ready=0,arrivals=0
        for(const room of Array.isArray(data.rooms)?data.rooms:[]){
          const stage=roomCheckStage({...room,checkIssueOpen:room.issueOpen,readyForInspection:room.inspectionSubmitted})
          if(stage!=='ready'&&stage!=='recheck')continue
          ready++
          if(String(room.reservationStatus||'').trim().toLowerCase()==='arrival')arrivals++
        }
        setInspectionCounts({ready,arrivals})
      }catch{
        if(active)setInspectionCounts({ready:0,arrivals:0})
      }finally{inFlight=false}
    }
    void refresh()
    const timer=window.setInterval(()=>{void refresh()},45000)
    // Explicit operational updates bypass the passive polling cooldown.
    const onDataChange=()=>{void refresh(true)}
    const onRefresh=()=>{void refresh()}
    window.addEventListener('ths:live-data-refresh',onDataChange)
    window.addEventListener('focus',onRefresh)
    document.addEventListener('visibilitychange',onRefresh)
    return()=>{
      active=false
      window.clearInterval(timer)
      window.removeEventListener('ths:live-data-refresh',onDataChange)
      window.removeEventListener('focus',onRefresh)
      document.removeEventListener('visibilitychange',onRefresh)
    }
  },[maySeeInspections])

  const navActionBadge=(count:number,label:string)=>count>0?<span className="staff-nav-action-count" aria-label={count+' '+label} title={count+' '+label}>{count>99?'99+':count}</span>:null
  const navSectionHeading=(key:NavSectionKey,label:string,count=0)=>(
    <button type="button" className="ops-nav-heading" aria-expanded={navOpen[key]} aria-controls={'ths-nav-'+key} onClick={()=>toggleNavSection(key)}>
      <span>{label}</span>
      {!navOpen[key]&&navActionBadge(count,'pending actions')}
      <ChevronDown size={13} className={navOpen[key]?'is-open':''} aria-hidden="true"/>
    </button>
  )

  const managementWorkspace=Boolean(access?.isAdmin || access?.capabilities?.some(cap=>['manager','general_manager','operations_manager','owner','hospitality_assistant'].includes(cap)))
  const hasReservations=modules.some(module=>module.module_key==='reservations'&&module.active!==false&&module.enabled!==false)
  // Keep the dedicated Rooms workspace visible to managers without moving the
  // existing Room Operations submenu or reparenting HSK Quality.
  const roomsSidebarItem = managementWorkspace && hasReservations
    ? modules.find(module=>
        module.module_key==='housekeeping' &&
        module.active!==false &&
        module.enabled!==false &&
        (module.published!==false || access?.canPreviewUnpublished)
      )
    : undefined

  const nav = useMemo(
    () =>
      modules
        .filter(m => m.active !== false && m.enabled !== false)
        .filter(
          m =>
            m.published !== false ||
            access?.canPreviewUnpublished
        )
        .filter(
          m =>
            !['housekeeping_today_cleans','housekeeping_today_refreshes','housekeeping_today_sidework'].includes(m.module_key) &&
            m.module_key !== 'breakfast_menu_manager' &&
            m.module_key !== 'room_board' &&
            !(hasReservations && m.module_key==='ops') &&
            m.module_key !== 'housekeeping_assignments' &&
            m.module_key !== 'room_checks' &&
            !(managementWorkspace && hasReservations && m.module_key==='housekeeping') &&
            !m.module_key.endsWith('_inventory')
        )
        .sort(
          (a, b) =>
            (a.sort_order || 0) - (b.sort_order || 0)
        ),
    [modules, access, managementWorkspace, hasReservations]
  )

  const dashboardItem = nav.find(
    item => item.module_key === 'dashboard'
  )

  const shiftReportsItem = nav.find(
    item => item.module_key === 'shift_reports'
  )

  // Keep sidebar placement separate from module permissions and destinations.
  const administrativeKeys = new Set(['housekeeping_quality', 'staff'])
  const administrationNav = nav.filter(item =>
    administrativeKeys.has(item.module_key)
  )

  const breakfastNav = nav.filter(item =>
    breakfastModules.has(item.module_key)
  )

  const operationsNav = nav.filter(item =>
    operationsModules.has(item.module_key) &&
    item.module_key !== 'shift_reports' &&
    !administrativeKeys.has(item.module_key)
  )

  const nestedChildrenByParent: Record<string, string[]> = {
    reservations: managementWorkspace
      ? ['reservation_sync', 'housekeeping', 'room_checks']
      : ['reservation_sync'],
    housekeeping: managementWorkspace ? [] : ['room_checks', 'housekeeping_quality']
  }

  const nestedChildKeys = new Set(
    Object.values(nestedChildrenByParent).flat()
  )

  const operationRoots = operationsNav.filter(
    item => !nestedChildKeys.has(item.module_key) && (item.module_key !== 'housekeeping' || !managementWorkspace)
  )

  const nestedChildrenFor = (parentKey: string) =>
    (nestedChildrenByParent[parentKey] || [])
      .map(key => key==='housekeeping' && parentKey==='reservations' ? roomsSidebarItem : operationsNav.find(item => item.module_key === key))
      .filter(Boolean) as ModuleRow[]

  const orphanedNestedChildren = operationsNav.filter(item => {
    if (!nestedChildKeys.has(item.module_key)) return false
    const parentEntry = Object.entries(nestedChildrenByParent)
      .find(([, children]) => children.includes(item.module_key))
    if (!parentEntry) return false
    return !operationsNav.some(parent => parent.module_key === parentEntry[0])
  })

  const otherNav = nav.filter(
    item =>
      item.module_key !== 'dashboard' &&
      item.module_key !== 'shift_reports' &&
      !administrativeKeys.has(item.module_key) &&
      !breakfastModules.has(item.module_key) &&
      !operationsModules.has(item.module_key)
  )

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()

    if (!q) return []

    return nav
      .filter(item => {
        const title = item.title?.toLowerCase() || ''
        const label = item.label?.toLowerCase() || ''
        const key = item.module_key?.toLowerCase() || ''

        return (
          title.includes(q) ||
          label.includes(q) ||
          staffModuleLabel(item).toLowerCase().includes(q) ||
          key.includes(q)
        )
      })
      .slice(0, 8)
  }, [search, nav])

  const displayName =
    access?.name ||
    access?.preferredName ||
    'Staff'

  const displayRole =
    access?.jobTitle ||
    access?.roleName ||
    'Staff'

  function openResult(item: ModuleRow) {
    const href =
      hrefFallback[item.module_key] ||
      item.href ||
      '#'

    setSearch('')
    setSearchOpen(false)
    router.push(href)
  }

  const itemIsActive = (item: ModuleRow) => {
    const href =
      hrefFallback[item.module_key] ||
      item.href ||
      '#'

    const exactOnlyRoutes =
      new Set(['/dashboard', '/breakfast', '/housekeeping'])

    return exactOnlyRoutes.has(href)
      ? pathname === href
      : (
          pathname === href ||
          pathname.startsWith(`${href}/`)
        )
  }

  const renderNavLink = (
    item: ModuleRow,
    options?: { nested?: boolean; parentActive?: boolean }
  ) => {
    const Icon =
      iconMap[item.module_key] || LayoutGrid

    const href =
      hrefFallback[item.module_key] ||
      item.href ||
      '#'

    const active = itemIsActive(item)
    const preview = item.published === false
    const nested = Boolean(options?.nested)

    return (
      <Link
        key={item.module_key}
        href={href}
        title={staffModuleLabel(item)}
        aria-label={staffModuleLabel(item)}
        className={[
          active ? 'active' : '',
          nested ? 'sidebar-nested-link' : '',
          options?.parentActive ? 'sidebar-parent-active' : ''
        ].filter(Boolean).join(' ')}
      >
        <span className="sidebar-link-icon">
          <Icon size={nested ? 14 : 17} />
        </span>

        <span className="sidebar-link-label">
          {staffModuleLabel(item)}
        </span>

        {item.module_key==='reservations' && navActionBadge(inspectionCounts.ready,'rooms ready for inspection')}
        {preview && (
          <em className="preview-badge">
            Preview
          </em>
        )}
      </Link>
    )
  }

  const renderOperationItem = (item: ModuleRow) => {
    const children = nestedChildrenFor(item.module_key)
    const childActive = children.some(itemIsActive) || (item.module_key==='reservations' && pathname==='/room-checks')

    // Hospitality Assistants need a direct Inspections entry even when
    // module filtering leaves Reservations without other nested children.
    const showInspectionLink=item.module_key==='reservations' && maySeeInspections
    if (!children.length && !showInspectionLink) {
      return renderNavLink(item)
    }

    return (
      <div
        className={`sidebar-nav-group ${childActive ? 'has-active-child' : ''}`}
        key={item.module_key}
      >
        {renderNavLink(item, { parentActive: childActive })}
        <div className="sidebar-nested-links">
          {children.map(child =>
            renderNavLink(child, { nested: true })
          )}
          {showInspectionLink && <Link href="/room-checks" className={pathname==='/room-checks'?'active sidebar-nested-link':'sidebar-nested-link'}>
            <span className="sidebar-link-icon"><ShieldCheck size={17}/></span>
            <span className="sidebar-link-label">Inspections</span>
            {navActionBadge(inspectionCounts.ready,'rooms ready for inspection')}
          </Link>}
        </div>
      </div>
    )
  }

  async function exitPreview(){
    await fetch('/api/staff-preview',{method:'DELETE'}).catch(()=>null)
    window.location.assign('/staff')
  }

  function toggleSidebar() {
    setSidebarCollapsed(current => {
      const next = !current
      try { window.localStorage.setItem('ths-sidebar-collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }

  return (
    <main className={`ops-app staff-ops-app ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileNavOpen ? 'mobile-nav-open' : ''} ${access?.isPreviewMode ? 'staff-view-as-mode' : ''}`}>
      {access?.isPreviewMode && (
        <div className="staff-view-as-banner">
          <div>
            <strong>Owner preview</strong>
            <span>Viewing the app as {displayName}. This preview is read-only.</span>
          </div>
          <button type="button" onClick={()=>void exitPreview()}>Exit preview</button>
        </div>
      )}

      <aside className={`ops-sidebar staff-ops-sidebar ${sidebarCollapsed && !mobileNavOpen ? 'collapsed' : ''} ${mobileNavOpen ? 'mobile-open' : ''}`}>

        <div className="sidebar-brand">

          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>

          <Link
            className="ops-logo"
            href="/dashboard"
          >
            <div className="ops-logo-mark">
              THS
            </div>

            <div className="ops-logo-copy">
              <strong>
                The Hotel Saugatuck
              </strong>

              <span>
                Operations Hub
              </span>
            </div>
          </Link>

        </div>

        <nav className="ops-nav staff-ops-nav">

          <div className="ops-nav-section">
            {navSectionHeading('overview','Overview')}
            <div id="ths-nav-overview" className="ops-nav-section-items" hidden={!navOpen.overview}>

            {dashboardItem ? (
              renderNavLink(dashboardItem)
            ) : (
              <Link
                href="/dashboard"
                className={
                  pathname === '/dashboard'
                    ? 'active'
                    : ''
                }
              >
                <span className="sidebar-link-icon">
                  <LayoutGrid size={17} />
                </span>

                <span className="sidebar-link-label">
                  Dashboard
                </span>
              </Link>
            )}
            {shiftReportsItem && renderNavLink(shiftReportsItem)}
            <Link href="/notifications" className={pathname==='/notifications'?'active':''} aria-current={pathname==='/notifications'?'page':undefined}>
              <span className="sidebar-link-icon"><Bell size={17}/></span>
              <span className="sidebar-link-label">Notifications</span>
              {unreadCount>0&&<span className="staff-nav-notification-count">{unreadCount>99?'99+':unreadCount}</span>}
            </Link>
            </div>
          </div>

          {breakfastNav.length > 0 && (
            <div className="ops-nav-section">
              {navSectionHeading('breakfast','Breakfast')}
              <div id="ths-nav-breakfast" className="ops-nav-section-items" hidden={!navOpen.breakfast}>
                {breakfastNav.map(item=>renderNavLink(item))}
              </div>
            </div>
          )}

          {operationsNav.length > 0 && (
            <div className="ops-nav-section">
              {navSectionHeading('operations','Operations',inspectionCounts.ready)}
              <div id="ths-nav-operations" className="ops-nav-section-items" hidden={!navOpen.operations}>
                {operationRoots.map(item=><Fragment key={item.module_key}>
                  {renderOperationItem(item)}
                </Fragment>)}
                {orphanedNestedChildren.map(item => renderNavLink(item))}
              </div>
            </div>
          )}

          {modules.some(m=>['housekeeping_today_cleans','housekeeping_today_refreshes','housekeeping_today_sidework'].includes(m.module_key)) && (
            <div className="ops-nav-section">
              {navSectionHeading('housekeeping','Housekeeping',inspectionCounts.arrivals)}
              <div id="ths-nav-housekeeping" className="ops-nav-section-items" hidden={!navOpen.housekeeping}>
              {modules.some(m=>m.module_key==='housekeeping_today_cleans') && (
                <Link href="/housekeeping/today" className={pathname==='/housekeeping/today'?'active':''}>
                  <span className="sidebar-link-icon"><BedDouble size={17}/></span>
                  <span className="sidebar-link-label">Today's Cleans</span>
                </Link>
              )}
              {(access?.isAdmin || (access?.capabilities||[]).some(cap=>['manager','general_manager','operations_manager','owner','foh_manager','hospitality_assistant'].includes(cap))) && (
                <Link href="/housekeeping/arrivals" className={pathname==='/housekeeping/arrivals'?'active':''}>
                  <span className="sidebar-link-icon"><ClipboardCheck size={17}/></span>
                  <span className="sidebar-link-label">Today's Arrivals</span>
                  {navActionBadge(inspectionCounts.arrivals,'arrival walkthroughs due')}
                </Link>
              )}
              {(access?.isAdmin || (access?.capabilities||[]).some(cap=>['manager','general_manager','operations_manager','owner','housekeeping','hospitality_assistant'].includes(cap))) && (
                <Link href="/housekeeping/refreshes" className={pathname==='/housekeeping/refreshes'?'active':''}>
                  <span className="sidebar-link-icon"><BedDouble size={17}/></span>
                  <span className="sidebar-link-label">Today's Refreshes</span>
                </Link>
              )}
              {modules.some(m=>m.module_key==='housekeeping_today_sidework')&&<Link href="/housekeeping/sidework" className={pathname==='/housekeeping/sidework'?'active':''}>
                <span className="sidebar-link-icon"><ClipboardList size={17}/></span>
                <span className="sidebar-link-label">Today's Sidework</span>
              </Link>}
              </div>
            </div>
          )}

          {administrationNav.length > 0 && (
            <div className="ops-nav-section">
              {navSectionHeading('administration','Administration')}
              <div id="ths-nav-administration" className="ops-nav-section-items" hidden={!navOpen.administration}>
                {administrationNav.map(item => renderNavLink(item))}
              </div>
            </div>
          )}

          {otherNav.length > 0 && (
            <div className="ops-nav-section">
              {navSectionHeading('tools','Tools')}
              <div id="ths-nav-tools" className="ops-nav-section-items" hidden={!navOpen.tools}>
                {otherNav.map(item=>renderNavLink(item))}
              </div>
            </div>
          )}

        </nav>

        <div className="ops-sidebar-bottom">

          <div className="ops-sidebar-profile">

            <div className="ops-sidebar-avatar">
              {staffInitials(access?.username,displayName)||'TH'}
            </div>

            <div className="ops-sidebar-profile-copy">
              <strong>
                {displayName}
              </strong>

              <span>
                {displayRole}
              </span>
            </div>

          </div>

          <div className="sidebar-footer-actions">

            <button
              type="button"
              onClick={() =>
                window.location.assign('/settings')
              }
            >
              <Settings size={17} />
              <span>Settings</span>
            </button>

            <form
              action="/auth/signout"
              method="post"
            >
              <button type="submit">
                <LogOut size={17} />
                <span>Sign out</span>
              </button>
            </form>

          </div>

        </div>

      </aside>

      {mobileNavOpen && (
        <button
          type="button"
          className="mobile-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <section className="ops-main staff-ops-main">

        <header className="ops-topbar staff-ops-topbar">

          <button
            type="button"
            className="mobile-nav-toggle"
            onClick={() => {
              setSidebarCollapsed(false)
              setMobileNavOpen(open => !open)
            }}
            aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="staff-page-title">
            <span>
              The Hotel Saugatuck
            </span>

            <strong>
              {title}
            </strong>
          </div>

          <div className="staff-topbar-spacer" />

          <div className="ops-search staff-global-search">
            <Search size={17} />

            <input
              value={search}
              onChange={e => {
                setSearch(e.target.value)
                setSearchOpen(true)
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={e => {
                if (
                  e.key === 'Enter' &&
                  searchResults.length > 0
                ) {
                  e.preventDefault()
                  openResult(searchResults[0])
                }

                if (e.key === 'Escape') {
                  setSearchOpen(false)
                }
              }}
              placeholder="Search workspace"
            />

            {searchOpen && search.trim() && (
              <div className="workspace-search-results">
                {searchResults.length > 0 ? (
                  searchResults.map(item => {
                    const Icon =
                      iconMap[item.module_key] ||
                      LayoutGrid

                    return (
                      <button
                        key={item.module_key}
                        type="button"
                        onMouseDown={e =>
                          e.preventDefault()
                        }
                        onClick={() =>
                          openResult(item)
                        }
                      >
                        <Icon size={16} />

                        <span>
                          {staffModuleLabel(item)}
                        </span>
                      </button>
                    )
                  })
                ) : (
                  <div className="workspace-search-empty">
                    No matching tools.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="staff-user-area">

            <div className="notification-center" ref={notificationPanelRef}>

              <button
                className="ops-icon-btn notification-bell-btn"
                aria-label={
                  unreadCount > 0
                    ? `Notifications, ${unreadCount} unread`
                    : 'Notifications'
                }
                type="button"
                onClick={() => {
                  const next =
                    !notificationsOpen

                  setNotificationsOpen(next)

                  if (next) {
                    void loadNotifications(true)
                  }
                }}
              >
                <Bell size={18} />

                {unreadCount > 0 && (
                  <span className="notification-count">
                    {unreadCount > 99
                      ? '99+'
                      : unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="notification-panel">

                  <div className="notification-panel-head">
                    <div>
                      <strong>
                        Notifications
                      </strong>

                      <span>
                        {unreadCount > 0
                          ? `${unreadCount} unread`
                          : 'All caught up'}
                      </span>
                    </div>

                    <div className="notification-panel-head-actions">
                      {unreadCount > 0 && <button type="button" onClick={()=>void markAllNotificationsRead()}>Mark all read</button>}
                      <Link href="/notifications" onClick={()=>setNotificationsOpen(false)}>View all</Link>
                    </div>
                  </div>

                  <div className="notification-list">

                    {notificationsLoading &&
                      notifications.length === 0 && (
                        <div className="notification-empty">
                          Loading notifications…
                        </div>
                      )}

                    {!notificationsLoading &&
                      notifications.length === 0 && (
                        <div className="notification-empty">
                          No notifications yet.
                        </div>
                      )}

                    {notifications.map(notification => (
                      <div key={notification.id} className="notification-item unread">
                        <span className="notification-item-dot"/>
                        <button type="button" className="notification-item-open" onClick={()=>void openNotification(notification)} title="Open this notification">
                          <span className="notification-item-copy">
                            <strong>{notification.title}</strong>
                            <span>{notification.message}</span>
                            <small>{notificationTime(notification.created_at)} · Open details</small>
                          </span>
                        </button>
                        <button type="button" className="notification-item-dismiss" aria-label={'Archive '+notification.title} title="Archive notification" onClick={()=>void updateNotification(notification.id,'archive')}><Archive size={14}/></button>
                      </div>
                    ))}

                  </div>
                  <div className="notification-panel-footer"><Link href="/notifications" onClick={()=>setNotificationsOpen(false)}>All notifications & history →</Link></div>
                </div>
              )}

            </div>

            <div className="ops-avatar">
              {staffInitials(access?.username,displayName)||'TH'}
            </div>

            <div className="ops-user-copy">
              <strong>
                {displayName}
              </strong>

              <span>
                {displayRole}
              </span>
            </div>

          </div>

        </header>

        <div className={`ops-content staff-page-content ${access?.isPreviewMode ? 'staff-preview-readonly' : ''}`}>
          {access && !access.isPreviewMode && (access.capabilities||[]).some(cap=>['housekeeping','hospitality_assistant','runner'].includes(cap)) && <StaffShiftNote/>}
          {children}
        </div>

      </section>

    </main>
  )
}
