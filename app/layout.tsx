import type { Metadata, Viewport } from 'next'
import PwaRegister from '@/components/PwaRegister'
import './globals.css'
import './styles/brand.css'
import './styles/dashboard.css'
import './styles/controls.css'
import './styles/settings.css'
import './styles/breakfast.css'
import './styles/operations.css'
import './styles/shell.css'
import './styles/shell-desktop.css'
import './styles/shell-mobile.css'
import './styles/housekeeping.css'
import './styles/notifications.css'
import './styles/shift-reports.css'
import './styles/maintenance.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#171716'
}

export const metadata: Metadata = {
  title: {
    default: 'THS Operations Hub',
    template: '%s | THS Operations'
  },
  applicationName: 'THS Operations',
  description: 'Operations platform for The Hotel Saugatuck',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ]
  },
  appleWebApp: {
    capable: true,
    title: 'THS Operations',
    statusBarStyle: 'black-translucent'
  },
  formatDetection: {
    telephone: false
  }
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  )
}
