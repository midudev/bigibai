// Cliente WebSocket para el Hub social de La Fábrica (Nivel 1: avatares, nombres, colores, emotes y salas)

export type EmoteId = 'wave' | 'dance' | 'celebrate' | 'gg'
export type HubStatus = 'offline' | 'connecting' | 'online'

export const EMOTES: { id: EmoteId; label: string; key: string; badge: string }[] = [
  { id: 'wave', label: 'Saludar', key: 'Z', badge: 'HOLA!' },
  { id: 'dance', label: 'Bailar', key: 'X', badge: 'FIESTA!' },
  { id: 'celebrate', label: 'Saltar', key: 'C', badge: 'VAMOS!' },
  { id: 'gg', label: 'GG', key: 'G', badge: 'GG!' },
]

export const PEER_COLORS = [
  { name: 'Azul Ibai', hex: '#2456b8', badge: '#6fa3e8' },
  { name: 'Rojo Navidad', hex: '#c8323c', badge: '#ff7b84' },
  { name: 'Dorado', hex: '#d99116', badge: '#ffd24a' },
  { name: 'Esmeralda', hex: '#1f8a58', badge: '#6ee7b7' },
  { name: 'Morado', hex: '#6c3cc4', badge: '#c4a6ff' },
  { name: 'Turquesa', hex: '#169696', badge: '#5eead4' },
  { name: 'Rosa', hex: '#c94b8c', badge: '#f9a8d4' },
  { name: 'Chocolate', hex: '#7a4428', badge: '#e0a97b' },
] as const

export interface LocalPose {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  speed: number
  onGround: boolean
  inLiquid: boolean
  inStage: boolean
}

export interface RemotePeer {
  id: number
  name: string
  color: number
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  speed: number
  onGround: boolean
  inLiquid: boolean
  inStage: boolean
  emote: EmoteId | null
  emoteAt: number
}

export interface HubState {
  status: HubStatus
  room: string
  label: string
  isPublic: boolean
  count: number
  max: number
  selfId: number
  selfName: string
}

export interface HubClientOptions {
  wsUrl: string
  getPose: () => LocalPose | null
  onPeersChange: (peers: Map<number, RemotePeer>) => void
  onPeerEmote?: (peer: RemotePeer, emote: EmoteId) => void
  onStateChange: (state: HubState) => void
}

const FLAG_GROUND = 1
const FLAG_LIQUID = 2
const FLAG_STAGE = 4
const TICK_MS = 100 // 10 Hz
const KEEPALIVE_MS = 4500

function wrapAngle(a: number): number {
  let r = (a + Math.PI) % (Math.PI * 2)
  if (r < 0) r += Math.PI * 2
  return r - Math.PI
}

function encodePose(pose: LocalPose): ArrayBuffer {
  const buf = new ArrayBuffer(20)
  const view = new DataView(buf)
  const flags =
    (pose.onGround ? FLAG_GROUND : 0) | (pose.inLiquid ? FLAG_LIQUID : 0) | (pose.inStage ? FLAG_STAGE : 0)
  const speedByte = Math.max(0, Math.min(255, Math.round(pose.speed * 20)))
  const yawQ = Math.max(-32767, Math.min(32767, Math.round((wrapAngle(pose.yaw) / Math.PI) * 32767)))
  const pitchQ = Math.max(-32767, Math.min(32767, Math.round((pose.pitch / (Math.PI / 2)) * 32767)))
  view.setUint8(0, 1)
  view.setUint8(1, flags)
  view.setUint8(2, speedByte)
  view.setUint8(3, 0)
  view.setFloat32(4, pose.x, true)
  view.setFloat32(8, pose.y, true)
  view.setFloat32(12, pose.z, true)
  view.setInt16(16, yawQ, true)
  view.setInt16(18, pitchQ, true)
  return buf
}

export function createFactoryHubClient(opts: HubClientOptions) {
  const peers = new Map<number, RemotePeer>()
  let ws: WebSocket | null = null
  let enabled = false
  let room = 'public'
  let color = 0
  let retryMs = 1200
  let retryTimer = 0
  let tickTimer = 0
  let lastSentAt = 0
  let lastPose: LocalPose | null = null
  let state: HubState = {
    status: 'offline',
    room: 'public',
    label: 'Desconectado',
    isPublic: true,
    count: 1,
    max: 28,
    selfId: 0,
    selfName: '',
  }

  const emitState = (patch: Partial<HubState>) => {
    state = { ...state, ...patch, count: state.status === 'online' ? peers.size + 1 : 1 }
    opts.onStateChange(state)
  }

  const clearTimers = () => {
    if (retryTimer) {
      window.clearTimeout(retryTimer)
      retryTimer = 0
    }
    if (tickTimer) {
      window.clearInterval(tickTimer)
      tickTimer = 0
    }
  }

  const closeSocket = () => {
    if (!ws) return
    const current = ws
    ws = null
    current.onopen = current.onmessage = current.onerror = current.onclose = null
    try {
      current.close(1000, 'Client disconnect')
    } catch {}
  }

  const sendPoseIfNeeded = (force = false) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (document.hidden && !force) return
    const pose = opts.getPose()
    if (!pose) return
    const now = performance.now()
    const moved =
      !lastPose ||
      Math.abs(pose.x - lastPose.x) > 0.02 ||
      Math.abs(pose.y - lastPose.y) > 0.02 ||
      Math.abs(pose.z - lastPose.z) > 0.02 ||
      Math.abs(wrapAngle(pose.yaw - lastPose.yaw)) > 0.03 ||
      Math.abs(pose.pitch - lastPose.pitch) > 0.04 ||
      pose.onGround !== lastPose.onGround ||
      pose.inLiquid !== lastPose.inLiquid ||
      pose.inStage !== lastPose.inStage ||
      Math.abs(pose.speed - lastPose.speed) > 0.2
    if (!force && !moved && now - lastSentAt < KEEPALIVE_MS) return
    lastSentAt = now
    lastPose = { ...pose }
    try {
      ws.send(encodePose(pose))
    } catch {}
  }

  const scheduleReconnect = () => {
    if (!enabled || retryTimer) return
    const wait = retryMs
    retryMs = Math.min(15000, Math.round(retryMs * 1.6))
    retryTimer = window.setTimeout(() => {
      retryTimer = 0
      if (enabled) openSocket(room)
    }, wait)
  }

  const openSocket = (targetRoom: string) => {
    clearTimers()
    closeSocket()
    peers.clear()
    opts.onPeersChange(peers)

    if (!enabled || !opts.wsUrl) {
      emitState({ status: 'offline', label: 'Sin conexión', selfId: 0 })
      return
    }

    emitState({ status: 'connecting', room: targetRoom, label: 'Conectando…', selfId: 0 })

    let url: URL
    try {
      url = new URL(opts.wsUrl, location.href)
      if (url.protocol === 'http:') url.protocol = 'ws:'
      if (url.protocol === 'https:') url.protocol = 'wss:'
    } catch {
      emitState({ status: 'offline', label: 'URL no válida' })
      return
    }

    url.searchParams.set('room', targetRoom || 'public')
    url.searchParams.set('color', String(color))

    let socket: WebSocket
    try {
      socket = new WebSocket(url.toString())
    } catch {
      emitState({ status: 'offline', label: 'Desconectado' })
      scheduleReconnect()
      return
    }

    socket.binaryType = 'arraybuffer'
    ws = socket

    socket.onopen = () => {
      if (ws !== socket) return
      retryMs = 1200
      lastPose = null
      sendPoseIfNeeded(true)
      tickTimer = window.setInterval(() => sendPoseIfNeeded(false), TICK_MS)
    }

    socket.onmessage = (event) => {
      if (ws !== socket) return
      if (event.data instanceof ArrayBuffer) {
        if (event.data.byteLength !== 22) return
        const view = new DataView(event.data)
        if (view.getUint8(0) !== 1) return
        const flags = view.getUint8(1)
        const id = view.getUint16(2, true)
        const peer = peers.get(id)
        if (!peer) return
        peer.x = view.getFloat32(4, true)
        peer.y = view.getFloat32(8, true)
        peer.z = view.getFloat32(12, true)
        peer.yaw = (view.getInt16(16, true) / 32767) * Math.PI
        peer.pitch = (view.getInt16(18, true) / 32767) * (Math.PI / 2)
        peer.speed = view.getUint8(20) / 20
        peer.onGround = Boolean(flags & FLAG_GROUND)
        peer.inLiquid = Boolean(flags & FLAG_LIQUID)
        peer.inStage = Boolean(flags & FLAG_STAGE)
        return
      }

      if (typeof event.data !== 'string') return
      let msg: Record<string, any>
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      if (msg.t === 'full') {
        if (typeof msg.next === 'string' && msg.next) {
          room = msg.next
          openSocket(msg.next)
        } else {
          enabled = false
          closeSocket()
          emitState({ status: 'offline', label: 'Sala llena' })
        }
        return
      }

      if (msg.t === 'welcome') {
        peers.clear()
        const list = Array.isArray(msg.peers) ? msg.peers : []
        for (const p of list) {
          peers.set(p.id, {
            id: p.id,
            name: String(p.name || 'Jugador'),
            color: Number(p.color) || 0,
            x: Number(p.x) || 64.5,
            y: Number(p.y) || 8,
            z: Number(p.z) || 75.5,
            yaw: Number(p.yaw) || 0,
            pitch: Number(p.pitch) || 0,
            speed: (Number(p.speed) || 0) / 20,
            onGround: Boolean((Number(p.flags) || 1) & FLAG_GROUND),
            inLiquid: Boolean((Number(p.flags) || 0) & FLAG_LIQUID),
            inStage: Boolean((Number(p.flags) || 0) & FLAG_STAGE),
            emote: null,
            emoteAt: 0,
          })
        }
        opts.onPeersChange(peers)
        emitState({
          status: 'online',
          room: String(msg.room || targetRoom),
          label: String(msg.label || targetRoom),
          isPublic: Boolean(msg.isPublic),
          max: Number(msg.max) || 28,
          selfId: Number(msg.id) || 0,
          selfName: String(msg.name || ''),
        })
        return
      }

      if (msg.t === 'join' && msg.peer) {
        const p = msg.peer
        peers.set(p.id, {
          id: p.id,
          name: String(p.name || 'Jugador'),
          color: Number(p.color) || 0,
          x: Number(p.x) || 64.5,
          y: Number(p.y) || 8,
          z: Number(p.z) || 75.5,
          yaw: Number(p.yaw) || 0,
          pitch: Number(p.pitch) || 0,
          speed: (Number(p.speed) || 0) / 20,
          onGround: Boolean((Number(p.flags) || 1) & FLAG_GROUND),
          inLiquid: Boolean((Number(p.flags) || 0) & FLAG_LIQUID),
          inStage: Boolean((Number(p.flags) || 0) & FLAG_STAGE),
          emote: null,
          emoteAt: 0,
        })
        opts.onPeersChange(peers)
        emitState({})
        return
      }

      if (msg.t === 'leave' && typeof msg.id === 'number') {
        if (peers.delete(msg.id)) {
          opts.onPeersChange(peers)
          emitState({})
        }
        return
      }

      if (msg.t === 'profile' && typeof msg.id === 'number') {
        const peer = peers.get(msg.id)
        if (!peer) return
        if (typeof msg.name === 'string') peer.name = msg.name
        if (typeof msg.color === 'number') peer.color = msg.color
        opts.onPeersChange(peers)
        return
      }

      if (msg.t === 'emote' && typeof msg.id === 'number' && typeof msg.e === 'string') {
        const peer = peers.get(msg.id)
        if (!peer) return
        peer.emote = msg.e as EmoteId
        peer.emoteAt = performance.now()
        opts.onPeerEmote?.(peer, peer.emote)
      }
    }

    socket.onerror = () => {
      // onclose se encarga de reconectar
    }

    socket.onclose = () => {
      if (ws !== socket) return
      ws = null
      clearTimers()
      peers.clear()
      opts.onPeersChange(peers)
      emitState({ status: 'offline', label: enabled ? 'Reconectando…' : 'Desconectado', selfId: 0 })
      if (enabled) scheduleReconnect()
    }
  }

  return {
    connect(config: { room?: string; color: number }) {
      enabled = true
      room = config.room?.trim() || 'public'
      color = config.color
      retryMs = 1200
      openSocket(room)
    },
    updateColor(nextColor: number) {
      color = nextColor
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ t: 'profile', color }))
        } catch {}
      }
    },
    sendEmote(emote: EmoteId) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ t: 'emote', e: emote }))
        } catch {}
      }
    },
    disconnect() {
      enabled = false
      clearTimers()
      closeSocket()
      peers.clear()
      opts.onPeersChange(peers)
      emitState({ status: 'offline', label: 'Desconectado', selfId: 0 })
    },
    getState: () => state,
    dispose() {
      enabled = false
      clearTimers()
      closeSocket()
      peers.clear()
    },
  }
}

export type FactoryHubClient = ReturnType<typeof createFactoryHubClient>
