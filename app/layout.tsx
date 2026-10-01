import './globals.css'
import './brand.css'

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
      <body>{children}</body>
    </html>
  )
}
