import GuestScheduler from '@/components/GuestScheduler'

export default function BreakfastPage() {
  return (
    <main className="guest-app-shell">
      <header className="guest-topbar">
        <div className="guest-brand">
          <div className="guest-brand-mark">THS</div>
          <div><strong>The Hotel Saugatuck</strong><span>Breakfast</span></div>
        </div>
      </header>
      <div className="guest-page-content">
        <GuestScheduler />
      </div>
    </main>
  )
}
