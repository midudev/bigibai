// Cloudflare Worker + Durable Object (WebSocket Hibernation API) para el Hub social de La Fábrica
// 1 sala = 1 Durable Object (máx. 28 jugadores). Público se reparte automáticamente en hub-1..hub-64.

const MAX_PLAYERS = 28
const MAX_PUBLIC_SHARDS = 64
const MAX_COLOR = 7
const EMOTE_COOLDOWN_MS = 1100
const POSE_COOLDOWN_MS = 50
const PROFILE_COOLDOWN_MS = 1000
// El cliente manda 10 poses/s: por encima de esto es un script inundando la sala
const MAX_MESSAGES_PER_SECOND = 40
// Una misma IP no puede llenar una sala pública con bots; el resto de sus conexiones van a otra sala
const MAX_PEERS_PER_IP = 4
// Conexiones nuevas por IP y minuto. El binding CONNECT_LIMITER es aproximado (deja pasar ráfagas):
// el límite estricto lo lleva un Durable Object por IP
const MAX_CONNECTIONS_PER_MINUTE = 60
const VALID_EMOTES = new Set(['wave', 'dance', 'celebrate', 'gg'])

// Nombres aleatorios generados solo en servidor (seguros para todos los públicos)
const NAME_NOUNS = [
  'Duende',
  'Reno',
  'Elfo',
  'Turron',
  'Galleta',
  'Pingu',
  'Oso',
  'Estrella',
  'Regalo',
  'Trineo',
  'Cacao',
  'Bombom',
  'Choco',
  'Nieve',
  'Bola',
  'Cascabel',
  'Gorro',
  'Maza',
  'Polvoron',
  'Abeto',
]

const NAME_ADJS = [
  'Dulce',
  'Veloz',
  'Feliz',
  'Magico',
  'Dorado',
  'Alegre',
  'Saltarin',
  'Brilla',
  'Chispa',
  'Suave',
  'Listo',
  'Majo',
  'Fresco',
  'Festivo',
  'Pro',
  'Top',
]

// Tipos mínimos del runtime de Cloudflare Workers / Durable Objects para no exigir dependencias extra
interface Env {
  FACTORY_ROOM: DurableObjectNamespace
  CONNECT_GUARD: DurableObjectNamespace
  CONNECT_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> }
  ALLOWED_ORIGINS?: string
}

interface DurableObjectNamespace {
  idFromName(name: string): unknown
  get(id: unknown): { fetch(request: Request): Promise<Response> }
}

interface HibernatingWebSocket extends WebSocket {
  accept(): void
  serializeAttachment(value: unknown): void
  deserializeAttachment(): unknown
}

interface DurableObjectState {
  acceptWebSocket(ws: WebSocket, tags?: string[]): void
  getWebSockets(tag?: string): HibernatingWebSocket[]
}

declare class WebSocketPair {
  0: WebSocket
  1: HibernatingWebSocket
}

interface PeerAttachment {
  id: number
  ip: string
  name: string
  color: number
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  speed: number
  flags: number
  lastPoseAt: number
  lastEmoteAt: number
  lastProfileAt?: number
}

function randomSafeName(usedNames: Set<string>): string {
  for (let attempt = 0; attempt < 12; attempt++) {
    const noun = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)]
    const adj = NAME_ADJS[Math.floor(Math.random() * NAME_ADJS.length)]
    const num = Math.floor(10 + Math.random() * 90)
    const candidate = `${noun}${adj}${num}`.slice(0, 16)
    if (!usedNames.has(candidate)) return candidate
  }
  return `Duende${Math.floor(1000 + Math.random() * 9000)}`
}

function sanitizeColor(raw: string | null): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 && n <= MAX_COLOR ? n : Math.floor(Math.random() * (MAX_COLOR + 1))
}

function sanitizePrivateCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)
}

function parseRoom(raw: string | null): { id: string; label: string; isPublic: boolean; shard: number } {
  const value = (raw ?? '').trim()
  if (!value || value.toLowerCase() === 'public') {
    return { id: 'hub-1', label: 'Pública 1', isPublic: true, shard: 1 }
  }
  const publicMatch = /^hub-(\d+)$/i.exec(value)
  if (publicMatch) {
    const shard = Math.min(MAX_PUBLIC_SHARDS, Math.max(1, Number(publicMatch[1]) || 1))
    return { id: `hub-${shard}`, label: `Pública ${shard}`, isPublic: true, shard }
  }
  const code = sanitizePrivateCode(value)
  if (code.length >= 2) {
    return { id: `priv-${code}`, label: code, isPublic: false, shard: 0 }
  }
  return { id: 'hub-1', label: 'Pública 1', isPublic: true, shard: 1 }
}

function isOriginAllowed(request: Request, env: Env): boolean {
  if (!env.ALLOWED_ORIGINS) return true
  // Los navegadores siempre mandan Origin al abrir un WebSocket
  const origin = request.headers.get('Origin')
  if (!origin) return false
  const allowed = env.ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return allowed.includes('*') || allowed.includes(origin)
}

async function allowConnection(env: Env, ip: string): Promise<boolean> {
  const { success } = await env.CONNECT_LIMITER.limit({ key: ip })
  if (!success) return false
  try {
    const guard = env.CONNECT_GUARD.get(env.CONNECT_GUARD.idFromName(ip))
    const response = await guard.fetch(new Request('https://guard/'))
    return response.status === 204
  } catch {
    return false
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health' || url.pathname === '/factory-hub/health') {
      return new Response('ok', {
        headers: { 'content-type': 'text/plain', 'access-control-allow-origin': '*' },
      })
    }

    if (url.pathname !== '/ws' && url.pathname !== '/factory-hub/ws') {
      return new Response('Not found', { status: 404 })
    }

    if (!isOriginAllowed(request, env)) {
      return new Response('Forbidden origin', { status: 403 })
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    const ip = request.headers.get('cf-connecting-ip') || 'unknown'
    if (!(await allowConnection(env, ip))) {
      return new Response('Too many connections', { status: 429, headers: { 'retry-after': '60' } })
    }

    const room = parseRoom(url.searchParams.get('room'))
    const stub = env.FACTORY_ROOM.get(env.FACTORY_ROOM.idFromName(room.id))
    const nextUrl = new URL(request.url)
    nextUrl.searchParams.set('roomId', room.id)
    nextUrl.searchParams.set('roomLabel', room.label)
    nextUrl.searchParams.set('isPublic', room.isPublic ? '1' : '0')
    nextUrl.searchParams.set('shard', String(room.shard))
    nextUrl.searchParams.set('ip', ip)
    return stub.fetch(new Request(nextUrl.toString(), request))
  },
}

export class FactoryRoom {
  private ctx: DurableObjectState
  // Caché en memoria de los peers activos para evitar deserialize/serializeAttachment en cada pose (10 Hz)
  private peersCache = new Map<HibernatingWebSocket, PeerAttachment>()
  private lastPersisted = new Map<HibernatingWebSocket, number>()
  private messageWindows = new Map<HibernatingWebSocket, { start: number; count: number }>()
  private hydrated = false
  private poseOut = new ArrayBuffer(22)
  private poseOutView = new DataView(this.poseOut)

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx
  }

  private ensureHydrated() {
    if (this.hydrated) return
    this.hydrated = true
    for (const ws of this.ctx.getWebSockets()) {
      const data = ws.deserializeAttachment() as PeerAttachment | null
      if (data && typeof data.id === 'number') this.peersCache.set(ws, data)
    }
  }

  // Tras hidratar, todos los sockets aceptados están en la caché: uno que no está ya se ha ido
  private getPeer(ws: HibernatingWebSocket): PeerAttachment | null {
    this.ensureHydrated()
    return this.peersCache.get(ws) ?? null
  }

  private isFlooding(ws: HibernatingWebSocket, now: number): boolean {
    const bucket = this.messageWindows.get(ws)
    if (!bucket || now - bucket.start >= 1000) {
      this.messageWindows.set(ws, { start: now, count: 1 })
      return false
    }
    bucket.count++
    return bucket.count > MAX_MESSAGES_PER_SECOND
  }

  private kick(ws: HibernatingWebSocket, code: number, reason: string) {
    this.removePeer(ws)
    try {
      ws.close(code, reason)
    } catch {}
  }

  private getPeers(): { ws: HibernatingWebSocket; data: PeerAttachment }[] {
    this.ensureHydrated()
    const list: { ws: HibernatingWebSocket; data: PeerAttachment }[] = []
    for (const [ws, data] of this.peersCache) list.push({ ws, data })
    return list
  }

  private nextPeerId(existing: { data: PeerAttachment }[]): number {
    const used = new Set(existing.map((p) => p.data.id))
    for (let id = 1; id < 65000; id++) {
      if (!used.has(id)) return id
    }
    return 1
  }

  private broadcast(payload: string | ArrayBuffer, exclude?: WebSocket) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue
      try {
        ws.send(payload)
      } catch {
        try {
          ws.close(1011, 'Send failed')
        } catch {}
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const roomId = url.searchParams.get('roomId') || 'hub-1'
    const roomLabel = url.searchParams.get('roomLabel') || 'Pública 1'
    const isPublic = url.searchParams.get('isPublic') === '1'
    const shard = Number(url.searchParams.get('shard') || '1')
    const ip = url.searchParams.get('ip') || 'unknown'

    const existing = this.getPeers()
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]

    const sameIp = isPublic ? existing.filter(({ data }) => data.ip === ip).length : 0
    if (existing.length >= MAX_PLAYERS || sameIp >= MAX_PEERS_PER_IP) {
      // Con la API de hibernación, como los demás: el runtime gestiona el cierre
      this.ctx.acceptWebSocket(server)
      const next = isPublic && shard < MAX_PUBLIC_SHARDS ? `hub-${shard + 1}` : null
      server.send(JSON.stringify({ t: 'full', room: roomId, next }))
      server.close(4001, 'Room full')
      return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket })
    }

    const id = this.nextPeerId(existing)
    const usedNames = new Set(existing.map((p) => p.data.name))
    const peer: PeerAttachment = {
      id,
      ip,
      name: randomSafeName(usedNames),
      color: sanitizeColor(url.searchParams.get('color')),
      x: 64.5,
      y: 8,
      z: 75.5,
      yaw: 0,
      pitch: 0,
      speed: 0,
      flags: 1,
      lastPoseAt: 0,
      lastEmoteAt: 0,
    }

    this.ctx.acceptWebSocket(server)
    server.serializeAttachment(peer)
    this.peersCache.set(server, peer)
    this.lastPersisted.set(server, Date.now())

    // Bienvenida al recién llegado con la lista de jugadores actuales
    server.send(
      JSON.stringify({
        t: 'welcome',
        id,
        name: peer.name,
        room: roomId,
        label: roomLabel,
        isPublic,
        max: MAX_PLAYERS,
        peers: existing.map(({ data }) => ({
          id: data.id,
          name: data.name,
          color: data.color,
          x: data.x,
          y: data.y,
          z: data.z,
          yaw: data.yaw,
          pitch: data.pitch,
          speed: data.speed,
          flags: data.flags,
        })),
      })
    )

    // Avisar al resto de la sala
    this.broadcast(
      JSON.stringify({
        t: 'join',
        peer: {
          id: peer.id,
          name: peer.name,
          color: peer.color,
          x: peer.x,
          y: peer.y,
          z: peer.z,
          yaw: peer.yaw,
          pitch: peer.pitch,
          speed: peer.speed,
          flags: peer.flags,
        },
      }),
      server
    )

    return new Response(null, { status: 101, webSocket: client } as ResponseInit & { webSocket: WebSocket })
  }

  webSocketMessage(ws: HibernatingWebSocket, message: string | ArrayBuffer) {
    const peer = this.getPeer(ws)
    if (!peer) return

    const now = Date.now()
    if (this.isFlooding(ws, now)) return this.kick(ws, 1008, 'Too many messages')

    // Trama binaria de posición (20 bytes cliente -> 22 bytes servidor)
    if (message instanceof ArrayBuffer) {
      if (message.byteLength !== 20) return this.kick(ws, 1003, 'Invalid frame')
      if (now - peer.lastPoseAt < POSE_COOLDOWN_MS) return

      const view = new DataView(message)
      const type = view.getUint8(0)
      if (type !== 1) return

      const flags = view.getUint8(1)
      const speed = view.getUint8(2)
      const x = view.getFloat32(4, true)
      const y = view.getFloat32(8, true)
      const z = view.getFloat32(12, true)
      const yawQ = view.getInt16(16, true)
      const pitchQ = view.getInt16(18, true)

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
      if (x < -16 || x > 144 || y < -20 || y > 80 || z < -16 || z > 144) return

      peer.x = x
      peer.y = y
      peer.z = z
      peer.yaw = (yawQ / 32767) * Math.PI
      peer.pitch = (pitchQ / 32767) * (Math.PI / 2)
      peer.speed = speed
      peer.flags = flags
      peer.lastPoseAt = now
      // Solo persistir attachment periódicamente para sobrevivir a hibernación sin serializar 280 veces/s
      if (now - (this.lastPersisted.get(ws) ?? 0) >= 2500) {
        this.lastPersisted.set(ws, now)
        ws.serializeAttachment(peer)
      }

      // Reenvío compacto con peerId (22 bytes) reutilizando el buffer
      const outView = this.poseOutView
      outView.setUint8(0, 1)
      outView.setUint8(1, flags)
      outView.setUint16(2, peer.id, true)
      outView.setFloat32(4, x, true)
      outView.setFloat32(8, y, true)
      outView.setFloat32(12, z, true)
      outView.setInt16(16, yawQ, true)
      outView.setInt16(18, pitchQ, true)
      outView.setUint8(20, speed)
      outView.setUint8(21, 0)
      this.broadcast(this.poseOut, ws)
      return
    }

    // Mensajes JSON poco frecuentes: emotes y cambio de perfil
    if (typeof message !== 'string' || message.length > 256) return this.kick(ws, 1009, 'Message too big')
    let data: Record<string, unknown>
    try {
      data = JSON.parse(message)
    } catch {
      return this.kick(ws, 1003, 'Invalid message')
    }
    if (!data || typeof data !== 'object') return

    if (data.t === 'emote' && typeof data.e === 'string' && VALID_EMOTES.has(data.e)) {
      if (now - peer.lastEmoteAt < EMOTE_COOLDOWN_MS) return
      peer.lastEmoteAt = now
      ws.serializeAttachment(peer)
      this.broadcast(JSON.stringify({ t: 'emote', id: peer.id, e: data.e }), ws)
      return
    }

    if (data.t === 'profile') {
      const nextColor = typeof data.color === 'number' ? sanitizeColor(String(data.color)) : peer.color
      if (nextColor === peer.color || now - (peer.lastProfileAt ?? 0) < PROFILE_COOLDOWN_MS) return
      peer.color = nextColor
      peer.lastProfileAt = now
      ws.serializeAttachment(peer)
      this.broadcast(JSON.stringify({ t: 'profile', id: peer.id, color: peer.color }), ws)
    }
  }

  webSocketClose(ws: HibernatingWebSocket) {
    this.removePeer(ws)
  }

  webSocketError(ws: HibernatingWebSocket) {
    this.removePeer(ws)
  }

  private removePeer(ws: HibernatingWebSocket) {
    const peer = this.getPeer(ws)
    this.peersCache.delete(ws)
    this.lastPersisted.delete(ws)
    this.messageWindows.delete(ws)
    if (!peer) return
    this.broadcast(JSON.stringify({ t: 'leave', id: peer.id }), ws)
  }
}

// Ventana fija de un minuto en memoria: si el objeto se descarga por inactividad, la ventana ya pasó
export class ConnectGuard {
  private windowStart = 0
  private count = 0

  fetch(): Response {
    const now = Date.now()
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now
      this.count = 0
    }
    this.count++
    return new Response(null, { status: this.count > MAX_CONNECTIONS_PER_MINUTE ? 429 : 204 })
  }
}
