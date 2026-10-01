import './globals.css'

export const metadata = {
  title: 'THS Breakfast App',
  description: 'Breakfast scheduling and kitchen operations for The Hotel Saugatuck'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
