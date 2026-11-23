import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BackSide,
  BatchedMesh,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Data3DTexture,
  DataArrayTexture,
  DepthTexture,
  EdgesGeometry,
  Fog,
  InstancedMesh,
  LessEqualCompare,
  LessEqualDepth,
  LineBasicMaterial,
  LineSegments,
  LinearFilter,
  Matrix4,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  NearestMipmapLinearFilter,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RedFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import type { Object3D } from 'three'
import { B, BELT, BLOCKS, D, DOOR_STYLES, H, LOOT, W, at, beltPoint, buildLeaf, buildProps, buildSkin, generate, type DoorSlot } from './world'
import { mulberry32 } from './voxels'
import { DAMAGE, SPEED_STEP, STRENGTH_STEP, shieldTime, type PlayerStats } from './stats'
import { FIELD, buildStage, type StageDef, type StageKind, type Weapon } from './stages'
import { buildModels, createStage, disposeModels, type StageCtx, type StageHud, type StageRuntime, type StageSound } from './actors'
import { createPeersRenderer } from './peers'
import type { EmoteId, LocalPose, RemotePeer } from './multiplayer'

export type DoorState = 'locked' | 'unlocked' | 'today' | 'opened' | 'done'
export type SecretId = 'plane' | 'vat' | 'ibai' | 'crown' | 'dragon' | 'disco'
export type SoundName =
  | StageSound
  | 'break'
  | 'place'
  | 'jump'
  | 'bounce'
  | 'gift'
  | 'splash'
  | 'hurt'
export type { StageHud, StageKind, Weapon }
export interface HotbarItem {
  type: number
  count: number
  icon: string
  name: string
}
export type StageEvent =
  | { type: 'warp'; day: number }
  | { type: 'enter'; day: number; title: string; intro: string; weapon: Weapon; kind: StageKind; boss: boolean }
  | { type: 'hud'; hud: StageHud }
  | { type: 'hurt' }
  | { type: 'say'; text: string }
  | { type: 'lose' }
  | { type: 'win'; day: number; stars: number }
  | { type: 'special' }
  | { type: 'exit' }

export interface FactoryOptions {
  stage: HTMLElement
  canvas: HTMLCanvasElement
  states: Record<number, DoorState>
  reducedMotion: boolean
  // Hora local forzada (0-24) para probar el ciclo de día y noche
  hour?: number
  stats: PlayerStats
  // Reliquias ya recogidas
  relics: number[]
  onRelic: (index: number) => void
  onDoor: (day: number, state: DoorState) => void
  onSecret: (id: SecretId) => void
  onInventory: (items: HotbarItem[], selected: number) => void
  onCoins: (count: number, total: number, picked: boolean) => void
  onLock: (locked: boolean) => void
  onSound: (name: SoundName) => void
  onStick: (x: number, y: number, dx: number, dy: number, active: boolean) => void
  onView?: (view: number) => void
  onStage: (event: StageEvent) => void
}

const SAVE_KEY = 'fabrica:partida'
const VIEW_KEY = 'fabrica:camara'
const CAM_DIST = 4.2
const SAVE_VERSION = 2
const OPEN_ANGLE = -1.95
const CHUNK = 32
const SHADOW_LAYER = 1
// La isla es grande: su niebla empieza más lejos que la de las fases
const HUB_FOG = [60, 175]
const HALF = 0.3
const TALL = 1.8
const EYE = 1.62
const SUNRISE = 7.5
const SUNSET = 18.5
const LIGHT_MAX = 9
const SUN_MIN = 0.45
const UP = new Vector3(0, 1, 0)
const TINTS: Record<DoorState, [number, number]> = {
  locked: [0x2c3d66, 0x6f83ad],
  unlocked: [0xf8b132, 0xf8b132],
  today: [0xffd24a, 0xffd24a],
  opened: [0xf8b132, 0xfff2c4],
  done: [0x91e4bc, 0x91e4bc],
}
const AO = [0.5, 0.68, 0.84, 1]
// Esquinas en orden abajo-izquierda, abajo-derecha, arriba-derecha, arriba-izquierda
const FACES = [
  { n: [1, 0, 0], a: [1, 2], shade: 0.84, c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], a: [1, 2], shade: 0.68, c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], a: [0, 2], shade: 1, c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], a: [0, 2], shade: 0.5, c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], a: [0, 1], shade: 0.92, c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], a: [0, 1], shade: 0.6, c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
]
const QUAD_UV = [0, 0, 1, 0, 1, 1, 0, 1]

// Una textura de 16 px por tipo de material, en un atlas de 4 x 4
const TILE = {
  PLATE: 0, FLOOR: 1, SOFT: 2, PLANKS: 3, CHOC: 4, LEAVES: 5, LAMP: 6, GIFT: 7,
  PIPE: 8, BELT: 9, BOUNCE: 10, BRICK: 11, SHINGLE: 12, STRIPE: 13, GLASS: 14, COBBLE: 15,
}
const TILE_OF: Record<number, number> = {
  [B.FLOOR_A]: TILE.FLOOR,
  [B.FLOOR_B]: TILE.FLOOR,
  [B.PIPE]: TILE.PIPE,
  [B.PIPE_BLUE]: TILE.PIPE,
  [B.CHOC]: TILE.CHOC,
  [B.CHOC_LIGHT]: TILE.CHOC,
  [B.RED]: TILE.SOFT,
  [B.CREAM]: TILE.SOFT,
  [B.PURPLE]: TILE.SOFT,
  [B.SNOW]: TILE.SOFT,
  [B.GREEN]: TILE.LEAVES,
  [B.GLOW]: TILE.LAMP,
  [B.TEAL]: TILE.LAMP,
  [B.DOOR_GLOW]: TILE.LAMP,
  [B.WOOD]: TILE.PLANKS,
  [B.BELT_XP]: TILE.BELT,
  [B.BELT_XN]: TILE.BELT,
  [B.BELT_ZP]: TILE.BELT,
  [B.BELT_ZN]: TILE.BELT,
  [B.BOUNCE]: TILE.BOUNCE,
  [B.GIFT]: TILE.GIFT,
  [B.BRICK]: TILE.BRICK,
  [B.STONE]: TILE.BRICK,
  [B.DARK_STONE]: TILE.BRICK,
  [B.ICE]: TILE.BRICK,
  [B.ROOF_RED]: TILE.SHINGLE,
  [B.ROOF_BLUE]: TILE.SHINGLE,
  [B.CANDY]: TILE.STRIPE,
  [B.GLASS]: TILE.GLASS,
  [B.COBBLE]: TILE.COBBLE,
  [B.GINGER]: TILE.SOFT,
  [B.COAL]: TILE.SOFT,
  [B.PINK]: TILE.SOFT,
  [B.FRAME_WOOD]: TILE.PLANKS,
  [B.FRAME_STONE]: TILE.BRICK,
  [B.FRAME_CANDY]: TILE.STRIPE,
  [B.PLASTER]: TILE.SOFT,
  [B.TIMBER]: TILE.PLANKS,
  [B.WINDOW]: TILE.LAMP,
}

function blockAtlas() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(64, 64)
  const data = img.data
  const arrayData = new Uint8Array(16 * 16 * 16 * 4)
  const rand = mulberry32(2026)
  const paint = (tile: number, fn: (x: number, y: number) => number | number[]) => {
    const ox = (tile % 4) * 16
    const oy = Math.floor(tile / 4) * 16
    const layerBase = tile * 16 * 16 * 4
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const v = fn(x, y)
        const r = Math.round(Math.min(1, typeof v === 'number' ? v : v[0]) * 255)
        const g = Math.round(Math.min(1, typeof v === 'number' ? v : v[1]) * 255)
        const b = Math.round(Math.min(1, typeof v === 'number' ? v : v[2]) * 255)
        const ci = ((oy + y) * 64 + (ox + x)) * 4
        data[ci] = r
        data[ci + 1] = g
        data[ci + 2] = b
        data[ci + 3] = 255
        // flipY en DataArrayTexture para igualar la orientación UV de CanvasTexture
        const ai = layerBase + ((15 - y) * 16 + x) * 4
        arrayData[ai] = r
        arrayData[ai + 1] = g
        arrayData[ai + 2] = b
        arrayData[ai + 3] = 255
      }
    }
  }
  const edge = (x: number, y: number) => x === 0 || y === 0 || x === 15 || y === 15
  paint(TILE.PLATE, (x, y) => {
    if (edge(x, y)) return 0.66 + rand() * 0.05
    if ((x === 2 || x === 13) && (y === 2 || y === 13)) return 1
    return (y === 1 ? 0.92 : 0.84) + rand() * 0.12
  })
  paint(TILE.FLOOR, (x, y) => (x === 0 || y === 0 ? 0.68 : x === 15 || y === 15 ? 0.8 : 0.88 + rand() * 0.1))
  paint(TILE.SOFT, () => (rand() < 0.05 ? 1 : 0.88 + rand() * 0.09))
  paint(TILE.PLANKS, (x, y) =>
    y % 4 === 0 ? 0.64 : x === (Math.floor(y / 4) % 2 ? 4 : 11) ? 0.7 : 0.82 + rand() * 0.16
  )
  paint(TILE.CHOC, (x, y) =>
    x % 8 === 0 || y % 8 === 0 ? 1 : x % 8 === 7 || y % 8 === 7 ? 0.6 : 0.8 + rand() * 0.08
  )
  paint(TILE.LEAVES, () => {
    const n = rand()
    return n < 0.3 ? 0.58 : n < 0.5 ? 1 : 0.8
  })
  paint(TILE.LAMP, (x, y) =>
    edge(x, y) ? 0.68 : x === 7 || x === 8 || y === 7 || y === 8 ? 0.8 : 0.94 + rand() * 0.06
  )
  paint(TILE.GIFT, (x, y) => {
    const k = (edge(x, y) ? 0.78 : 1) * (0.88 + rand() * 0.12)
    const ribbon = (x >= 6 && x <= 9) || (y >= 6 && y <= 9)
    return ribbon ? [0.97 * k, 0.72 * k, 0.2 * k] : [0.82 * k, 0.2 * k, 0.26 * k]
  })
  paint(TILE.PIPE, (x, y) => (1 - (Math.abs(x - 7.5) / 7.5) * 0.3) * (y === 0 || y === 15 ? 0.82 : 1) - rand() * 0.04)
  paint(TILE.BELT, (x, y) => (x === 0 || x === 15 ? 0.5 : (x + (y < 8 ? y : 15 - y)) % 8 < 2 ? 0.95 : 0.7))
  paint(TILE.BOUNCE, (x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5))
    return d > 7 ? 0.6 : d > 5 ? 1 : d > 3 ? 0.72 : 1
  })
  paint(TILE.BRICK, (x, y) => {
    const row = y >> 2
    return y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7 ? 0.62 : 0.84 + ((row * 7 + ((x + (row % 2) * 4) >> 3) * 3) % 4) * 0.04 + rand() * 0.05
  })
  paint(TILE.SHINGLE, (x, y) => {
    const row = y >> 2
    const k = (x + (row % 2) * 2) % 4
    return y % 4 === 3 ? 0.58 : k === 3 ? 0.7 : 0.86 + (y % 4) * 0.04 + rand() * 0.04
  })
  paint(TILE.STRIPE, (x, y) => {
    const k = 0.9 + rand() * 0.1
    return (x + y) % 8 < 4 ? [0.86 * k, 0.16 * k, 0.22 * k] : [k, k, k]
  })
  paint(TILE.GLASS, (x, y) => {
    if (edge(x, y)) return 0.6
    return x + y === 9 || x + y === 10 || x + y === 19 ? 1 : 0.8 + rand() * 0.05
  })
  paint(TILE.COBBLE, (x, y) => {
    const cx = (x + ((y >> 3) % 2) * 4) % 8
    return cx === 0 || y % 8 === 0 ? 0.6 : 0.8 + (((x + ((y >> 3) % 2) * 4) >> 3) % 2) * 0.08 + rand() * 0.1
  })
  ctx.putImageData(img, 0, 0)
  const arrayTex = new DataArrayTexture(arrayData, 16, 16, 16)
  arrayTex.colorSpace = SRGBColorSpace
  arrayTex.wrapS = arrayTex.wrapT = RepeatWrapping
  arrayTex.magFilter = NearestFilter
  arrayTex.minFilter = NearestMipmapLinearFilter
  arrayTex.generateMipmaps = true
  arrayTex.needsUpdate = true
  return { canvas, arrayTex }
}

const ICON_FACES = [
  { shade: 1, m: [1, 0.5, -1, 0.5, 16, 0] },
  { shade: 0.62, m: [1, 0.5, 0, 1, 0, 8] },
  { shade: 0.8, m: [1, -0.5, 0, 1, 16, 16] },
]

function blockIcon(atlas: HTMLCanvasElement, type: number) {
  const tile = TILE_OF[type] ?? TILE.PLATE
  const face = document.createElement('canvas')
  face.width = face.height = 16
  const fctx = face.getContext('2d')!
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  const color = new Color(BLOCKS[type].color)
  for (const { shade, m } of ICON_FACES) {
    fctx.globalCompositeOperation = 'source-over'
    fctx.drawImage(atlas, (tile % 4) * 16, Math.floor(tile / 4) * 16, 16, 16, 0, 0, 16, 16)
    fctx.globalCompositeOperation = 'multiply'
    fctx.fillStyle = `#${color.clone().multiplyScalar(shade).getHexString()}`
    fctx.fillRect(0, 0, 16, 16)
    ctx.setTransform(m[0] * 2, m[1] * 2, m[2] * 2, m[3] * 2, m[4] * 2, m[5] * 2)
    ctx.drawImage(face, 0, 0)
  }
  return canvas.toDataURL()
}

function pixelTexture(size: number, paint: (x: number, y: number, rand: () => number) => number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const data = img.data
  const rand = mulberry32(size * 31)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const g = Math.round(paint(x, y, rand) * 255)
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = g
      data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.magFilter = NearestFilter
  tex.minFilter = NearestMipmapLinearFilter
  return tex
}

function glowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 32
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)')
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.28)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 32, 32)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  return tex
}

function numbersAtlas() {
  const cell = 96
  const canvas = document.createElement('canvas')
  canvas.width = cell * 6
  canvas.height = cell * 8
  const ctx = canvas.getContext('2d')!
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < 24; i++) {
    const x = (i % 6) * cell
    const y = Math.floor(i / 6) * cell
    const cx = x + cell / 2 + 2
    const cy = y + cell / 2 + 3
    // Placa con marco
    ctx.fillStyle = '#10204a'
    ctx.fillRect(x + 2, y + 2, 92, 92)
    ctx.fillStyle = '#fff'
    ctx.fillRect(x + 10, y + 10, 76, 76)
    ctx.fillStyle = '#10204a'
    ctx.font = `${i < 9 ? 48 : 32}px Pixel, monospace`
    ctx.fillText(String(i + 1), cx, cy)
    // Número pintado en la fachada: solo los dígitos, con contorno
    ctx.font = `${i < 9 ? 64 : 40}px Pixel, monospace`
    ctx.fillStyle = '#10204a'
    for (const [ox, oy] of [[-4, 0], [4, 0], [0, -4], [0, 4], [-4, -4], [4, 4], [-4, 4], [4, -4]]) {
      ctx.fillText(String(i + 1), cx + ox, cy + cell * 4 + oy)
    }
    ctx.fillStyle = '#fff'
    ctx.fillText(String(i + 1), cx, cy + cell * 4)
  }
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.magFilter = NearestFilter
  return tex
}

interface Save {
  v: number
  p: number[]
  inv: [number, number][]
  sel: number
  coins: number[]
  edits: number[]
}

function readSave(): Save | null {
  try {
    const save = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null')
    return save?.v === SAVE_VERSION && Array.isArray(save.edits) && Array.isArray(save.coins) ? save : null
  } catch {
    return null
  }
}

export async function createFactory(opts: FactoryOptions) {
  const { stage: root, canvas, reducedMotion } = opts
  const states = { ...opts.states }
  let stats = { ...opts.stats }

  // Carga la fuente en paralelo mientras se genera el mundo y las texturas
  const fontReady = Promise.race([
    document.fonts.load('30px Pixel'),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ])

  const isMobile =
    matchMedia('(pointer: coarse), (hover: none)').matches ||
    (navigator.maxTouchPoints > 0 && Math.min(window.screen.width, window.screen.height) <= 920)
  const lowEnd =
    isMobile &&
    ((navigator.hardwareConcurrency || 4) <= 4 ||
      ((navigator as { deviceMemory?: number }).deviceMemory ?? 4) <= 4)
  const maxDpr = Math.min(window.devicePixelRatio || 1, isMobile ? (lowEnd ? 1.25 : 1.5) : 2)
  let dpr = maxDpr
  const renderer = new WebGLRenderer({
    canvas,
    antialias: !isMobile && maxDpr < 2,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(dpr)
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.14

  const scene = new Scene()
  scene.matrixAutoUpdate = false
  const hubFog = isMobile ? [52, 150] : HUB_FOG
  const fog = new Fog(0x06143a, hubFog[0], hubFog[1])
  scene.fog = fog
  const camera = new PerspectiveCamera(70, 1, 0.08, isMobile ? 200 : 260)
  camera.rotation.order = 'YXZ'
  scene.add(camera)

  const aniso = Math.min(isMobile ? 2 : 4, renderer.capabilities.getMaxAnisotropy())
  const { canvas: blockCanvas, arrayTex: blockArrayTex } = blockAtlas()
  blockArrayTex.anisotropy = aniso
  const propTex = pixelTexture(16, (_x, _y, rand) => 0.86 + rand() * 0.14)
  propTex.anisotropy = aniso
  const stripes = pixelTexture(8, (_x, y, rand) => (y < 4 ? 0.72 : 0.95) + rand() * 0.05)
  // Cuarto canal del color de vértice: 0-1 es la luz de farolas que recibe, 2 brilla con luz propia.
  // aOcc: oclusión ambiental y sombra horneada; los modelos no lo llevan y valen 0
  const ambient = { value: new Color(1, 1, 1) }
  const lampBase = new Color(0, 0, 0)
  const lamp = { value: new Color(0, 0, 0) }
  const shadowSize = isMobile ? (lowEnd ? 512 : 768) : 2048
  // RedFormat (R8, 1 byte/px en vez de RGBA8 4 bytes/px) y sin mipmaps: ahorra 12 MB de VRAM
  const shadowTarget = new WebGLRenderTarget(shadowSize, shadowSize, {
    format: RedFormat,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: false,
  })
  shadowTarget.depthTexture = new DepthTexture(shadowSize, shadowSize)
  shadowTarget.depthTexture.compareFunction = LessEqualCompare
  shadowTarget.depthTexture.magFilter = shadowTarget.depthTexture.minFilter = LinearFilter
  const light = {
    uSky: { value: new Color() },
    uGround: { value: new Color() },
    uSun: { value: new Color() },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uLamp: lamp,
    uShadowMap: { value: shadowTarget.depthTexture },
    uShadowMatrix: { value: new Matrix4() },
    uShadowOn: { value: 0 },
    uLightVol: { value: null as Data3DTexture | null },
    uBlockAtlas: { value: blockArrayTex },
  }
  // Los modelos y el terreno leen la luz de farolas del volumen 3D (uLightVol).
  // El terreno usa sampler2DArray para repetir texturas sobre quads fusionados (greedy meshing)
  const lit = (material: MeshBasicMaterial, flash?: { value: number }, model = false, foreground = false) => {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, light)
      if (flash) shader.uniforms.uFlash = flash
      shader.vertexShader =
        `attribute vec2 aOcc;
        ${model ? '' : 'attribute float aTile;\nuniform vec3 uSky;\nuniform vec3 uGround;\nuniform vec3 uSunDir;\nvarying float vTile;\nvarying vec2 vBlockUv;\nvarying vec3 vSky;\nvarying float vNdl;\n'}uniform mat4 uShadowMatrix;
        varying vec2 vOcc;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying vec3 vShadowCoord;
        ` +
        shader.vertexShader.replace(
          '#include <fog_vertex>',
          `#include <fog_vertex>
          vOcc = aOcc;
          ${model ? '' : 'vTile = aTile;\nvBlockUv = uv;'}
          vec4 wp = vec4(transformed, 1.0);
          vec3 wn = normal;
          #ifdef USE_BATCHING
            wp = batchingMatrix * wp;
            wn = mat3(batchingMatrix) * wn;
          #endif
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
            wn = mat3(instanceMatrix) * wn;
          #endif
          vWorld = (modelMatrix * wp).xyz;
          vNormalW = mat3(modelMatrix) * wn;
          ${
            model
              ? ''
              : `vSky = mix(uGround, uSky, 0.5 + 0.5 * vNormalW.y) * dot(vNormalW * vNormalW, vec3(0.8, 1.0, 0.92));
          vNdl = max(dot(vNormalW, uSunDir), 0.0);`
          }
          vShadowCoord = (uShadowMatrix * vec4(vWorld + ${model ? 'normalize(vNormalW)' : 'vNormalW'} * 0.05, 1.0)).xyz;${
            foreground ? '\ngl_Position.z = gl_Position.z * 0.02 - 0.98 * gl_Position.w;' : ''
          }`
        )
      shader.fragmentShader =
        `${model ? 'uniform vec3 uSky;\nuniform vec3 uGround;\n' : 'uniform mediump sampler2DArray uBlockAtlas;\nvarying float vTile;\nvarying vec2 vBlockUv;\nvarying vec3 vSky;\nvarying float vNdl;\n'}uniform vec3 uSun;
        uniform vec3 uSunDir;
        uniform vec3 uLamp;
        uniform float uFlash;
        uniform sampler2DShadow uShadowMap;
        uniform float uShadowOn;
        uniform highp sampler3D uLightVol;
        varying vec2 vOcc;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying vec3 vShadowCoord;
        // Ruido de gradiente intercalado para rotar las 4 muestras PCF y suavizar los bordes de sombra sin coste extra
        float ign(vec2 p) {
          return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
        }
        float sunVisibility() {
          float baked = 1.0 - vOcc.y;
          if (uShadowOn < 0.5) return baked;
          vec3 c = vShadowCoord;
          float edge = max(abs(c.x - 0.5), abs(c.y - 0.5)) * 2.0;
          if (edge >= 1.0 || c.z >= 1.0) return baked;
          float a = ign(gl_FragCoord.xy) * 6.2831853;
          float ca = cos(a);
          float sa = sin(a);
          mat2 rot = mat2(ca, -sa, sa, ca);
          vec2 t = vec2(${(1.35 / shadowSize).toFixed(8)});
          ${
            isMobile
              ? `float s = texture(uShadowMap, vec3(c.xy + (rot * vec2(-0.65, -0.35)) * t, c.z));
          s += texture(uShadowMap, vec3(c.xy + (rot * vec2(0.65, 0.35)) * t, c.z));
          return mix(s * 0.5, baked, smoothstep(0.8, 1.0, edge));`
              : `float s = texture(uShadowMap, vec3(c.xy + (rot * vec2(-0.707, -0.35)) * t, c.z));
          s += texture(uShadowMap, vec3(c.xy + (rot * vec2(0.35, -0.707)) * t, c.z));
          s += texture(uShadowMap, vec3(c.xy + (rot * vec2(0.707, 0.35)) * t, c.z));
          s += texture(uShadowMap, vec3(c.xy + (rot * vec2(-0.35, 0.707)) * t, c.z));
          return mix(s * 0.25, baked, smoothstep(0.8, 1.0, edge));`
          }
        }
        float lampLight(vec3 n, float baked) {
          vec3 p = vWorld + n * ${model ? '0.3' : '0.5'};
          float level = texture(uLightVol, vec3(p.x / ${W}.0, p.z / ${D}.0, p.y / ${H}.0)).r * ${255 / LIGHT_MAX};
          float clamped = min(level, 1.0);
          float vol = level > 0.001 ? ${isMobile ? 'clamped * clamped' : 'pow(clamped, 1.7)'} : 0.0;
          return ${model ? 'max(baked, vol)' : 'vol'};
        }
        ` +
        shader.fragmentShader
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
          vec3 viewDir = normalize(cameraPosition - vWorld);
          ${
            model
              ? `if (vColor.a < 1.5) {
            vec3 n = normalize(vNormalW);
            float ao = 1.0 - vOcc.x;
            vec3 sky = mix(uGround, uSky, 0.5 + 0.5 * n.y) * dot(n * n, vec3(0.8, 1.0, 0.92));
            float ndl = max(dot(n, uSunDir), 0.0);
            float vis = ndl > 0.0 ? sunVisibility() : 0.0;
            float sun = ndl * vis * (0.5 + 0.5 * ao);
            vec3 halfV = normalize(uSunDir + viewDir);
            float spec = pow(max(dot(n, halfV), 0.0), 28.0) * 0.22 * vis * step(0.01, ndl);
            float rimBase = 1.0 - max(dot(n, viewDir), 0.0);
            float rim = rimBase * rimBase * rimBase * 0.14 * ao;
            diffuseColor.rgb = diffuseColor.rgb * (sky * ao + uSun * sun + uLamp * lampLight(n, min(vColor.a, 1.0))) + uSun * spec + sky * rim;
          } else {
            diffuseColor.rgb *= 1.3;
          }`
              : `diffuseColor *= texture(uBlockAtlas, vec3(vBlockUv, vTile));
          if (vColor.a < 0.5) {
            vec3 n = vNormalW;
            ivec3 cell = ivec3(floor(vWorld - n * 0.01));
            uint h = uint(cell.x * 73856093) ^ uint(cell.y * 19349663) ^ uint(cell.z * 83492791);
            diffuseColor.rgb *= 0.95 + float(h & 15u) * 0.00625;
            float ao = 1.0 - vOcc.x;
            float vis = vNdl > 0.0 ? sunVisibility() : 0.0;
            float sun = vNdl * vis * (0.5 + 0.5 * ao);
            // Brillo especular según el tipo de bloque (acero, baldosa, tubería, chocolate, cristal)
            int ti = int(vTile + 0.5);
            float shiny = (ti == 14) ? 0.45 : (ti == 0 || ti == 1 || ti == 8) ? 0.22 : (ti == 4) ? 0.18 : 0.06;
            float power = (ti == 14) ? 48.0 : (ti == 0 || ti == 1 || ti == 8) ? 26.0 : 16.0;
            vec3 halfV = normalize(uSunDir + viewDir);
            float spec = vis > 0.01 ? pow(max(dot(n, halfV), 0.0), power) * shiny * vis : 0.0;
            float rimBase = 1.0 - max(dot(n, viewDir), 0.0);
            float rim = rimBase * rimBase * rimBase * (ti == 14 ? 0.28 : 0.09) * ao;
            diffuseColor.rgb = diffuseColor.rgb * (vSky * ao + uSun * sun + uLamp * lampLight(n, 0.0)) + uSun * spec + vSky * rim;
          } else {
            diffuseColor.rgb *= 1.35;
          }`
          }
          diffuseColor.a = 1.0;` +
              (flash ? '\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), uFlash);' : '')
          )
          .replace(
            '#include <fog_fragment>',
            `#ifdef USE_FOG
              float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
              float sDot = max(dot(-viewDir, uSunDir), 0.0);
              float sDot2 = sDot * sDot;
              float sunScatter = sDot2 * sDot2 * sDot2;
              vec3 scatterFog = mix(fogColor, fogColor + uSun * 0.35, sunScatter * 0.75);
              gl_FragColor.rgb = mix(gl_FragColor.rgb, scatterFog, fogFactor);
            #endif`
          )
    }
    material.customProgramCacheKey = () => `lit:${flash ? 1 : 0}:${model ? 1 : 0}:${foreground ? 1 : 0}`
    return material
  }
  const mat = lit(new MeshBasicMaterial({ vertexColors: true }))
  const matProp = lit(new MeshBasicMaterial({ vertexColors: true, map: propTex }), undefined, true)
  const foeFlash = { value: 0 }
  const matFoe = lit(new MeshBasicMaterial({ vertexColors: true, map: propTex }), foeFlash, true)
  const matHand = lit(new MeshBasicMaterial({ vertexColors: true, map: propTex, fog: false }), undefined, true, true)
  // Chocolate fundido con brillos especulares y fresnel líquido
  const matScroll = new MeshBasicMaterial({ vertexColors: true, map: stripes })
  matScroll.onBeforeCompile = (shader) => {
    shader.uniforms.uSun = light.uSun
    shader.uniforms.uSunDir = light.uSunDir
    shader.uniforms.uSky = light.uSky
    shader.vertexShader =
      'varying vec3 vLiqWorld;\n' +
      shader.vertexShader.replace(
        '#include <fog_vertex>',
        '#include <fog_vertex>\nvLiqWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      )
    shader.fragmentShader =
      'uniform vec3 uSun;\nuniform vec3 uSunDir;\nuniform vec3 uSky;\nvarying vec3 vLiqWorld;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 lv = normalize(cameraPosition - vLiqWorld);
        vec3 ln = normalize(vec3(sin(vLiqWorld.x * 3.0) * 0.06, 1.0, cos(vLiqWorld.z * 3.0) * 0.06));
        float lspec = pow(max(dot(ln, normalize(uSunDir + lv)), 0.0), 42.0) * 0.55;
        float lfres = pow(1.0 - max(dot(ln, lv), 0.0), 3.0) * 0.22;
        diffuseColor.rgb += uSun * lspec + uSky * lfres;`
      )
  }
  const props = buildProps()
  const skin = buildSkin()
  const matHeld = lit(new MeshBasicMaterial({ vertexColors: true, map: propTex }), undefined, true)
  const models = buildModels()
  const disposables: { dispose: () => void }[] = [
    shadowTarget,
    shadowTarget.depthTexture,
    blockArrayTex,
    propTex,
    stripes,
    mat,
    matProp,
    matFoe,
    matHand,
    matScroll,
    matHeld,
    ...Object.values(props),
    ...Object.values(skin),
  ]

  const fixed = <T extends Object3D>(obj: T, parent: Object3D = scene) => {
    obj.matrixAutoUpdate = false
    obj.updateMatrix()
    parent.add(obj)
    return obj
  }
  const moving = <T extends Object3D>(obj: T) => (scene.add(obj), obj)
  const castShadow = <T extends Object3D>(obj: T) => {
    obj.layers.enable(SHADOW_LAYER)
    return obj
  }

  // Mundo: la fábrica generada más los cambios guardados del jugador
  const world = generate()
  const hubBlocks = world.blocks
  const SPOT = world.spots
  const original = hubBlocks.slice()
  const save = readSave()
  const edits = new Map<number, number>()
  if (save) {
    for (let i = 0; i < save.edits.length; i += 2) {
      const index = save.edits[i]
      const type = save.edits[i + 1]
      const valid = type === B.AIR || (BLOCKS[type] && !BLOCKS[type].fixed)
      if (!(index >= 0 && index < hubBlocks.length) || !valid || BLOCKS[original[index]]?.fixed) continue
      hubBlocks[index] = type
      edits.set(index, type)
    }
  }
  // Rejilla activa: la fábrica o la fase que hay detrás de una puerta
  let blocks = hubBlocks

  const get = (x: number, y: number, z: number) =>
    x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D ? B.AIR : blocks[at(x, y, z)]
  const isOpaque = (t: number) => t !== B.AIR && t !== B.LIQUID && t !== B.DOOR_CELL
  const isSolid = (t: number) => t !== B.AIR && t !== B.LIQUID
  const occ = (x: number, y: number, z: number) => (isOpaque(get(x, y, z)) ? 1 : 0)

  const palette = new Float32Array(64 * 3)
  const palette8 = new Uint8Array(64 * 3)
  const color = new Color()
  for (const [id, def] of Object.entries(BLOCKS)) {
    color.set(def.color)
    const idx3 = Number(id) * 3
    palette.set([color.r, color.g, color.b], idx3)
    palette8[idx3] = Math.round(color.r * 255)
    palette8[idx3 + 1] = Math.round(color.g * 255)
    palette8[idx3 + 2] = Math.round(color.b * 255)
  }

  // Luz de farolas, ventanas y guirnaldas por celdas, y un destello en cada cara a la vista
  const CELLS = hubBlocks.length
  const LAYER = W * D
  const OPAQUE = new Uint8Array(64)
  const GLOW = new Uint8Array(64)
  for (let t = 1; t < 64; t++) {
    OPAQUE[t] = isOpaque(t) ? 1 : 0
    GLOW[t] = BLOCKS[t]?.glow ? 1 : 0
  }
  const hubLightVol = new Uint8Array(CELLS)
  const stageLightVol = new Uint8Array(CELLS)
  let lightVol = hubLightVol
  const lightTex = new Data3DTexture(lightVol, W, D, H)
  lightTex.format = RedFormat
  lightTex.magFilter = lightTex.minFilter = LinearFilter
  lightTex.unpackAlignment = 1
  light.uLightVol.value = lightTex
  disposables.push(lightTex)
  const glowTex = glowTexture()
  const glowMat = new PointsMaterial({
    map: glowTex,
    size: isMobile ? 2.8 : 3.4,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
  })
  const hubGlowGeo = new BufferGeometry()
  const hubGlows = new Points(hubGlowGeo, glowMat)
  hubGlows.frustumCulled = false
  hubGlows.renderOrder = 5
  fixed(hubGlows)
  const stageGlowGeo = new BufferGeometry()
  const stageGlows = new Points(stageGlowGeo, glowMat)
  stageGlows.frustumCulled = false
  stageGlows.renderOrder = 5
  stageGlows.visible = false
  fixed(stageGlows)
  let glowGeo = hubGlowGeo
  disposables.push(hubGlowGeo, stageGlowGeo, glowTex, glowMat)
  const GLOW_LIMIT = isMobile ? 1200 : 2400
  const buildGlows = (x0 = 0, y0 = 0, z0 = 0, x1 = W - 1, y1 = H - 1, z1 = D - 1) => {
    const spots: number[] = []
    const tints: number[] = []
    for (let y = y0; y <= y1 && spots.length <= GLOW_LIMIT; y++) {
      const yOff = y << 14
      for (let z = z0; z <= z1 && spots.length <= GLOW_LIMIT; z++) {
        const yzOff = yOff | (z << 7)
        for (let x = x0; x <= x1 && spots.length <= GLOW_LIMIT; x++) {
          const t = blocks[yzOff | x]
          if (!GLOW[t]) continue
          const r = palette[t * 3] * 0.5
          const g = palette[t * 3 + 1] * 0.5
          const b = palette[t * 3 + 2] * 0.5
          for (let f = 0; f < 6; f++) {
            const n = FACES[f].n
            if (OPAQUE[get(x + n[0], y + n[1], z + n[2])]) continue
            spots.push(x + 0.5 + n[0] * 0.56, y + 0.5 + n[1] * 0.56, z + 0.5 + n[2] * 0.56)
            tints.push(r, g, b)
          }
        }
      }
    }
    glowGeo.dispose()
    glowGeo.setAttribute('position', new BufferAttribute(new Float32Array(spots), 3))
    glowGeo.setAttribute('color', new BufferAttribute(new Float32Array(tints), 3))
  }

  // La luz se propaga celda a celda por el aire y pierde un nivel en cada paso: no atraviesa paredes
  const queue = new Int32Array(CELLS)
  const box = [0, 0, 0, 0, 0, 0]
  let queued = 0
  const shine = (i: number, level: number) => {
    if (lightVol[i] >= level || OPAQUE[blocks[i]] || queued >= CELLS) return
    lightVol[i] = level
    queue[queued++] = i
  }
  const shineAround = (i: number, level: number) => {
    const x = i & 127
    const z = (i >> 7) & 127
    const y = i >> 14
    const inX = x >= box[0] && x <= box[3]
    const inY = y >= box[1] && y <= box[4]
    const inZ = z >= box[2] && z <= box[5]
    if (inY && inZ) {
      if (x + 1 >= box[0] && x < box[3]) shine(i + 1, level)
      if (x > box[0] && x - 1 <= box[3]) shine(i - 1, level)
    }
    if (inX && inZ) {
      if (y + 1 >= box[1] && y < box[4]) shine(i + LAYER, level)
      if (y > box[1] && y - 1 <= box[4]) shine(i - LAYER, level)
    }
    if (inX && inY) {
      if (z + 1 >= box[2] && z < box[5]) shine(i + W, level)
      if (z > box[2] && z - 1 <= box[5]) shine(i - W, level)
    }
  }
  // Recalcula solo la caja dada: se siembra con sus focos y con la luz que ya había justo fuera
  const computeLight = (x0 = 0, y0 = 0, z0 = 0, x1 = W - 1, y1 = H - 1, z1 = D - 1) => {
    box[0] = Math.max(0, x0)
    box[1] = Math.max(0, y0)
    box[2] = Math.max(0, z0)
    box[3] = Math.min(W - 1, x1)
    box[4] = Math.min(H - 1, y1)
    box[5] = Math.min(D - 1, z1)
    for (let y = box[1]; y <= box[4]; y++) {
      for (let z = box[2]; z <= box[5]; z++) lightVol.fill(0, at(box[0], y, z), at(box[3], y, z) + 1)
    }
    queued = 0
    const ex = Math.min(W - 1, box[3] + 1)
    const ey = Math.min(H - 1, box[4] + 1)
    const ez = Math.min(D - 1, box[5] + 1)
    for (let y = Math.max(0, box[1] - 1); y <= ey; y++) {
      const outY = y < box[1] || y > box[4]
      for (let z = Math.max(0, box[2] - 1); z <= ez; z++) {
        const outZ = outY || z < box[2] || z > box[5]
        const row = (y << 14) | (z << 7)
        for (let x = Math.max(0, box[0] - 1); x <= ex; x++) {
          const i = row | x
          if (GLOW[blocks[i]]) shineAround(i, LIGHT_MAX)
          else if (lightVol[i] > 1 && (outZ || x < box[0] || x > box[3])) queue[queued++] = i
        }
      }
    }
    for (let head = 0; head < queued; head++) {
      const level = lightVol[queue[head]] - 1
      if (level > 0) shineAround(queue[head], level)
    }
    lightTex.needsUpdate = true
  }
  const levelAt = (x: number, y: number, z: number) =>
    x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D ? 0 : lightVol[x | (z << 7) | (y << 14)]

  const hubRoof = new Int8Array(W * D).fill(-1)
  const stageRoof = new Int8Array(W * D).fill(-1)
  let roof = hubRoof
  let hubTop = 0
  let top = 0
  const computeRoof = (x0 = 0, z0 = 0, x1 = W - 1, z1 = D - 1, yMax = H - 1) => {
    for (let z = z0; z <= z1; z++) {
      const zOff = z << 7
      for (let x = x0; x <= x1; x++) {
        let y = yMax
        while (y >= 0 && !OPAQUE[blocks[x | zOff | (y << 14)]]) y--
        roof[x | zOff] = y
        if (y >= top) top = y + 1
      }
    }
  }

  // Sombras proyectadas: un rayo por celda hacia el sol o la luna, con memoización en el recorrido DDA
  const sunDir = new Vector3(0, 1, 0)
  const hubSunDir = new Vector3(0, 1, 0)
  const hubSunVol = new Uint8Array(CELLS)
  const stageSunVol = new Uint8Array(CELLS)
  let sunVol = hubSunVol
  let stepX = 1
  let stepZ = 1
  let spanX = Infinity
  let spanY = 1
  let spanZ = Infinity
  const setSun = (dir: Vector3) => {
    sunDir.copy(dir)
    stepX = dir.x > 0 ? 1 : -1
    stepZ = dir.z > 0 ? 1 : -1
    spanX = 1 / Math.abs(dir.x)
    spanY = 1 / dir.y
    spanZ = 1 / Math.abs(dir.z)
    sunVol.fill(0)
  }
  const sunAt = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D) return 1
    const i = x | (z << 7) | (y << 14)
    const hit0 = sunVol[i]
    if (hit0) return hit0 - 1
    let lit = 1
    let tx = spanX * 0.5
    let ty = spanY * 0.5
    let tz = spanZ * 0.5
    for (;;) {
      if (tx < ty && tx < tz) {
        x += stepX
        tx += spanX
        if (x < 0 || x >= W) break
      } else if (ty < tz) {
        y++
        ty += spanY
        if (y >= top) break
      } else {
        z += stepZ
        tz += spanZ
        if (z < 0 || z >= D) break
      }
      const ni = x | (z << 7) | (y << 14)
      if (OPAQUE[blocks[ni]]) {
        lit = 0
        break
      }
      const cached = sunVol[ni]
      if (cached) {
        lit = cached - 1
        break
      }
    }
    sunVol[i] = lit + 1
    return lit
  }

  const toGeometry = (pos: number[], col: number[], uv: number[], idx: number[], colorSize: number) => {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    geo.setAttribute('color', new BufferAttribute(new Float32Array(col), colorSize))
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    geo.setIndex(new BufferAttribute(pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1))
    geo.computeBoundingSphere()
    return geo
  }

  // Buffers reutilizables compactos (26 B/vértice en vez de 51 B/vértice) sin generar basura en el GC
  let capV = 32768
  let sPos = new Float32Array(capV * 3)
  let sCol = new Uint8Array(capV * 4)
  let sUv = new Float32Array(capV * 2)
  let sNrm = new Int8Array(capV * 3)
  let sOcc = new Uint8Array(capV * 2)
  let sTile = new Uint8Array(capV)
  let sIdx = new Uint32Array((capV >> 2) * 6)
  const ensureScratch = (needV: number) => {
    if (needV <= capV) return
    while (capV < needV) capV <<= 1
    const grow = <T extends Float32Array | Int8Array | Uint8Array | Uint32Array>(
      old: T,
      Ctor: new (len: number) => T,
      len: number
    ) => {
      const next = new Ctor(len)
      next.set(old)
      return next
    }
    sPos = grow(sPos, Float32Array, capV * 3)
    sCol = grow(sCol, Uint8Array, capV * 4)
    sUv = grow(sUv, Float32Array, capV * 2)
    sNrm = grow(sNrm, Int8Array, capV * 3)
    sOcc = grow(sOcc, Uint8Array, capV * 2)
    sTile = grow(sTile, Uint8Array, capV)
    sIdx = grow(sIdx, Uint32Array, (capV >> 2) * 6)
  }

  // Solo se generan las caras a la vista, con greedy meshing, oclusión ambiental, sombra y luz por vértice
  const CHUNKS_X = W / CHUNK
  const CHUNKS_COUNT = CHUNKS_X * (D / CHUNK)
  const hubTerrain = fixed(new Group())
  const stageTerrain = fixed(new Group())
  stageTerrain.visible = false
  const hubChunks: (Mesh | null)[] = new Array(CHUNKS_COUNT).fill(null)
  const stageChunks: (Mesh | null)[] = new Array(CHUNKS_COUNT).fill(null)
  let chunks = hubChunks
  let terrainGroup = hubTerrain
  const pending = new Set<number>()
  const mark = (set: Set<number>, x0: number, z0: number, x1: number, z1: number) => {
    const cx1 = Math.min(CHUNKS_X - 1, Math.floor(x1 / CHUNK))
    const cz1 = Math.min(D / CHUNK - 1, Math.floor(z1 / CHUNK))
    for (let cz = Math.max(0, Math.floor(z0 / CHUNK)); cz <= cz1; cz++) {
      for (let cx = Math.max(0, Math.floor(x0 / CHUNK)); cx <= cx1; cx++) set.add(cx + cz * CHUNKS_X)
    }
  }
  // Con el sol muy bajo las sombras taparían todo: se limita su inclinación
  const aim = new Vector3()
  const aimSun = (body: Vector3) => {
    aim.copy(body)
    if (aim.y < SUN_MIN) {
      const k = Math.sqrt(1 - SUN_MIN * SUN_MIN) / Math.hypot(aim.x, aim.z)
      aim.set(aim.x * k, SUN_MIN, aim.z * k)
    }
    if (aim.dot(sunDir) > 0.9995) return
    setSun(aim)
    light.uSunDir.value.copy(sunDir)
    for (let ci = 0; ci < chunks.length; ci++) pending.add(ci)
  }
  const maskKey = new Int32Array(CHUNK * H)
  const buildChunk = (ci: number) => {
    const x0 = (ci % CHUNKS_X) * CHUNK
    const z0 = Math.floor(ci / CHUNKS_X) * CHUNK
    let yMax = -1
    for (let z = z0; z < z0 + CHUNK; z++) {
      const zOff = z << 7
      for (let x = x0; x < x0 + CHUNK; x++) {
        const r = roof[x | zOff]
        if (r > yMax) yMax = r
      }
    }
    const old = chunks[ci]
    if (old) {
      terrainGroup.remove(old)
      old.geometry.dispose()
      chunks[ci] = null
    }
    if (yMax < 0) return

    let vCount = 0
    let iCount = 0

    const emitQuad = (
      x0v: number, y0v: number, z0v: number,
      x1v: number, y1v: number, z1v: number,
      x2v: number, y2v: number, z2v: number,
      x3v: number, y3v: number, z3v: number,
      nx: number, ny: number, nz: number,
      key: number, rw: number, rh: number
    ) => {
      ensureScratch(vCount + 4)
      const base = vCount
      const p3 = base * 3
      const p4 = base * 4
      const p2 = base * 2
      const t = key & 63
      const r = palette8[t * 3]
      const g = palette8[t * 3 + 1]
      const b = palette8[t * 3 + 2]
      const tile = TILE_OF[t] ?? TILE.PLATE
      const em = GLOW[t] ? 255 : 0
      const ao0 = AO[(key >> 6) & 3]
      const ao1 = AO[(key >> 8) & 3]
      const ao2 = AO[(key >> 10) & 3]
      const ao3 = AO[(key >> 12) & 3]
      const op0 = (key >> 14) & 7
      const op1 = (key >> 17) & 7
      const op2 = (key >> 20) & 7
      const op3 = (key >> 23) & 7

      sPos[p3] = x0v; sPos[p3 + 1] = y0v; sPos[p3 + 2] = z0v
      sPos[p3 + 3] = x1v; sPos[p3 + 4] = y1v; sPos[p3 + 5] = z1v
      sPos[p3 + 6] = x2v; sPos[p3 + 7] = y2v; sPos[p3 + 8] = z2v
      sPos[p3 + 9] = x3v; sPos[p3 + 10] = y3v; sPos[p3 + 11] = z3v

      for (let k = 0; k < 4; k++) {
        const k3 = p3 + k * 3
        const k4 = p4 + k * 4
        sNrm[k3] = nx; sNrm[k3 + 1] = ny; sNrm[k3 + 2] = nz
        sCol[k4] = r; sCol[k4 + 1] = g; sCol[k4 + 2] = b; sCol[k4 + 3] = em
        sTile[base + k] = tile
      }
      sOcc[p2] = Math.round((1 - ao0) * 255); sOcc[p2 + 1] = Math.round((1 - op0 * 0.25) * 255)
      sOcc[p2 + 2] = Math.round((1 - ao1) * 255); sOcc[p2 + 3] = Math.round((1 - op1 * 0.25) * 255)
      sOcc[p2 + 4] = Math.round((1 - ao2) * 255); sOcc[p2 + 5] = Math.round((1 - op2 * 0.25) * 255)
      sOcc[p2 + 6] = Math.round((1 - ao3) * 255); sOcc[p2 + 7] = Math.round((1 - op3 * 0.25) * 255)

      sUv[p2] = 0; sUv[p2 + 1] = 0
      sUv[p2 + 2] = rw; sUv[p2 + 3] = 0
      sUv[p2 + 4] = rw; sUv[p2 + 5] = rh
      sUv[p2 + 6] = 0; sUv[p2 + 7] = rh

      const l0 = ao0 * (0.58 + op0 * 0.105)
      const l1 = ao1 * (0.58 + op1 * 0.105)
      const l2 = ao2 * (0.58 + op2 * 0.105)
      const l3 = ao3 * (0.58 + op3 * 0.105)
      if (l0 + l2 >= l1 + l3) {
        sIdx[iCount] = base; sIdx[iCount + 1] = base + 1; sIdx[iCount + 2] = base + 2
        sIdx[iCount + 3] = base; sIdx[iCount + 4] = base + 2; sIdx[iCount + 5] = base + 3
      } else {
        sIdx[iCount] = base + 1; sIdx[iCount + 1] = base + 2; sIdx[iCount + 2] = base + 3
        sIdx[iCount + 3] = base + 1; sIdx[iCount + 4] = base + 3; sIdx[iCount + 5] = base
      }
      vCount += 4
      iCount += 6
    }

    // Empaqueta (t, ao0..3, open0..3) en 26 bits para fusionar también tiras 1D con gradiente lineal de AO/sombra
    const UNIFORM_GLOW_BITS = (3 << 6) | (3 << 8) | (3 << 10) | (3 << 12) | (4 << 14) | (4 << 17) | (4 << 20) | (4 << 23)
    const packCell = (x: number, y: number, z: number, t: number, f: number, sunlit: boolean) => {
      if (GLOW[t]) return t | UNIFORM_GLOW_BITS
      const face = FACES[f]
      const n = face.n
      const px = x + n[0]
      const py = y + n[1]
      const pz = z + n[2]
      const fs = sunlit ? sunAt(px, py, pz) : 1
      let key = t
      for (let k = 0; k < 4; k++) {
        const c = face.c[k]
        const o1 = c[face.a[0]] * 2 - 1
        const o2 = c[face.a[1]] * 2 - 1
        const ux = face.a[0] === 0 ? o1 : 0
        const uy = face.a[0] === 1 ? o1 : 0
        const wy = face.a[1] === 1 ? o2 : 0
        const wz = face.a[1] === 2 ? o2 : 0
        const s1 = occ(px + ux, py + uy, pz)
        const s2 = occ(px, py + wy, pz + wz)
        const s3 = occ(px + ux, py + uy + wy, pz + wz)
        const hid = s3 || (s1 && s2)
        const open = sunlit
          ? fs +
            (s1 ? fs : sunAt(px + ux, py + uy, pz)) +
            (s2 ? fs : sunAt(px, py + wy, pz + wz)) +
            (hid ? fs : sunAt(px + ux, py + uy + wy, pz + wz))
          : 4
        const aoIdx = s1 && s2 ? 0 : 3 - s1 - s2 - s3
        key |= (aoIdx << (6 + k * 2)) | (open << (14 + k * 3))
      }
      return key
    }

    const greedyMerge = (w: number, h: number, emit: (i: number, j: number, rw: number, rh: number, key: number) => void) => {
      for (let j = 0; j < h; j++) {
        const row = j * w
        for (let i = 0; i < w; ) {
          const key = maskKey[row + i]
          if (!key) {
            i++
            continue
          }
          const ao0 = (key >> 6) & 3
          const ao1 = (key >> 8) & 3
          const ao2 = (key >> 10) & 3
          const ao3 = (key >> 12) & 3
          const op0 = (key >> 14) & 7
          const op1 = (key >> 17) & 7
          const op2 = (key >> 20) & 7
          const op3 = (key >> 23) & 7
          // Solo se fusiona a lo largo de un eje si la iluminación es constante en ese eje (interpolación 100 % exacta)
          const constU = ao0 === ao1 && ao3 === ao2 && op0 === op1 && op3 === op2
          const constV = ao0 === ao3 && ao1 === ao2 && op0 === op3 && op1 === op2
          let rw = 1
          if (constU) {
            while (i + rw < w && maskKey[row + i + rw] === key) rw++
          }
          let rh = 1
          if (constV) {
            outer: while (j + rh < h) {
              const nextRow = (j + rh) * w + i
              for (let k = 0; k < rw; k++) {
                if (maskKey[nextRow + k] !== key) break outer
              }
              rh++
            }
          }
          for (let dj = 0; dj < rh; dj++) maskKey.fill(0, (j + dj) * w + i, (j + dj) * w + i + rw)
          emit(i, j, rw, rh, key)
          i += rw
        }
      }
    }

    const hSlice = yMax + 1
    // Caras +X (0) y -X (1): planos en x, máscara (z, y)
    for (let f = 0; f < 2; f++) {
      const nx = f === 0 ? 1 : -1
      const sunlit = nx * sunDir.x > 0
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx
        const px = x + nx
        let any = false
        for (let y = 0; y <= yMax; y++) {
          const yOff = y << 14
          const row = y * CHUNK
          for (let lz = 0; lz < CHUNK; lz++) {
            const z = z0 + lz
            const t = blocks[x | (z << 7) | yOff]
            if (!OPAQUE[t] || (px >= 0 && px < W && OPAQUE[blocks[px | (z << 7) | yOff]])) {
              maskKey[row + lz] = 0
              continue
            }
            maskKey[row + lz] = packCell(x, y, z, t, f, sunlit)
            any = true
          }
        }
        if (!any) continue
        const fx = f === 0 ? x + 1 : x
        greedyMerge(CHUNK, hSlice, (i, j, rw, rh, key) => {
          const zs = z0 + i
          if (f === 0) emitQuad(fx, j, zs + rw, fx, j, zs, fx, j + rh, zs, fx, j + rh, zs + rw, 1, 0, 0, key, rw, rh)
          else emitQuad(fx, j, zs, fx, j, zs + rw, fx, j + rh, zs + rw, fx, j + rh, zs, -1, 0, 0, key, rw, rh)
        })
      }
    }

    // Caras +Y (2) y -Y (3): planos en y, máscara (x, z)
    for (let f = 2; f < 4; f++) {
      const ny = f === 2 ? 1 : -1
      const sunlit = ny > 0
      for (let y = 0; y <= yMax; y++) {
        const py = y + ny
        const yOff = y << 14
        const pyOff = py << 14
        let any = false
        for (let lz = 0; lz < CHUNK; lz++) {
          const z = z0 + lz
          const zOff = z << 7
          const row = lz * CHUNK
          for (let lx = 0; lx < CHUNK; lx++) {
            const x = x0 + lx
            const t = blocks[x | zOff | yOff]
            if (!OPAQUE[t] || (py >= 0 && py < H && OPAQUE[blocks[x | zOff | pyOff]])) {
              maskKey[row + lx] = 0
              continue
            }
            maskKey[row + lx] = packCell(x, y, z, t, f, sunlit)
            any = true
          }
        }
        if (!any) continue
        const fy = f === 2 ? y + 1 : y
        greedyMerge(CHUNK, CHUNK, (i, j, rw, rh, key) => {
          const xs = x0 + i
          const zs = z0 + j
          if (f === 2) emitQuad(xs, fy, zs + rh, xs + rw, fy, zs + rh, xs + rw, fy, zs, xs, fy, zs, 0, 1, 0, key, rw, rh)
          else emitQuad(xs, fy, zs, xs + rw, fy, zs, xs + rw, fy, zs + rh, xs, fy, zs + rh, 0, -1, 0, key, rw, rh)
        })
      }
    }

    // Caras +Z (4) y -Z (5): planos en z, máscara (x, y)
    for (let f = 4; f < 6; f++) {
      const nz = f === 4 ? 1 : -1
      const sunlit = nz * sunDir.z > 0
      for (let lz = 0; lz < CHUNK; lz++) {
        const z = z0 + lz
        const pz = z + nz
        const zOff = z << 7
        const pzOff = pz << 7
        let any = false
        for (let y = 0; y <= yMax; y++) {
          const yOff = y << 14
          const row = y * CHUNK
          for (let lx = 0; lx < CHUNK; lx++) {
            const x = x0 + lx
            const t = blocks[x | zOff | yOff]
            if (!OPAQUE[t] || (pz >= 0 && pz < D && OPAQUE[blocks[x | pzOff | yOff]])) {
              maskKey[row + lx] = 0
              continue
            }
            maskKey[row + lx] = packCell(x, y, z, t, f, sunlit)
            any = true
          }
        }
        if (!any) continue
        const fz = f === 4 ? z + 1 : z
        greedyMerge(CHUNK, hSlice, (i, j, rw, rh, key) => {
          const xs = x0 + i
          if (f === 4) emitQuad(xs, j, fz, xs + rw, j, fz, xs + rw, j + rh, fz, xs, j + rh, fz, 0, 0, 1, key, rw, rh)
          else emitQuad(xs + rw, j, fz, xs, j, fz, xs, j + rh, fz, xs + rw, j + rh, fz, 0, 0, -1, key, rw, rh)
        })
      }
    }

    if (!vCount) return
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(sPos.slice(0, vCount * 3), 3))
    geo.setAttribute('color', new BufferAttribute(sCol.slice(0, vCount * 4), 4, true))
    geo.setAttribute('uv', new BufferAttribute(sUv.slice(0, vCount * 2), 2))
    geo.setAttribute('normal', new BufferAttribute(sNrm.slice(0, vCount * 3), 3))
    geo.setAttribute('aOcc', new BufferAttribute(sOcc.slice(0, vCount * 2), 2, true))
    geo.setAttribute('aTile', new BufferAttribute(sTile.slice(0, vCount), 1))
    geo.setIndex(
      new BufferAttribute(
        vCount > 65535 ? sIdx.slice(0, iCount) : new Uint16Array(sIdx.subarray(0, iCount)),
        1
      )
    )
    geo.computeBoundingSphere()
    chunks[ci] = castShadow(fixed(new Mesh(geo, mat), terrainGroup))
  }

  // Chocolate fundido: una sola malla con la textura en movimiento (solo en la fábrica)
  let liquid: Mesh | null = null
  const buildLiquid = () => {
    const pos: number[] = []
    const col: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    const r = palette[B.LIQUID * 3]
    const g = palette[B.LIQUID * 3 + 1]
    const b = palette[B.LIQUID * 3 + 2]
    for (let y = 0; y < H; y++) {
      const yOff = y << 14
      for (let z = 0; z < D; z++) {
        const yzOff = yOff | (z << 7)
        for (let x = 0; x < W; x++) {
          if (blocks[yzOff | x] !== B.LIQUID) continue
          const open = get(x, y + 1, z) === B.AIR
          const topY = open ? 0.88 : 1
          for (const face of FACES) {
            if (face.n[1] < 0) continue
            if (face.n[1] ? !open : get(x + face.n[0], y, z + face.n[2]) !== B.AIR) continue
            const base = pos.length / 3
            const shade = face.n[1] ? 1.25 : face.shade
            for (let k = 0; k < 4; k++) {
              const c = face.c[k]
              const cy = y + c[1] * topY
              pos.push(x + c[0], cy, z + c[2])
              col.push(r * shade, g * shade, b * shade)
              uv.push(QUAD_UV[k * 2], face.n[1] ? QUAD_UV[k * 2 + 1] * 0.5 : cy * 0.5)
            }
            idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
          }
        }
      }
    }
    if (liquid) {
      hubTerrain.remove(liquid)
      liquid.geometry.dispose()
      liquid = null
    }
    if (pos.length) liquid = fixed(new Mesh(toGeometry(pos, col, uv, idx, 3), matScroll), hubTerrain)
  }

  const rebuildWorld = (bounds?: [number, number, number, number, number, number] | null, withLiquid = true) => {
    pending.clear()
    if (bounds === null) {
      top = 0
      lightVol.fill(0)
      lightTex.needsUpdate = true
      roof.fill(-1)
      glowGeo.dispose()
      glowGeo.setAttribute('position', new BufferAttribute(new Float32Array(0), 3))
      glowGeo.setAttribute('color', new BufferAttribute(new Float32Array(0), 3))
      for (let ci = 0; ci < chunks.length; ci++) {
        const old = chunks[ci]
        if (old) {
          terrainGroup.remove(old)
          old.geometry.dispose()
          chunks[ci] = null
        }
      }
      return
    }
    if (bounds) {
      const [bx0, by0, bz0, bx1, by1, bz1] = bounds
      lightVol.fill(0)
      computeLight(
        Math.max(0, bx0 - LIGHT_MAX),
        Math.max(0, by0 - LIGHT_MAX),
        Math.max(0, bz0 - LIGHT_MAX),
        Math.min(W - 1, bx1 + LIGHT_MAX),
        Math.min(H - 1, by1 + LIGHT_MAX),
        Math.min(D - 1, bz1 + LIGHT_MAX)
      )
      buildGlows(bx0, by0, bz0, bx1, by1, bz1)
      top = 0
      roof.fill(-1)
      computeRoof(bx0, bz0, bx1, bz1, by1)
      sunVol.fill(0)
      const cx0 = Math.floor(bx0 / CHUNK)
      const cz0 = Math.floor(bz0 / CHUNK)
      const cx1 = Math.floor(bx1 / CHUNK)
      const cz1 = Math.floor(bz1 / CHUNK)
      for (let ci = 0; ci < chunks.length; ci++) {
        const cx = ci % CHUNKS_X
        const cz = Math.floor(ci / CHUNKS_X)
        if (cx >= cx0 && cx <= cx1 && cz >= cz0 && cz <= cz1) buildChunk(ci)
        else if (chunks[ci]) {
          terrainGroup.remove(chunks[ci]!)
          chunks[ci]!.geometry.dispose()
          chunks[ci] = null
        }
      }
      return
    }
    computeLight()
    buildGlows()
    top = 0
    computeRoof()
    hubTop = top
    sunVol.fill(0)
    for (let ci = 0; ci < chunks.length; ci++) buildChunk(ci)
    if (withLiquid) buildLiquid()
  }

  // Cielo según la hora local: degradado, sol, luna con su fase real, estrellas y nubes
  const skyUniforms = {
    uZenith: { value: new Color() },
    uHorizon: { value: new Color() },
    uCloud: { value: new Color() },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunX: { value: new Vector3(1, 0, 0) },
    uSunY: { value: new Vector3(0, 0, 1) },
    uMoonDir: { value: new Vector3(0, 1, 0) },
    uMoonX: { value: new Vector3(1, 0, 0) },
    uMoonY: { value: new Vector3(0, 0, 1) },
    uNight: { value: 0 },
    uSun: { value: 0 },
    uPhase: { value: 0.5 },
    uTime: { value: 0 },
  }
  const skyGeo = new BoxGeometry(1, 1, 1)
  const skyMat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    depthFunc: LessEqualDepth,
    uniforms: skyUniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uCloud;
      uniform vec3 uSunDir;
      uniform vec3 uSunX;
      uniform vec3 uSunY;
      uniform vec3 uMoonDir;
      uniform vec3 uMoonX;
      uniform vec3 uMoonY;
      uniform float uNight;
      uniform float uSun;
      uniform float uPhase;
      uniform float uTime;
      varying vec3 vDir;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.75, d.y));

        if (uNight > 0.001) {
          // Estrellas sobre una rejilla cúbica, para que no se deformen en el cénit
          if (d.y > 0.0) {
            vec3 a = abs(d);
            float m = max(a.x, max(a.y, a.z));
            vec2 face = a.y == m ? d.xz / m : (a.x == m ? d.zy / m : d.xy / m);
            vec2 cell = floor(face * 110.0) + (a.y == m ? 19.0 : (a.x == m ? 47.0 : 83.0)) * sign(d.x + d.y + d.z);
            float seed = hash(cell);
            float star = step(0.9935, seed) * (0.55 + 0.45 * sin(uTime * 1.7 + seed * 400.0));
            col += vec3(0.9, 0.95, 1.0) * star * (0.4 + fract(seed * 91.0)) * uNight * smoothstep(0.0, 0.2, d.y);

            // Aurora boreal suave en el cielo nocturno navideño
            if (d.y > 0.08 && d.y < 0.72) {
              float wave = sin(d.x * 4.5 + uTime * 0.22 + sin(d.z * 3.2 - uTime * 0.15) * 1.4);
              float band = exp(-pow((d.y - 0.34 - wave * 0.08) * 7.5, 2.0));
              float curtain = 0.5 + 0.5 * sin(d.x * 14.0 + d.z * 9.0 + uTime * 0.45);
              vec3 aurCol = mix(vec3(0.08, 0.78, 0.65), vec3(0.45, 0.24, 0.85), clamp((d.y - 0.22) * 3.2, 0.0, 1.0));
              col += aurCol * band * (0.35 + 0.65 * curtain) * uNight * 0.26;
            }
          }

          // Luna pixelada, con cráteres y la fase de hoy
          float md = dot(d, uMoonDir);
          if (md > 0.0) {
            col += vec3(0.5, 0.62, 1.0) * uNight * pow(md, 90.0) * 0.35;
            vec2 q = (floor(vec2(dot(d, uMoonX), dot(d, uMoonY)) / 0.075 * 9.0) + 0.5) / 9.0;
            if (dot(q, q) < 1.0) {
              float limb = cos(uPhase * 6.2831853) * sqrt(max(0.0, 1.0 - q.y * q.y));
              float lit = uPhase < 0.5 ? step(limb, q.x) : step(q.x, -limb);
              float crater = hash(q * 9.0) < 0.2 ? 0.8 : 1.0;
              col = mix(col, vec3(0.93, 0.95, 1.0) * crater * mix(0.2, 1.0, lit), uNight * mix(0.6, 1.0, lit));
            }
          }
        }

        // Sol cuadrado y pixelado con halo atmosférico
        if (uSun > 0.001) {
          float sd = dot(d, uSunDir);
          if (sd > 0.0) {
            col += vec3(1.0, 0.78, 0.45) * uSun * (pow(sd, 36.0) * 0.5 + pow(sd, 6.0) * 0.14);
            vec2 sq = (floor(vec2(dot(d, uSunX), dot(d, uSunY)) / 0.085 * 4.0) + 0.5) / 4.0;
            float sm = max(abs(sq.x), abs(sq.y));
            if (sm < 1.0) {
              vec3 sunCol = sm < 0.5 ? vec3(1.0, 0.99, 0.88) : (sm < 0.75 ? vec3(1.0, 0.9, 0.42) : vec3(1.0, 0.72, 0.2));
              col = mix(col, sunCol * 1.45, uSun * (sm < 0.75 ? 1.0 : 0.85));
            }
          }
        }

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const skyDome = new Mesh(skyGeo, skyMat)
  skyDome.frustumCulled = false
  // Se pinta después de los bloques opacos para que el early-Z descarte el cielo tapado
  skyDome.renderOrder = 1
  fixed(skyDome)
  disposables.push(skyGeo, skyMat)

  // Nubes 3D estilo Minecraft (bloques con grosor, sombreado por cara y desplazamiento infinito en 1 draw call)
  const CLOUD_PERIOD = 192
  const clouds = (() => {
    const N = 24
    const CELL = CLOUD_PERIOD / N // 8 bloques por celda
    const THICK = 3.2
    const grid = new Uint8Array(N * N)
    const crand = mulberry32(2025)
    const stamp = (cx: number, cz: number, w: number, d: number) => {
      for (let dz = 0; dz < d; dz++) {
        const z = (((cz + dz) % N) + N) % N
        for (let dx = 0; dx < w; dx++) {
          const x = (((cx + dx) % N) + N) % N
          grid[z * N + x] = 1
        }
      }
    }
    // Grupos rectangulares cohesivos, como el mapa de nubes clásico de Minecraft
    for (let i = 0; i < 16; i++) {
      const cx = Math.floor(crand() * N)
      const cz = Math.floor(crand() * N)
      const w = 2 + Math.floor(crand() * 4)
      const d = 1 + Math.floor(crand() * 3)
      stamp(cx, cz, w, d)
      if (crand() < 0.75) {
        stamp(cx + Math.floor(crand() * w) - 1, cz + Math.floor(crand() * d) - 1, 1 + Math.floor(crand() * 3), 1 + Math.floor(crand() * 2))
      }
    }
    const atC = (x: number, z: number) => grid[((((z % N) + N) % N) * N) + (((x % N) + N) % N)]
    const pos: number[] = []
    const nrm: number[] = []
    const idx: number[] = []
    const quad = (
      x0: number, y0: number, z0: number,
      x1: number, y1: number, z1: number,
      x2: number, y2: number, z2: number,
      x3: number, y3: number, z3: number,
      nx: number, ny: number, nz: number
    ) => {
      const base = pos.length / 3
      pos.push(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3)
      nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz)
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
    // Rejilla 2x2 (384x384) centrada en el origen para cubrir más allá del horizonte y envolver sin cortes
    const M = N * 2
    const off = -CLOUD_PERIOD
    const mask = new Uint8Array(M * M)
    for (let z = 0; z < M; z++) for (let x = 0; x < M; x++) mask[z * M + x] = atC(x, z)
    // Greedy meshing de caras superior (+Y) e inferior (-Y)
    for (let z = 0; z < M; z++) {
      for (let x = 0; x < M; ) {
        if (!mask[z * M + x]) {
          x++
          continue
        }
        let rw = 1
        while (x + rw < M && mask[z * M + x + rw]) rw++
        let rh = 1
        outer: while (z + rh < M) {
          for (let k = 0; k < rw; k++) if (!mask[(z + rh) * M + x + k]) break outer
          rh++
        }
        for (let dz = 0; dz < rh; dz++) mask.fill(0, (z + dz) * M + x, (z + dz) * M + x + rw)
        const x0 = off + x * CELL
        const x1 = x0 + rw * CELL
        const z0 = off + z * CELL
        const z1 = z0 + rh * CELL
        quad(x0, THICK, z1, x1, THICK, z1, x1, THICK, z0, x0, THICK, z0, 0, 1, 0)
        quad(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1, 0, -1, 0)
        x += rw
      }
    }
    // Caras laterales solo en los bordes de cada nube
    for (let z = 0; z < M; z++) {
      for (let x = 0; x < M; x++) {
        if (!atC(x, z)) continue
        const x0 = off + x * CELL
        const x1 = x0 + CELL
        const z0 = off + z * CELL
        const z1 = z0 + CELL
        if (!atC(x + 1, z)) quad(x1, 0, z1, x1, 0, z0, x1, THICK, z0, x1, THICK, z1, 1, 0, 0)
        if (!atC(x - 1, z)) quad(x0, 0, z0, x0, 0, z1, x0, THICK, z1, x0, THICK, z0, -1, 0, 0)
        if (!atC(x, z + 1)) quad(x0, 0, z1, x1, 0, z1, x1, THICK, z1, x0, THICK, z1, 0, 0, 1)
        if (!atC(x, z - 1)) quad(x1, 0, z0, x0, 0, z0, x0, THICK, z0, x1, THICK, z0, 0, 0, -1)
      }
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    geo.setAttribute('normal', new BufferAttribute(new Int8Array(nrm), 3))
    geo.setIndex(new BufferAttribute(new Uint16Array(idx), 1))
    const matCloud = new ShaderMaterial({
      transparent: true,
      depthWrite: true,
      uniforms: {
        uCloud: skyUniforms.uCloud,
        uSun: light.uSun,
        uSunDir: light.uSunDir,
        uHorizon: skyUniforms.uHorizon,
      },
      vertexShader: `
        varying vec3 vN;
        varying vec3 vWorld;
        void main() {
          vN = normal;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 uCloud;
        uniform vec3 uSun;
        uniform vec3 uSunDir;
        uniform vec3 uHorizon;
        varying vec3 vN;
        varying vec3 vWorld;
        void main() {
          // Sombreado direccional clásico de las nubes 3D de Minecraft
          float shade = vN.y > 0.5 ? 1.0 : (vN.y < -0.5 ? 0.72 : (abs(vN.z) > 0.5 ? 0.88 : 0.82));
          float sunEdge = max(dot(vN, uSunDir), 0.0) * 0.14;
          vec3 col = uCloud * shade + uSun * sunEdge;
          float dist = length(vWorld.xz - cameraPosition.xz);
          float fade = smoothstep(185.0, 75.0, dist);
          if (fade < 0.01) discard;
          col = mix(uHorizon, col, smoothstep(185.0, 95.0, dist));
          gl_FragColor = vec4(col, 0.88 * fade);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
    const mesh = new Mesh(geo, matCloud)
    mesh.position.set(64, 54, 64)
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    moving(mesh)
    disposables.push(geo, matCloud)
    return mesh
  })()

  const zenNight = new Color(0x020818)
  const zenDay = new Color(0x3586dd)
  const zenDusk = new Color(0x2c3a7a)
  const horNight = new Color(0x0b1f4f)
  const horDay = new Color(0xa9d4f5)
  const horDusk = new Color(0xf0935e)
  // Valores lineales. La nieve devuelve parte del sol y de noche la luna alumbra según su fase
  const skyNight = new Color(0.1, 0.13, 0.24)
  const skyDay = new Color(0.27, 0.32, 0.44)
  const skyDusk = new Color(0.3, 0.22, 0.3)
  const sunLow = new Color(1, 0.46, 0.2)
  const sunHigh = new Color(1, 0.93, 0.78)
  const moonTint = new Color(0.55, 0.68, 1)
  const cloudNight = new Color(0x1a2a5c)
  const cloudDay = new Color(0xffffff)
  const lampTint = new Color(1, 0.72, 0.38)
  // Cada fase tiene su propia hora del día
  let stageHour: number | null = null
  const updateSky = () => {
    const date = new Date()
    const hour = stageHour ?? opts.hour ?? date.getHours() + date.getMinutes() / 60
    const isDay = hour > SUNRISE && hour < SUNSET
    const arc = isDay
      ? (hour - SUNRISE) / (SUNSET - SUNRISE)
      : ((hour + 24 - SUNSET) % 24) / (24 - SUNSET + SUNRISE)
    const day = isDay ? Math.min(1, Math.sin(arc * Math.PI) * 2.5) : 0
    const dusk = Math.sin(day * Math.PI)
    const body = isDay ? skyUniforms.uSunDir.value : skyUniforms.uMoonDir.value
    body.set(Math.cos(arc * Math.PI) * 0.85, Math.sin(arc * Math.PI) * 0.62 + 0.12, -0.4).normalize()
    aimSun(body)
    skyUniforms.uSunX.value.crossVectors(UP, skyUniforms.uSunDir.value).normalize()
    skyUniforms.uSunY.value.crossVectors(skyUniforms.uSunDir.value, skyUniforms.uSunX.value)
    skyUniforms.uMoonX.value.crossVectors(UP, skyUniforms.uMoonDir.value).normalize()
    skyUniforms.uMoonY.value.crossVectors(skyUniforms.uMoonDir.value, skyUniforms.uMoonX.value)
    skyUniforms.uSun.value = isDay ? 1 : 0
    skyUniforms.uNight.value = 1 - day
    // Fase lunar real: días desde la luna nueva del 6 de enero de 2000
    skyUniforms.uPhase.value = ((((Date.now() / 86400000 - 10962.76) % 29.530589) + 29.530589) % 29.530589) / 29.530589
    skyUniforms.uZenith.value.copy(zenNight).lerp(zenDay, day).lerp(zenDusk, dusk * 0.5)
    skyUniforms.uHorizon.value.copy(horNight).lerp(horDay, day).lerp(horDusk, dusk * 0.8)
    skyUniforms.uCloud.value.copy(cloudNight).lerp(cloudDay, day).lerp(horDusk, dusk * 0.4)
    const height = isDay ? Math.sin(arc * Math.PI) : 0
    const full = 0.5 - 0.5 * Math.cos(skyUniforms.uPhase.value * Math.PI * 2)
    light.uSky.value.copy(skyNight).lerp(skyDay, day).lerp(skyDusk, dusk * 0.5)
    if (isDay) {
      const high = Math.min(1, Math.max(0, (height - 0.12) / 0.55))
      light.uSun.value.copy(sunLow).lerp(sunHigh, high * high * (3 - 2 * high)).multiplyScalar(0.95 * Math.min(1, height * 7))
    } else light.uSun.value.copy(moonTint).multiplyScalar(0.3 * (0.35 + 0.65 * full))
    light.uGround.value.copy(light.uSun.value).multiplyScalar(0.18).add(color.copy(light.uSky.value).multiplyScalar(0.35))
    ambient.value.copy(light.uSun.value).multiplyScalar(0.75).add(light.uSky.value)
    lampBase.copy(lampTint).multiplyScalar(1.25 - day * 1.0)
    lamp.value.copy(lampBase)
    glowMat.opacity = 0.95 - day * 0.65
    matScroll.color.copy(ambient.value)
    fog.color.copy(skyUniforms.uHorizon.value)
    renderer.setClearColor(fog.color)
  }
  updateSky()

  // Puertas: cada una con su estilo, su tamaño y una o dos hojas
  const slots = world.doors
  const byDay = new Map<number, number>(slots.map((slot, i) => [slot.day, i]))
  const doorAt = new Map<number, number>()
  const doorCells: number[][] = slots.map(() => [])
  slots.forEach((slot, i) => {
    const rx = slot.nz
    const rz = -slot.nx
    // El marco también cuenta al tocar, para no tener que atinar
    for (let k = -1; k <= slot.w; k++) {
      for (let dy = 0; dy <= slot.h; dy++) {
        const x = slot.x + rx * k
        const z = slot.z + rz * k
        doorAt.set(at(x, slot.y + dy, z), i)
        if (k < 0 || k === slot.w || dy === slot.h) continue
        doorAt.set(at(x - slot.nx, slot.y + dy, z - slot.nz), i)
        doorCells[i].push(at(x, slot.y + dy, z))
      }
    }
  })
  const isOpen = (day: number) => states[day] === 'opened' || states[day] === 'done'
  // Una puerta abierta deja pasar: detrás está el portal a su fase
  const syncDoorCell = (i: number) => {
    const type = isOpen(slots[i].day) ? B.AIR : B.DOOR_CELL
    for (const cell of doorCells[i]) hubBlocks[cell] = type
  }
  // Todas las hojas de las puertas en un único BatchedMesh (1 draw call en vez de 11)
  const leafGeos = new Map<string, BufferGeometry>()
  let totalLeaves = 0
  let totalVerts = 0
  let totalIndices = 0
  for (const slot of slots) {
    const count = DOOR_STYLES[slot.style].leaves
    totalLeaves += count
    for (let n = 0; n < count; n++) {
      const key = `${slot.style}:${n}`
      if (!leafGeos.has(key)) {
        const geo = buildLeaf(slot.style, n === 1)
        leafGeos.set(key, geo)
        totalVerts += geo.attributes.position.count
        totalIndices += geo.index!.count
      }
    }
  }
  const doorBatch = castShadow(fixed(new BatchedMesh(totalLeaves, totalVerts, totalIndices, matProp)))
  doorBatch.frustumCulled = false
  doorBatch.perObjectFrustumCulled = false
  doorBatch.sortObjects = false
  const leafGeoIds = new Map<string, number>()
  for (const [key, geo] of leafGeos) {
    leafGeoIds.set(key, doorBatch.addGeometry(geo))
    geo.dispose()
  }
  const doorLeaves: { index: number; mirror: boolean }[][] = slots.map(() => [])
  slots.forEach((slot, i) => {
    for (let n = 0; n < DOOR_STYLES[slot.style].leaves; n++) {
      const geoId = leafGeoIds.get(`${slot.style}:${n}`)!
      doorLeaves[i].push({ index: doorBatch.addInstance(geoId), mirror: n === 1 })
    }
  })
  const doorAngle = new Float32Array(slots.length)
  const doorGoal = new Float32Array(slots.length)
  const doorRattle = new Float32Array(slots.length)
  const m4 = new Matrix4()
  const q = new Quaternion()
  const p = new Vector3()
  const one = new Vector3(1, 1, 1)
  const scale = new Vector3()

  const writeDoor = (i: number) => {
    const slot = slots[i]
    for (const { index, mirror } of doorLeaves[i]) {
      // La bisagra va en la jamba izquierda; la de la hoja espejo, en la derecha
      const side = mirror ? slot.w - 0.5 : -0.5
      const hx = slot.x + 0.5 + slot.nz * side + slot.nx * 0.37
      const hz = slot.z + 0.5 - slot.nx * side + slot.nz * 0.37
      q.setFromAxisAngle(UP, slot.angle + (mirror ? -doorAngle[i] : doorAngle[i]))
      doorBatch.setMatrixAt(index, m4.compose(p.set(hx, slot.y, hz), q, one))
    }
  }

  // Portales: un remolino pixelado en el hueco de cada puerta abierta
  const portalGeo = new BufferGeometry()
  const portalMat = new ShaderMaterial({
    uniforms: { uTime: skyUniforms.uTime },
    vertexShader: `
      attribute float aDone;
      varying vec2 vUv;
      varying float vDone;
      void main() {
        vUv = uv;
        vDone = aDone;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vDone;
      void main() {
        vec2 p = (floor(vUv * vec2(16.0, 32.0)) + 0.5) / vec2(16.0, 32.0) - 0.5;
        p.y *= 2.0;
        float r = length(p);
        float swirl = sin(atan(p.y, p.x) * 3.0 + r * 9.0 - uTime * 3.0);
        vec3 a = mix(vec3(0.36, 0.18, 0.63), vec3(0.13, 0.78, 0.69), vDone);
        vec3 b = mix(vec3(0.97, 0.69, 0.2), vec3(1.0, 0.95, 0.77), vDone);
        vec3 col = mix(a, b, step(0.0, swirl)) * (0.95 - r * 0.6);
        gl_FragColor = vec4(col + step(0.92, fract(sin(dot(floor(vUv * 16.0), vec2(12.9, 78.2)) + floor(uTime * 6.0)) * 43758.5)) * 0.25, 1.0);
        #include <colorspace_fragment>
      }`,
  })
  const portals = new Mesh(portalGeo, portalMat)
  fixed(portals)
  disposables.push(portalGeo, portalMat)
  const buildPortals = () => {
    const pos: number[] = []
    const uv: number[] = []
    const done: number[] = []
    const idx: number[] = []
    slots.forEach((slot) => {
      if (!isOpen(slot.day)) return
      const cx = slot.cx - slot.nx * 0.47
      const cz = slot.cz - slot.nz * 0.47
      const rx = (slot.nz * slot.w) / 2
      const rz = (-slot.nx * slot.w) / 2
      const top = slot.y + slot.h
      const base = pos.length / 3
      pos.push(cx - rx, slot.y, cz - rz, cx + rx, slot.y, cz + rz, cx + rx, top, cz + rz, cx - rx, top, cz - rz)
      uv.push(...QUAD_UV)
      for (let k = 0; k < 4; k++) done.push(states[slot.day] === 'done' ? 1 : 0)
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    })
    portalGeo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    portalGeo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    portalGeo.setAttribute('aDone', new BufferAttribute(new Float32Array(done), 1))
    portalGeo.setIndex(idx)
    if (pos.length) portalGeo.computeBoundingSphere()
    portals.visible = pos.length > 0 && !stage
  }

  // Números de las puertas: carteles fijos en el escenario, todos en una sola malla
  const signOf: number[] = []
  slots.forEach((slot, i) => slot.signs.forEach(() => signOf.push(i)))
  const SIGNS = signOf.length
  const numGeo = new BufferGeometry()
  const nPos = new Float32Array(SIGNS * 4 * 3)
  const nUv = new Float32Array(SIGNS * 4 * 2)
  const nTint = new Float32Array(SIGNS * 4 * 3)
  const nPulse = new Float32Array(SIGNS * 4)
  const nIdx = new Uint16Array(SIGNS * 6)
  const corners = [-1, -1, 1, -1, 1, 1, -1, 1]
  slots
    .flatMap((slot) => slot.signs.map((sign) => ({ sign, d: slot.day - 1 })))
    .forEach(({ sign, d }, i) => {
      const { c, u, v } = sign
      const u0 = (d % 6) / 6
      const v0 = 1 - (Math.floor(d / 6) + (sign.stencil ? 4 : 0)) / 8
      for (let k = 0; k < 4; k++) {
        const a = corners[k * 2]
        const b = corners[k * 2 + 1]
        nPos.set([c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b, c[2] + u[2] * a + v[2] * b], (i * 4 + k) * 3)
        nUv.set([u0 + (a > 0 ? 1 / 6 : 0), v0 - (b > 0 ? 0 : 1 / 8)], (i * 4 + k) * 2)
      }
      nIdx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6)
    })
  numGeo.setAttribute('position', new BufferAttribute(nPos, 3))
  numGeo.setAttribute('uv', new BufferAttribute(nUv, 2))
  numGeo.setAttribute('aTint', new BufferAttribute(nTint, 3))
  numGeo.setAttribute('aPulse', new BufferAttribute(nPulse, 1))
  numGeo.setIndex(new BufferAttribute(nIdx, 1))
  await fontReady
  const atlas = numbersAtlas()
  const numMat = new ShaderMaterial({
    uniforms: {
      uMap: { value: atlas },
      uTime: skyUniforms.uTime,
      uFog: { value: fog.color },
      uAmbient: ambient,
    },
    vertexShader: `
      attribute vec3 aTint;
      attribute float aPulse;
      varying vec2 vUv;
      varying vec3 vTint;
      varying float vPulse;
      varying float vDepth;
      void main() {
        vUv = uv;
        vTint = aTint;
        vPulse = aPulse;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uTime;
      uniform vec3 uFog;
      uniform vec3 uAmbient;
      varying vec2 vUv;
      varying vec3 vTint;
      varying float vPulse;
      varying float vDepth;
      void main() {
        vec4 c = texture2D(uMap, vUv);
        if (c.a < 0.5) discard;
        // De noche el cartel sigue encendido; el de hoy parpadea
        vec3 col = c.rgb * vTint * mix(uAmbient, vec3(1.0), 0.7) * (1.0 + vPulse * (0.25 + 0.25 * sin(uTime * 5.0)));
        gl_FragColor = vec4(mix(col, uFog, smoothstep(${HUB_FOG[0]}.0, ${HUB_FOG[1]}.0, vDepth) * 0.85), 1.0);
        #include <colorspace_fragment>
      }`,
  })
  const numbers = new Mesh(numGeo, numMat)
  numbers.frustumCulled = false
  fixed(numbers)
  disposables.push(numGeo, numMat, atlas)

  const paintDoor = (i: number) => {
    const state = states[slots[i].day] ?? 'locked'
    const [leafHex, numHex] = TINTS[state]
    color.set(leafHex)
    for (const { index } of doorLeaves[i]) {
      doorBatch.setColorAt(index, color)
    }
    color.set(numHex)
    for (let n = 0; n < SIGNS; n++) {
      if (signOf[n] !== i) continue
      for (let k = 0; k < 4; k++) {
        nTint.set([color.r, color.g, color.b], (n * 4 + k) * 3)
        nPulse[n * 4 + k] = state === 'today' ? 1 : 0
      }
    }
    numGeo.attributes.aTint.needsUpdate = true
    numGeo.attributes.aPulse.needsUpdate = true
  }
  slots.forEach((slot, i) => {
    doorAngle[i] = doorGoal[i] = isOpen(slot.day) ? OPEN_ANGLE : 0
    syncDoorCell(i)
    writeDoor(i)
    paintDoor(i)
  })
  buildPortals()
  rebuildWorld()
  hubSunDir.copy(sunDir)

  // Todos los objetos móviles de la fábrica (regalos, monedas, reliquias, avión, Ibai y dragón) en 1 solo BatchedMesh
  const GIFTS = 12
  const propGeos = [props.gift, props.ribbon, props.coin, props.relic, props.plane, props.ibai, props.dragon]
  const propMaxInst = GIFTS * 2 + world.coins.length + world.relics.length + 3
  const propVerts = propGeos.reduce((s, g) => s + g.attributes.position.count, 0)
  const propIndices = propGeos.reduce((s, g) => s + g.index!.count, 0)
  const propBatch = castShadow(fixed(new BatchedMesh(propMaxInst, propVerts, propIndices, matProp)))
  propBatch.frustumCulled = false
  propBatch.perObjectFrustumCulled = false
  propBatch.sortObjects = false
  const gGift = propBatch.addGeometry(props.gift)
  const gRibbon = propBatch.addGeometry(props.ribbon)
  const gCoin = propBatch.addGeometry(props.coin)
  const gRelic = propBatch.addGeometry(props.relic)
  const gPlane = propBatch.addGeometry(props.plane)
  const gIbai = propBatch.addGeometry(props.ibai)
  const gDragon = propBatch.addGeometry(props.dragon)
  const giftBodyIds = Array.from({ length: GIFTS }, () => propBatch.addInstance(gGift))
  const giftRibbonIds = Array.from({ length: GIFTS }, () => propBatch.addInstance(gRibbon))
  const giftPalette = [
    [0xf2e6c9, 0xc8323c],
    [0xb4317a, 0xf8b132],
    [0x21c7b0, 0xffffff],
    [0xc8323c, 0xf8b132],
    [0x1c7a45, 0xc8323c],
    [0x4b2a8a, 0x21c7b0],
  ]
  const paintGifts = (golden: boolean) => {
    for (let i = 0; i < GIFTS; i++) {
      const [body, bow] = giftPalette[i % giftPalette.length]
      propBatch.setColorAt(giftBodyIds[i], color.set(golden ? 0xf8b132 : body))
      propBatch.setColorAt(giftRibbonIds[i], color.set(golden ? 0xfff2c4 : bow))
    }
  }
  paintGifts(false)

  // Monedas de chocolate y reliquias
  const coinTaken = world.coins.map((_, i) => save?.coins.includes(i) ?? false)
  const coinIds = world.coins.map((_, i) => {
    const id = propBatch.addInstance(gCoin)
    propBatch.setColorAt(id, color.set(0xffffff))
    if (coinTaken[i]) propBatch.setVisibleAt(id, false)
    return id
  })
  const coinCount = () => coinTaken.filter(Boolean).length

  const relicTaken = world.relics.map((_, i) => opts.relics.includes(i))
  const relicIds = world.relics.map((_, i) => {
    const id = propBatch.addInstance(gRelic)
    propBatch.setColorAt(id, color.set(0xffffff))
    if (relicTaken[i]) propBatch.setVisibleAt(id, false)
    return id
  })

  const planeId = propBatch.addInstance(gPlane)
  const ibaiId = propBatch.addInstance(gIbai)
  const dragonId = propBatch.addInstance(gDragon)
  color.set(0xffffff)
  propBatch.setColorAt(planeId, color)
  propBatch.setColorAt(ibaiId, color)
  propBatch.setColorAt(dragonId, color)
  const planePos = new Vector3(SPOT.center[0] + 30, 43, SPOT.center[2])
  const plane = { position: planePos }
  let ibaiScale = 1.7
  const q2 = new Quaternion()
  const peers = createPeersRenderer({ skin, matProp, castShadow, reducedMotion: opts.reducedMotion })
  scene.add(peers.group)
  const hubObjects: Object3D[] = [doorBatch, portals, numbers, propBatch, peers.group]

  // Sombras de contacto: un disco pixelado bajo cada personaje, todos en una sola malla
  const BLOBS = 96
  const blobCanvas = document.createElement('canvas')
  blobCanvas.width = blobCanvas.height = 16
  const blobCtx = blobCanvas.getContext('2d')!
  const blobImg = blobCtx.createImageData(16, 16)
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 8
      blobImg.data[(y * 16 + x) * 4 + 3] = Math.round((d < 0.5 ? 1 : d < 0.75 ? 0.6 : d < 1 ? 0.25 : 0) * 255)
    }
  }
  blobCtx.putImageData(blobImg, 0, 0)
  const blobTex = new CanvasTexture(blobCanvas)
  blobTex.magFilter = NearestFilter
  const blobGeo = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2)
  const blobMat = new MeshBasicMaterial({
    map: blobTex,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const blobs = new InstancedMesh(blobGeo, blobMat, BLOBS)
  blobs.frustumCulled = false
  blobs.count = 0
  fixed(blobs)
  disposables.push(blobTex, blobGeo, blobMat)
  const blobData = new Float32Array(BLOBS * 4)
  let blobCount = 0
  let blobStage = 0
  const blob = (x: number, y: number, z: number, r: number) => {
    if (blobCount >= BLOBS) return
    blobData[blobCount * 4] = x
    blobData[blobCount * 4 + 1] = y
    blobData[blobCount * 4 + 2] = z
    blobData[blobCount * 4 + 3] = r
    blobCount++
  }
  const DROP = 10
  const drawBlobs = () => {
    let n = 0
    for (let i = 0; i < blobCount; i++) {
      const x = blobData[i * 4]
      const y = blobData[i * 4 + 1]
      const z = blobData[i * 4 + 2]
      const bx = Math.floor(x)
      const bz = Math.floor(z)
      if (bx < 0 || bz < 0 || bx >= W || bz >= D) continue
      let by = Math.min(H - 1, Math.floor(y + 0.05))
      const stop = Math.max(0, by - DROP)
      const xz = bx | (bz << 7)
      while (by >= stop && !OPAQUE[blocks[xz | (by << 14)]]) by--
      if (by < stop) continue
      const r = blobData[i * 4 + 3] * (1 - Math.max(0, y - by - 1) * 0.06)
      blobs.setMatrixAt(n++, m4.makeScale(r, 1, r).setPosition(x, by + 1.02, z))
    }
    blobs.count = n
    if (n > 0) blobs.instanceMatrix.needsUpdate = true
  }

  // Nieve alrededor del jugador, animada en el shader
  const FLAKES = reducedMotion ? 0 : isMobile ? 120 : 260
  const snowGeo = new BufferGeometry()
  const flakes = new Float32Array(FLAKES * 3)
  const rand = mulberry32(99)
  for (let i = 0; i < FLAKES; i++) flakes.set([rand() * 48, rand() * 30, rand() * 48], i * 3)
  snowGeo.setAttribute('position', new BufferAttribute(flakes, 3))
  const snowMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: skyUniforms.uTime, uScale: { value: 300 }, uCam: { value: camera.position } },
    vertexShader: `
      uniform float uTime;
      uniform float uScale;
      uniform vec3 uCam;
      void main() {
        vec3 pos = position;
        pos.y -= uTime * (0.8 + fract(position.x * 7.3));
        pos.x += sin(uTime * 0.7 + position.z) * 0.6;
        pos = mod(pos - uCam + vec3(24.0, 15.0, 24.0), vec3(48.0, 30.0, 48.0)) - vec3(24.0, 15.0, 24.0) + uCam;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = uScale * (0.05 + fract(position.z * 3.1) * 0.05) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      void main() {
        gl_FragColor = vec4(0.9, 0.95, 1.0, 0.9);
        #include <colorspace_fragment>
      }`,
  })
  const snow = new Points(snowGeo, snowMat)
  snow.frustumCulled = false
  fixed(snow)
  disposables.push(snowGeo, snowMat)

  // Trocitos que saltan al picar, golpear o recoger
  const BITS = 96
  const bitPos = new Float32Array(BITS * 3).fill(-999)
  const bitCol = new Float32Array(BITS * 3)
  const bitVel = new Float32Array(BITS * 3)
  const bitLife = new Float32Array(BITS)
  const bitGeo = new BufferGeometry()
  bitGeo.setAttribute('position', new BufferAttribute(bitPos, 3))
  bitGeo.setAttribute('color', new BufferAttribute(bitCol, 3))
  const bitMat = new PointsMaterial({ size: 0.16, vertexColors: true })
  const bits = new Points(bitGeo, bitMat)
  bits.frustumCulled = false
  bits.visible = false
  fixed(bits)
  disposables.push(bitGeo, bitMat)
  let bitNext = 0
  let bitsAlive = 0
  const burst = (x: number, y: number, z: number, r: number, g: number, b: number, amount: number) => {
    for (let n = 0; n < amount; n++) {
      const i = bitNext++ % BITS
      bitPos.set([x + Math.random(), y + Math.random(), z + Math.random()], i * 3)
      bitVel.set([(Math.random() - 0.5) * 5, 2 + Math.random() * 3.5, (Math.random() - 0.5) * 5], i * 3)
      bitCol.set([r, g, b], i * 3)
      bitLife[i] = 0.7
    }
    bitGeo.attributes.color.needsUpdate = true
    bitsAlive = 0.8
  }
  const burstBlock = (x: number, y: number, z: number, type: number, amount = 8) =>
    burst(x, y, z, palette[type * 3], palette[type * 3 + 1], palette[type * 3 + 2], amount)

  // Marca del bloque al que se apunta
  const outlineBox = new BoxGeometry(1.01, 1.01, 1.01)
  const outlineGeo = new EdgesGeometry(outlineBox)
  const outlineMat = new LineBasicMaterial({ color: 0xffffff })
  const outline = moving(new LineSegments(outlineGeo, outlineMat))
  outline.visible = false
  disposables.push(outlineBox, outlineGeo, outlineMat)

  // Lo que lleva el jugador en la mano: el bloque elegido, la espada o el lanzabolas
  const hand = new Mesh(models.cube, matHand)
  hand.frustumCulled = false
  hand.renderOrder = 50
  camera.add(hand)
  let swing = 1

  // Tercera persona: 0 primera persona, 1 cámara detrás, 2 cámara de frente
  let view = 0
  try {
    view = Number(localStorage.getItem(VIEW_KEY)) % 3 || 0
  } catch {}
  let camDist = CAM_DIST
  let gait = 0
  const camDir = new Vector3()
  const avatar = castShadow(moving(new Group()))
  avatar.visible = false
  const limb = (geo: BufferGeometry, x: number, y: number) => {
    const mesh = castShadow(new Mesh(geo, matProp))
    mesh.position.set(x, y, 0)
    avatar.add(mesh)
    return mesh
  }
  limb(skin.torso, 0, 0)
  const head = limb(skin.head, 0, 1.3)
  const armL = limb(skin.arm, -0.39, 1.24)
  const armR = limb(skin.arm, 0.39, 1.24)
  const legL = limb(skin.leg, -0.14, 0.6)
  const legR = limb(skin.leg, 0.14, 0.6)
  const held = castShadow(new Mesh(models.cube, matHeld))
  armR.add(held)
  let selfEmote: EmoteId | null = null
  let selfEmoteTimer = 0

  // Jugador
  const pos = new Vector3(world.spawn.x, world.spawn.y, world.spawn.z)
  const vel = new Vector3()
  let yaw = world.spawn.yaw
  let pitch = 0
  let onGround = false
  let inLiquid = false
  let sinceGround = 1
  let liquidLevel: number | null = null
  let stride = 0
  let shake = 0
  if (save?.p?.length === 5 && save.p.every(Number.isFinite)) {
    pos.set(save.p[0], save.p[1], save.p[2])
    yaw = save.p[3]
    pitch = save.p[4]
  }

  const inventory = new Map<number, number>(save?.inv ?? [[B.CHOC, 12], [B.CREAM, 6], [B.BOUNCE, 2]])
  for (const type of [...inventory.keys()]) {
    if (!BLOCKS[type] || BLOCKS[type].fixed || !(inventory.get(type)! > 0)) inventory.delete(type)
  }
  let selected = save && inventory.has(save.sel) ? save.sel : (inventory.keys().next().value ?? 0)
  const icons = new Map<number, string>()
  const iconOf = (type: number) => {
    if (!icons.has(type)) icons.set(type, blockIcon(blockCanvas, type))
    return icons.get(type)!
  }
  const emitInventory = () => {
    if (!inventory.has(selected)) selected = inventory.keys().next().value ?? 0
    opts.onInventory(
      [...inventory].map(([type, count]) => ({
        type,
        count,
        name: BLOCKS[type].name,
        icon: iconOf(type),
      })),
      selected
    )
  }
  const give = (type: number, amount = 1) => inventory.set(type, (inventory.get(type) ?? 0) + amount)

  // Fase en curso
  let stage: {
    def: StageDef
    run: StageRuntime
    hud: StageHud
    invuln: number
    // Segundos que faltan para que vuelva el escudo
    shield: number
    check: Vector3
    over: boolean
  } | null = null
  let warp = 0
  let warpDay = 0
  // Fases de naves: vista cenital, sin gravedad y dentro del campo
  const flying = () => stage?.def.kind === 'ships'
  let shipDist = 24
  const bound = () => {
    pos.x = Math.max(FIELD.x - FIELD.hx + 0.6, Math.min(FIELD.x + FIELD.hx - 0.6, pos.x))
    pos.z = Math.max(FIELD.z - FIELD.hz + 1, Math.min(FIELD.z + FIELD.hz - 1, pos.z))
    pos.y = FIELD.y
  }

  // Guardado automático: dentro de una fase se conserva el sitio de la fábrica
  let dirty = false
  let saveClock = 0
  let wiped = false
  const spot = [pos.x, pos.y, pos.z, yaw, pitch]
  const persist = () => {
    if (wiped) return
    if (!stage) spot.splice(0, 5, pos.x, pos.y, pos.z, yaw, pitch)
    const flat: number[] = []
    for (const [index, type] of edits) flat.push(index, type)
    const data: Save = {
      v: SAVE_VERSION,
      p: spot.map((n) => Math.round(n * 100) / 100),
      inv: [...inventory],
      sel: selected,
      coins: coinTaken.flatMap((taken, i) => (taken ? [i] : [])),
      edits: flat,
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    } catch {}
    dirty = false
  }

  const hits = (x: number, y: number, z: number) => {
    for (let iy = Math.floor(y); iy <= Math.floor(y + TALL - 0.01); iy++) {
      for (let iz = Math.floor(z - HALF); iz <= Math.floor(z + HALF); iz++) {
        for (let ix = Math.floor(x - HALF); ix <= Math.floor(x + HALF); ix++) {
          if (isSolid(get(ix, iy, iz))) return true
        }
      }
    }
    return false
  }
  const respawn = () => {
    pos.set(world.spawn.x, world.spawn.y, world.spawn.z)
    while (hits(pos.x, pos.y, pos.z) && pos.y < H) pos.y++
    vel.set(0, 0, 0)
  }
  if (hits(pos.x, pos.y, pos.z)) respawn()

  const setBlock = (x: number, y: number, z: number, type: number) => {
    const index = at(x, y, z)
    const previous = blocks[index]
    blocks[index] = type
    if (original[index] === type) edits.delete(index)
    else edits.set(index, type)
    computeRoof(x, z, x, z)
    // Al momento solo se rehace lo que toca el bloque; la luz y la sombra que cambian lejos van a la cola
    const lampNear = FACES.some((face) => GLOW[get(x + face.n[0], y + face.n[1], z + face.n[2])])
    const lamp = GLOW[type] || GLOW[previous]
    const lit =
      lamp ||
      lampNear ||
      lightVol[index] > 0 ||
      FACES.some((face) => levelAt(x + face.n[0], y + face.n[1], z + face.n[2]) > 1)
    if (lit) {
      computeLight(x - LIGHT_MAX, y - LIGHT_MAX, z - LIGHT_MAX, x + LIGHT_MAX, y + LIGHT_MAX, z + LIGHT_MAX)
    }
    if (lamp || lampNear) buildGlows()
    if (OPAQUE[type] !== OPAQUE[previous]) {
      sunVol.fill(0)
      const reach = (y + 1) / sunDir.y
      for (let t = 0; ; t += 4) {
        const k = Math.min(t, reach)
        const sx = x - sunDir.x * k
        const sz = z - sunDir.z * k
        mark(pending, sx - 2, sz - 2, sx + 3, sz + 3)
        if (t >= reach) break
      }
    }
    const now = new Set<number>()
    mark(now, x - 1, z - 1, x + 1, z + 1)
    for (const ci of now) {
      pending.delete(ci)
      buildChunk(ci)
    }
    if (FACES.some((face) => get(x + face.n[0], y + face.n[1], z + face.n[2]) === B.LIQUID)) buildLiquid()
    shadowDirty = true
    dirty = true
  }

  // Rayo por la rejilla de bloques
  const hit = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, type: 0, dist: 0 }
  const raycast = (o: Vector3, d: Vector3, max: number) => {
    let x = Math.floor(o.x)
    let y = Math.floor(o.y)
    let z = Math.floor(o.z)
    const sx = d.x > 0 ? 1 : -1
    const sy = d.y > 0 ? 1 : -1
    const sz = d.z > 0 ? 1 : -1
    const tdx = Math.abs(1 / d.x)
    const tdy = Math.abs(1 / d.y)
    const tdz = Math.abs(1 / d.z)
    let tx = (d.x > 0 ? x + 1 - o.x : o.x - x) * tdx
    let ty = (d.y > 0 ? y + 1 - o.y : o.y - y) * tdy
    let tz = (d.z > 0 ? z + 1 - o.z : o.z - z) * tdz
    let t = 0
    hit.nx = hit.ny = hit.nz = 0
    while (t <= max) {
      const type = get(x, y, z)
      if (isSolid(type)) {
        hit.x = x
        hit.y = y
        hit.z = z
        hit.type = type
        hit.dist = t
        return true
      }
      hit.nx = hit.ny = hit.nz = 0
      if (tx < ty && tx < tz) {
        x += sx
        t = tx
        tx += tdx
        hit.nx = -sx
      } else if (ty < tz) {
        y += sy
        t = ty
        ty += tdy
        hit.ny = -sy
      } else {
        z += sz
        t = tz
        tz += tdz
        hit.nz = -sz
      }
    }
    return false
  }

  // Estado de las puertas
  let paused = true
  const locked = () => document.pointerLockElement === canvas
  // Si el navegador no deja capturar el ratón, se juega arrastrando para mirar
  let lockFailed = false
  const lock = () => {
    if (lockFailed) return
    const failed = () => {
      lockFailed = true
      opts.onLock(true)
    }
    try {
      const request = canvas.requestPointerLock() as Promise<void> | undefined
      request?.catch?.(failed)
    } catch {
      failed()
    }
  }
  const setState = (day: number, state: DoorState) => {
    const i = byDay.get(day)
    if (i === undefined) return
    states[day] = state
    paintDoor(i)
    syncDoorCell(i)
    doorGoal[i] = isOpen(day) ? OPEN_ANGLE : 0
    buildPortals()
  }
  const tapDoor = (i: number) => {
    const { day } = slots[i]
    const state = states[day] ?? 'locked'
    if (state === 'locked') doorRattle[i] = 0.6
    opts.onDoor(day, state)
  }

  // Fases: se cambia la rejilla entera y se esconde la fábrica
  const emitHud = (patch: Partial<StageHud>) => {
    if (!stage) return
    Object.assign(stage.hud, patch)
    opts.onStage({ type: 'hud', hud: { ...stage.hud } })
  }
  const setHand = () => {
    const weapon = stage?.def.weapon
    hand.geometry = weapon === 'sword' ? models.sword : weapon === 'snow' ? models.blaster : models.cube
    const holding = weapon !== 'ship' && (!!weapon || inventory.has(selected))
    hand.visible = holding && !view
    matHand.color.set(weapon ? 0xffffff : (BLOCKS[selected]?.color ?? 0xffffff))
    held.geometry = hand.geometry
    held.visible = holding
    matHeld.color.copy(matHand.color)
    if (weapon === 'sword') {
      held.position.set(0, -0.56, 0.2)
      held.rotation.set(Math.PI / 2, 0, 0)
      held.scale.setScalar(1.1)
    } else if (weapon === 'snow') {
      held.position.set(0, -0.5, 0.22)
      held.rotation.set(Math.PI / 2, Math.PI, 0)
      held.scale.setScalar(1)
    } else {
      held.position.set(0, -0.62, 0.14)
      held.rotation.set(0, 0, 0)
      held.scale.setScalar(0.22)
    }
  }
  const loseStage = () => {
    if (!stage || stage.over) return
    stage.over = true
    if (locked()) document.exitPointerLock()
    opts.onStage({ type: 'lose' })
  }
  const damage = (kx: number, kz: number, force = false) => {
    if (!stage || stage.over || (stage.invuln > 0 && !force)) return
    stage.invuln = 1.2
    const k = Math.hypot(kx, kz)
    if (k > 0.001) {
      vel.x = (kx / k) * 10
      vel.z = (kz / k) * 10
      vel.y = Math.max(vel.y, 5.5)
    }
    // El escudo para un golpe enemigo, no una caída
    if (!force && stage.hud.shield) {
      stage.shield = shieldTime(stats.defense)
      shake = Math.max(shake, 0.2)
      opts.onSound('clang')
      emitHud({ shield: false })
      return
    }
    shake = Math.max(shake, 0.45)
    opts.onSound('hurt')
    opts.onStage({ type: 'hurt' })
    emitHud({ hearts: Math.max(0, stage.hud.hearts - (force ? 1 : stage.def.bite)) })
    if (stage.hud.hearts <= 0) loseStage()
  }
  const stageCtx: StageCtx = {
    scene,
    mat: matProp,
    matFoe,
    foeFlash,
    coinGeo: props.coin,
    player: { pos, vel },
    solid: (x, y, z) => isSolid(get(x, y, z)),
    hurt: (kx, kz) => damage(kx, kz),
    burst: (x, y, z, hex, amount) => {
      color.set(hex)
      burst(x, y, z, color.r, color.g, color.b, amount)
    },
    shake: (amount) => (shake = Math.max(shake, amount)),
    sound: (name) => opts.onSound(name),
    say: (text) => opts.onStage({ type: 'say', text }),
    hud: emitHud,
    blob,
    checkpoint: (x, y, z) => stage?.check.set(x, y, z),
    liquid: (level) => (liquidLevel = level),
    heal: () => {
      if (!stage || stage.hud.hearts >= stage.def.hearts) return false
      emitHud({ hearts: stage.hud.hearts + 1 })
      return true
    },
    hearts: () => stage?.hud.hearts ?? 0,
    strike: (power) => Math.round(power * DAMAGE * (1 + stats.strength * STRENGTH_STEP)),
    win: (stars) => {
      if (!stage || stage.over) return
      stage.over = true
      opts.onStage({ type: 'win', day: stage.def.day, stars })
    },
    lose: loseStage,
  }
  const enterStage = (day: number) => {
    persist()
    stage?.run.dispose()
    const def = buildStage(day)
    def.hearts += stats.health
    if (!stage) {
      hubSunDir.copy(sunDir)
      hubTerrain.visible = false
      hubGlows.visible = false
      for (const obj of hubObjects) obj.visible = false
    }
    blocks = def.blocks
    chunks = stageChunks
    terrainGroup = stageTerrain
    lightVol = stageLightVol
    roof = stageRoof
    sunVol = stageSunVol
    glowGeo = stageGlowGeo
    lightTex.image.data = stageLightVol
    stageTerrain.visible = def.bounds !== null
    stageGlows.visible = def.bounds !== null
    stageHour = def.hour
    const space = def.kind === 'ships'
    fog.near = space ? 300 : 42
    fog.far = space ? 400 : 125
    snow.visible = !space
    clouds.visible = !space
    blobStage = 0
    updateSky()
    rebuildWorld(def.bounds, false)
    pos.set(def.spawn.x, def.spawn.y, def.spawn.z)
    vel.set(0, 0, 0)
    yaw = def.spawn.yaw
    pitch = 0
    stage = {
      def,
      run: null as unknown as StageRuntime,
      hud: { hearts: def.hearts, boss: null, coins: null, bonus: null, time: null, kills: null, bombs: null, shield: stats.defense > 0 ? true : null },
      invuln: 1.5,
      shield: 0,
      check: new Vector3(def.spawn.x, def.spawn.y, def.spawn.z),
      over: false,
    }
    stage.run = createStage(stageCtx, def, models)
    shadowDirty = true
    setHand()
    opts.onStage({ type: 'enter', day, title: def.title, intro: def.intro, weapon: def.weapon, kind: def.kind, boss: !!def.boss || def.kind === 'horde' || def.kind === 'hunt' || def.ships === 4 })
    emitHud({})
  }
  const faceDoor = (slot: DoorSlot) => {
    pos.set(slot.cx + slot.nx * 2.4, slot.y, slot.cz + slot.nz * 2.4)
    while (hits(pos.x, pos.y, pos.z) && pos.y < H) pos.y++
    vel.set(0, 0, 0)
    yaw = slot.angle
    pitch = 0
  }
  const leaveStage = () => {
    if (!stage) return
    const slot = slots[byDay.get(stage.def.day)!]
    stage.run.dispose()
    stage = null
    // Libera solo los chunks de la fase; los de la fábrica siguen listos en caché
    for (let ci = 0; ci < stageChunks.length; ci++) {
      const old = stageChunks[ci]
      if (old) {
        stageTerrain.remove(old)
        old.geometry.dispose()
        stageChunks[ci] = null
      }
    }
    stageTerrain.visible = false
    stageGlows.visible = false
    blocks = hubBlocks
    chunks = hubChunks
    terrainGroup = hubTerrain
    lightVol = hubLightVol
    roof = hubRoof
    sunVol = hubSunVol
    top = hubTop
    glowGeo = hubGlowGeo
    lightTex.image.data = hubLightVol
    lightTex.needsUpdate = true
    pending.clear()
    sunDir.copy(hubSunDir)
    light.uSunDir.value.copy(sunDir)
    stageHour = null
    liquidLevel = null
    fog.near = hubFog[0]
    fog.far = hubFog[1]
    snow.visible = true
    clouds.visible = true
    hubTerrain.visible = true
    hubGlows.visible = true
    for (const obj of hubObjects) obj.visible = true
    if (!portalGeo.index?.count) portals.visible = false
    blobStage = 0
    updateSky()
    shadowDirty = true
    faceDoor(slot)
    setHand()
    emitInventory()
    opts.onStage({ type: 'exit' })
  }

  // Secretos
  const fx = { planeRoll: -1, planeBoost: 0, big: 0, gold: 0, disco: 0, jump: -1 }
  const once = new Set<SecretId>()
  let ibaiTaps = 0
  let planeAngle = 0
  const trigger = (id: SecretId) => {
    if (id === 'plane') {
      fx.planeRoll = 0
      fx.planeBoost = 4
    } else if (id === 'ibai') fx.big = 8
    else if (id === 'crown') {
      fx.gold = 12
      paintGifts(true)
    } else if (id === 'disco') fx.disco = 8
    opts.onSecret(id)
  }
  const triggerOnce = (id: SecretId) => {
    if (once.has(id)) return
    once.add(id)
    trigger(id)
  }
  const spots = [
    { pos: plane.position, r: 3, far: 200, tap: () => trigger('plane') },
    {
      pos: new Vector3(SPOT.ibai[0], SPOT.ibai[1] + 2.8, SPOT.ibai[2]),
      r: 2.2,
      far: 30,
      tap: () => {
        fx.jump = 0
        if (++ibaiTaps === 5) trigger('ibai')
      },
    },
  ]

  // Acción en la dirección dada: atacar en una fase; en la fábrica, puerta, secreto, picar o poner
  const eye = new Vector3()
  const dir = new Vector3()
  const act = (place: boolean, reach: number) => {
    if (stage) {
      if (stage.over) return
      // El botón secundario lanza el ataque especial
      if (place) {
        if (stage.run.special(eye, dir)) {
          swing = 0
          opts.onStage({ type: 'special' })
        }
      } else if (stage.run.attack(eye, dir)) swing = 0
      return
    }
    const blocked = raycast(eye, dir, reach)
    for (const spot of spots) {
      p.copy(spot.pos).sub(eye)
      const along = p.dot(dir)
      if (along < 0 || along > spot.far || (blocked && hit.dist < along)) continue
      if (p.lengthSq() - along * along < spot.r * spot.r) return spot.tap()
    }
    if (!blocked) return
    const door = doorAt.get(at(hit.x, hit.y, hit.z))
    if (door !== undefined) return tapDoor(door)
    if (place) {
      const x = hit.x + hit.nx
      const y = hit.y + hit.ny
      const z = hit.z + hit.nz
      const left = inventory.get(selected) ?? 0
      if (!left || x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D || get(x, y, z) !== B.AIR) return
      if (doorAt.has(at(x, y, z))) return
      const overlaps =
        x + 1 > pos.x - HALF &&
        x < pos.x + HALF &&
        z + 1 > pos.z - HALF &&
        z < pos.z + HALF &&
        y + 1 > pos.y &&
        y < pos.y + TALL
      if (overlaps) return
      setBlock(x, y, z, selected)
      opts.onSound('place')
      swing = 0
      if (left > 1) inventory.set(selected, left - 1)
      else inventory.delete(selected)
      setHand()
      return emitInventory()
    }
    if (BLOCKS[hit.type].fixed) return
    burstBlock(hit.x, hit.y, hit.z, hit.type, hit.type === B.GIFT ? 20 : 8)
    opts.onSound(hit.type === B.GIFT ? 'gift' : 'break')
    swing = 0
    if (hit.type === B.GIFT) {
      give(LOOT[Math.floor(Math.random() * LOOT.length)], 2 + Math.floor(Math.random() * 3))
      give(LOOT[Math.floor(Math.random() * LOOT.length)])
    } else give(hit.type)
    setBlock(hit.x, hit.y, hit.z, B.AIR)
    setHand()
    emitInventory()
  }
  const lookDir = (out: Vector3) =>
    out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
  // En tercera persona se actúa desde la cabeza del jugador, no desde la cámara
  const aimCenter = () => {
    if (view) {
      eye.set(pos.x, pos.y + EYE, pos.z)
      lookDir(dir)
      return
    }
    eye.copy(camera.position)
    camera.getWorldDirection(dir)
  }
  const aimFromHead = () => {
    if (!view) return
    eye.addScaledVector(dir, camDist)
    p.copy(eye).addScaledVector(dir, raycast(eye, dir, 48) ? hit.dist : 48)
    eye.set(pos.x, pos.y + EYE, pos.z)
    dir.copy(p).sub(eye).normalize()
  }
  const setView = (value: number) => {
    view = value % 3
    camDist = CAM_DIST
    setHand()
    try {
      localStorage.setItem(VIEW_KEY, String(view))
    } catch {}
    opts.onView?.(view)
  }

  // Entrada
  const keys = new Set<string>()
  const stick = { x: 0, y: 0 }
  const touches = new Map<
    number,
    { x: number; y: number; sx: number; sy: number; at: number; moved: number; role: 'move' | 'look' }
  >()
  let jumpHeld = false
  let fireHeld = false
  let actionHeld = false
  let hubRepeat = 0
  // Piloto automático para las pruebas: sustituye a teclado y ratón
  let bot: { f: number; s: number; jump: boolean; fire: boolean; run?: boolean; yaw: number; pitch: number } | null = null
  let timeScale = 1
  let placing = false
  let width = 1
  let height = 1
  let typed = ''
  const KONAMI = 'ArrowUpArrowUpArrowDownArrowDownArrowLeftArrowRightArrowLeftArrowRightba'
  const look = (dx: number, dy: number, speed: number) => {
    if (flying()) {
      if (paused || stage!.over) return
      // Arrastrar lleva la nave con el dedo o el ratón
      const scale = ((2 * shipDist * Math.tan((baseFov * Math.PI) / 360)) / height) * (speed > 0.004 ? 1.25 : 1)
      pos.x += dx * scale
      pos.z += dy * scale
      return bound()
    }
    yaw -= dx * speed
    pitch = Math.max(-1.5, Math.min(1.5, pitch - dy * speed))
  }

  const STICK_RADIUS = 50
  const STICK_DEADZONE = 0.12
  const onDown = (e: PointerEvent) => {
    if (paused || warp > 0) return
    if (e.pointerType === 'mouse' && !lockFailed) {
      if (!locked()) return lock()
      fireHeld = e.button === 0
      aimCenter()
      return act(e.button === 2, 6)
    }
    const rect = canvas.getBoundingClientRect()
    const hasStick = [...touches.values()].some((touch) => touch.role === 'move')
    const role =
      e.pointerType !== 'mouse' && e.clientX - rect.left < width * 0.42 && !hasStick && !flying() ? 'move' : 'look'
    touches.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      at: performance.now(),
      moved: 0,
      role,
    })
    if (role === 'move') opts.onStick(e.clientX, e.clientY, 0, 0, true)
    try {
      canvas.setPointerCapture(e.pointerId)
    } catch {}
  }
  const onMove = (e: PointerEvent) => {
    const touch = touches.get(e.pointerId)
    if (!touch) return
    const dx = e.clientX - touch.x
    const dy = e.clientY - touch.y
    touch.x = e.clientX
    touch.y = e.clientY
    if (Math.abs(dx) > 140 || Math.abs(dy) > 140) return
    touch.moved += Math.abs(dx) + Math.abs(dy)
    if (touch.role === 'look') return look(dx, dy, 0.0055)
    let ox = (touch.x - touch.sx) / STICK_RADIUS
    let oy = (touch.y - touch.sy) / STICK_RADIUS
    const mag = Math.hypot(ox, oy)
    if (mag > 1) {
      ox /= mag
      oy /= mag
    }
    const clampedMag = Math.min(1, mag)
    if (clampedMag < STICK_DEADZONE) {
      stick.x = stick.y = 0
    } else {
      const norm = (clampedMag - STICK_DEADZONE) / (1 - STICK_DEADZONE)
      stick.x = (ox / clampedMag) * norm
      stick.y = -(oy / clampedMag) * norm
    }
    opts.onStick(touch.sx, touch.sy, ox * 34, oy * 34, true)
  }
  const onUp = (e: PointerEvent) => {
    fireHeld = false
    const touch = touches.get(e.pointerId)
    if (!touch) return
    touches.delete(e.pointerId)
    if (touch.role === 'move') {
      stick.x = stick.y = 0
      opts.onStick(0, 0, 0, 0, false)
    }
    const maxMove = e.pointerType === 'mouse' ? 10 : 16
    if (e.type !== 'pointerup' || paused || touch.moved > maxMove || performance.now() - touch.at > 380) return
    if (flying()) return
    // Toque corto: se actúa sobre lo que hay bajo el dedo
    const rect = canvas.getBoundingClientRect()
    eye.copy(camera.position)
    dir
      .set(((e.clientX - rect.left) / width) * 2 - 1, -((e.clientY - rect.top) / height) * 2 + 1, 0.5)
      .unproject(camera)
      .sub(eye)
      .normalize()
    aimFromHead()
    act(stage ? e.button === 2 : placing || e.button === 2, 7)
  }
  const onMouseMove = (e: MouseEvent) => {
    if (locked() && !paused) look(e.movementX, e.movementY, 0.0024)
  }
  const onLockChange = () => {
    if (lockFailed) return
    keys.clear()
    fireHeld = false
    opts.onLock(locked())
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    typed = (typed + e.key).slice(-KONAMI.length)
    if (!stage && (typed.endsWith(KONAMI) || typed.toLowerCase().endsWith('ibai'))) {
      typed = ''
      trigger('disco')
    }
    if (paused) return
    keys.add(e.code)
    if (e.code === 'Space') e.preventDefault()
    if (e.code === 'KeyV' && !e.repeat) setView(view + 1)
    if ((e.code === 'KeyQ' || (e.code === 'Space' && flying())) && stage) {
      aimCenter()
      act(true, 6)
    }
    if (e.code === 'KeyE' || e.code === 'KeyF') {
      aimCenter()
      if (stage || (raycast(eye, dir, 6) && doorAt.has(at(hit.x, hit.y, hit.z)))) act(false, 6)
    }
    if (e.code.startsWith('Digit') && !stage) {
      const type = [...inventory.keys()][Number(e.code.slice(5)) - 1]
      if (type) {
        selected = type
        setHand()
        emitInventory()
      }
    }
  }
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code)
  const onMenu = (e: Event) => e.preventDefault()
  const onContextLost = (e: Event) => e.preventDefault()

  let baseFov = 70
  const resize = () => {
    width = root.clientWidth || 1
    height = root.clientHeight || 1
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    baseFov = camera.aspect < 1 ? 82 : 70
    camera.fov = baseFov
    camera.updateProjectionMatrix()
    const half = Math.tan((baseFov * Math.PI) / 360)
    shipDist = Math.max(FIELD.hz / half, FIELD.hx / (half * camera.aspect)) * 1.1
    snowMat.uniforms.uScale.value = height * dpr
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(root)
  resize()

  // Física: gravedad, colisiones por ejes, cintas, camas elásticas y chocolate
  let speedNow = 0
  const step = (dt: number) => {
    let f = stick.y + (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
    let s = stick.x + (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
    if (bot) {
      f = bot.f
      s = bot.s
    }
    if (stage?.over) f = s = 0
    const len = Math.hypot(f, s)
    if (len > 1) {
      f /= len
      s /= len
    }
    if (flying()) {
      const grip = Math.min(1, dt * 12)
      const speed = 11 * (1 + stats.speed * SPEED_STEP)
      vel.set(vel.x + (s * speed - vel.x) * grip, 0, vel.z + (-f * speed - vel.z) * grip)
      pos.x += vel.x * dt
      pos.z += vel.z * dt
      bound()
      onGround = false
      speedNow = 0
      return
    }
    const jump = !stage?.over && (jumpHeld || keys.has('Space') || !!bot?.jump)
    const bx = Math.floor(pos.x)
    const bz = Math.floor(pos.z)
    const wasLiquid = inLiquid
    inLiquid =
      get(bx, Math.floor(pos.y + 0.4), bz) === B.LIQUID ||
      get(bx, Math.floor(pos.y + 1.2), bz) === B.LIQUID ||
      (liquidLevel !== null && pos.y + 0.4 < liquidLevel)
    if (inLiquid && !wasLiquid) opts.onSound('splash')
    // En táctil se corre llevando la palanca a tope hacia delante
    const sprint = f > 0 && (keys.has('ShiftLeft') || !!bot?.run || (stick.y > 0.92 && Math.abs(stick.x) < 0.5))
    const speed = inLiquid ? 2.6 : (sprint ? 7 : 4.8) * (1 + stats.speed * SPEED_STEP)
    const sin = Math.sin(yaw)
    const cos = Math.cos(yaw)
    const grip = Math.min(1, dt * (onGround || inLiquid ? 14 : 4.5))
    vel.x += ((-sin * f + cos * s) * speed - vel.x) * grip
    vel.z += ((-cos * f - sin * s) * speed - vel.z) * grip

    if (inLiquid) vel.y += ((jump ? 4.2 : -1.6) - vel.y) * Math.min(1, dt * 5)
    else {
      vel.y = Math.max(-40, vel.y - 28 * dt)
      // Un instante de margen tras dejar el borde: los saltos de plataforma perdonan un poco
      if (jump && sinceGround < 0.12 && vel.y <= 0.01) {
        vel.y = 8.7
        sinceGround = 1
        opts.onSound('jump')
      }
    }

    let pushX = 0
    let pushZ = 0
    if (onGround) {
      const under = get(bx, Math.floor(pos.y - 0.1), bz)
      if (under === B.BELT_XP) pushX = BELT.speed
      else if (under === B.BELT_XN) pushX = -BELT.speed
      else if (under === B.BELT_ZP) pushZ = BELT.speed
      else if (under === B.BELT_ZN) pushZ = -BELT.speed
    }

    let bumped = false
    const wantX = pos.x + (vel.x + pushX) * dt
    const wantZ = pos.z + (vel.z + pushZ) * dt
    if (hits(wantX, pos.y, pos.z)) {
      bumped = true
      vel.x = 0
    } else pos.x = wantX
    if (hits(pos.x, pos.y, wantZ)) {
      bumped = true
      vel.z = 0
    } else pos.z = wantZ

    const wasGround = onGround
    onGround = false
    const wantY = pos.y + vel.y * dt
    if (!hits(pos.x, wantY, pos.z)) pos.y = wantY
    else if (vel.y < 0) {
      pos.y = Math.floor(wantY) + 1
      let bouncy = false
      for (const ox of [-HALF, HALF]) {
        for (const oz of [-HALF, HALF]) {
          if (get(Math.floor(pos.x + ox), pos.y - 1, Math.floor(pos.z + oz)) === B.BOUNCE) bouncy = true
        }
      }
      onGround = !bouncy
      vel.y = bouncy ? 19.5 : 0
      if (bouncy) opts.onSound('bounce')
    } else {
      pos.y = Math.floor(wantY + TALL) - TALL - 0.001
      vel.y = 0
    }
    sinceGround = onGround ? 0 : sinceGround + dt

    // Salto automático ante un escalón de un bloque
    const canHop = (onGround || wasGround) && !inLiquid && vel.y <= 0
    if (bumped && len > 0.2 && canHop && !hits(wantX, pos.y + 1.05, wantZ)) vel.y = 8.7
    speedNow = onGround ? Math.hypot(vel.x, vel.z) : 0
    if (vel.lengthSq() > 0.01) dirty = true

    if (stage) {
      // Caerse al vacío cuesta un corazón y devuelve al último punto de control
      if (pos.y < -12 && !stage.over) {
        pos.copy(stage.check)
        vel.set(0, 0, 0)
        damage(0, 0, true)
      }
      return
    }
    if (pos.y < -14) respawn()

    for (let i = 0; i < world.coins.length; i++) {
      if (coinTaken[i]) continue
      const c = world.coins[i]
      const dx = c[0] - pos.x
      const dy = c[1] - (pos.y + 0.9)
      const dz = c[2] - pos.z
      if (dx * dx + dy * dy + dz * dz < 1.7) {
        coinTaken[i] = true
        dirty = true
        burstBlock(c[0] - 0.5, c[1] - 0.5, c[2] - 0.5, B.GOLD, 14)
        opts.onCoins(coinCount(), world.coins.length, true)
      }
    }
    for (let i = 0; i < world.relics.length; i++) {
      if (relicTaken[i]) continue
      const c = world.relics[i]
      const dx = c[0] - pos.x
      const dy = c[1] - (pos.y + 0.9)
      const dz = c[2] - pos.z
      if (dx * dx + dy * dy + dz * dz < 2.25) {
        relicTaken[i] = true
        burst(c[0] - 0.5, c[1] - 0.5, c[2] - 0.5, 0.13, 0.78, 0.69, 24)
        opts.onRelic(i)
      }
    }

    // Acercarse a una puerta abierta del todo lleva a su fase: no hace falta atinar con el hueco
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]
      if (!isOpen(slot.day) || Math.abs(doorAngle[i] - OPEN_ANGLE) > 0.15 || Math.abs(pos.y - slot.y) > 1) continue
      const dx = pos.x - slot.cx
      const dz = pos.z - slot.cz
      const front = dx * slot.nx + dz * slot.nz
      if (front < -0.6 || front > 1.2 || Math.abs(dx * slot.nz - dz * slot.nx) > slot.w / 2 + 0.3) continue
      warp = 0.5
      warpDay = slot.day
      vel.set(0, 0, 0)
      opts.onStage({ type: 'warp', day: warpDay })
      break
    }

    if (pos.y < 13 && Math.abs(pos.x - SPOT.dragon[0]) < 4.4 && Math.abs(pos.z - SPOT.dragon[2]) < 4.4) triggerOnce('dragon')
    if (inLiquid && pos.y > 27.5) triggerOnce('vat')
    if (pos.y > SPOT.crown[1] - 0.5 && Math.abs(pos.x - SPOT.crown[0]) < 2.6 && Math.abs(pos.z - SPOT.crown[2]) < 2.6) triggerOnce('crown')
  }

  // Sombras en tiempo real cerca de la cámara; más lejos quedan las horneadas.
  // Se pintan las caras traseras para que una cara no se sombree a sí misma
  const SHADOW_HALF = 40
  const SHADOW_REACH = 120
  const sunCam = new OrthographicCamera(-SHADOW_HALF, SHADOW_HALF, SHADOW_HALF, -SHADOW_HALF, 1, SHADOW_REACH * 2)
  sunCam.layers.set(SHADOW_LAYER)
  const shadowMat = new MeshBasicMaterial({ side: BackSide, colorWrite: false, fog: false })
  const shadowBias = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
  const focus = new Vector3()
  let shadows = true
  let shadowDirty = true
  disposables.push(shadowMat)
  // Precompila matFoe y SpriteMaterial al arrancar para evitar tirones en el primer golpe a un jefe
  const warmFoe = new Mesh(models.cube, matFoe)
  warmFoe.position.set(0, -999, 0)
  const warmSpriteMat = new SpriteMaterial({ map: glowTex, transparent: true, depthTest: false, depthWrite: false, fog: false })
  const warmSprite = new Sprite(warmSpriteMat)
  warmSprite.position.set(0, -999, 0)
  scene.add(warmFoe, warmSprite)
  renderer.compile(scene, camera)
  scene.remove(warmFoe, warmSprite)
  warmSpriteMat.dispose()

  const renderShadows = () => {
    light.uShadowOn.value = shadows && !flying() ? 1 : 0
    blobMat.opacity = light.uShadowOn.value ? 0.3 : 0.45
    if (!light.uShadowOn.value) return
    if (paused && !shadowDirty && frames % 6 !== 0) return
    if (isMobile && !shadowDirty && frames % 2 !== 0) return
    shadowDirty = false
    // Centrada por delante de la cámara y ajustada a la rejilla de texels para que no tiemble
    const ry = camera.rotation.y
    focus.set(camera.position.x - Math.sin(ry) * SHADOW_HALF * 0.4, pos.y, camera.position.z - Math.cos(ry) * SHADOW_HALF * 0.4)
    sunCam.position.copy(focus).add(sunDir)
    sunCam.lookAt(focus)
    sunCam.updateMatrixWorld()
    const e = sunCam.matrixWorld.elements
    const texel = (SHADOW_HALF * 2) / shadowSize
    const fx = focus.x * e[0] + focus.y * e[1] + focus.z * e[2]
    const fy = focus.x * e[4] + focus.y * e[5] + focus.z * e[6]
    const dx = Math.round(fx / texel) * texel - fx
    const dy = Math.round(fy / texel) * texel - fy
    focus.set(focus.x + e[0] * dx + e[4] * dy, focus.y + e[1] * dx + e[5] * dy, focus.z + e[2] * dx + e[6] * dy)
    sunCam.position.copy(focus).addScaledVector(sunDir, SHADOW_REACH)
    sunCam.updateMatrixWorld()

    const ghost = !avatar.visible
    avatar.visible = true
    scene.overrideMaterial = shadowMat
    renderer.setRenderTarget(shadowTarget)
    renderer.render(scene, sunCam)
    renderer.setRenderTarget(null)
    scene.overrideMaterial = null
    if (ghost) avatar.visible = false
    light.uShadowMatrix.value.multiplyMatrices(shadowBias, sunCam.projectionMatrix).multiply(sunCam.matrixWorldInverse)
  }

  // Bucle
  const point = { x: 0, z: 0 }
  let last = 0
  let lastPausedRender = 0
  let time = 0
  let slow = 0
  let frames = 0
  let skyClock = 0

  const frame = (now: number) => {
    if (paused && isMobile && now - lastPausedRender < 48) {
      last = now
      return
    }
    if (paused) lastPausedRender = now
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016)
    last = now
    time += dt

    // Si el dispositivo no llega, se baja la resolución antes que los fps
    if (!paused && frames++ > 30) {
      slow = dt > 0.024 ? slow + 1 : Math.max(0, slow - 1)
      const threshold = isMobile ? 28 : 45
      if (slow > threshold && dpr > 1) {
        dpr = Math.max(1, dpr - 0.25)
        renderer.setPixelRatio(dpr)
        resize()
        slow = 0
      } else if (slow > threshold && shadows) {
        // Último recurso: solo las sombras horneadas
        shadows = false
        slow = 0
      } else if (isMobile && slow > threshold && dpr > 0.75) {
        dpr = 0.75
        renderer.setPixelRatio(dpr)
        resize()
        slow = 0
      }
    }

    for (let n = 0; n < timeScale; n++) {
      if (warp > 0) {
        warp -= dt
        if (warp <= 0) enterStage(warpDay)
      } else if (!paused) {
        if (bot) {
          yaw = bot.yaw
          pitch = bot.pitch
        }
        step(dt)
        if (stage) {
          stage.invuln -= dt
          if (!stage.over) {
            if (stage.shield > 0 && (stage.shield -= dt) <= 0) {
              opts.onSound('checkpoint')
              emitHud({ shield: true })
            }
            blobCount = 0
            stage.run.update(dt)
            blobStage = blobCount
            if (bot?.fire) {
              eye.set(pos.x, pos.y + EYE, pos.z)
              dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
              act(false, 6)
            } else if ((fireHeld && locked() && stage.def.weapon === 'snow') || (actionHeld && !flying())) {
              aimCenter()
              act(false, 6)
            }
          }
        } else if (actionHeld) {
          hubRepeat -= dt
          if (hubRepeat <= 0) {
            hubRepeat = 0.28
            aimCenter()
            act(placing, 6)
          }
        }
      }
    }

    // Cámara con balanceo al andar, sacudidas y un poco más de campo de visión al correr
    stride += speedNow * dt * (reducedMotion ? 0 : 1)
    shake = Math.max(0, shake - dt * 1.8)
    const bob = Math.sin(stride * 1.9) * 0.035
    const jolt = reducedMotion ? 0 : shake * 0.3
    camera.position.set(
      pos.x + (Math.random() - 0.5) * jolt,
      pos.y + EYE + bob + (Math.random() - 0.5) * jolt,
      pos.z + (Math.random() - 0.5) * jolt
    )
    camera.rotation.set(pitch, yaw, 0)
    const space = flying()
    if (space) {
      camera.position.set(
        FIELD.x + (Math.random() - 0.5) * jolt * 3,
        FIELD.y + shipDist,
        FIELD.z + shipDist * 0.1 + (Math.random() - 0.5) * jolt * 3
      )
      camera.rotation.set(-Math.PI / 2 + 0.1, 0, 0)
    } else if (view) {
      // La cámara se aleja del jugador hasta donde le dejen los bloques
      lookDir(camDir).multiplyScalar(view === 1 ? -1 : 1)
      p.set(pos.x, pos.y + EYE + 0.15, pos.z)
      const room = raycast(p, camDir, CAM_DIST + 0.4) ? Math.max(0.2, hit.dist - 0.4) : CAM_DIST
      camDist = room < camDist ? room : camDist + (room - camDist) * Math.min(1, dt * 6)
      camera.position.addScaledVector(camDir, camDist)
      camera.position.y += 0.15 - bob
      if (view === 2) camera.rotation.set(-pitch, yaw + Math.PI, 0)
    }
    avatar.visible = !space && view > 0 && camDist > 0.9
    const fov = baseFov + (speedNow > 5.5 ? 7 : 0) + (warp > 0 ? (0.5 - warp) * 70 : 0)
    if (Math.abs(fov - camera.fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 8)
      camera.updateProjectionMatrix()
    }

    // Mano: golpe de espada, retroceso del lanzabolas o gesto de picar
    swing = Math.min(1, swing + dt * 5.5)
    const arc = Math.sin(swing * Math.PI)
    const sway = Math.sin(stride * 0.95) * 0.012
    const weapon = stage?.def.weapon
    // También en primera persona, por su sombra
    if (!space) {
      const moveSpeed = Math.hypot(vel.x, vel.z)
      const goal = onGround ? Math.min(1, moveSpeed / 4.8) : inLiquid ? 0.5 : 0.35
      gait += (goal - gait) * Math.min(1, dt * 10)
      const cycle = onGround ? stride * 0.95 : time * (inLiquid ? 5 : 0)
      const walk = (onGround || inLiquid ? Math.sin(cycle) : 1) * gait * (reducedMotion ? 0 : 1)
      avatar.position.set(pos.x, pos.y + Math.abs(Math.sin(cycle)) * gait * 0.04, pos.z)
      avatar.rotation.y = yaw + Math.PI
      head.rotation.x = -pitch * 0.6
      legL.rotation.x = walk * 0.75
      legR.rotation.x = -walk * 0.75
      armL.rotation.x = -walk * 0.75
      armL.rotation.z = -0.06
      armR.rotation.z = 0.06
      if (weapon === 'snow') armR.rotation.x = -Math.PI / 2 - pitch + arc * 0.25
      else if (weapon === 'sword') armR.rotation.x = -0.7 + arc * 0.5 - Math.sin(swing * Math.PI * 2) * 1.3
      else armR.rotation.x = (held.visible ? -0.45 : walk * 0.75) - arc * 1.1
      if (!stage && selfEmoteTimer > 0 && selfEmote) {
        selfEmoteTimer = Math.max(0, selfEmoteTimer - dt)
        const t = 2.6 - selfEmoteTimer
        const motion = opts.reducedMotion ? 0 : 1
        if (selfEmote === 'wave') {
          armR.rotation.x = -2.5
          armR.rotation.z = 0.35 + Math.sin(t * 14) * 0.45 * motion
        } else if (selfEmote === 'dance') {
          avatar.rotation.y += Math.sin(t * 7) * 0.55 * motion
          avatar.position.y += Math.abs(Math.sin(t * 10)) * 0.22 * motion
          armL.rotation.x = -1.6 + Math.sin(t * 10) * 0.7 * motion
          armR.rotation.x = -1.6 - Math.sin(t * 10) * 0.7 * motion
          armL.rotation.z = -0.45
          armR.rotation.z = 0.45
        } else if (selfEmote === 'celebrate') {
          avatar.position.y += Math.abs(Math.sin(t * 8)) * 0.45 * motion
          armL.rotation.x = -2.7
          armR.rotation.x = -2.7
          armL.rotation.z = -0.28
          armR.rotation.z = 0.28
        } else if (selfEmote === 'gg') {
          armR.rotation.x = -2.15
          armR.rotation.z = -0.15
        }
        if (selfEmoteTimer <= 0) selfEmote = null
      }
    }
    if (weapon === 'sword') {
      hand.position.set(0.4 - arc * 0.3 + sway, -0.36 + bob * 0.4, -0.7)
      hand.rotation.set(-0.35 - arc * 1.5, -0.2, -0.35 + arc * 0.9)
      hand.scale.setScalar(0.6)
    } else if (weapon === 'snow') {
      hand.position.set(0.3 + sway, -0.26 + bob * 0.4, -0.5 + arc * 0.09)
      hand.rotation.set(arc * 0.2, 0.1, 0)
      hand.scale.setScalar(0.7)
    } else {
      hand.position.set(0.42 + sway, -0.4 + bob * 0.4 - arc * 0.12, -0.72 - arc * 0.15)
      hand.rotation.set(0.25 - arc * 0.8, 0.7, 0.08)
      hand.scale.setScalar(0.15)
    }

    saveClock += dt
    if (saveClock > 3) {
      saveClock = 0
      if (dirty) persist()
    }
    skyClock += dt
    if (skyClock > 20) {
      skyClock = 0
      updateSky()
    }
    skyUniforms.uTime.value = time
    if (clouds.visible) clouds.position.x = 64 + ((time * 1.1) % CLOUD_PERIOD) - CLOUD_PERIOD * 0.5
    lamp.value.copy(lampBase).multiplyScalar(1 + Math.sin(time * 3.1) * 0.035)
    stripes.offset.y = (time * 1.2) % 1

    // Un trozo del mundo por frame, el más cercano primero
    if (pending.size) {
      let best = -1
      let near = Infinity
      for (const ci of pending) {
        const dx = ((ci % CHUNKS_X) + 0.5) * CHUNK - pos.x
        const dz = (Math.floor(ci / CHUNKS_X) + 0.5) * CHUNK - pos.z
        const d = dx * dx + dz * dz
        if (d < near) {
          near = d
          best = ci
        }
      }
      pending.delete(best)
      buildChunk(best)
    }
    blobCount = stage ? blobStage : 0
    blob(pos.x, pos.y, pos.z, 0.42)
    if (!stage) peers.update(dt, time, blob)

    if (bitsAlive > 0) {
      bits.visible = true
      bitsAlive -= dt
      for (let i = 0; i < BITS; i++) {
        if (bitLife[i] <= 0) continue
        bitLife[i] -= dt
        bitVel[i * 3 + 1] -= 16 * dt
        bitPos[i * 3] += bitVel[i * 3] * dt
        bitPos[i * 3 + 1] += bitVel[i * 3 + 1] * dt
        bitPos[i * 3 + 2] += bitVel[i * 3 + 2] * dt
        if (bitLife[i] <= 0) bitPos[i * 3 + 1] = -999
      }
      bitGeo.attributes.position.needsUpdate = true
      if (bitsAlive <= 0) bits.visible = false
    }

    outline.visible = false
    if (!stage) {
      if ((locked() || isMobile) && !paused && view !== 2) {
        aimCenter()
        if (raycast(eye, dir, 6) && !doorAt.has(at(hit.x, hit.y, hit.z))) {
          outline.visible = true
          outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5)
        }
      }

      for (let i = 0; i < GIFTS; i++) {
        beltPoint(time * BELT.speed + i * (BELT.length / GIFTS), point)
        m4.makeTranslation(point.x, 8, point.z)
        propBatch.setMatrixAt(giftBodyIds[i], m4)
        propBatch.setMatrixAt(giftRibbonIds[i], m4)
        blob(point.x, 8, point.z, 0.55)
      }

      q.setFromAxisAngle(UP, time * 2.4)
      for (let i = 0; i < world.coins.length; i++) {
        if (coinTaken[i]) {
          propBatch.setVisibleAt(coinIds[i], false)
          continue
        }
        const c = world.coins[i]
        propBatch.setMatrixAt(coinIds[i], m4.compose(p.set(c[0], c[1] + Math.sin(time * 2 + i) * 0.12, c[2]), q, one))
        blob(c[0], c[1], c[2], 0.28)
      }

      q.setFromAxisAngle(UP, -time * 1.6)
      for (let i = 0; i < world.relics.length; i++) {
        if (relicTaken[i]) {
          propBatch.setVisibleAt(relicIds[i], false)
          continue
        }
        const c = world.relics[i]
        scale.setScalar(1.1 + Math.sin(time * 4 + i) * 0.08)
        propBatch.setMatrixAt(relicIds[i], m4.compose(p.set(c[0], c[1] + Math.sin(time * 1.7 + i) * 0.18, c[2]), q, scale))
        blob(c[0], c[1] - 0.6, c[2], 0.4)
      }

      for (let i = 0; i < slots.length; i++) {
        const rattling = doorRattle[i] > 0
        if (!rattling && Math.abs(doorGoal[i] - doorAngle[i]) < 0.001) continue
        if (rattling) {
          doorRattle[i] = Math.max(0, doorRattle[i] - dt)
          doorAngle[i] = -Math.abs(Math.sin(doorRattle[i] * 22)) * 0.16 * (doorRattle[i] / 0.6)
        } else doorAngle[i] += (doorGoal[i] - doorAngle[i]) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 4))
        writeDoor(i)
      }

      fx.planeBoost = Math.max(0, fx.planeBoost - dt)
      planeAngle += dt * (fx.planeBoost > 0 ? 1.5 : 0.3)
      planePos.set(SPOT.center[0] + Math.cos(planeAngle) * 30, 43 + Math.sin(time * 0.8), SPOT.center[2] - Math.sin(planeAngle) * 30)
      let planeRollX = -0.3
      if (fx.planeRoll >= 0) {
        fx.planeRoll += dt / 1.2
        planeRollX = -0.3 + Math.min(1, fx.planeRoll) * Math.PI * 2
        if (fx.planeRoll >= 1) fx.planeRoll = -1
      }
      q.setFromAxisAngle(UP, planeAngle + Math.PI / 2)
      q2.setFromAxisAngle(p.set(1, 0, 0), planeRollX)
      q.multiply(q2)
      propBatch.setMatrixAt(planeId, m4.compose(planePos, q, one))

      // Ibai asoma del regalo y sigue al jugador con la mirada
      fx.big = Math.max(0, fx.big - dt)
      let hop = 0
      if (fx.jump >= 0) {
        fx.jump += dt * 2.2
        hop = Math.sin(Math.min(1, fx.jump) * Math.PI) * 1.6
        if (fx.jump >= 1) fx.jump = -1
      }
      const size = fx.big > 0 ? 4.5 : 1.7
      ibaiScale += (size - ibaiScale) * Math.min(1, dt * 6)
      q.setFromAxisAngle(UP, Math.atan2(pos.x - SPOT.ibai[0], pos.z - SPOT.ibai[2]))
      propBatch.setMatrixAt(ibaiId, m4.compose(p.set(SPOT.ibai[0], SPOT.ibai[1] + Math.sin(time * 1.6) * 0.25 + hop, SPOT.ibai[2]), q, scale.setScalar(ibaiScale)))

      const dragonY = SPOT.dragon[1] + Math.sin(time * 1.4) * 0.3
      q.setFromAxisAngle(UP, Math.atan2(pos.x - SPOT.dragon[0], pos.z - SPOT.dragon[2]))
      propBatch.setMatrixAt(dragonId, m4.compose(p.set(SPOT.dragon[0], dragonY, SPOT.dragon[2]), q, scale.setScalar(1.5)))
      blob(SPOT.dragon[0], dragonY, SPOT.dragon[2], 1.5)

      if (fx.gold > 0) {
        fx.gold -= dt
        if (fx.gold <= 0) paintGifts(false)
      }
    }
    if (fx.disco > 0) {
      fx.disco -= dt
      if (fx.disco > 0) mat.color.setHSL((time * 0.6) % 1, 1, 0.62)
      else mat.color.set(0xffffff)
      matProp.color.copy(mat.color)
    }

    drawBlobs()
    renderShadows()
    renderer.render(scene, camera)
  }

  // Solo se renderiza con la pestaña visible y la fábrica en pantalla
  let onScreen = true
  let running = false
  const sync = () => {
    const should = onScreen && !document.hidden
    if (should === running) return
    running = should
    last = performance.now()
    renderer.setAnimationLoop(should ? frame : null)
  }
  const onHide = () => {
    if (document.hidden) persist()
    sync()
  }
  const visibility = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting
    sync()
  })
  visibility.observe(root)

  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('contextmenu', onMenu)
  canvas.addEventListener('webglcontextlost', onContextLost)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('pointerlockchange', onLockChange)
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('pagehide', persist)
  sync()

  setHand()
  opts.onView?.(view)
  emitInventory()
  opts.onCoins(coinCount(), world.coins.length, false)

  return {
    setState,
    getPose(): LocalPose {
      return {
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw,
        pitch,
        speed: speedNow,
        onGround,
        inLiquid,
        inStage: Boolean(stage),
      }
    },
    syncPeers(list: Map<number, RemotePeer>) {
      peers.syncPeers(list)
    },
    peerEmote(id: number, emote: EmoteId) {
      peers.triggerEmote(id, emote)
    },
    playEmote(emote: EmoteId) {
      if (stage) return
      selfEmote = emote
      selfEmoteTimer = 2.6
    },
    setStats(value: PlayerStats) {
      stats = { ...value }
    },
    trigger,
    leaveStage,
    goToDoor(day: number) {
      const i = byDay.get(day)
      if (i === undefined || stage || warp > 0) return
      faceDoor(slots[i])
    },
    retryStage() {
      if (stage) enterStage(stage.def.day)
    },
    // Solo para pruebas: piloto automático, velocidad del tiempo y lectura del estado
    debug: {
      drive(input: typeof bot) {
        bot = input
      },
      scale(value: number) {
        timeScale = value
      },
      solid: (x: number, y: number, z: number) => isSolid(get(Math.floor(x), Math.floor(y), Math.floor(z))),
      perf: () => ({
        isMobile,
        lowEnd,
        dpr,
        shadows,
        shadowSize,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      }),
      state: () => ({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        onGround,
        hearts: stage?.hud.hearts ?? 0,
        over: stage?.over ?? false,
        route: stage?.def.route ?? [],
        kind: stage?.def.kind ?? '',
        peek: stage?.run.peek() ?? null,
      }),
    },
    // Solo para pruebas: coloca al jugador
    teleport(x: number, y: number, z: number, angle = 0) {
      pos.set(x, y, z)
      vel.set(0, 0, 0)
      yaw = angle
      pitch = 0
    },
    // Solo para pruebas: entra directamente en la fase de un día
    warpTo(day: number) {
      if (!byDay.has(day) || warp > 0) return
      warp = 0.5
      warpDay = day
      opts.onStage({ type: 'warp', day })
    },
    setPaused(value: boolean) {
      paused = value
      if (!value) return
      keys.clear()
      touches.clear()
      stick.x = stick.y = 0
      opts.onStick(0, 0, 0, 0, false)
      jumpHeld = fireHeld = actionHeld = false
    },
    play() {
      paused = false
      if (matchMedia('(pointer: fine)').matches) lock()
    },
    release() {
      if (locked()) document.exitPointerLock()
    },
    jump(value: boolean) {
      jumpHeld = value
    },
    action(value: boolean) {
      actionHeld = value
      if (!value || paused || warp > 0 || flying()) return
      hubRepeat = 0.32
      aimCenter()
      act(stage ? false : placing, 6)
    },
    lookBy(dx: number, dy: number) {
      if (paused || warp > 0) return
      look(dx, dy, 0.0055)
    },
    special() {
      if (!stage || paused) return
      aimCenter()
      act(true, 6)
    },
    cycleView() {
      setView(view + 1)
    },
    setPlacing(value: boolean) {
      placing = value
    },
    pick(type: number) {
      if (!inventory.has(type)) return
      selected = type
      dirty = true
      setHand()
      emitInventory()
    },
    wipe() {
      wiped = true
      try {
        localStorage.removeItem(SAVE_KEY)
      } catch {}
    },
    dispose() {
      persist()
      renderer.setAnimationLoop(null)
      if (locked()) document.exitPointerLock()
      stage?.run.dispose()
      visibility.disconnect()
      resizeObserver.disconnect()
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('pagehide', persist)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('contextmenu', onMenu)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      for (const chunk of hubChunks) chunk?.geometry.dispose()
      for (const chunk of stageChunks) chunk?.geometry.dispose()
      liquid?.geometry.dispose()
      disposeModels(models)
      peers.dispose()
      for (const item of disposables) item.dispose()
      doorBatch.dispose()
      propBatch.dispose()
      blobs.dispose()
      renderer.dispose()
    },
  }
}

export type Factory = Awaited<ReturnType<typeof createFactory>>
