'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutGrid,
  ConciergeBell,
  UtensilsCrossed,
  ClipboardList,
  FileText,
  BedDouble,
  Wrench,
  FolderKanban,
  Settings,
  LogOut,
  Bell,
  Search,
  ShieldCheck,
  ScrollText,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  Building2,
  BookOpen,
  Menu,
  X
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
  preferredName: string | null
  email: string | null
  phone: string | null
  jobTitle: string | null
  canPreviewUnpublished: boolean
  permissions: string[]
  theme: 'light' | 'blue' | 'dark'
  roleName: string | null
  isAdmin: boolean
}

type NotificationRow = {
  id: string
  notification_type: string
  title: string
  message: string
  room_id: string | null
  service_date: string | null
  read_at: string | null
  created_at: string
}

const iconMap: Record<string, any> = {
  dashboard: LayoutGrid,
  front_desk: ConciergeBell,
  kitchen: UtensilsCrossed,
  menu_manager: ClipboardList,
  breakfast_menu_manager: ClipboardList,
  daily_overview: FileText,
  housekeeping: BedDouble,
  housekeeping_setup: ClipboardList,
  room_checks: ShieldCheck,
  projects: FolderKanban,
  maintenance: Wrench,
  shift_reports: ScrollText,
  breakfast_guest: UtensilsCrossed,
  laundry: Package,
  lobby: Building2,
  housekeeping_guide: BookOpen,
  front_desk_inventory: Package,
  kitchen_inventory: Package,
  housekeeping_inventory: Package,
  laundry_inventory: Package,
  lobby_inventory: Package
}

const permissionByModule: Record<string, string | undefined> = {
  dashboard: 'dashboard.view',
  front_desk: 'breakfast.front_desk.view',
  kitchen: 'breakfast.kitchen.view',
  menu_manager: 'breakfast.menu_manager.view',
  breakfast_menu_manager: 'breakfast.menu_manager.view',
  daily_overview: 'breakfast.read_only.view',
  housekeeping: 'housekeeping.dashboard.view',
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
  housekeeping_setup: '/housekeeping/setup',
  room_checks: '/room-checks',
  projects: '/projects',
  maintenance: '/maintenance',
  shift_reports: '/shift-reports',
  breakfast_guest: '/breakfast',
  laundry: '/laundry',
  lobby: '/lobby',
  housekeeping_guide: '/housekeeping/resources',
  front_desk_inventory: '/inventory/front-desk',
  kitchen_inventory: '/inventory/kitchen',
  housekeeping_inventory: '/inventory/housekeeping',
  laundry_inventory: '/inventory/laundry',
  lobby_inventory: '/inventory/lobby'
}

const breakfastModules = new Set([
  'front_desk',
  'kitchen',
  'daily_overview',
  'breakfast_guest',
  'menu_manager'
])

const operationsModules = new Set([
  'housekeeping',
  'housekeeping_setup',
  'room_checks',
  'projects',
  'shift_reports',
  'maintenance',
  'laundry',
  'lobby',
  'housekeeping_guide',
  'front_desk_inventory',
  'kitchen_inventory',
  'housekeeping_inventory',
  'laundry_inventory',
  'lobby_inventory'
])

function initials(name: string) {
  const pieces = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!pieces.length) return 'TH'

  if (pieces.length === 1) {
    return pieces[0].slice(0, 2).toUpperCase()
  }

  return `${pieces[0][0]}${pieces[pieces.length - 1][0]}`.toUpperCase()
}

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

  const [notifications, setNotifications] =
    useState<NotificationRow[]>([])

  const [unreadCount, setUnreadCount] =
    useState(0)

  const [notificationsOpen, setNotificationsOpen] =
    useState(false)

  const [notificationsLoading, setNotificationsLoading] =
    useState(false)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('ths-sidebar-collapsed')
      if (saved === '1') setSidebarCollapsed(true)
      if (saved === null && window.innerWidth <= 760) setSidebarCollapsed(true)
    } catch {}

    fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return

        setAccess(d.access)
        setModules(d.modules || [])

        document.documentElement.dataset.theme =
          d.access?.theme || 'blue'
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  async function loadNotifications(showLoading = false) {
    if (showLoading) {
      setNotificationsLoading(true)
    }

    try {
      const r = await fetch('/api/notifications', {
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
    void loadNotifications()

    const timer = window.setInterval(() => {
      void loadNotifications()
    }, 30000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  async function markNotificationRead(id: string) {
    const target = notifications.find(n => n.id === id)

    if (!target || target.read_at) {
      return
    }

    const r = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id })
    })

    if (!r.ok) return

    setNotifications(current =>
      current.map(item =>
        item.id === id
          ? {
              ...item,
              read_at: new Date().toISOString()
            }
          : item
      )
    )

    setUnreadCount(current =>
      Math.max(0, current - 1)
    )
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

    const now = new Date().toISOString()

    setNotifications(current =>
      current.map(item => ({
        ...item,
        read_at: item.read_at || now
      }))
    )

    setUnreadCount(0)
  }

  const nav = useMemo(
    () =>
      modules
        .filter(m => m.active !== false && m.enabled !== false)
        .filter(
          m =>
            m.published !== false ||
            access?.canPreviewUnpublished
        )
        .filter(m => {
          const permission = permissionByModule[m.module_key]

          return (
            !permission ||
            access?.isAdmin ||
            access?.permissions?.includes(permission)
          )
        })
        .filter(
          m =>
            m.module_key !== 'breakfast_menu_manager' &&
            !m.module_key.endsWith('_inventory')
        )
        .sort(
          (a, b) =>
            (a.sort_order || 0) - (b.sort_order || 0)
        ),
    [modules, access]
  )

  const dashboardItem = nav.find(
    item => item.module_key === 'dashboard'
  )

  const breakfastNav = nav.filter(item =>
    breakfastModules.has(item.module_key)
  )

  const operationsNav = nav.filter(item =>
    operationsModules.has(item.module_key)
  )

  const otherNav = nav.filter(
    item =>
      item.module_key !== 'dashboard' &&
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

  const renderNavLink = (item: ModuleRow) => {
    const Icon =
      iconMap[item.module_key] || LayoutGrid

    const href =
      hrefFallback[item.module_key] ||
      item.href ||
      '#'

    const exactOnlyRoutes =
      new Set(['/dashboard', '/breakfast'])

    const active =
      exactOnlyRoutes.has(href)
        ? pathname === href
        : (
            pathname === href ||
            pathname.startsWith(`${href}/`)
          )

    const preview = item.published === false

    return (
      <Link
        key={item.module_key}
        href={href}
        className={active ? 'active' : ''}
      >
        <span className="sidebar-link-icon">
          <Icon size={17} />
        </span>

        <span className="sidebar-link-label">
          {item.label || item.title}
        </span>

        {preview && (
          <em className="preview-badge">
            Preview
          </em>
        )}
      </Link>
    )
  }

  function toggleSidebar() {
    setSidebarCollapsed(current => {
      const next = !current
      try { window.localStorage.setItem('ths-sidebar-collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }

  return (
    <main className={`ops-app staff-ops-app ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileNavOpen ? 'mobile-nav-open' : ''}`}>

      <aside className={`ops-sidebar staff-ops-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileNavOpen ? 'mobile-open' : ''}`}>

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
            <div className="ops-nav-label">
              Overview
            </div>

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
          </div>

          {breakfastNav.length > 0 && (
            <div className="ops-nav-section">
              <div className="ops-nav-label">
                Breakfast
              </div>

              {breakfastNav.map(renderNavLink)}
            </div>
          )}

          {operationsNav.length > 0 && (
            <div className="ops-nav-section">
              <div className="ops-nav-label">
                Operations
              </div>

              {operationsNav.map(renderNavLink)}
            </div>
          )}

          {otherNav.length > 0 && (
            <div className="ops-nav-section">
              <div className="ops-nav-label">
                Tools
              </div>

              {otherNav.map(renderNavLink)}
            </div>
          )}

        </nav>

        <div className="ops-sidebar-bottom">

          <div className="ops-sidebar-profile">

            <div className="ops-sidebar-avatar">
              {initials(displayName)}
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
            onClick={() => setMobileNavOpen(open => !open)}
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
                          {item.label ||
                            item.title}
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

            <div className="notification-center">

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

                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          void markAllNotificationsRead()
                        }
                      >
                        Mark all read
                      </button>
                    )}
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
                      <button
                        key={notification.id}
                        type="button"
                        className={
                          notification.read_at
                            ? 'notification-item'
                            : 'notification-item unread'
                        }
                        onClick={() =>
                          void markNotificationRead(
                            notification.id
                          )
                        }
                      >
                        <span className="notification-item-dot" />

                        <span className="notification-item-copy">
                          <strong>
                            {notification.title}
                          </strong>

                          <span>
                            {notification.message}
                          </span>

                          <small>
                            {notificationTime(
                              notification.created_at
                            )}
                          </small>
                        </span>
                      </button>
                    ))}

                  </div>

                </div>
              )}

            </div>

            <div className="ops-avatar">
              {initials(displayName)}
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

        <div className="ops-content staff-page-content">
          {children}
        </div>

      </section>

    </main>
  )
}
