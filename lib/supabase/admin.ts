import { createClient } from '@supabase/supabase-js'
import { supabaseAdminKey, supabaseUrl } from './env'

export function createSupabaseAdmin() {
  return createClient(
    supabaseUrl(),
    supabaseAdminKey(),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}
