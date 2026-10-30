import { NextResponse, type NextRequest } from 'next/server'

/**
 * Page routes validate authentication using getStaffAccess()/canUseModule()
 * in their server components. Do not duplicate Supabase session refresh or
 * claims validation in Edge middleware: concurrent auth checks can compete
 * for the same refresh token and incorrectly redirect valid staff to /login.
 *
 * Private API routes continue to enforce authentication independently.
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/front-desk/:path*',
    '/kitchen/:path*',
    '/breakfast/menu-manager/:path*',
    '/breakfast/overview/:path*',
    '/settings/:path*',
    '/housekeeping/:path*',
    '/room-checks/:path*',
    '/projects/:path*',
    '/maintenance/:path*'
  ]
}
