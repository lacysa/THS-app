export function supabaseUrl() {
  const value =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL

  if (!value) throw new Error('Missing Supabase URL environment variable.')
  return value
}

export function supabasePublicKey() {
  const value =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY

  if (!value) throw new Error('Missing Supabase publishable/anon key environment variable.')
  return value
}

export function supabaseAdminKey() {
  const value =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!value) throw new Error('Missing Supabase secret/service-role key environment variable.')
  return value
}
