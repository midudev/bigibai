import { env } from 'cloudflare:workers'

// Bindings de rate limiting de Cloudflare (`ratelimits` en wrangler.jsonc).
// Los contadores son por ubicación de Cloudflare y la ventana es de 60 segundos
const LIMITERS = {
  magicLinkEmail: 'MAGIC_LINK_EMAIL_LIMITER',
  magicLinkIp: 'MAGIC_LINK_IP_LIMITER',
  couponIp: 'COUPON_IP_LIMITER',
  couponUser: 'COUPON_USER_LIMITER',
  achievementUser: 'ACHIEVEMENT_USER_LIMITER',
} as const

export type RateLimiter = keyof typeof LIMITERS

export const RATE_LIMIT_MESSAGE = 'Demasiados intentos. Inténtalo de nuevo en un minuto'

/**
 * Cuenta un intento para `key` y devuelve si todavía está dentro del límite
 */
export async function checkRateLimit(limiter: RateLimiter, key: string): Promise<boolean> {
  const { success } = await env[LIMITERS[limiter]].limit({ key })
  return success
}
