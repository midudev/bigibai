/// <reference types="astro/client" />

import type { User } from '@supabase/supabase-js'

interface ImportMetaEnv {
  readonly SUPABASE_URL: string
  readonly SUPABASE_ANON_KEY: string
  readonly PUBLIC_FACTORY_WS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  namespace App {
    interface Locals {
      // Sacado de los claims del JWT (getClaims), no es el usuario completo de Supabase Auth
      user: null | Pick<User, 'id' | 'email' | 'user_metadata'>
      // Fecha real de la petición
      now: Date
      // Desbloquea todas las puertas del calendario y la fábrica (?abrir)
      unlockAllDoors: boolean
    }
  }

  interface Window {
    L: any
    Supercluster: any
  }
}
