import BreakfastMenu from '@/components/BreakfastMenu'

export default async function BreakfastMenuPage({searchParams}:{searchParams:Promise<{token?:string}>}) {
  const params = await searchParams
  const token = params.token || ''
  return (
    <main className="guest-app-shell">
      <header className="guest-topbar">
        <div className="guest-brand">
          <div className="guest-brand-mark">THS</div>
          <div><strong>The Hotel Saugatuck</strong><span>Breakfast Menu</span></div>
        </div>
      </header>
      <div className="guest-page-content guest-menu-page-content">
        <BreakfastMenu token={token}/>
      </div>
    </main>
  )
}
