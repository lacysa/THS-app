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
  ShieldCheck
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

const iconMap: Record<string, any> = {
  dashboard: LayoutGrid,
  front_desk: ConciergeBell,
  kitchen: UtensilsCrossed,
  menu_manager: ClipboardList,
  breakfast_menu_manager: ClipboardList,
  daily_overview: FileText,
  housekeeping: BedDouble,
  room_checks: ShieldCheck,
  projects: FolderKanban,
  maintenance: Wrench,
  breakfast_guest: UtensilsCrossed
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
  maintenance: 'projects.view',
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
  room_checks: '/room-checks',
  projects: '/projects',
  maintenance: '/maintenance',
  breakfast_guest: '/breakfast'
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
  'room_checks',
  'projects',
  'maintenance'
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

  useEffect(() => {
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
          m => m.module_key !== 'breakfast_menu_manager'
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

  const renderNavLink = (item: ModuleRow) => {
    const Icon =
      iconMap[item.module_key] || LayoutGrid

    const href =
      hrefFallback[item.module_key] ||
      item.href ||
      '#'

    const active =
      pathname === href ||
      (href !== '/dashboard' &&
        pathname.startsWith(`${href}/`))

    const preview = item.published === false

    return (
      <Link
        key={item.module_key}
        href={href}
        className={active ? 'active' : ''}
      >
        <Icon size={18} />
        <span>{item.label || item.title}</span>

        {preview && (
          <em className="preview-badge">
            Preview
          </em>
        )}
      </Link>
    )
  }

  function openResult(item: ModuleRow) {
    const href =
      hrefFallback[item.module_key] ||
      item.href ||
      '#'

    setSearch('')
    setSearchOpen(false)
    router.push(href)
  }

  return (
    <main className="ops-app staff-ops-app">

      <aside className="ops-sidebar staff-ops-sidebar">

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
                <LayoutGrid size={18} />
                <span>Dashboard</span>
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

          <button
            type="button"
            onClick={() =>
              window.location.assign('/settings')
            }
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>

          <form
            action="/auth/signout"
            method="post"
          >
            <button type="submit">
              <LogOut size={18} />
              <span>Sign out</span>
            </button>
          </form>

        </div>

      </aside>

      <section className="ops-main staff-ops-main">

        <header className="ops-topbar staff-ops-topbar">

          <div className="staff-page-title">
            <span>
              The Hotel Saugatuck
            </span>

            <strong>
              {title}
            </strong>
          </div>

          <div className="staff-topbar-spacer" />

          <div
            className="ops-search staff-global-search"
            style={{ position: 'relative' }}
          >
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

            <button
              className="ops-icon-btn"
              aria-label="Notifications"
              type="button"
            >
              <Bell size={18} />
            </button>

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
