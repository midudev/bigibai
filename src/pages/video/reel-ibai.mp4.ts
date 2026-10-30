import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'

// Los estáticos responden 200 a las peticiones con Range y Safari no reproduce vídeo sin un 206
const SOURCE = '/2026/reel-ibai.mp4'
const MAX_CHUNK = 4 * 1024 * 1024

function parseRange(header: string, size: number): [number, number] | null | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (!match[1] && !match[2])) return undefined

  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  if (start > end || start >= size) return null
  return [start, Math.min(end, start + MAX_CHUNK - 1)]
}

async function readRange(body: ReadableStream<Uint8Array>, start: number, end: number) {
  const bytes = new Uint8Array(end - start + 1)
  const reader = body.getReader()
  let offset = 0
  while (offset <= end) {
    const { done, value } = await reader.read()
    if (done) break
    const from = Math.max(start - offset, 0)
    const to = Math.min(end - offset + 1, value.byteLength)
    if (to > from) bytes.set(value.subarray(from, to), offset + from - start)
    offset += value.byteLength
  }
  await reader.cancel()
  return bytes
}

function withVideoHeaders(response: Response) {
  const copy = new Response(response.body, response)
  copy.headers.set('Accept-Ranges', 'bytes')
  copy.headers.set('Cache-Control', 'public, max-age=86400')
  return copy
}

export const GET: APIRoute = async ({ request, url }) => {
  const range = request.headers.get('Range')
  const asset = await env.ASSETS.fetch(
    new Request(new URL(SOURCE, url), { headers: range ? { Range: range } : {} })
  )
  const size = Number(asset.headers.get('Content-Length'))
  if (!range || !asset.ok || asset.status === 206 || !asset.body || !size) {
    return withVideoHeaders(asset)
  }

  const bounds = parseRange(range, size)
  if (bounds === undefined) return withVideoHeaders(asset)
  if (bounds === null) {
    await asset.body.cancel()
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  }

  const [start, end] = bounds
  const response = new Response(await readRange(asset.body, start, end), {
    status: 206,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${size}`,
    },
  })
  const etag = asset.headers.get('ETag')
  if (etag) response.headers.set('ETag', etag)
  return withVideoHeaders(response)
}
