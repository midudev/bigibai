import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'

// Los estáticos responden 200 a las peticiones con Range y Safari no reproduce vídeo sin un 206.
// La Cache API sí responde 206 con el trozo pedido: el vídeo entero se guarda una vez por centro
// de datos y el Worker no vuelve a leer los 15 MB en cada petición
const SOURCE = '/2026/reel-ibai.mp4'
const MAX_AGE = 86400
const FORWARDED_HEADERS = ['Range', 'If-None-Match', 'If-Modified-Since']

function withVideoHeaders(response: Response) {
  const copy = new Response(response.body, response)
  copy.headers.set('Accept-Ranges', 'bytes')
  copy.headers.set('Cache-Control', `public, max-age=${MAX_AGE}`)
  return copy
}

async function storeInCache(cache: Cache, key: Request) {
  const asset = await env.ASSETS.fetch(key)
  if (asset.status !== 200 || !asset.body) return asset

  const headers = new Headers({ 'Cache-Control': `public, max-age=${MAX_AGE}` })
  for (const name of ['Content-Type', 'Content-Length', 'ETag', 'Last-Modified']) {
    const value = asset.headers.get(name)
    if (value) headers.set(name, value)
  }
  await cache.put(key, new Response(asset.body, { headers }))
  return null
}

export const GET: APIRoute = async ({ request, url }) => {
  const cache = caches.default
  const key = new Request(new URL(SOURCE, url))
  const lookup = new Request(key)
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name)
    if (value) lookup.headers.set(name, value)
  }

  let response = await cache.match(lookup)
  if (!response) {
    const failed = await storeInCache(cache, key)
    if (failed) return withVideoHeaders(failed)
    response = await cache.match(lookup)
  }

  return withVideoHeaders(response ?? (await env.ASSETS.fetch(key)))
}
