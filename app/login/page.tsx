export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; config?: string }>
}) {
  const params = await searchParams

  return (
    <main className="login-screen">
      <section className="login-brand-panel">
        <div className="login-brand-mark">THS</div>
        <div className="login-brand-copy">
          <div className="ops-kicker">The Hotel Saugatuck</div>
          <h1>Operations Hub</h1>
          <p>Breakfast today. Housekeeping, maintenance, projects, and staff operations next.</p>
        </div>
      </section>

      <section className="login-form-panel">
        <form className="login-form-card" action="/auth/login" method="post">
          <div>
            <div className="ops-kicker">Staff access</div>
            <h2>Welcome back</h2>
            <p>Sign in to continue to your operations dashboard.</p>
          </div>

          {params.config === 'missing' && (
            <div className="notice error">
              Supabase is connected, but the app cannot find the URL or publishable key environment variable.
            </div>
          )}

          {params.error === 'phone_config' && (
            <div className="notice error">Phone sign-in is not configured on the server yet. Add SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in Vercel. Email sign-in still works.</div>
          )}

          {params.error === 'phone_not_found' && (
            <div className="notice error">That username or phone number is not attached to an active staff account.</div>
          )}

          {params.error && !['phone_config','phone_not_found'].includes(params.error) && (
            <div className="notice error">We could not sign you in with that username, phone number, or email and password.</div>
          )}

          <div className="field">
            <label>Username, phone number, or email</label>
            <input type="text" name="identifier" required autoComplete="username" />
          </div>

          <div className="field">
            <label>Password</label>
            <input type="password" name="password" required autoComplete="current-password" />
          </div>

          <button className="login-submit" type="submit">Sign in</button>
        </form>
      </section>
    </main>
  )
}
