import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  NearestFilter,
  Quaternion,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
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
const MAX_PEERS = 32
const LABEL_DIST_SQ = 36 * 36

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

  // Pequeña bufanda / insignia de color en el torso para distinguir rápido a cada jugador.
  // Todas las extremidades y bufandas se dibujan con InstancedMesh (5 draw calls totales en vez de 7 por jugador)
  const scarfGeo = new BoxGeometry(0.62, 0.14, 0.42)
  const scarfMat = new MeshBasicMaterial({ color: 0xffffff })
  const makeInst = (geo: BufferGeometry, mat: Material, cap: number) => {
    const mesh = opts.castShadow(new InstancedMesh(geo, mat, cap))
    mesh.frustumCulled = false
    mesh.count = 0
    group.add(mesh)
    return mesh
  }
  const torsoInst = makeInst(opts.skin.torso, opts.matProp, MAX_PEERS)
  const headInst = makeInst(opts.skin.head, opts.matProp, MAX_PEERS)
  const armInst = makeInst(opts.skin.arm, opts.matProp, MAX_PEERS * 2)
  const legInst = makeInst(opts.skin.leg, opts.matProp, MAX_PEERS * 2)
  const scarfInst = makeInst(scarfGeo, scarfMat, MAX_PEERS)

  const emoteCache = new Map<EmoteId, CanvasTexture>()
  const rootM = new Matrix4()
  const localM = new Matrix4()
  const outM = new Matrix4()
  const rootPos = new Vector3()
  const localPos = new Vector3()
  const one = new Vector3(1, 1, 1)
  const up = new Vector3(0, 1, 0)
  const rootQ = new Quaternion()
  const localQ = new Quaternion()
  const localEuler = new Euler()
  const tmpColor = new Color()
  const colorCache = PEER_COLORS.map((p) => new Color(p.hex))

  const getEmoteTex = (emote: EmoteId) => {
    let tex = emoteCache.get(emote)
    if (!tex) {
      tex = makeEmoteTexture(emote)
      emoteCache.set(emote, tex)
    }
    return tex
  }

  const createVisual = (peer: RemotePeer): PeerVisual => {
    const labelTex = makeLabelTexture(peer.name, peer.color)
    const labelMat = new SpriteMaterial({ map: labelTex, transparent: true, depthTest: true, fog: false })
    const labelSprite = new Sprite(labelMat)
    labelSprite.scale.set(2.1, 0.4, 1)
    labelSprite.visible = false
    group.add(labelSprite)

    const emoteMat = new SpriteMaterial({ transparent: true, depthTest: true, fog: false })
    const emoteSprite = new Sprite(emoteMat)
    emoteSprite.scale.set(1.45, 0.44, 1)
    emoteSprite.visible = false
    group.add(emoteSprite)

    return {
      id: peer.id,
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
    group.remove(visual.labelSprite)
    group.remove(visual.emoteSprite)
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
  }

  const writeLimb = (
    inst: InstancedMesh,
    index: number,
    lx: number,
    ly: number,
    rx: number,
    rz: number
  ) => {
    localPos.set(lx, ly, 0)
    localEuler.set(rx, 0, rz)
    localQ.setFromEuler(localEuler)
    localM.compose(localPos, localQ, one)
    outM.multiplyMatrices(rootM, localM)
    inst.setMatrixAt(index, outM)
  }

  const update = (
    dt: number,
    time: number,
    addBlob: (x: number, y: number, z: number, r: number) => void,
    camPos?: Vector3
  ) => {
    if (!group.visible) return
    const lerp = Math.min(1, dt * 12)
    const motion = opts.reducedMotion ? 0 : 1
    let count = 0

    for (const [id, visual] of visuals) {
      const target = latestPeers.get(id)
      if (!target || target.inStage || count >= MAX_PEERS) {
        visual.labelSprite.visible = false
        visual.emoteSprite.visible = false
        continue
      }

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

      const headRx = -visual.pitch * 0.6
      const legLRx = walk * 0.75
      const legRRx = -walk * 0.75
      let armLRx = -walk * 0.75
      let armRRx = walk * 0.75
      let armLRz = -0.06
      let armRRz = 0.06
      let emoteBob = 0

      if (visual.emoteTimer > 0 && visual.emote) {
        visual.emoteTimer = Math.max(0, visual.emoteTimer - dt)
        const t = EMOTE_DURATION - visual.emoteTimer
        if (visual.emote === 'wave') {
          armRRx = -2.5
          armRRz = 0.35 + Math.sin(t * 14) * 0.45 * motion
        } else if (visual.emote === 'dance') {
          extraYaw = Math.sin(t * 7) * 0.55 * motion
          extraY += Math.abs(Math.sin(t * 10)) * 0.22 * motion
          armLRx = -1.6 + Math.sin(t * 10) * 0.7 * motion
          armRRx = -1.6 - Math.sin(t * 10) * 0.7 * motion
          armLRz = -0.45
          armRRz = 0.45
        } else if (visual.emote === 'celebrate') {
          extraY += Math.abs(Math.sin(t * 8)) * 0.45 * motion
          armLRx = -2.7
          armRRx = -2.7
          armLRz = -0.28
          armRRz = 0.28
        } else if (visual.emote === 'gg') {
          armRRx = -2.15
          armRRz = -0.15
        }
        emoteBob = Math.sin(t * 6) * 0.06 * motion
        if (visual.emoteTimer <= 0) visual.emote = null
      }

      const wy = visual.y + extraY
      rootPos.set(visual.x, wy, visual.z)
      rootQ.setFromAxisAngle(up, visual.yaw + Math.PI + extraYaw)
      rootM.compose(rootPos, rootQ, one)

      torsoInst.setMatrixAt(count, rootM)
      writeLimb(headInst, count, 0, 1.3, headRx, 0)
      writeLimb(armInst, count * 2, -0.39, 1.24, armLRx, armLRz)
      writeLimb(armInst, count * 2 + 1, 0.39, 1.24, armRRx, armRRz)
      writeLimb(legInst, count * 2, -0.14, 0.6, legLRx, 0)
      writeLimb(legInst, count * 2 + 1, 0.14, 0.6, legRRx, 0)
      writeLimb(scarfInst, count, 0, 1.24, 0, 0)
      scarfInst.setColorAt(count, colorCache[visual.color % colorCache.length] ?? tmpColor.set(0xffffff))

      const near =
        !camPos ||
        (visual.x - camPos.x) * (visual.x - camPos.x) + (visual.z - camPos.z) * (visual.z - camPos.z) < LABEL_DIST_SQ
      visual.labelSprite.visible = near
      if (near) visual.labelSprite.position.set(visual.x, wy + 2.22, visual.z)
      const showEmote = near && visual.emoteTimer > 0 && visual.emote !== null
      visual.emoteSprite.visible = showEmote
      if (showEmote) visual.emoteSprite.position.set(visual.x, wy + 2.7 + emoteBob, visual.z)

      addBlob(visual.x, visual.y, visual.z, 0.42)
      count++
    }

    torsoInst.count = count
    headInst.count = count
    armInst.count = count * 2
    legInst.count = count * 2
    scarfInst.count = count
    if (count > 0) {
      torsoInst.instanceMatrix.needsUpdate = true
      headInst.instanceMatrix.needsUpdate = true
      armInst.instanceMatrix.needsUpdate = true
      legInst.instanceMatrix.needsUpdate = true
      scarfInst.instanceMatrix.needsUpdate = true
      if (scarfInst.instanceColor) scarfInst.instanceColor.needsUpdate = true
    }
  }

  const dispose = () => {
    for (const visual of visuals.values()) destroyVisual(visual)
    visuals.clear()
    for (const tex of emoteCache.values()) tex.dispose()
    emoteCache.clear()
    torsoInst.dispose()
    headInst.dispose()
    armInst.dispose()
    legInst.dispose()
    scarfInst.dispose()
    scarfGeo.dispose()
    scarfMat.dispose()
  }

  return {
    group,
    syncPeers,
    triggerEmote,
    update,
    dispose,
  }
}
