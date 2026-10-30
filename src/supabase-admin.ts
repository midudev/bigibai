import { createClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY } from 'astro:env/server'

// Un solo cliente para todas las peticiones del isolate: que nunca guarde ni refresque una sesión,
// o las consultas de un usuario podrían acabar hechas con la de otro
export const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
