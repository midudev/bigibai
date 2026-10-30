// Tipos de los bindings de wrangler.jsonc que usa el código (no instalamos @cloudflare/workers-types)
declare module 'cloudflare:workers' {
  interface RateLimit {
    limit(options: { key: string }): Promise<{ success: boolean }>
  }

  export const env: {
    ASSETS: { fetch(request: Request): Promise<Response> }
    MAGIC_LINK_EMAIL_LIMITER: RateLimit
    MAGIC_LINK_IP_LIMITER: RateLimit
    COUPON_IP_LIMITER: RateLimit
    COUPON_USER_LIMITER: RateLimit
  }
}
