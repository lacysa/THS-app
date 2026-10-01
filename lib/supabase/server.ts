import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { supabasePublicKey, supabaseUrl } from './env'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    supabaseUrl(),
    supabasePublicKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components cannot always write cookies.
          }
        }
      }
    }
  )
}
