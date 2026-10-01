'use client'

import {
  useEffect,
  useMemo,
  useState
} from 'react'

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
  Search,
  LogOut,
  Settings,
  Bell,
  ChevronRight
} from 'lucide-react'

type ModuleRow = {
  module_key: string
  title: string
  label: string | null
  department: string
  href: string | null
  status: string
  sort_order: number
  active: boolean
  enabled: boolean
  published: boolean
}

const icons: Record<string, any> = {
  dashboard: LayoutGrid,
  front_desk: ConciergeBell,
  kitchen: UtensilsCrossed,
  menu_manager: ClipboardList,
  breakfast_menu_manager: ClipboardList,
  daily_overview: ClipboardList,
  housekeeping: BedDouble,
  room_checks: ShieldCheck,
  projects: FolderKanban,
  maintenance: Wrench,
  breakfast_guest: UtensilsCrossed
}

const hrefFallback: Record<string, string> = {
  dashboard: '/dashboard',
  front_desk: '/front-desk',
  kitchen: '/kitchen',
  menu_manager: '/breakfast/menu-manager',
  breakfast_menu_manager:
    '/breakfast/menu-manager',
  daily_overview: '/breakfast/overview',
  housekeeping: '/housekeeping',
  room_checks: '/room-checks',
  projects: '/projects',
  maintenance: '/maintenance',
  breakfast_guest: '/breakfast'
}

const descriptions: Record<string, string> = {
  front_desk:
    'Breakfast scheduling, guest delivery times, missing menus, and room coordination.',

  kitchen:
    'Live breakfast tickets, dietary restrictions, condiments, and order status.',

  menu_manager:
    'Build and edit the guest breakfast menu directly inside the app.',

  daily_overview:
    'Read-only daily breakfast overview for service and front desk coordination.',

  housekeeping:
    'Room assignments, cleaning progress, inspections, and daily room operations.',

  room_checks:
    'Inspect completed rooms, approve guest-ready status, and send rooms back for reclean.',

  projects:
    'Operational projects, assignments, notes, due dates, and progress tracking.',

  maintenance:
    'Repair requests, room issues, recurring tasks, and maintenance history.',

  breakfast_guest:
    'Open the guest-facing breakfast scheduling and menu tools.'
}

function initials(name: string) {
  const pieces = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!pieces.length) return 'TH'

  if (pieces.length === 1) {
    return pieces[0]
      .slice(0, 2)
      .toUpperCase()
  }

  return `${pieces[0][0]}${
    pieces[pieces.length - 1][0]
  }`.toUpperCase()
}

function departmentLabel(
  moduleKey: string,
  department: string
) {
  if (
    moduleKey === 'front_desk' ||
    moduleKey === 'kitchen' ||
    moduleKey === 'daily_overview' ||
    moduleKey === 'breakfast_guest' ||
    moduleKey === 'menu_manager'
  ) {
    return 'Breakfast'
  }

  if (
    moduleKey === 'housekeeping' ||
    moduleKey === 'room_checks' ||
    moduleKey === 'projects' ||
    moduleKey === 'maintenance'
  ) {
    return 'Operations'
  }

  return department || 'Operations'
}

export default function DashboardGrid({
  displayName = 'Staff',
  displayRole = 'Staff',
  modules = [],
  canPreviewUnpublished = false,
  theme = 'blue'
}: {
  displayName?: string
  displayRole?: string
  modules?: ModuleRow[]
  canPreviewUnpublished?: boolean
  theme?: 'light' | 'blue' | 'dark'
}) {
  const [search, setSearch] =
    useState('')

  useEffect(() => {
    document.documentElement.dataset.theme =
      theme
  }, [theme])

  const visible = useMemo(
    () =>
      modules
        .filter(
          m =>
            m.active !== false &&
            m.enabled !== false &&
            (m.published !== false ||
              canPreviewUnpublished)
        )
        .filter(
          m =>
            m.module_key !== 'dashboard' &&
            m.module_key !==
              'breakfast_menu_manager'
        )
        .filter(m =>
          `${m.title} ${m.department}`
            .toLowerCase()
            .includes(
              search.toLowerCase()
            )
        ),
    [
      modules,
      canPreviewUnpublished,
      search
    ]
  )

  return (
    <main className="ops-app">

      <aside className="ops-sidebar">

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

        <nav className="ops-nav">

          <div className="ops-nav-section">

            <div className="ops-nav-label">
              Overview
            </div>

            <Link
              className="active"
              href="/dashboard"
            >
              <LayoutGrid size={18} />

              <span>
                Operations Hub
              </span>
            </Link>

          </div>

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
              window.location.assign(
                '/settings'
              )
            }
          >
            <Settings size={18} />

            <span>
              Settings
            </span>
          </button>

          <form
            action="/auth/signout"
            method="post"
          >
            <button type="submit">

              <LogOut size={18} />

              <span>
                Sign out
              </span>

            </button>
          </form>

        </div>

      </aside>

      <section className="ops-main">

        <header className="ops-topbar">

          <div className="staff-page-title">

            <span>
              The Hotel Saugatuck
            </span>

            <strong>
              Operations Hub
            </strong>

          </div>

          <div className="staff-topbar-spacer" />

          <div className="ops-search">

            <Search size={17} />

            <input
              value={search}
              onChange={e =>
                setSearch(
                  e.target.value
                )
              }
              placeholder="Search services"
            />

          </div>

          <div className="ops-top-actions">

            <button
              className="ops-icon-btn"
              type="button"
              aria-label="Notifications"
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

        <div className="ops-content">

          <div className="ops-heading-row">

            <div>

              <div className="ops-kicker">
                The Hotel Saugatuck
              </div>

              <h1>
                Operations
              </h1>

              <p>
                Daily tools and operational
                services for The Hotel
                Saugatuck.
              </p>

            </div>

          </div>

          {visible.length === 0 ? (

            <div className="ops-empty">
              No services match your search.
            </div>

          ) : (

            <div className="ops-card-grid">

              {visible.map(m => {

                const Icon =
                  icons[m.module_key] ||
                  LayoutGrid

                const href =
                  hrefFallback[
                    m.module_key
                  ] ||
                  m.href ||
                  '#'

                const preview =
                  m.published === false

                return (
                  <Link
                    key={m.module_key}
                    className="ops-card"
                    href={href}
                  >

                    <div className="ops-card-icon">
                      <Icon size={22} />
                    </div>

                    <div className="ops-card-eyebrow">
                      {departmentLabel(
                        m.module_key,
                        m.department
                      )}
                    </div>

                    <h2>
                      {m.label || m.title}
                    </h2>

                    <p>
                      {descriptions[
                        m.module_key
                      ] ||
                        'Operations module.'}
                    </p>

                    <div className="ops-card-footer">

                      <span
                        className={`ops-status ${
                          preview
                            ? 'coming-soon'
                            : 'live'
                        }`}
                      >
                        {preview
                          ? 'Preview'
                          : 'Live'}
                      </span>

                      <ChevronRight
                        size={18}
                      />

                    </div>

                  </Link>
                )
              })}

            </div>

          )}

        </div>

      </section>

    </main>
  )
}
