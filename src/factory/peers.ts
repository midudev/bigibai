import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three'
import { EMOTES, PEER_COLORS, type EmoteId, type RemotePeer } from './multiplayer'

interface SkinGeometries {
  head: BufferGeometry
  torso: BufferGeometry
  arm: BufferGeometry
  leg: BufferGeometry
}

interface PeerVisual {
  id: number
  root: Group
  head: Mesh
  armL: Mesh
  armR: Mesh
  legL: Mesh
  legR: Mesh
  badgeMat: MeshBasicMaterial
  labelSprite: Sprite
  labelTex: CanvasTexture
  labelMat: SpriteMaterial
  emoteSprite: Sprite
  emoteTex: CanvasTexture | null
  emoteMat: SpriteMaterial
  name: string
  color: number
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  gait: number
  stride: number
  emote: EmoteId | null
  emoteTimer: number
}

const EMOTE_DURATION = 2.6

function shortestAngle(from: number, to: number): number {
  let diff = (to - from + Math.PI) % (Math.PI * 2)
  if (diff < 0) diff += Math.PI * 2
  return diff - Math.PI
}

function makeLabelTexture(name: string, colorIndex: number): CanvasTexture {
  const palette = PEER_COLORS[colorIndex % PEER_COLORS.length]
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 48
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  ctx.font = 'bold 18px "Pixel", monospace'
  const text = name.slice(0, 16)
  const measured = Math.min(220, Math.ceil(ctx.measureText(text).width) + 28)
  const x = Math.round((canvas.width - measured) / 2)
  const y = 8
  const h = 32

  // Caja pixel-art con borde negro y acento del color del jugador
  ctx.fillStyle = '#06143ad9'
  ctx.fillRect(x, y, measured, h)
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 4
  ctx.strokeRect(x + 2, y + 2, measured - 4, h - 4)
  ctx.fillStyle = palette.badge
  ctx.fillRect(x + 6, y + 10, 10, 12)

  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 24, y + h / 2 + 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, x + 22, y + h / 2)

  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  return tex
}

function makeEmoteTexture(emote: EmoteId): CanvasTexture {
  const meta = EMOTES.find((e) => e.id === emote)
  const text = meta?.badge ?? '!'
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 48
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  ctx.font = 'bold 18px "Pixel", monospace'
  const w = Math.min(148, Math.ceil(ctx.measureText(text).width) + 24)
  const x = Math.round((canvas.width - w) / 2)
  const y = 6
  const h = 32

  ctx.fillStyle = emote === 'gg' ? '#f8b132' : '#fff7e6'
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 4
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4)

  ctx.fillStyle = '#10204a'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvas.width / 2, y + h / 2 + 1)

  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  return tex
}

export function createPeersRenderer(opts: {
  skin: SkinGeometries
  matProp: Material
  castShadow: <T extends Object3D>(obj: T) => T
  reducedMotion: boolean
}) {
  const group = new Group()
  const visuals = new Map<number, PeerVisual>()
  let latestPeers = new Map<number, RemotePeer>()

  // Pequeña bufanda / insignia de color en el torso para distinguir rápido a cada jugador
  const scarfGeo = new BoxGeometry(0.62, 0.14, 0.42)
  const emoteCache = new Map<EmoteId, CanvasTexture>()

  const getEmoteTex = (emote: EmoteId) => {
    let tex = emoteCache.get(emote)
    if (!tex) {
      tex = makeEmoteTexture(emote)
      emoteCache.set(emote, tex)
    }
    return tex
  }

  const createVisual = (peer: RemotePeer): PeerVisual => {
    const root = opts.castShadow(new Group())
    const limb = (geo: BufferGeometry, x: number, y: number) => {
      const mesh = opts.castShadow(new Mesh(geo, opts.matProp))
      mesh.position.set(x, y, 0)
      root.add(mesh)
      return mesh
    }
    limb(opts.skin.torso, 0, 0)
    const head = limb(opts.skin.head, 0, 1.3)
    const armL = limb(opts.skin.arm, -0.39, 1.24)
    const armR = limb(opts.skin.arm, 0.39, 1.24)
    const legL = limb(opts.skin.leg, -0.14, 0.6)
    const legR = limb(opts.skin.leg, 0.14, 0.6)

    const palette = PEER_COLORS[peer.color % PEER_COLORS.length]
    const badgeMat = new MeshBasicMaterial({ color: palette.hex })
    const scarf = opts.castShadow(new Mesh(scarfGeo, badgeMat))
    scarf.position.set(0, 1.24, 0)
    root.add(scarf)

    const labelTex = makeLabelTexture(peer.name, peer.color)
    const labelMat = new SpriteMaterial({ map: labelTex, transparent: true, depthTest: true, fog: false })
    const labelSprite = new Sprite(labelMat)
    labelSprite.position.set(0, 2.22, 0)
    labelSprite.scale.set(2.1, 0.4, 1)
    root.add(labelSprite)

    const emoteMat = new SpriteMaterial({ transparent: true, depthTest: true, fog: false })
    const emoteSprite = new Sprite(emoteMat)
    emoteSprite.position.set(0, 2.7, 0)
    emoteSprite.scale.set(1.45, 0.44, 1)
    emoteSprite.visible = false
    root.add(emoteSprite)

    root.position.set(peer.x, peer.y, peer.z)
    root.rotation.y = peer.yaw + Math.PI
    group.add(root)

    return {
      id: peer.id,
      root,
      head,
      armL,
      armR,
      legL,
      legR,
      badgeMat,
      labelSprite,
      labelTex,
      labelMat,
      emoteSprite,
      emoteTex: null,
      emoteMat,
      name: peer.name,
      color: peer.color,
      x: peer.x,
      y: peer.y,
      z: peer.z,
      yaw: peer.yaw,
      pitch: peer.pitch,
      gait: 0,
      stride: Math.random() * 10,
      emote: null,
      emoteTimer: 0,
    }
  }

  const destroyVisual = (visual: PeerVisual) => {
    group.remove(visual.root)
    visual.badgeMat.dispose()
    visual.labelTex.dispose()
    visual.labelMat.dispose()
    visual.emoteMat.dispose()
  }

  const syncPeers = (peers: Map<number, RemotePeer>) => {
    latestPeers = peers
    for (const [id, visual] of visuals) {
      if (!peers.has(id)) {
        destroyVisual(visual)
        visuals.delete(id)
      }
    }
    for (const [id, peer] of peers) {
      const existing = visuals.get(id)
      if (!existing) {
        visuals.set(id, createVisual(peer))
        continue
      }
      if (existing.name !== peer.name || existing.color !== peer.color) {
        existing.name = peer.name
        existing.color = peer.color
        const palette = PEER_COLORS[peer.color % PEER_COLORS.length]
        existing.badgeMat.color.set(palette.hex)
        existing.labelTex.dispose()
        existing.labelTex = makeLabelTexture(peer.name, peer.color)
        existing.labelMat.map = existing.labelTex
        existing.labelMat.needsUpdate = true
      }
    }
  }

  const triggerEmote = (id: number, emote: EmoteId) => {
    const visual = visuals.get(id)
    if (!visual) return
    visual.emote = emote
    visual.emoteTimer = EMOTE_DURATION
    const tex = getEmoteTex(emote)
    visual.emoteTex = tex
    visual.emoteMat.map = tex
    visual.emoteMat.needsUpdate = true
    visual.emoteSprite.visible = true
  }

  const update = (dt: number, time: number, addBlob: (x: number, y: number, z: number, r: number) => void) => {
    if (!group.visible) return
    const lerp = Math.min(1, dt * 12)
    const motion = opts.reducedMotion ? 0 : 1

    for (const [id, visual] of visuals) {
      const target = latestPeers.get(id)
      if (!target || target.inStage) {
        visual.root.visible = false
        continue
      }
      visual.root.visible = true

      // Si se teletransportó muy lejos (por ejemplo a una puerta), saltar directo sin arrastrarlo por el mapa
      const dx = target.x - visual.x
      const dy = target.y - visual.y
      const dz = target.z - visual.z
      const distSq = dx * dx + dy * dy + dz * dz
      if (distSq > 64) {
        visual.x = target.x
        visual.y = target.y
        visual.z = target.z
        visual.yaw = target.yaw
        visual.pitch = target.pitch
      } else {
        visual.x += dx * lerp
        visual.y += dy * lerp
        visual.z += dz * lerp
        visual.yaw += shortestAngle(visual.yaw, target.yaw) * lerp
        visual.pitch += (target.pitch - visual.pitch) * lerp
      }

      const horizMove = Math.hypot(dx, dz)
      const speed = Math.max(target.speed, horizMove * 4)
      const goalGait = target.onGround ? Math.min(1, speed / 4.8) : target.inLiquid ? 0.5 : 0.35
      visual.gait += (goalGait - visual.gait) * Math.min(1, dt * 10)
      if (target.onGround && speed > 0.15) visual.stride += Math.min(speed, 8) * dt * 1.6

      const cycle = target.onGround ? visual.stride * 0.95 : time * (target.inLiquid ? 5 : 0)
      const walk = (target.onGround || target.inLiquid ? Math.sin(cycle) : 1) * visual.gait * motion

      let extraY = Math.abs(Math.sin(cycle)) * visual.gait * 0.04
      let extraYaw = 0

      visual.head.rotation.x = -visual.pitch * 0.6
      visual.legL.rotation.x = walk * 0.75
      visual.legR.rotation.x = -walk * 0.75
      visual.armL.rotation.x = -walk * 0.75
      visual.armR.rotation.x = walk * 0.75
      visual.armL.rotation.z = -0.06
      visual.armR.rotation.z = 0.06

      if (visual.emoteTimer > 0 && visual.emote) {
        visual.emoteTimer = Math.max(0, visual.emoteTimer - dt)
        const t = EMOTE_DURATION - visual.emoteTimer
        if (visual.emote === 'wave') {
          visual.armR.rotation.x = -2.5
          visual.armR.rotation.z = 0.35 + Math.sin(t * 14) * 0.45 * motion
        } else if (visual.emote === 'dance') {
          extraYaw = Math.sin(t * 7) * 0.55 * motion
          extraY += Math.abs(Math.sin(t * 10)) * 0.22 * motion
          visual.armL.rotation.x = -1.6 + Math.sin(t * 10) * 0.7 * motion
          visual.armR.rotation.x = -1.6 - Math.sin(t * 10) * 0.7 * motion
          visual.armL.rotation.z = -0.45
          visual.armR.rotation.z = 0.45
        } else if (visual.emote === 'celebrate') {
          extraY += Math.abs(Math.sin(t * 8)) * 0.45 * motion
          visual.armL.rotation.x = -2.7
          visual.armR.rotation.x = -2.7
          visual.armL.rotation.z = -0.28
          visual.armR.rotation.z = 0.28
        } else if (visual.emote === 'gg') {
          visual.armR.rotation.x = -2.15
          visual.armR.rotation.z = -0.15
        }
        visual.emoteSprite.position.y = 2.7 + Math.sin(t * 6) * 0.06 * motion
        if (visual.emoteTimer <= 0) {
          visual.emote = null
          visual.emoteSprite.visible = false
        }
      }

      visual.root.position.set(visual.x, visual.y + extraY, visual.z)
      visual.root.rotation.y = visual.yaw + Math.PI + extraYaw
      addBlob(visual.x, visual.y, visual.z, 0.42)
    }
  }

  const dispose = () => {
    for (const visual of visuals.values()) destroyVisual(visual)
    visuals.clear()
    for (const tex of emoteCache.values()) tex.dispose()
    emoteCache.clear()
    scarfGeo.dispose()
  }

  return {
    group,
    syncPeers,
    triggerEmote,
    update,
    dispose,
  }
}
