import { defineMiddleware, sequence } from 'astro:middleware'
import type { APIContext } from 'astro'
import type { JwtPayload } from '@supabase/supabase-js'
import { createClient } from '@/supabase'

const protectedRoutes = ['/dashboard', '/admin']
const redirectRoutes = ['/registro']
const publicRoutes = ['/aviso-legal', '/bases-legales', '/politica-de-cookies', '/privacidad', '/api/auth/signin', '/api/auth/callback', '/api/auth/signout', '/video/reel-ibai.mp4']

const UNLOCK_DOORS_PARAM = 'abrir'
const UNLOCK_DOORS_COOKIE = 'puertas-abiertas'
const UNLOCK_OFF_VALUES = new Set(['0', 'false', 'off'])

// www.bigibai.com (de `site` en astro.config.mjs). El dominio raíz redirige aquí
const CANONICAL_HOST = new URL(import.meta.env.SITE).hostname
const APEX_HOST = CANONICAL_HOST.replace(/^www\./, '')

// Los estáticos reciben las mismas cabeceras desde public/_headers
const SECURITY_HEADERS = {
  'X-DNS-Prefetch-Control': 'on',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // Sin restringir scripts ni estilos (Leaflet y Google Fonts vienen de CDNs externos; la CSP con
  // hashes de Astro no es compatible con el ClientRouter). script-src-attr 'none' bloquea los
  // manejadores inline (onerror=, onclick=...), el vector habitual de un XSS
  'Content-Security-Policy':
    "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src-attr 'none'; upgrade-insecure-requests",
}
// Sin includeSubDomains (ni preload, que lo exige) mientras el seguimiento de clics de Mailgun use
// http://email.bigibai.com: con él, los enlaces de los emails de acceso fallarían por HTTPS
const HSTS_HEADER = 'max-age=63072000'

// Rutas que no necesitan verificación de autenticación
function shouldSkipAuth(pathname: string): boolean {
  // Skip rutas públicas que nunca necesitan auth
  return publicRoutes.includes(pathname)
}

// ?abrir desbloquea todas las puertas y se guarda en una cookie; ?abrir=off vuelve al modo normal
function resolveUnlockAllDoors(context: APIContext): boolean {
  const param = context.url.searchParams.get(UNLOCK_DOORS_PARAM)

  if (param !== null) {
    if (UNLOCK_OFF_VALUES.has(param.toLowerCase())) {
      context.cookies.delete(UNLOCK_DOORS_COOKIE, { path: '/' })
      return false
    }

    context.cookies.set(UNLOCK_DOORS_COOKIE, '1', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: !import.meta.env.DEV,
    })
    return true
  }

  return context.cookies.get(UNLOCK_DOORS_COOKIE)?.value === '1'
}

// La web solo ofrece enlace mágico y Google, pero la API de Supabase Auth también acepta altas con
// contraseña (y sin confirmar el email). Sin esto, alguien podría registrar el email de otra
// persona con una contraseña suya y entrar después en su cuenta cuando ella participe
function isPasswordSession(amr: JwtPayload['amr'] = []): boolean {
  return amr.some((entry) => (typeof entry === 'string' ? entry : entry.method) === 'password')
}

function setSecurityHeaders(response: Response, url: URL) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
  if (url.protocol === 'https:') response.headers.set('Strict-Transport-Security', HSTS_HEADER)

  // Solo se indexa el dominio canónico (no workers.dev ni previews)
  if (url.hostname !== CANONICAL_HOST) response.headers.set('X-Robots-Tag', 'noindex')

  // El HTML depende de la sesión: que ninguna caché compartida lo guarde
  if (!response.headers.has('Cache-Control')) {
    response.headers.set('Cache-Control', 'private, no-cache')
  }
}

// bigibai.com -> www.bigibai.com (lo que hacía Vercel)
const canonicalHost = defineMiddleware((context, next) => {
  if (context.url.hostname !== APEX_HOST) return next()

  const url = new URL(context.url)
  url.hostname = CANONICAL_HOST
  return context.redirect(url.toString(), 308)
})

const blockFormActions = defineMiddleware((context, next) => {
  if (context.request.method === 'POST' && context.url.searchParams.has('_action')) {
    return new Response(null, { status: 404 })
  }
  return next()
})

const securityHeaders = defineMiddleware(async (context, next) => {
  const response = await next()

  try {
    setSecurityHeaders(response, context.url)
    return response
  } catch {
    // Algunas respuestas (p. ej. Response.redirect) tienen las cabeceras inmutables
    const copy = new Response(response.body, response)
    setSecurityHeaders(copy, context.url)
    return copy
  }
})

const auth = defineMiddleware(async (context, next) => {
  const { pathname } = context.url

  context.locals.now = new Date()
  context.locals.unlockAllDoors = resolveUnlockAllDoors(context)

  // Skip auth check para rutas que no lo necesitan
  if (shouldSkipAuth(pathname)) {
    return next()
  }

  const supabase = createClient({
    request: context.request,
    cookies: context.cookies,
  })

  // Verifica la firma del JWT en local con la clave pública del proyecto (el JWKS queda en caché en
  // el isolate). A cambio, una sesión revocada sigue valiendo hasta que caduca su JWT (1 hora)
  const { data } = await supabase.auth.getClaims()
  let claims = data?.claims

  if (claims && (isPasswordSession(claims.amr) || claims.is_anonymous)) {
    await supabase.auth.signOut({ scope: 'local' })
    claims = undefined
  }

  const user = claims
    ? { id: claims.sub, email: claims.email, user_metadata: claims.user_metadata ?? {} }
    : null

  // Verificar si es una ruta protegida (incluye rutas que empiezan con /admin)
  const isProtectedRoute = protectedRoutes.includes(pathname)

  if (!user && isProtectedRoute) {
    return context.redirect('/registro')
  }

  if (user && redirectRoutes.includes(pathname)) {
    return context.redirect('/dashboard')
  }

  context.locals.user = user

  return next()
})

export const onRequest = sequence(securityHeaders, canonicalHost, blockFormActions, auth)
