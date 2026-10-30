// @ts-check
import path from 'node:path'

import { defineConfig, envField } from 'astro/config'
import sitemap from '@astrojs/sitemap'

import tailwindcss from '@tailwindcss/vite'

import cloudflare from '@astrojs/cloudflare'

import { CAMPAIGN } from './src/data/campaign.ts'

// https://astro.build/config
export default defineConfig({
  site: 'https://www.bigibai.com',
  // 'compile': imágenes optimizadas en build, sin binding de Cloudflare Images
  adapter: cloudflare({ imageService: 'compile' }),
  // No usamos Astro.session: evita que el adapter cree un KV para sesiones
  session: false,
  integrations: [
    sitemap({
      // Las páginas privadas llevan noindex; las casillas son dinámicas y no las detecta solo
      filter: (page) => !/^\/(admin|dashboard)\/?$/.test(new URL(page).pathname),
      customPages: Array.from(
        { length: CAMPAIGN.totalDays },
        (_, i) => `https://www.bigibai.com/casilla-${i + 1}-diciembre`
      ),
      // Mismas URLs que el canonical: sin barra final
      serialize(item) {
        const url = new URL(item.url)
        if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '')
        return { ...item, url: url.href }
      },
    }),
  ],
  output: 'server',
  // Se leen al ejecutar (secrets del Worker; en local, .env.local), así que no acaban en el bundle
  env: {
    schema: {
      PUBLIC_SUPABASE_URL: envField.string({ context: 'server', access: 'secret' }),
      // Clave secreta (sb_secret_…) de los dos clientes de Supabase. Sb-Forwarded-For solo se acepta con
      // una clave de este tipo
      SUPABASE_SECRET_KEY: envField.string({ context: 'server', access: 'secret' }),
      TURNSTILE_SECRET_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      COUPON_HMAC_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      ENCRYPTION_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      SALT_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      ADMIN_USERS_IDS: envField.string({ context: 'server', access: 'secret', default: '' }),
      TOTAL_COUPONS: envField.number({ context: 'server', access: 'secret', default: 0 }),
      EXPERIENCE_ENABLED: envField.boolean({ context: 'server', access: 'secret', default: true }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve('./src'),
      },
    },
  },
})
