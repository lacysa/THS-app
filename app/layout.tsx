import './globals.css'
import './styles/brand.css'
import './styles/shell.css'
import './styles/dashboard.css'
import './styles/controls.css'
import './styles/settings.css'
import './styles/breakfast.css'
import './styles/operations.css'
import './styles/housekeeping.css'
import './styles/notifications.css'
import './styles/shift-reports.css'
import './styles/maintenance.css'

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
}

export const metadata = {
  title: 'THS Operations Hub',
  description: 'Operations platform for The Hotel Saugatuck'
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
