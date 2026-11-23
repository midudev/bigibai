import { Voxels, mulberry32 } from './voxels'

export const W = 128
export const H = 48
export const D = 128
// Altura a la que se pisa el suelo
export const G = 8
const C = 64
// Centro de la plaza de la aldea
const VX = 110
const VZ = 83

export const B = {
  AIR: 0,
  FLOOR_A: 1,
  FLOOR_B: 2,
  STEEL: 3,
  STEEL_LIGHT: 4,
  STEEL_DARK: 5,
  PIPE: 6,
  PIPE_BLUE: 7,
  CHOC: 8,
  CHOC_LIGHT: 9,
  GOLD: 10,
  RED: 11,
  GREEN: 12,
  CREAM: 13,
  GLOW: 14,
  WOOD: 15,
  PURPLE: 16,
  TEAL: 17,
  SNOW: 18,
  FRAME: 19,
  VAT: 20,
  BELT_XP: 21,
  BELT_XN: 22,
  BELT_ZP: 23,
  BELT_ZN: 24,
  BOUNCE: 25,
  GIFT: 26,
  LIQUID: 27,
  BRICK: 28,
  STONE: 29,
  DOOR_GLOW: 30,
  DOOR_CELL: 31,
  DARK_STONE: 32,
  ROOF_RED: 33,
  ROOF_BLUE: 34,
  GLASS: 35,
  ICE: 36,
  CANDY: 37,
  GINGER: 38,
  COBBLE: 39,
  COAL: 40,
  PINK: 41,
  FRAME_WOOD: 42,
  FRAME_STONE: 43,
  FRAME_GOLD: 44,
  FRAME_CANDY: 45,
  PLASTER: 46,
  TIMBER: 47,
  WINDOW: 48,
} as const

interface BlockDef {
  color: number
  name: string
  glow?: boolean
  // No se puede picar
  fixed?: boolean
}

export const BLOCKS: Record<number, BlockDef> = {
  [B.FLOOR_A]: { color: 0x102a5e, name: 'Baldosa oscura' },
  [B.FLOOR_B]: { color: 0x16377a, name: 'Baldosa' },
  [B.STEEL]: { color: 0x1f4a8f, name: 'Acero azul' },
  [B.STEEL_LIGHT]: { color: 0x3a74c4, name: 'Acero claro' },
  [B.STEEL_DARK]: { color: 0x14306b, name: 'Acero oscuro' },
  [B.PIPE]: { color: 0xe8f1ff, name: 'Tubería' },
  [B.PIPE_BLUE]: { color: 0x2c62b8, name: 'Anilla' },
  [B.CHOC]: { color: 0x5a2d1a, name: 'Chocolate' },
  [B.CHOC_LIGHT]: { color: 0x7a4428, name: 'Chocolate con leche' },
  [B.GOLD]: { color: 0xf8b132, name: 'Oro' },
  [B.RED]: { color: 0xc8323c, name: 'Lazo rojo' },
  [B.GREEN]: { color: 0x1c7a45, name: 'Abeto' },
  [B.CREAM]: { color: 0xf2e6c9, name: 'Papel de regalo' },
  [B.GLOW]: { color: 0xffd97a, name: 'Farol', glow: true },
  [B.WOOD]: { color: 0x9a6b3a, name: 'Madera' },
  [B.PURPLE]: { color: 0x5b2fa0, name: 'Terciopelo' },
  [B.TEAL]: { color: 0x21c7b0, name: 'Luz turquesa', glow: true },
  [B.SNOW]: { color: 0xdfeaff, name: 'Nieve' },
  [B.FRAME]: { color: 0x6fa3e8, name: 'Marco', fixed: true },
  [B.VAT]: { color: 0xbfd8f5, name: 'Cuba' },
  [B.BELT_XP]: { color: 0x4a5d85, name: 'Cinta', fixed: true },
  [B.BELT_XN]: { color: 0x4a5d85, name: 'Cinta', fixed: true },
  [B.BELT_ZP]: { color: 0x4a5d85, name: 'Cinta', fixed: true },
  [B.BELT_ZN]: { color: 0x4a5d85, name: 'Cinta', fixed: true },
  [B.BOUNCE]: { color: 0xe0489a, name: 'Cama elástica' },
  [B.GIFT]: { color: 0xffffff, name: 'Regalo sorpresa' },
  [B.LIQUID]: { color: 0x5a2d1a, name: 'Chocolate fundido', fixed: true },
  [B.BRICK]: { color: 0xb5523c, name: 'Ladrillo' },
  [B.STONE]: { color: 0x9aa6c2, name: 'Piedra' },
  [B.DOOR_GLOW]: { color: 0xffd97a, name: 'Puerta', glow: true, fixed: true },
  [B.DOOR_CELL]: { color: 0, name: 'Puerta', fixed: true },
  [B.DARK_STONE]: { color: 0x474d70, name: 'Piedra del castillo' },
  [B.ROOF_RED]: { color: 0xc8323c, name: 'Teja roja' },
  [B.ROOF_BLUE]: { color: 0x2c62b8, name: 'Teja azul' },
  [B.GLASS]: { color: 0x9fdcf2, name: 'Cristal' },
  [B.ICE]: { color: 0xcfeaff, name: 'Hielo' },
  [B.CANDY]: { color: 0xffffff, name: 'Bastón de caramelo' },
  [B.GINGER]: { color: 0xb5733a, name: 'Galleta de jengibre' },
  [B.COBBLE]: { color: 0x6f7da6, name: 'Adoquín' },
  [B.COAL]: { color: 0x23263a, name: 'Carbón' },
  [B.PINK]: { color: 0xf08bb4, name: 'Glaseado' },
  [B.FRAME_WOOD]: { color: 0x6b4424, name: 'Marco de madera', fixed: true },
  [B.FRAME_STONE]: { color: 0xd3dbee, name: 'Marco de piedra', fixed: true },
  [B.FRAME_GOLD]: { color: 0xf8b132, name: 'Marco dorado', fixed: true },
  [B.FRAME_CANDY]: { color: 0xffffff, name: 'Marco de caramelo', fixed: true },
  [B.PLASTER]: { color: 0xeee2c8, name: 'Enlucido' },
  [B.TIMBER]: { color: 0x4f3220, name: 'Viga' },
  [B.WINDOW]: { color: 0xffbf5e, name: 'Ventana', glow: true },
}

// Lo que puede salir de un regalo sorpresa
export const LOOT = [B.GOLD, B.TEAL, B.PURPLE, B.RED, B.CREAM, B.BOUNCE, B.GLOW, B.CANDY, B.PINK]

export const BELT = { length: 88, speed: 2.5 }

// Cada estilo de puerta tiene su tamaño: ancho, alto y número de hojas
export const DOOR_STYLES = {
  panel: { w: 1, h: 2, leaves: 1 },
  candy: { w: 1, h: 2, leaves: 1 },
  porthole: { w: 1, h: 2, leaves: 1 },
  tall: { w: 1, h: 3, leaves: 1 },
  barn: { w: 2, h: 2, leaves: 2 },
  vault: { w: 2, h: 2, leaves: 1 },
  gate: { w: 2, h: 3, leaves: 2 },
  shutter: { w: 3, h: 3, leaves: 2 },
} as const
export type DoorStyle = keyof typeof DOOR_STYLES
// Dónde va el número: placa en el dintel, pintado en la fachada, farolillo colgante o felpudo con placa
type SignKind = 'plaque' | 'big' | 'lantern' | 'mat'
type Vec3 = [number, number, number]

export interface DoorSign {
  // Centro y semiejes del cartel
  c: Vec3
  u: Vec3
  v: Vec3
  stencil: boolean
}

export interface DoorSlot {
  day: number
  style: DoorStyle
  w: number
  h: number
  // Celda de la jamba izquierda; el hueco sigue hacia la derecha de quien mira la puerta
  x: number
  y: number
  z: number
  nx: number
  nz: number
  angle: number
  // Centro del hueco
  cx: number
  cz: number
  signs: DoorSign[]
}

export const at = (x: number, y: number, z: number) => x | (z << 7) | (y << 14)

export function beltPoint(d: number, out: { x: number; z: number }) {
  d = ((d % BELT.length) + BELT.length) % BELT.length
  const lo = C - 10.5
  const hi = C + 11.5
  if (d < 22) return (out.x = lo + d), (out.z = hi), out
  if (d < 44) return (out.x = hi), (out.z = hi - (d - 22)), out
  if (d < 66) return (out.x = hi - (d - 44)), (out.z = lo), out
  return (out.x = lo), (out.z = lo + (d - 66)), out
}

// Caminos de adoquín entre la plaza y cada edificio
const PATHS = [
  [62, 81, 66, 119], [62, 31, 66, 47], [104, 76, 116, 89], [101, 87, 103, 89], [117, 82, 117, 84], [39, 62, 47, 66], [81, 62, 88, 66], [88, 56, 91, 61],
  [40, 95, 61, 97], [57, 98, 61, 102], [33, 95, 40, 97], [33, 87, 35, 95], [67, 90, 71, 94],
  [67, 84, 79, 86], [67, 100, 99, 102], [29, 45, 47, 48], [48, 40, 61, 42], [20, 73, 24, 76],
  [20, 75, 40, 76], [39, 67, 41, 76], [67, 45, 99, 47], [91, 39, 93, 44], [40, 49, 42, 61],
  [42, 67, 43, 81],
]

export function generate() {
  const blocks = new Uint8Array(W * H * D)
  const rand = mulberry32(42)
  const doors: DoorSlot[] = []
  const coins: Vec3[] = []

  const get = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D ? blocks[at(x, y, z)] : B.AIR
  const set = (x: number, y: number, z: number, t: number) => {
    if (x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D) blocks[at(x, y, z)] = t
  }
  const fill = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, t: number) => {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) set(x, y, z, t)
      }
    }
  }
  const ring = (x0: number, z0: number, x1: number, z1: number, y: number, t: number) => {
    fill(x0, y, z0, x1, y, z0, t)
    fill(x0, y, z1, x1, y, z1, t)
    fill(x0, y, z0, x0, y, z1, t)
    fill(x1, y, z0, x1, y, z1, t)
  }
  const cyl = (cx: number, cz: number, r: number, y0: number, y1: number, t: number) => {
    for (let z = cz - r; z <= cz + r; z++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (Math.hypot(x - cx, z - cz) <= r + 0.5) fill(x, y0, z, x, y1, z, t)
      }
    }
  }
  // Media esfera hueca apoyada en y0
  const dome = (cx: number, y0: number, cz: number, r: number, pick: (x: number, y: number, z: number) => number) => {
    for (let y = y0; y <= y0 + r; y++) {
      for (let z = cz - r; z <= cz + r; z++) {
        for (let x = cx - r; x <= cx + r; x++) {
          const d = Math.hypot(x - cx, y - y0, z - cz)
          if (d <= r + 0.5 && d > r - 0.6) set(x, y, z, pick(x, y, z))
        }
      }
    }
  }
  const pyramid = (x0: number, z0: number, x1: number, z1: number, y: number, t: number) => {
    for (let i = 0; x0 + i <= x1 - i && z0 + i <= z1 - i; i++) fill(x0 + i, y + i, z0 + i, x1 - i, y + i, z1 - i, t)
  }
  const coin = (x: number, y: number, z: number) => coins.push([x + 0.5, y + 0.5, z + 0.5])
  const hash = (x: number, y: number, z: number) => (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) % 97

  // Colina del castillo: terrazas de un bloque que se suben a saltos
  const hill = (x: number, z: number) => Math.max(0, 4 - Math.max(46 - x, x - 81, 12 - z, z - 36, 0))

  // Isla flotante: nieve, baldosas en la plaza, adoquín en los caminos y chocolate bajo el suelo.
  // Al este se ensancha para la aldea y su borde sube en terrazas
  const pathMap = new Uint8Array(W * D)
  for (const [x0, z0, x1, z1] of PATHS) {
    for (let z = z0; z <= z1; z++) {
      const zOff = z << 7
      for (let x = x0; x <= x1; x++) pathMap[x | zOff] = 1
    }
  }
  for (let z = 0; z < D; z++) {
    const zOff = z << 7
    for (let x = 0; x < W; x++) {
      const dx = x - 63.5
      const dz = z - 63.5
      const angle = Math.atan2(dz, dx)
      const bulge = 7 * Math.exp(-(((angle - 0.4) / 0.38) ** 2))
      const edge = 57 + Math.sin(angle * 5) * 2 + Math.sin(angle * 11 + 1) + bulge
      const r = Math.hypot(dx, dz)
      if (r > edge) continue
      const terrace = bulge > 1.5 && x > VX + 2 ? Math.max(0, Math.min(3, Math.floor((r - edge + 8) / 2.4))) : 0
      const level = G + hill(x, z) + terrace
      const plaza = Math.abs(dx) < 17 && Math.abs(dz) < 17
      const top = plaza ? (((x >> 1) + (z >> 1)) % 2 ? B.FLOOR_A : B.FLOOR_B) : pathMap[x | zOff] ? B.COBBLE : B.SNOW
      for (let y = Math.max(0, Math.round(7 - (edge - r) * 1.2)); y < level; y++) {
        set(x, y, z, y === level - 1 ? top : y >= 4 ? B.CHOC : B.STEEL_DARK)
      }
    }
  }

  // Hueco de una puerta: celdas invisibles, fondo iluminado, marco irrompible y su número
  const door = (
    day: number, style: DoorStyle, x: number, y: number, z: number, nx: number, nz: number,
    { sign = 'plaque' as SignKind, size = 0, frame = B.FRAME as number } = {}
  ) => {
    const { w, h } = DOOR_STYLES[style]
    const rx = nz
    const rz = -nx
    for (let k = -1; k <= w; k++) {
      const px = x + rx * k
      const pz = z + rz * k
      for (let dy = 0; dy <= h; dy++) {
        if (k < 0 || k === w || dy === h) set(px, y + dy, pz, frame)
        else {
          set(px, y + dy, pz, B.DOOR_CELL)
          set(px - nx, y + dy, pz - nz, B.DOOR_GLOW)
        }
      }
    }
    const cx = x + 0.5 + (rx * (w - 1)) / 2
    const cz = z + 0.5 + (rz * (w - 1)) / 2
    const signs: DoorSign[] = []
    if (sign === 'lantern') {
      // Un brazo sale del marco y de él cuelga un farolillo con el número en sus cuatro caras
      const ax = x + rx * w + nx
      const az = z + rz * w + nz
      const s = 0.42
      set(ax, y + h, az, frame)
      for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        signs.push({
          c: [ax + 0.5 + fx * s, y + h - s - 0.02, az + 0.5 + fz * s],
          u: [fz * s, 0, -fx * s],
          v: [0, s, 0],
          stencil: false,
        })
      }
    } else {
      const big = sign === 'big'
      const s = size || (big ? 1.1 : 0.46)
      const base = y + h + (big ? 1.1 : 0.04)
      signs.push({ c: [cx + nx * 0.53, base + s, cz + nz * 0.53], u: [rx * s, 0, rz * s], v: [0, s, 0], stencil: big })
    }
    if (sign === 'mat') {
      const s = 0.62
      signs.push({ c: [cx + nx * 1.2, y + 0.03, cz + nz * 1.2], u: [rx * s, 0, rz * s], v: [-nx * s, 0, -nz * s], stencil: false })
    }
    doors.push({ day, style, w, h, x, y, z, nx, nz, angle: Math.atan2(nx, nz), cx, cz, signs })
  }
  const lamp = (x: number, z: number, y = G) => {
    fill(x, y, z, x, y + 2, z, B.STEEL_LIGHT)
    set(x, y + 3, z, B.GLOW)
  }
  const fir = (x: number, z: number, withCoin = false) => {
    if (get(x, G - 1, z) !== B.SNOW || get(x, G, z) !== B.AIR) return
    fill(x, G, z, x, G + 1, z, B.WOOD)
    fill(x - 2, 10, z - 2, x + 2, 10, z + 2, B.GREEN)
    fill(x - 1, 11, z - 1, x + 1, 12, z + 1, B.GREEN)
    set(x, 13, z, B.GREEN)
    set(x, 14, z, B.GOLD)
    set(x - 2, 10, z - 2, B.RED)
    set(x + 2, 10, z + 2, B.TEAL)
    if (withCoin) coin(x, 15, z)
  }

  // Río de chocolate: nace en la cascada de la torre y cae por el borde de la isla
  for (let x = 4; x <= 57; x++) {
    for (const z of [50, 51]) {
      if (get(x, 7, z)) set(x, 7, z, B.LIQUID)
      else if (get(x + 1, 7, z)) fill(x, 0, z, x, 7, z, B.LIQUID)
    }
  }
  fill(56, 7, 52, 57, 7, 57, B.LIQUID)
  fill(40, 7, 50, 42, 7, 51, B.WOOD)
  fill(30, 7, 50, 34, 7, 51, B.WOOD)

  // Torre central: sala secreta, conducto de chocolate y cuba
  fill(C - 5, G, C - 5, C + 5, 13, C + 5, B.STEEL)
  fill(C - 4, G, C - 4, C + 4, 12, C + 4, B.AIR)
  fill(C - 5, 13, C - 5, C + 5, 13, C + 5, B.STEEL_LIGHT)
  for (const c of [C - 5, C + 5]) for (const e of [C - 5, C + 5]) fill(c, G, e, c, 12, e, B.STEEL_DARK)
  door(12, 'gate', C - 1, G, C + 5, 0, 1, { size: 1, frame: B.FRAME_GOLD })
  door(2, 'vault', C, G, C - 5, 0, -1, { size: 0.9 })
  door(5, 'panel', C + 5, G, C, 1, 0, { sign: 'lantern' })
  door(15, 'porthole', C - 5, G, C, -1, 0, { sign: 'lantern' })
  fill(C - 3, 14, C - 3, C + 3, 26, C + 3, B.PIPE)
  for (const y of [16, 20, 24]) ring(C - 3, C - 3, C + 3, C + 3, y, B.PIPE_BLUE)
  fill(C - 5, 27, C - 5, C + 5, 27, C + 5, B.STEEL_LIGHT)
  for (let y = 28; y <= 31; y++) ring(C - 5, C - 5, C + 5, C + 5, y, y === 31 ? B.CHOC : B.VAT)
  for (let i = 0; i < 26; i++) {
    const along = C - 5 + Math.floor(rand() * 11)
    const side = Math.floor(rand() * 4)
    const drop = 30 - Math.floor(rand() * 2)
    const [x, z] = side === 0 ? [along, C - 5] : side === 1 ? [along, C + 5] : side === 2 ? [C - 5, along] : [C + 5, along]
    fill(x, drop, z, x, 30, z, B.CHOC)
  }
  fill(C - 4, 28, C - 4, C + 4, 30, C + 4, B.LIQUID)
  fill(C - 2, 13, C - 2, C + 2, 27, C + 2, B.LIQUID)

  // Cascadas de chocolate: se puede subir nadando hasta la cuba
  for (const sg of [1, -1]) {
    const f = C + 6 * sg
    fill(f, G, f, f, 32, f, B.LIQUID)
    fill(Math.min(f, f + sg), 7, Math.min(f, f + sg), Math.max(f, f + sg), 7, Math.max(f, f + sg), B.LIQUID)
    coin(f + sg, G, f + sg)
  }

  // Cinta transportadora que rodea la torre
  for (let i = C - 11; i <= C + 11; i++) {
    set(i, 7, C + 11, B.BELT_XP)
    set(C + 11, 7, i, B.BELT_ZN)
    set(i, 7, C - 11, B.BELT_XN)
    set(C - 11, 7, i, B.BELT_ZP)
  }
  set(C - 11, 7, C + 11, B.BELT_XP)

  // Camas elásticas para subir a la azotea de la torre
  set(C + 6, 7, C - 6, B.BOUNCE)
  set(C - 6, 7, C + 6, B.BOUNCE)
  coin(C - 4, 14, C + 4)
  coin(C + 4, 14, C - 4)
  coin(C, 32, C - 5)
  coin(C, 32, C + 5)
  coin(C - 3, G, C - 3)

  // Arco de entrada de bastones de caramelo
  for (const x of [59, 69]) fill(x, G, 108, x, 14, 108, B.CANDY)
  fill(59, 15, 108, 69, 15, 108, B.CANDY)
  for (let x = 60; x <= 68; x++) set(x, 14, 108, x % 2 ? B.GREEN : x % 4 ? B.RED : B.GOLD)
  set(64, 16, 108, B.GOLD)
  set(64, 17, 108, B.GLOW)
  for (const x of [58, 70]) set(x, 15, 108, B.GLOW)

  // Casa de jengibre: tejado de tableta con glaseado y chimenea
  fill(36, G, 82, 48, 12, 94, B.GINGER)
  fill(37, G, 83, 47, 12, 93, B.AIR)
  fill(37, 7, 83, 47, 7, 93, B.WOOD)
  for (const x of [36, 48]) for (const z of [82, 94]) fill(x, G, z, x, 12, z, B.CHOC)
  for (let i = 0; i <= 7; i++) {
    fill(35 + i, 13 + i, 82, 49 - i, 13 + i, 94, B.CHOC_LIGHT)
    for (const z of [82, 94]) {
      if (i < 7) fill(36 + i, 13 + i, z, 48 - i, 13 + i, z, B.GINGER)
      set(35 + i, 13 + i, z, B.SNOW)
      set(49 - i, 13 + i, z, B.SNOW)
    }
  }
  fill(35, 13, 81, 35, 13, 95, B.SNOW)
  fill(49, 13, 81, 49, 13, 95, B.SNOW)
  for (let x = 37; x <= 47; x += 2) set(x, 13, 95, [B.RED, B.TEAL, B.GOLD, B.PINK][(x >> 1) % 4])
  for (const x of [38, 39, 45, 46]) set(x, 10, 94, B.GLOW)
  for (const z of [86, 90]) for (const x of [36, 48]) set(x, 10, z, B.GLOW)
  set(42, 15, 94, B.GLOW)
  set(42, 17, 94, B.PINK)
  fill(45, 15, 86, 46, 19, 87, B.BRICK)
  fill(45, 20, 86, 46, 20, 87, B.SNOW)
  door(7, 'barn', 41, G, 94, 0, 1, { size: 0.9, frame: B.FRAME_CANDY })
  door(4, 'candy', 42, G, 82, 0, -1, { sign: 'mat', frame: B.FRAME_CANDY })
  // Piruletas en el jardín
  for (const [x, z, t] of [[37, 99, B.PINK], [47, 99, B.TEAL], [34, 92, B.RED]]) {
    fill(x, G, z, x, G + 2, z, B.CANDY)
    fill(x - 1, G + 3, z, x + 1, G + 5, z, t)
    set(x, G + 4, z, B.CREAM)
  }

  // El regalo gigante: de su tapa asoma Ibai
  fill(80, G, 80, 90, 15, 90, B.CREAM)
  fill(81, G, 81, 89, 14, 89, B.AIR)
  for (let y = G; y <= 15; y++) {
    for (let i = 80; i <= 90; i++) {
      if ((i + y) % 4 === 0 && y % 3 === 1) for (const e of [80, 90]) set(i, y, e, B.GOLD), set(e, y, i, B.GOLD)
    }
  }
  for (const e of [80, 90]) {
    fill(84, G, e, 86, 15, e, B.RED)
    fill(e, G, 84, e, 15, 86, B.RED)
  }
  fill(79, 16, 79, 91, 17, 91, B.CREAM)
  fill(84, 16, 79, 86, 17, 91, B.RED)
  fill(79, 16, 84, 91, 17, 86, B.RED)
  for (const x of [82, 88]) fill(x, 18, 85, x + (x < 85 ? 1 : -1), 19, 85, B.RED)
  door(19, 'tall', 80, G, 85, -1, 0, { sign: 'big', frame: B.FRAME_GOLD })
  coin(82, 18, 82)
  coin(88, 18, 88)

  // Puestos del mercadillo con toldo
  fill(52, G, 98, 56, 10, 102, B.WOOD)
  for (let z = 97; z <= 103; z++) fill(52, 11, z, 58, 11, z, z % 2 ? B.CANDY : B.CREAM)
  for (const z of [97, 103]) fill(58, G, z, 58, 10, z, B.WOOD)
  set(57, G, 102, B.GIFT)
  set(54, 10, 98, B.GLOW)
  door(1, 'panel', 56, G, 100, 1, 0, { sign: 'lantern', frame: B.FRAME_WOOD })
  fill(72, G, 90, 76, 10, 94, B.PURPLE)
  for (let z = 89; z <= 95; z++) fill(70, 11, z, 76, 11, z, z % 2 ? B.GREEN : B.CREAM)
  for (const z of [89, 95]) fill(70, G, z, 70, 10, z, B.GOLD)
  set(71, G, 90, B.GIFT)
  set(74, 10, 94, B.GLOW)
  door(6, 'candy', 72, G, 92, -1, 0, { sign: 'lantern', frame: B.FRAME_CANDY })

  // Nave de empaquetado: tejado a dos aguas, chimeneas y una caseta en la azotea
  fill(16, G, 56, 38, 14, 72, B.STEEL)
  fill(17, G, 57, 37, 14, 71, B.AIR)
  ring(16, 56, 38, 72, 11, B.STEEL_LIGHT)
  for (let i = 0; i < 3; i++) {
    fill(16, 15 + i, 56 + i * 2, 38, 15 + i, 72 - i * 2, B.STEEL_LIGHT)
    for (let x = 16; x <= 38; x += 4) fill(x, 15 + i, 56 + i * 2, x, 15 + i, 72 - i * 2, B.PIPE_BLUE)
  }
  for (let x = 19; x <= 35; x += 4) for (const z of [56, 72]) set(x, 13, z, B.GLOW)
  for (let z = 59; z <= 69; z += 5) set(16, 13, z, B.GLOW)
  for (const z of [61, 67]) fill(38, G, z, 38, 11, z, z === 61 ? B.GOLD : B.COAL)
  door(21, 'shutter', 38, G, 65, 1, 0, { sign: 'big' })
  door(9, 'porthole', 22, G, 72, 0, 1, { sign: 'lantern' })
  fill(24, 18, 62, 28, 20, 66, B.BRICK)
  fill(23, 21, 61, 29, 21, 67, B.ROOF_RED)
  fill(25, 22, 63, 27, 22, 65, B.ROOF_RED)
  door(17, 'panel', 28, 18, 64, 1, 0, { sign: 'mat', frame: B.FRAME_STONE })
  for (let i = 0; i <= 7; i++) fill(37 - i, G, 54, 37 - i, G + i, 55, B.STEEL_DARK)
  fill(19, 16, 59, 20, 23, 60, B.PIPE)
  fill(19, 21, 59, 20, 21, 60, B.PIPE_BLUE)
  fill(34, 16, 68, 35, 21, 69, B.PIPE)
  fill(34, 19, 68, 35, 19, 69, B.PIPE_BLUE)
  for (const [x, y, z] of [[20, 26, 60], [21, 28, 61], [35, 24, 69], [36, 26, 69]]) fill(x, y, z, x + 1, y, z + 1, B.SNOW)
  fill(40, G, 58, 41, G, 59, B.WOOD)
  set(40, G + 1, 58, B.WOOD)
  set(41, G + 1, 59, B.GIFT)
  set(15, 7, 62, B.BOUNCE)
  coin(22, 18, 58)
  coin(32, 18, 70)
  coin(20, 24, 60)

  // Silos de leche, cacao y fresa unidos por una pasarela
  const silo = (x: number, z: number, top: number, band: number) => {
    cyl(x, z, 4, G, top, B.VAT)
    for (let y = G + 3; y < top; y += 4) cyl(x, z, 4, y, y, band)
  }
  silo(96, 58, 19, B.CREAM)
  silo(106, 66, 23, B.CHOC_LIGHT)
  cyl(106, 66, 3, 24, 24, B.VAT)
  cyl(106, 66, 2, 25, 25, B.VAT)
  set(106, 26, 66, B.GLOW)
  silo(96, 74, 17, B.PINK)
  cyl(96, 74, 3, 18, 18, B.VAT)
  set(96, 19, 74, B.TEAL)
  fill(94, 13, 63, 97, 13, 69, B.STEEL_LIGHT)
  fill(98, 13, 65, 101, 13, 67, B.STEEL_LIGHT)
  for (const z of [63, 69]) set(94, 14, z, B.PIPE_BLUE)
  for (let i = 0; i <= 4; i++) fill(89 + i, G, 65, 89 + i, G + i, 67, B.STEEL_DARK)
  door(11, 'vault', 92, G, 57, -1, 0, { sign: 'big' })
  door(22, 'porthole', 102, 14, 66, -1, 0)
  // Tubería transitable del silo a la torre
  for (let x = 68; x <= 95; x++) set(x, 19, 62, x % 4 === 2 ? B.PIPE_BLUE : B.PIPE)
  fill(80, G, 61, 80, 18, 61, B.STEEL_LIGHT)
  set(100, 7, 54, B.BOUNCE)
  coin(74, 20, 62)
  coin(84, 20, 62)
  coin(96, 20, 58)
  coin(96, 14, 66)
  coin(106, 27, 66)

  // Tren de juguete: locomotora y dos vagones, cada uno con su puerta
  for (let x = 72; x <= 102; x++) {
    set(x, 7, 97, B.STEEL_LIGHT)
    set(x, 7, 99, B.STEEL_LIGHT)
    set(x, 7, 98, x % 2 ? B.WOOD : B.CHOC)
  }
  const wagon = (x0: number, x1: number, body: number, roof: number) => {
    fill(x0, G, 97, x1, 11, 99, body)
    fill(x0, 12, 96, x1, 12, 100, roof)
    for (const x of [x0 + 1, x1 - 1]) for (const z of [97, 99]) set(x, 10, z, B.GLOW)
    set(x1 + 1, G, 98, B.STEEL_DARK)
  }
  wagon(76, 82, B.PURPLE, B.GOLD)
  set(78, 13, 98, B.GIFT)
  fill(80, 13, 97, 81, 13, 98, B.CREAM)
  set(80, 14, 98, B.RED)
  wagon(84, 90, B.GREEN, B.CREAM)
  fill(92, G, 97, 94, 13, 99, B.RED)
  fill(91, 14, 96, 95, 14, 100, B.COAL)
  fill(95, G, 97, 98, 11, 99, B.RED)
  fill(95, 12, 98, 98, 12, 98, B.RED)
  for (const z of [97, 99]) fill(96, G, z, 96, 11, z, B.GOLD)
  set(96, 12, 98, B.GOLD)
  fill(97, 13, 98, 97, 15, 98, B.COAL)
  set(97, 16, 98, B.GOLD)
  for (const [x, y] of [[97, 18], [98, 20], [99, 22], [100, 23]]) set(x, y, 98, B.SNOW)
  fill(99, G, 97, 99, G, 99, B.STEEL)
  set(99, 10, 98, B.GLOW)
  set(93, 12, 99, B.GLOW)
  door(10, 'panel', 79, G, 99, 0, 1, { frame: B.FRAME_GOLD })
  door(20, 'candy', 87, G, 99, 0, 1, { frame: B.FRAME_CANDY })
  door(16, 'porthole', 93, G, 99, 0, 1, { frame: B.FRAME_GOLD })
  coin(87, 13, 98)
  coin(93, 15, 98)

  // Torre del reloj: mirador a media altura y campanario
  fill(28, G, 38, 34, 27, 44, B.BRICK)
  for (const x of [28, 34]) for (const z of [38, 44]) fill(x, G, z, x, 27, z, B.STONE)
  for (const y of [12, 22, 27]) ring(28, 38, 34, 44, y, B.STONE)
  for (const [x, z, ux, uz] of [[31, 44, 1, 0], [31, 38, 1, 0], [28, 41, 0, 1], [34, 41, 0, 1]]) {
    for (let i = -1; i <= 1; i++) fill(x + ux * i, 23, z + uz * i, x + ux * i, 25, z + uz * i, B.CREAM)
    set(x, 24, z, B.GOLD)
    set(x, 25, z, B.COAL)
    set(x + ux, 24, z + uz, B.COAL)
  }
  fill(27, 28, 37, 35, 28, 45, B.STONE)
  for (const x of [28, 34]) for (const z of [38, 44]) fill(x, 29, z, x, 31, z, B.STONE)
  fill(31, 30, 41, 31, 31, 41, B.GOLD)
  set(31, 29, 41, B.GLOW)
  pyramid(27, 37, 35, 45, 32, B.ROOF_BLUE)
  set(31, 37, 41, B.GOLD)
  fill(35, 17, 37, 38, 17, 45, B.STONE)
  for (const z of [37, 45]) fill(35, 18, z, 38, 18, z, B.WOOD)
  for (const z of [38, 39, 43, 44]) set(38, 18, z, B.WOOD)
  for (const z of [37, 41, 45]) set(35, 16, z, B.STONE)
  for (let i = 0; i <= 8; i++) {
    fill(47 - i, Math.max(G, G + i - 1), 40, 47 - i, G + i, 42, B.STONE)
    if (i % 3 === 0 && i) fill(47 - i, G, 41, 47 - i, G + i, 41, B.STONE)
  }
  door(23, 'tall', 31, G, 44, 0, 1, { sign: 'lantern', frame: B.FRAME_STONE })
  door(18, 'tall', 34, 18, 41, 1, 0, { frame: B.FRAME_STONE })
  set(27, G + 3, 46, B.GLOW)
  coin(36, 18, 38)
  coin(31, 38, 41)

  // Castillo del Rey Carbón en lo alto de la colina
  const K = 12
  fill(54, K, 16, 73, 21, 30, B.DARK_STONE)
  fill(55, K, 17, 72, 20, 29, B.AIR)
  for (let x = 54; x <= 73; x += 2) for (const z of [16, 30]) set(x, 22, z, B.DARK_STONE)
  for (let z = 16; z <= 30; z += 2) for (const x of [54, 73]) set(x, 22, z, B.DARK_STONE)
  for (const [x, z, top] of [[54, 16, 24], [73, 16, 27], [54, 30, 24], [73, 30, 24]]) {
    fill(x - 2, K, z - 2, x + 2, top, z + 2, B.DARK_STONE)
    for (const i of [-2, 0, 2]) for (const j of [-2, 0, 2]) if (i || j) set(x + i, top + 1, z + j, B.DARK_STONE)
    pyramid(x - 1, z - 1, x + 1, z + 1, top + 1, z === 30 ? B.ROOF_RED : B.ROOF_BLUE)
    set(x, top + 3, z, B.GOLD)
    for (const y of [16, 20]) set(x, y, z + (z === 30 ? 2 : -2), B.GLOW)
  }
  for (const x of [57, 60, 67, 70]) fill(x, 16, 30, x, 17, 30, B.GLOW)
  for (const x of [61, 66]) {
    fill(x, 15, 30, x, 19, 30, B.PURPLE)
    set(x, 20, 30, B.GOLD)
  }
  door(24, 'gate', 63, K, 30, 0, 1, { size: 1.2, frame: B.FRAME_GOLD })
  fill(68, 22, 15, 70, 25, 17, B.AIR)
  door(13, 'tall', 71, 22, 16, -1, 0, { sign: 'mat', frame: B.FRAME_STONE })
  for (let i = 0; i <= 8; i++) fill(52, K, 27 - i, 53, K + i, 27 - i, B.STONE)
  fill(54, 22, 18, 54, 22, 20, B.AIR)
  // La corona, en la azotea
  fill(63, 22, 22, 65, 22, 24, B.PURPLE)
  ring(63, 22, 65, 24, 23, B.GOLD)
  for (const x of [63, 65]) for (const z of [22, 24]) set(x, 24, z, B.GOLD)
  set(64, 23, 23, B.RED)
  for (const x of [59, 68]) lamp(x, 34, K)
  coin(64, 22, 27)
  coin(54, 28, 30)

  // Abeto gigante con una puerta en el tronco
  fill(90, G, 34, 94, 15, 38, B.WOOD)
  const rings = [9, 8, 8, 7, 7, 6, 5, 5, 4, 3, 3, 2, 1, 1]
  rings.forEach((r, i) => {
    const y = 14 + i
    for (let z = 36 - r; z <= 36 + r; z++) {
      for (let x = 92 - r; x <= 92 + r; x++) {
        const d = Math.hypot(x - 92, z - 36)
        if (d > r + 0.4) continue
        const rim = d > r - 0.8
        const n = hash(x, y, z)
        set(x, y, z, rim && n < 9 ? [B.RED, B.GOLD, B.TEAL][n % 3] : rim && n < 34 ? B.SNOW : B.GREEN)
      }
    }
  })
  set(92, 28, 36, B.GOLD)
  set(92, 29, 36, B.GLOW)
  door(8, 'panel', 92, G, 38, 0, 1, { frame: B.FRAME_WOOD })
  set(89, G, 40, B.GIFT)
  fill(95, G, 40, 96, G, 41, B.CREAM)
  set(95, G + 1, 40, B.RED)
  coin(92, 30, 36)
  coin(88, G, 42)

  // Iglú con túnel de entrada
  dome(108, G, 46, 5, (x, y, z) => (hash(x, y, z) < 30 ? B.SNOW : B.ICE))
  fill(100, G, 45, 103, 10, 47, B.SNOW)
  door(14, 'panel', 100, G, 46, -1, 0, { frame: B.FRAME_STONE })
  set(108, 14, 46, B.TEAL)
  coin(108, 15, 46)

  // Invernadero de cristal
  dome(23, G, 88, 6, (x, y, z) =>
    x === 23 || z === 88 || y === G ? B.STEEL_LIGHT : hash(x, y, z) < 12 ? B.GLOW : B.GLASS
  )
  fill(28, G, 86, 31, 11, 90, B.STEEL_LIGHT)
  door(3, 'tall', 31, G, 88, 1, 0)
  set(23, 15, 88, B.GOLD)
  for (const z of [84, 92]) {
    fill(32, G, z, 33, G, z, B.GREEN)
    set(32, G + 1, z, B.RED)
  }

  // Abetos, farolas y muñecos de nieve
  const firs = [[50, 106], [78, 110], [12, 78], [30, 104], [36, 21], [112, 60], [84, 50], [18, 46], [40, 28], [86, 20], [52, 76], [76, 76], [104, 100], [24, 30]]
  firs.forEach(([x, z], k) => fir(x, z, k % 3 === 0))
  for (const [x, z] of [[60, 84], [68, 96], [60, 104], [69, 105], [50, 60], [78, 68], [60, 44], [68, 44], [44, 94], [78, 88], [36, 62], [86, 60], [96, 44], [44, 52]]) {
    if (get(x, G, z) === B.AIR && get(x, G - 1, z)) lamp(x, z)
  }
  for (const [x, z] of [[56, 108], [100, 80], [22, 52]]) {
    if (get(x, G, z) !== B.AIR || get(x, G - 1, z) !== B.SNOW) continue
    fill(x, G, z, x, G + 2, z, B.SNOW)
    set(x, G + 3, z, B.COAL)
    set(x, G + 1, z + 1, B.GOLD)
  }
  for (const [x, z] of [[14, 60], [110, 76], [46, 114], [84, 112], [30, 20], [98, 24]]) {
    if (get(x, G - 1, z) && get(x, G, z) === B.AIR) coin(x, G, z)
  }

  // Aldea nevada: casitas de tejado nevado alrededor del abeto de Navidad
  const ground = (x: number, z: number) => {
    let y = H - 1
    while (y > 0 && !get(x, y - 1, z)) y--
    return y
  }
  // Casita con la puerta en el piñón: zócalo de piedra, vigas, ventanas encendidas, chimenea y tejado a dos aguas
  const cottage = (
    x0: number, z0: number, x1: number, z1: number, facing: 'n' | 's' | 'e' | 'w',
    { wall = B.PLASTER as number, chimney = true, gift = false } = {}
  ) => {
    const alongX = facing === 'n' || facing === 's'
    const w = alongX ? x1 - x0 + 1 : z1 - z0 + 1
    const d = alongX ? z1 - z0 + 1 : x1 - x0 + 1
    // u recorre la fachada y v va de la puerta al fondo
    const put = (u: number, y: number, v: number, t: number) =>
      facing === 's' ? set(x0 + u, y, z1 - v, t)
        : facing === 'n' ? set(x0 + u, y, z0 + v, t)
          : facing === 'e' ? set(x1 - v, y, z0 + u, t)
            : set(x0 + v, y, z0 + u, t)
    const box = (u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, t: number) => {
      for (let y = y0; y <= y1; y++) for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) put(u, y, v, t)
    }
    let y = 0
    let low = H
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        y = Math.max(y, ground(x, z))
        low = Math.min(low, ground(x, z))
      }
    }
    const top = y + 3
    const c = (w - 1) / 2
    box(0, low, 0, w - 1, y - 1, d - 1, B.STONE)
    box(0, y, 0, w - 1, top, d - 1, wall)
    box(0, y, 0, w - 1, y, d - 1, B.STONE)
    box(0, top, 0, w - 1, top, d - 1, B.TIMBER)
    for (const u of [0, w - 1]) for (const v of [0, d - 1]) box(u, y, v, u, top, v, B.TIMBER)
    box(1, y, 1, w - 2, top, d - 2, B.AIR)
    box(1, y - 1, 1, w - 2, y - 1, d - 2, B.WOOD)
    for (let k = 1; k < Math.max(w, d) - 1; k++) {
      if (k < w - 1 && (k - c) % 2 === 0) {
        if (k !== c) put(k, y + 1, 0, B.WINDOW)
        put(k, y + 1, d - 1, B.WINDOW)
      }
      if (k < d - 1 && k % 2 === 0) {
        put(0, y + 1, k, B.WINDOW)
        put(w - 1, y + 1, k, B.WINDOW)
      }
    }
    // Puerta abierta con corona de acebo y un escalón si la casa queda alta
    box(c, y, 0, c, y + 1, 0, B.AIR)
    put(c, y + 2, 0, B.GREEN)
    for (let s = 1; y - s >= low && y - s >= G; s++) put(c, y - s, -s, B.STONE)
    // Tejado: cada capa entra un bloque, nieve en los faldones y vigas en el borde de los piñones
    for (let i = 0; c - i >= -1; i++) {
      const yy = top + 1 + i
      const ul = i - 1
      const ur = w - i
      for (const u of ul === ur ? [ul] : [ul, ur]) box(u, yy, -1, u, yy, d, B.SNOW)
      for (const v of [-1, d]) {
        put(ul, yy, v, B.TIMBER)
        put(ur, yy, v, B.TIMBER)
      }
      if (ur - ul >= 2) for (const v of [0, d - 1]) box(ul + 1, yy, v, ur - 1, yy, v, wall)
    }
    put(c, top + 2, 0, B.WINDOW)
    // Chimenea encendida al fondo, con el tiro saliendo por la cumbrera
    box(c - 1, y, d - 2, c + 1, y + 2, d - 2, B.BRICK)
    put(c, y, d - 2, B.GLOW)
    if (chimney) {
      box(c, y + 3, d - 2, c, top + c + 3, d - 2, B.BRICK)
      put(c, top + c + 4, d - 2, B.SNOW)
    }
    put(1, y, d - 3, B.WOOD)
    if (gift) put(w - 2, y, 1, B.GIFT)
  }
  const pine = (x: number, z: number, big = false) => {
    const y = ground(x, z)
    if (get(x, y - 1, z) !== B.SNOW || get(x, y, z)) return
    const tiers = big ? [2.6, 2.1, 1.5, 2.1, 1.6, 1, 1.4, 0.9, 0.4] : [2.1, 1.5, 1, 1.5, 0.9, 0.5]
    fill(x, y, z, x, y + 1, z, B.WOOD)
    tiers.forEach((r, i) => {
      const k = Math.ceil(r)
      for (let dz = -k; dz <= k; dz++) {
        for (let dx = -k; dx <= k; dx++) {
          const d = Math.hypot(dx, dz)
          if (d > r + 0.3) continue
          // Nieve en las puntas de las ramas
          set(x + dx, y + 2 + i, z + dz, d > r - 0.7 && hash(x + dx, i, z + dz) < 45 ? B.SNOW : B.GREEN)
        }
      }
    })
  }

  // Plaza: macetero con luces, abeto con guirnalda en espiral, bolas y estrella
  fill(VX - 3, G, VZ - 3, VX + 3, G, VZ + 3, B.BRICK)
  fill(VX - 2, G, VZ - 2, VX + 2, G, VZ + 2, B.SNOW)
  for (const i of [-3, 0, 3]) for (const j of [-3, 0, 3]) if (i || j) set(VX + i, G, VZ + j, B.GLOW)
  set(VX, G + 1, VZ, B.WOOD)
  const tiers = [4.6, 4, 3.3, 3.8, 3.2, 2.5, 3, 2.4, 1.8, 2.1, 1.5, 0.9, 1.1, 0.5]
  tiers.forEach((r, i) => {
    const y = G + 2 + i
    const k = Math.ceil(r)
    for (let z = VZ - k; z <= VZ + k; z++) {
      for (let x = VX - k; x <= VX + k; x++) {
        const d = Math.hypot(x - VX, z - VZ)
        if (d > r + 0.3) continue
        const turn = Math.atan2(z - VZ, x - VX) / (Math.PI * 2) + i / 9
        const n = hash(x, y, z)
        const rim = d > r - 0.9
        set(x, y, z, !rim ? B.GREEN : turn - Math.floor(turn) < 0.11 ? B.GLOW : n < 14 ? (n % 2 ? B.RED : B.GOLD) : B.GREEN)
      }
    }
  })
  const star = G + 2 + tiers.length
  set(VX, star, VZ, B.GOLD)
  set(VX, star + 1, VZ, B.GLOW)
  for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) set(VX + i, star + 1, VZ + j, B.GOLD)
  set(VX, star + 2, VZ, B.GOLD)
  for (const [x, z] of [[VX - 4, VZ + 2], [VX + 4, VZ - 1], [VX + 1, VZ + 4]]) set(x, G, z, B.GIFT)
  for (const [x, z] of [[VX - 6, VZ - 6], [VX + 6, VZ - 6], [VX - 6, VZ + 6], [VX + 6, VZ + 6]]) {
    fill(x, G, z, x, G + 2, z, B.TIMBER)
    set(x, G + 3, z, B.GLOW)
  }

  cottage(111, 70, 117, 76, 's', { gift: true })
  cottage(103, 90, 109, 96, 'n', { wall: B.WOOD })
  cottage(94, 85, 100, 91, 'e', { wall: B.BRICK, chimney: false })
  cottage(118, 80, 124, 86, 'w', { gift: true })
  for (const [x, z, big] of [[120, 74, 1], [123, 92, 0], [116, 96, 1], [113, 92, 0], [121, 68, 0]]) pine(x, z, !!big)
  coin(VX, star + 4, VZ)
  coin(VX + 3, G + 1, VZ + 3)

  // Regalos sorpresa repartidos por la isla
  for (let i = 0; i < 26; i++) {
    const angle = rand() * Math.PI * 2
    const r = 14 + rand() * 36
    const x = Math.round(63.5 + Math.cos(angle) * r)
    const z = Math.round(63.5 + Math.sin(angle) * r)
    const ground = get(x, 7, z)
    const walkable = ground === B.FLOOR_A || ground === B.FLOOR_B || ground === B.SNOW
    if (walkable && get(x, G, z) === B.AIR && get(x, G + 3, z) === B.AIR) set(x, G, z, B.GIFT)
  }

  const spawn = { x: 64.5, y: G, z: 117.5, yaw: 0 }
  fill(64, G, 117, 64, G + 1, 117, B.AIR)
  // Sitios que el motor necesita conocer: secretos y el centro que rodea el avión
  const spots = {
    center: [C, 0, C] as Vec3,
    ibai: [85.5, 17.2, 85.5] as Vec3,
    dragon: [C + 0.5, 9.4, C + 0.5] as Vec3,
    crown: [64.5, 22, 23.5] as Vec3,
  }

  // Reliquias escondidas: cada una da un punto de nivel
  const relics: Vec3[] = [
    [108.5, 8.7, 46.5],
    [23.5, 8.7, 88.5],
    [29.5, 29.7, 43.5],
    [38.5, 8.7, 84.5],
  ]

  return { blocks, doors, coins, relics, spawn, spots }
}

const flat = { jitter: 0 }
const lit = { jitter: 0, glow: true }

// Hoja de una puerta con la bisagra en x = 0; la hoja espejo abre hacia el otro lado
export function buildLeaf(style: DoorStyle, mirror: boolean) {
  const { w, h, leaves } = DOOR_STYLES[style]
  const L = w / leaves
  const v = new Voxels(11)
  const A = 0xffffff
  const M = 0xd0d0d0
  const S = 0xa8a8a8
  const b = (x: number, y: number, z: number, bw: number, bh: number, bd: number, hex: number, opts = flat) =>
    v.box(mirror ? -x - bw : x, y, z, bw, bh, bd, hex, opts)
  b(0, 0, 0, L, h, 0.12, A)
  if (style === 'panel') {
    b(0.15, 1.1, 0.12, 0.7, 0.75, 0.03, M)
    b(0.15, 0.15, 0.12, 0.7, 0.8, 0.03, M)
    b(0.82, 0.95, 0.15, 0.1, 0.16, 0.07, A, lit)
  } else if (style === 'candy') {
    for (let i = 0; i < 5; i++) b(0.06, 0.1 + i * 0.37, 0.12, 0.88, 0.2, 0.03, i % 2 ? M : S)
    b(0.34, 1.42, 0.15, 0.32, 0.32, 0.02, A, lit)
    b(0.82, 0.9, 0.15, 0.1, 0.16, 0.07, A, lit)
  } else if (style === 'porthole') {
    b(0.18, 1.12, 0.12, 0.64, 0.64, 0.05, S)
    b(0.28, 1.22, 0.17, 0.44, 0.44, 0.02, A, lit)
    for (const x of [0.06, 0.82]) for (const y of [0.06, 1.82]) b(x, y, 0.12, 0.12, 0.12, 0.03, S)
    b(0.14, 0.3, 0.12, 0.72, 0.1, 0.03, M)
    b(0.14, 0.6, 0.12, 0.72, 0.1, 0.03, M)
    b(0.8, 0.85, 0.12, 0.08, 0.36, 0.08, M)
  } else if (style === 'tall') {
    b(0.15, 0.15, 0.12, 0.7, 0.85, 0.03, M)
    b(0.15, 1.15, 0.12, 0.7, 0.75, 0.03, M)
    b(0.18, 2.05, 0.12, 0.64, 0.6, 0.03, S)
    b(0.25, 2.1, 0.15, 0.5, 0.4, 0.02, A, lit)
    b(0.35, 2.5, 0.15, 0.3, 0.14, 0.02, A, lit)
    b(0.82, 1.05, 0.15, 0.1, 0.16, 0.07, A, lit)
  } else if (style === 'barn') {
    b(0, 0, 0.12, 1, 0.12, 0.04, M)
    b(0, 1.88, 0.12, 1, 0.12, 0.04, M)
    b(0, 0, 0.12, 0.12, 2, 0.04, M)
    b(0.88, 0, 0.12, 0.12, 2, 0.04, M)
    for (let i = 0; i < 7; i++) b(0.12 + i * 0.1, 0.13 + i * 0.24, 0.12, 0.16, 0.3, 0.03, S)
    b(0.78, 0.9, 0.16, 0.08, 0.3, 0.06, A, lit)
  } else if (style === 'vault') {
    b(0.3, 0.3, 0.12, 1.4, 1.4, 0.06, M)
    b(0.5, 0.14, 0.12, 1, 1.72, 0.06, M)
    b(0.14, 0.5, 0.12, 1.72, 1, 0.06, M)
    b(0.45, 0.93, 0.18, 1.1, 0.14, 0.06, S)
    b(0.93, 0.45, 0.18, 0.14, 1.1, 0.06, S)
    b(0.85, 0.85, 0.24, 0.3, 0.3, 0.05, A, lit)
    for (const x of [0.06, 1.8]) for (const y of [0.06, 1.8]) b(x, y, 0.12, 0.14, 0.14, 0.05, S)
  } else if (style === 'gate') {
    b(0.1, 0.12, 0.12, 0.36, 2.3, 0.03, M)
    b(0.54, 0.12, 0.12, 0.36, 2.3, 0.03, M)
    b(0.1, 2.5, 0.12, 0.8, 0.38, 0.04, S)
    for (const y of [0.5, 1.2, 1.9]) for (const x of [0.22, 0.66]) b(x, y, 0.15, 0.12, 0.12, 0.04, A, lit)
    b(0.84, 1.25, 0.15, 0.1, 0.34, 0.07, A, lit)
  } else {
    for (let i = 0; i < 9; i++) b(0.05, 0.1 + i * 0.31, 0.12, 1.4, 0.2, 0.04, i % 2 ? M : S)
    b(0.25, 2.27, 0.17, 1, 0.2, 0.02, A, lit)
    b(1.3, 0.85, 0.16, 0.1, 0.4, 0.06, M)
  }
  return v.build()
}

export function buildProps() {
  const gift = new Voxels(12)
  gift.box(-0.4, 0, -0.4, 0.8, 0.7, 0.8, 0xffffff, flat)

  const ribbon = new Voxels(13)
  ribbon.box(-0.11, 0, -0.42, 0.22, 0.72, 0.84, 0xffffff, flat)
  ribbon.box(-0.42, 0, -0.11, 0.84, 0.72, 0.22, 0xffffff, flat)
  ribbon.box(-0.22, 0.72, -0.11, 0.44, 0.18, 0.22, 0xffffff, flat)

  const coin = new Voxels(14)
  coin.box(-0.28, -0.28, -0.06, 0.56, 0.56, 0.12, 0xf8b132, flat)
  coin.box(-0.16, -0.16, -0.09, 0.32, 0.32, 0.18, 0xffe08a, { jitter: 0, glow: true })

  const relic = new Voxels(15)
  relic.box(-0.12, -0.5, -0.12, 0.24, 1, 0.24, 0x21c7b0, lit)
  relic.box(-0.24, -0.34, -0.24, 0.48, 0.68, 0.48, 0x8a55e0, flat)
  relic.box(-0.36, -0.14, -0.36, 0.72, 0.28, 0.72, 0x21c7b0, lit)

  const plane = new Voxels(18)
  plane.box(-1.6, -0.4, -0.4, 3.2, 0.8, 0.8, 0x8fd0f5)
  plane.box(1.6, -0.3, -0.3, 0.45, 0.6, 0.6, 0xc9ebff)
  plane.box(-1.2, -0.15, -0.42, 2.4, 0.3, 0.84, 0x4b2a8a)
  plane.box(-0.5, -0.2, -2, 1, 0.15, 4, 0x6fb6e6)
  plane.box(-1.7, 0.4, -0.08, 0.6, 0.75, 0.16, 0x4b2a8a)
  plane.box(-1.75, 0.1, -0.8, 0.5, 0.12, 1.6, 0x6fb6e6)
  for (const z of [-1.3, 0.95]) plane.box(-0.2, -0.52, z, 0.75, 0.35, 0.35, 0x3b6ea8)
  for (let i = 0; i < 5; i++) {
    plane.box(-0.9 + i * 0.45, 0.18, 0.4, 0.2, 0.14, 0.03, 0xf8b132, { glow: true })
    plane.box(-0.9 + i * 0.45, 0.18, -0.43, 0.2, 0.14, 0.03, 0xf8b132, { glow: true })
  }

  const ibai = new Voxels(19)
  const suit = 0x2456b8
  const skin = 0xf2b98f
  const hair = 0x5a3320
  ibai.box(-0.75, 0, -0.4, 1.5, 1.3, 0.8, suit)
  ibai.box(-0.8, 1.1, -0.45, 1.6, 0.25, 0.9, 0x9c2a2a)
  ibai.box(-0.55, 0.3, 0.4, 1.1, 0.5, 0.06, 0x9cc7ee)
  for (const x of [-1.25, 0.75]) {
    ibai.box(x, 0.5, -0.25, 0.5, 1.1, 0.5, suit)
    ibai.box(x, 1.6, -0.25, 0.5, 0.4, 0.5, skin)
  }
  ibai.box(-0.65, 1.35, -0.6, 1.3, 1.3, 1.2, skin, flat)
  ibai.box(-0.7, 2.4, -0.65, 1.4, 0.35, 1.3, hair)
  ibai.box(-0.7, 1.7, -0.65, 1.4, 0.7, 0.2, hair)
  ibai.box(-0.3, 2.75, -0.2, 0.8, 0.2, 0.7, hair)
  ibai.box(-0.67, 1.33, 0.3, 1.34, 0.5, 0.33, hair)
  for (const x of [-0.68, 0.58]) ibai.box(x, 1.34, -0.2, 0.1, 0.69, 0.815, hair)
  for (const x of [-0.42, 0.12]) {
    ibai.box(x, 2, 0.6, 0.3, 0.25, 0.03, 0xffffff, { glow: true })
    ibai.box(x + 0.09, 2, 0.62, 0.14, 0.2, 0.03, 0x1a1a2a, { glow: true })
    ibai.box(x - 0.03, 2.3, 0.6, 0.36, 0.08, 0.04, hair)
  }
  ibai.box(-0.3, 1.5, 0.63, 0.6, 0.15, 0.03, 0xffffff, { glow: true })

  const dragon = new Voxels(20)
  dragon.box(-0.6, -1, -0.6, 1.2, 1, 1.2, 0x47238a)
  dragon.box(-0.9, 0, -0.9, 1.8, 1.4, 1.8, 0x5b2fa0)
  dragon.box(-0.6, 0, 0.9, 1.2, 0.8, 0.6, 0x6c3cc0)
  for (const x of [-0.8, 0.5]) {
    dragon.box(x, 1.4, -0.3, 0.3, 0.9, 0.3, 0x21c7b0)
    dragon.box(x + 0.05, 0.75, 0.9, 0.3, 0.35, 0.04, 0xffffff, { glow: true })
    dragon.box(x + 0.14, 0.78, 0.93, 0.13, 0.25, 0.03, 0x10204a, { glow: true })
  }
  for (let i = 0; i < 3; i++) dragon.box(-0.15, 1.4, -0.8 + i * 0.5, 0.3, 0.4, 0.3, 0x8a55e0)

  return {
    gift: gift.build(),
    ribbon: ribbon.build(),
    coin: coin.build(),
    relic: relic.build(),
    plane: plane.build(),
    ibai: ibai.build(),
    dragon: dragon.build(),
  }
}

// El jugador en tercera persona: el Ibai de la portada del calendario, por piezas para animarlo
export function buildSkin() {
  const coat = 0x2456b8
  const red = 0x9c2a2a
  const skin = 0xf2b98f
  const hair = 0x5a3320
  const beard = 0x4a2a1a
  const glow = { glow: true }

  const head = new Voxels(51)
  head.box(-0.27, 0, -0.25, 0.54, 0.5, 0.5, skin, flat)
  head.box(-0.29, 0.42, -0.27, 0.58, 0.12, 0.54, hair)
  head.box(-0.2, 0.52, -0.02, 0.42, 0.07, 0.3, hair)
  head.box(-0.29, 0.1, -0.27, 0.58, 0.33, 0.1, hair)
  for (const x of [-0.285, 0.255]) head.box(x, 0.2, -0.18, 0.03, 0.23, 0.3, beard)
  for (const x of [-0.31, 0.27]) head.box(x, 0.2, -0.02, 0.04, 0.1, 0.08, skin)
  head.box(-0.285, -0.03, 0, 0.57, 0.2, 0.27, beard)
  head.box(-0.15, 0.15, 0.24, 0.3, 0.04, 0.035, beard)
  head.box(-0.035, 0.19, 0.24, 0.07, 0.07, 0.045, 0xe6a67c, flat)
  head.box(-0.1, 0.07, 0.262, 0.2, 0.055, 0.012, 0xffffff, glow)
  for (const x of [-0.18, 0.07]) {
    head.box(x, 0.26, 0.245, 0.11, 0.09, 0.012, 0xffffff, glow)
    head.box(x + 0.035, 0.265, 0.25, 0.05, 0.07, 0.012, 0x1a1a2a, glow)
    head.box(x - 0.01, 0.37, 0.24, 0.13, 0.03, 0.03, hair)
  }

  const torso = new Voxels(52)
  torso.box(-0.28, 0.58, -0.17, 0.56, 0.72, 0.34, coat)
  torso.box(-0.3, 0.52, -0.19, 0.6, 0.16, 0.38, 0x1b3f8f)
  torso.box(-0.29, 0.68, -0.18, 0.58, 0.08, 0.36, 0x3a2418)
  torso.box(-0.06, 0.67, 0.17, 0.12, 0.1, 0.03, 0xf8b132, glow)
  torso.box(-0.11, 0.78, 0.165, 0.22, 0.46, 0.02, 0x9cc7ee)
  for (const x of [-0.21, 0.11]) torso.box(x, 0.9, 0.165, 0.1, 0.4, 0.035, red)
  torso.box(-0.3, 1.24, -0.19, 0.6, 0.08, 0.38, red)

  const arm = new Voxels(53)
  arm.box(-0.11, -0.16, -0.11, 0.22, 0.22, 0.22, coat)
  arm.box(-0.09, -0.42, -0.09, 0.18, 0.26, 0.18, 0xb9bfd6)
  arm.box(-0.105, -0.52, -0.105, 0.21, 0.1, 0.21, 0x7a2f2a)
  arm.box(-0.08, -0.62, -0.08, 0.16, 0.1, 0.16, skin)

  const leg = new Voxels(54)
  leg.box(-0.125, -0.42, -0.13, 0.25, 0.44, 0.26, 0x23386e)
  leg.box(-0.135, -0.6, -0.14, 0.27, 0.18, 0.34, 0x6b3a22)

  return { head: head.build(), torso: torso.build(), arm: arm.build(), leg: leg.build() }
}
