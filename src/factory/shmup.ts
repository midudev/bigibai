import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, InstancedMesh, Matrix4, Mesh, Points, Quaternion, ShaderMaterial, Sprite, SpriteMaterial, Vector3 } from 'three'
import type { StageCtx } from './actors'
import { FIELD, type StageDef } from './stages'
import { DAMAGE } from './stats'
import { Voxels, mulberry32 } from './voxels'

type Opts = { jitter?: number; glow?: boolean }
const flat: Opts = { jitter: 0 }
const glow: Opts = { jitter: 0, glow: true }
const TAU = Math.PI * 2
const RED = 0xff3b4a
const ORANGE = 0xff8a2a
const YELLOW = 0xffe14a
const PINK = 0xff6ad5

// Radio de choque, vida, probabilidad de soltar mejora y cuántas caben a la vez en pantalla
const SHIPS = {
  drone: { hp: 2, r: 0.75, hex: 0xc8323c, drop: 0.07, cap: 24, size: 1 },
  zigzag: { hp: 2, r: 0.75, hex: 0x21c7b0, drop: 0.08, cap: 16, size: 1 },
  gunner: { hp: 7, r: 0.95, hex: 0xf08a2a, drop: 0.2, cap: 10, size: 1 },
  kamikaze: { hp: 3, r: 0.8, hex: 0xffe14a, drop: 0.08, cap: 12, size: 1 },
  spinner: { hp: 9, r: 1.1, hex: 0x8a55e0, drop: 0.3, cap: 8, size: 1 },
  tank: { hp: 26, r: 1.6, hex: 0x6b7f99, drop: 1, cap: 4, size: 1 },
  sniper: { hp: 5, r: 0.8, hex: 0x3a74c4, drop: 0.2, cap: 8, size: 1 },
  swarm: { hp: 1, r: 0.55, hex: 0xe0489a, drop: 0.04, cap: 32, size: 1 },
  bomber: { hp: 12, r: 1.4, hex: 0x239150, drop: 0.4, cap: 4, size: 1 },
  mine: { hp: 4, r: 0.8, hex: 0x4a4e5e, drop: 0.06, cap: 12, size: 1 },
  splitter: { hp: 8, r: 1, hex: 0x6fd3ff, drop: 0.2, cap: 8, size: 1 },
  shard: { hp: 1, r: 0.5, hex: 0x9fe8ff, drop: 0.03, cap: 24, size: 1 },
  laser: { hp: 10, r: 1, hex: 0xb0308a, drop: 0.4, cap: 4, size: 1 },
  saucer: { hp: 3, r: 0.85, hex: 0x9be04a, drop: 0.08, cap: 12, size: 1 },
  coal: { hp: 6, r: 1.25, hex: 0x3a3d4a, drop: 0.1, cap: 14, size: 1.5 },
  ember: { hp: 2, r: 0.6, hex: 0xff8a2a, drop: 0.03, cap: 28, size: 0.75 },
  ghost: { hp: 6, r: 0.85, hex: 0xf2f6ff, drop: 0.15, cap: 12, size: 1 },
  gift: { hp: 4, r: 0.85, hex: 0xc8323c, drop: 1, cap: 4, size: 1 },
  carrier: { hp: 80, r: 2.6, hex: 0x8fa3b8, drop: 1, cap: 2, size: 1 },
}
type ShipId = keyof typeof SHIPS
// Naves que al caer se parten en otras: cuentan todas para el marcador
const PIECES: Partial<Record<ShipId, number>> = { splitter: 4, coal: 3 }

const PICKUPS = ['power', 'wing', 'shield', 'heart', 'bomb', 'rapid', 'missile'] as const
type PickupId = (typeof PICKUPS)[number]
const PICKUP_HEX: Record<PickupId, number> = {
  power: 0xff5a1f, wing: 0x3ddc6a, shield: 0x6fe8ff, heart: 0xff5fa2, bomb: 0xffe14a, rapid: 0xb07cff, missile: 0xf8b132,
}
const PICKUP_ART: Record<PickupId, string[]> = {
  power: ['.XXXX..', '.X..XX.', '.X..XX.', '.XXXX..', '.X.....', '.X.....', '.X.....'],
  wing: ['...X...', '...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', 'X.XXX.X', '...X...'],
  shield: ['XXXXXXX', 'X.....X', 'X.....X', 'X.....X', '.X...X.', '..X.X..', '...X...'],
  heart: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
  bomb: ['....XX.', '...X...', '..XXX..', '.XXXXX.', '.XXXXX.', '.XXXXX.', '..XXX..'],
  rapid: ['.......', 'X..X...', '.X..X..', '..X..X.', '.X..X..', 'X..X...', '.......'],
  missile: ['...X...', '..XXX..', '..XXX..', '..XXX..', '..XXX..', '.XXXXX.', '.X.X.X.'],
}

type Step =
  | { wait: number }
  | { clear: number }
  | { boss: true }
  | { kind: ShipId; n: number; x: number; spread: number; gap: number }
const w = (wait: number): Step => ({ wait })
const c = (clear = 8): Step => ({ clear })
// x en unidades desde el centro; en enjambres y bombarderos, el lado por el que entran
const s = (kind: ShipId, n = 1, x = 0, spread = 0, gap = 0): Step => ({ kind, n, x, spread, gap })

const LEVELS: Step[][] = [
  [
    w(1.5), s('drone', 5, 0, 3.2), w(3), s('drone', 3, -5, 1.5, 0.4), s('drone', 3, 5, 1.5, 0.4), c(6),
    s('gift'), s('zigzag', 4, 0, 0, 0.5), w(3.5), s('swarm', 8, -1, 0, 0.3), c(9),
    s('gunner', 2, 0, 8), s('drone', 6, 0, 2.6, 0.25), c(9),
    s('kamikaze', 3, 0, 5, 0.6), w(2), s('saucer', 4), c(9),
    s('gift', 1, -4), s('zigzag', 3, -4, 0, 0.5), s('zigzag', 3, 4, 0, 0.5), s('gunner', 3, 0, 5), c(10),
    s('swarm', 10, 1, 0, 0.28), s('kamikaze', 4, 0, 4, 0.5), c(10),
    s('tank'), s('drone', 8, 0, 2.2, 0.2), s('saucer', 4, 4), c(12),
    s('gift', 1, 4), s('gunner', 4, 0, 4.5), s('kamikaze', 6, 0, 3, 0.4), s('swarm', 10, -1, 0, 0.28), c(15),
  ],
  [
    w(1.5), s('coal', 4, 0, 4.5, 0.5), w(3), s('coal', 5, 0, 3.5, 0.6), s('drone', 4, 0, 4), c(9),
    s('gift'), s('mine', 5, 0, 3.5, 0.3), s('zigzag', 4, 0, 0, 0.5), c(9),
    s('bomber', 1, -1), s('coal', 4, 0, 4, 0.8), c(10),
    s('spinner', 2, 0, 8), s('swarm', 8, 1, 0, 0.3), c(10),
    s('splitter', 3, 0, 5, 0.5), s('mine', 4, 0, 4, 0.4), c(10),
    s('gift', 1, -3), s('bomber', 1, 1), s('bomber', 1, -1), s('kamikaze', 4, 0, 4, 0.5), c(10),
    s('tank', 2, 0, 9), s('coal', 6, 0, 3, 0.5), c(11),
    s('spinner', 3, 0, 6), s('splitter', 3, 0, 5, 0.4), s('drone', 8, 0, 2.2, 0.2), c(12),
    s('gift', 1, 3), s('tank'), s('bomber', 1, 1), s('coal', 8, 0, 2.3, 0.4), s('mine', 6, 0, 3, 0.5), c(16),
  ],
  [
    w(1.5), s('ghost', 3, 0, 5), w(3), s('ghost', 4, 0, 4, 0.4), s('drone', 5, 0, 3.2), c(9),
    s('gift'), s('sniper', 2, 0, 12), s('zigzag', 5, 0, 0, 0.45), c(9),
    s('laser'), s('swarm', 10, -1, 0, 0.28), c(10),
    s('ghost', 4, 0, 4.5), s('saucer', 5, -3), c(9),
    s('laser', 2, 0, 9), s('kamikaze', 4, 0, 4, 0.5), c(10),
    s('gift', 1, 4), s('sniper', 3, 0, 7), s('spinner', 2, 0, 8), c(10),
    s('tank', 2, 0, 9), s('ghost', 5, 0, 3.5, 0.3), c(11),
    s('splitter', 3, 0, 5, 0.4), s('laser', 2, 0, 12), s('gunner', 3, 0, 4), c(11),
    s('gift', 1, -4), s('carrier'), w(6), s('ghost', 4, 0, 4.5), s('sniper', 2, 0, 15), c(22),
  ],
  [
    w(1.5), s('drone', 6, 0, 3), s('zigzag', 4, 0, 0, 0.45), w(3), s('coal', 5, 0, 3.5, 0.5), s('swarm', 10, 1, 0, 0.28), c(8),
    s('gift'), s('gunner', 3, 0, 5), s('mine', 4, 0, 4.5, 0.4), s('kamikaze', 4, 0, 4, 0.5), c(9),
    s('spinner', 2, 0, 9), s('ghost', 4, 0, 4), s('saucer', 4, 3), c(9),
    s('gift', 1, -4), s('tank'), s('laser', 2, 0, 12), s('bomber', 1, -1), s('splitter', 2, 0, 7), c(11),
    s('carrier'), s('sniper', 2, 0, 15), c(18),
    s('gift', 2, 0, 7), w(3.5), { boss: true },
  ],
]

function buildShips() {
  let seed = 200
  const make = (paint: (v: Voxels) => void) => {
    const v = new Voxels(seed++)
    paint(v)
    return v.build()
  }
  const pair = (v: Voxels, x: number, y: number, z: number, bw: number, h: number, d: number, hex: number, opts?: Opts) => {
    v.box(x, y, z, bw, h, d, hex, opts)
    v.box(-x - bw, y, z, bw, h, d, hex, opts)
  }
  const icon = (id: PickupId) =>
    make((v) => {
      v.box(-0.9, -0.14, -0.9, 1.8, 0.1, 1.8, PICKUP_HEX[id], glow)
      v.box(-0.78, -0.1, -0.78, 1.56, 0.1, 1.56, 0x0c0d24, glow)
      PICKUP_ART[id].forEach((row, j) =>
        [...row].forEach((cell, i) => {
          if (cell !== '.') v.box((i - 3.5) * 0.2, 0, (j - 3.5) * 0.2, 0.2, 0.16, 0.2, PICKUP_HEX[id], glow)
        })
      )
    })

  return {
    // La nave del jugador mira hacia -z; las enemigas, hacia +z
    player: make((v) => {
      v.box(-0.3, 0, -1, 0.6, 0.5, 1.9, 0xe8f1ff)
      v.box(-0.16, 0.05, -1.5, 0.32, 0.36, 0.5, 0x2fd27a)
      v.box(-0.18, 0.5, -0.7, 0.36, 0.18, 0.6, 0x21c7b0, glow)
      pair(v, 0.3, 0.05, -0.2, 0.8, 0.3, 0.9, 0x1c9a55)
      pair(v, 1.1, 0.05, 0, 0.26, 0.36, 1.1, 0xe8f1ff)
      pair(v, 0.62, 0.12, -0.8, 0.14, 0.18, 0.7, 0x9fb0c8)
      pair(v, 0.3, 0.35, 0.3, 0.5, 0.06, 0.3, 0xc8323c, flat)
      pair(v, 0.06, 0.1, 0.9, 0.2, 0.26, 0.16, 0x6fe8ff, glow)
    }),
    wing: make((v) => {
      v.box(-0.16, 0, -0.5, 0.32, 0.3, 1, 0xe8f1ff)
      pair(v, 0.16, 0.04, 0, 0.42, 0.2, 0.45, 0x1c9a55)
      v.box(-0.1, 0.3, -0.3, 0.2, 0.1, 0.3, 0x21c7b0, glow)
      v.box(-0.08, 0.06, 0.5, 0.16, 0.16, 0.1, 0x6fe8ff, glow)
    }),
    bubble: make((v) => {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU
        v.box(Math.cos(a) * 1.55 - 0.11, 0.25, Math.sin(a) * 1.55 - 0.11, 0.22, 0.14, 0.22, 0x6fe8ff, glow)
      }
    }),
    bit: make((v) => v.box(-0.25, -0.25, -0.25, 0.5, 0.5, 0.5, 0xffffff, glow)),
    rail: make((v) => v.box(-0.06, 0, -FIELD.hz - 4, 0.12, 0.1, FIELD.hz * 2 + 8, 0x27358a, glow)),
    backdrop: make((v) => v.box(-160, -0.5, -160, 320, 0.5, 320, 0x05030f, glow)),
    drone: make((v) => {
      v.box(-0.5, 0, -0.6, 1, 0.5, 1.2, 0xc8323c)
      v.box(-0.25, 0.05, 0.6, 0.5, 0.4, 0.5, 0xa3232c)
      pair(v, 0.5, 0.1, -0.6, 0.5, 0.3, 0.7, 0xa3232c)
      v.box(-0.2, 0.5, 0.1, 0.4, 0.12, 0.3, 0xffe14a, glow)
    }),
    zigzag: make((v) => {
      v.box(-0.3, 0, -0.8, 0.6, 0.45, 1.8, 0x21c7b0)
      pair(v, 0.3, 0.1, -0.9, 0.7, 0.25, 0.6, 0x15877a)
      pair(v, 1, 0.1, -1.2, 0.25, 0.25, 0.6, 0x15877a)
      v.box(-0.12, 0.45, -0.5, 0.24, 0.1, 1.1, 0xc9fff6, glow)
    }),
    gunner: make((v) => {
      v.box(-0.7, 0, -0.7, 1.4, 0.6, 1.4, 0xf08a2a)
      pair(v, 0.7, 0.05, -0.5, 0.5, 0.4, 0.9, 0xc96a1a)
      pair(v, 0.4, 0.1, 0.7, 0.3, 0.3, 0.8, 0x4a5d85)
      v.box(-0.3, 0.6, -0.2, 0.6, 0.14, 0.5, RED, glow)
    }),
    kamikaze: make((v) => {
      v.box(-0.2, 0, 0.6, 0.4, 0.4, 0.7, 0xf8b132)
      v.box(-0.5, 0, 0, 1, 0.45, 0.6, 0xffe14a)
      v.box(-0.8, 0, -0.6, 1.6, 0.45, 0.6, 0xf8b132)
      v.box(-0.3, 0.1, -0.8, 0.6, 0.3, 0.2, RED, glow)
      v.box(-0.12, 0.45, 0.1, 0.24, 0.1, 0.4, 0x1a1a2a, flat)
    }),
    spinner: make((v) => {
      v.box(-0.5, 0, -0.5, 1, 0.6, 1, 0x8a55e0)
      pair(v, 0.5, 0.1, -0.2, 1, 0.35, 0.4, 0x5b2fa0)
      v.box(-0.2, 0.1, -1.5, 0.4, 0.35, 1, 0x5b2fa0)
      v.box(-0.2, 0.1, 0.5, 0.4, 0.35, 1, 0x5b2fa0)
      pair(v, 1.3, 0.12, -0.25, 0.3, 0.36, 0.5, PINK, glow)
      v.box(-0.25, 0.12, -1.6, 0.5, 0.36, 0.3, PINK, glow)
      v.box(-0.25, 0.12, 1.3, 0.5, 0.36, 0.3, PINK, glow)
      v.box(-0.25, 0.6, -0.25, 0.5, 0.12, 0.5, 0xffffff, glow)
    }),
    tank: make((v) => {
      v.box(-1.5, 0, -1.2, 3, 0.8, 2.4, 0x6b7f99)
      pair(v, 1.5, 0.1, -0.9, 0.5, 0.6, 1.8, 0x4a5d85)
      v.box(-0.6, 0.8, -0.5, 1.2, 0.4, 1, 0x8fa3b8)
      for (const x of [-1, -0.15, 0.7]) v.box(x, 0.2, 1.2, 0.3, 0.3, 0.7, 0x24242c)
      v.box(-0.5, 1.2, 0.1, 1, 0.1, 0.3, RED, glow)
      for (let i = 0; i < 5; i++) v.box(-1.4 + i * 0.6, 0.8, -1.15, 0.3, 0.04, 0.4, 0xf8b132, flat)
    }),
    sniper: make((v) => {
      v.box(-0.35, 0, -1, 0.7, 0.5, 1.6, 0x3a74c4)
      v.box(-0.1, 0.15, 0.6, 0.2, 0.2, 1.4, 0xdfe8ff)
      pair(v, 0.35, 0.1, -1.1, 0.8, 0.25, 0.5, 0x14306b)
      v.box(-0.14, 0.14, 1.9, 0.28, 0.24, 0.16, RED, glow)
    }),
    swarm: make((v) => {
      v.box(-0.35, 0, -0.35, 0.7, 0.4, 0.7, 0xe0489a)
      pair(v, 0.35, 0.1, -0.1, 0.3, 0.2, 0.5, 0xc93a86)
      v.box(-0.14, 0.4, 0.05, 0.28, 0.1, 0.2, 0xffffff, glow)
    }),
    bomber: make((v) => {
      v.box(-0.6, 0, -0.8, 1.2, 0.6, 1.6, 0x239150)
      pair(v, 0.6, 0.1, -0.5, 1.8, 0.3, 1, 0x1c7a45)
      pair(v, 1.7, 0.1, -0.9, 0.5, 0.4, 0.6, 0x0f3d24)
      pair(v, 1.75, 0.15, -1, 0.4, 0.3, 0.14, ORANGE, glow)
      v.box(-0.3, 0.6, -0.3, 0.6, 0.12, 0.6, YELLOW, glow)
    }),
    mine: make((v) => {
      v.box(-0.5, 0, -0.5, 1, 0.8, 1, 0x24242c)
      pair(v, 0.5, 0.25, -0.15, 0.45, 0.3, 0.3, 0x4a4e5e)
      v.box(-0.15, 0.25, -0.95, 0.3, 0.3, 0.45, 0x4a4e5e)
      v.box(-0.15, 0.25, 0.5, 0.3, 0.3, 0.45, 0x4a4e5e)
      pair(v, 0.5, 0.25, 0.5, 0.25, 0.3, 0.25, 0x4a4e5e)
      pair(v, 0.5, 0.25, -0.75, 0.25, 0.3, 0.25, 0x4a4e5e)
      v.box(-0.2, 0.8, -0.2, 0.4, 0.12, 0.4, RED, glow)
    }),
    splitter: make((v) => {
      v.box(-0.9, 0, -0.3, 1.8, 0.5, 0.6, 0x6fd3ff)
      v.box(-0.6, 0, -0.6, 1.2, 0.55, 1.2, 0x9fe8ff)
      v.box(-0.3, 0, -0.9, 0.6, 0.5, 1.8, 0x6fd3ff)
      v.box(-0.25, 0.55, -0.25, 0.5, 0.12, 0.5, 0xffffff, glow)
    }),
    shard: make((v) => {
      v.box(-0.45, 0, -0.15, 0.9, 0.35, 0.3, 0x9fe8ff)
      v.box(-0.15, 0, -0.45, 0.3, 0.35, 0.9, 0x9fe8ff)
      v.box(-0.12, 0.35, -0.12, 0.24, 0.08, 0.24, 0xffffff, glow)
    }),
    laser: make((v) => {
      v.box(-0.8, 0, -0.6, 1.6, 0.6, 1.2, 0xb0308a)
      pair(v, 0.5, 0.1, 0.6, 0.3, 0.4, 1, 0x7a1f66)
      v.box(-0.25, 0.15, 0.6, 0.5, 0.3, 0.4, PINK, glow)
      pair(v, 0.8, 0.1, -0.8, 0.4, 0.3, 0.8, 0x7a1f66)
    }),
    saucer: make((v) => {
      v.box(-0.9, 0, -0.5, 1.8, 0.4, 1, 0x9be04a)
      v.box(-0.5, 0, -0.9, 1, 0.4, 1.8, 0x9be04a)
      v.box(-0.4, 0.4, -0.4, 0.8, 0.3, 0.8, 0x21c7b0, glow)
      pair(v, 0.6, 0.4, -0.1, 0.2, 0.08, 0.2, YELLOW, glow)
      v.box(-0.1, 0.4, -0.8, 0.2, 0.08, 0.2, YELLOW, glow)
      v.box(-0.1, 0.4, 0.6, 0.2, 0.08, 0.2, YELLOW, glow)
    }),
    coal: make((v) => {
      v.box(-0.6, 0, -0.5, 1.2, 0.7, 1, 0x2a2a33)
      v.box(-0.8, 0.1, -0.2, 0.5, 0.5, 0.7, 0x3a3d4a)
      v.box(0.3, 0.05, -0.75, 0.5, 0.55, 0.6, 0x33363f)
      v.box(-0.3, 0.1, 0.4, 0.8, 0.5, 0.4, 0x3a3d4a)
      v.box(-0.25, 0.7, -0.15, 0.25, 0.08, 0.25, ORANGE, glow)
      v.box(0.25, 0.6, 0.1, 0.18, 0.08, 0.18, 0xff5a1f, glow)
    }),
    ember: make((v) => {
      v.box(-0.5, 0, -0.4, 1, 0.6, 0.8, 0x33363f)
      v.box(-0.2, 0.05, -0.6, 0.6, 0.5, 0.4, 0x2a2a33)
      v.box(-0.2, 0.6, -0.15, 0.4, 0.1, 0.3, ORANGE, glow)
    }),
    ghost: make((v) => {
      v.box(-0.7, 0, -0.6, 1.4, 0.6, 1.4, 0xf2f6ff)
      v.box(-0.5, 0, 0.8, 1, 0.5, 0.3, 0xdfe6fa)
      for (let i = 0; i < 3; i++) v.box(-0.7 + i * 0.5, 0, -0.95 - (i % 2) * 0.2, 0.4, 0.5, 0.4, 0xdfe6fa)
      pair(v, 0.15, 0.6, 0.2, 0.3, 0.08, 0.4, 0x1a1a2a, glow)
    }),
    gift: make((v) => {
      v.box(-0.6, 0, -0.6, 1.2, 0.9, 1.2, 0xc8323c)
      v.box(-0.15, 0.02, -0.62, 0.3, 0.92, 1.24, 0xf8b132, glow)
      v.box(-0.62, 0.02, -0.15, 1.24, 0.92, 0.3, 0xf8b132, glow)
      pair(v, 0.05, 0.94, -0.12, 0.3, 0.16, 0.24, 0xffe08a, glow)
      pair(v, 0.6, 0.2, -0.5, 0.2, 0.3, 0.4, 0x4a5d85)
    }),
    carrier: make((v) => {
      v.box(-2.5, 0, -1.5, 5, 1, 3, 0x8fa3b8)
      v.box(-1.2, 1, -1, 2.4, 0.5, 1.6, 0xb8c6d6)
      pair(v, 2.5, 0.1, -1, 1.2, 0.8, 2, 0x4a5d85)
      pair(v, 2.7, 0.9, -0.6, 0.8, 0.1, 1.2, 0x24242c, flat)
      v.box(-0.9, 0.2, 1.5, 1.8, 0.6, 0.7, 0x6b7f99)
      v.box(-0.8, 1.5, 0.1, 1.6, 0.1, 0.3, RED, glow)
      pair(v, 0.6, 0.2, -1.9, 0.9, 0.6, 0.4, 0x24242c)
      pair(v, 0.7, 0.3, -2, 0.7, 0.4, 0.12, ORANGE, glow)
      for (let i = 0; i < 6; i++) v.box(-2.3 + i * 0.8, 1, -1.45, 0.4, 0.04, 0.4, 0xc8323c, flat)
    }),
    boss: make((v) => {
      v.box(-2.2, 0, -2.5, 4.4, 1.2, 5, 0x33333d)
      v.box(-1.5, 1.2, -1.8, 3, 0.5, 3, 0x24242c)
      v.box(-1.2, 0.2, 2.5, 2.4, 1, 1, 0x4a4e5e)
      pair(v, 0.25, 1.2, 2.7, 0.7, 0.14, 0.5, RED, glow)
      for (let i = 0; i < 4; i++) v.box(-0.95 + i * 0.5, 0.5, 3.5, 0.3, 0.4, 0.12, ORANGE, glow)
      v.box(-0.8, 1.7, -1.4, 1.6, 0.3, 1.2, 0xf8b132)
      for (const x of [-0.8, -0.2, 0.4]) for (const z of [-1.4, -0.6]) v.box(x, 2, z, 0.4, 0.4, 0.4, 0xf8b132)
      v.box(-0.7, 1.7, 0.2, 1.4, 0.2, 1.2, 0xff8a2a, glow)
      v.box(-0.35, 1.9, 0.55, 0.7, 0.14, 0.5, 0xffe08a, glow)
      pair(v, 2.2, 0.2, -1.2, 2.2, 0.5, 2, 0x3d3d48)
      pair(v, 2.2, 0.1, -3, 3.4, 0.3, 1.2, 0x2c2c36)
      pair(v, 5.2, 0.1, -3.4, 0.6, 0.3, 1.8, 0x16161c)
      pair(v, 0.6, 0.2, -3.3, 1, 0.8, 0.9, 0x16161c)
      pair(v, 0.7, 0.3, -3.5, 0.8, 0.6, 0.25, ORANGE, glow)
      for (let i = 0; i < 5; i++) pair(v, 2.3, 1.2, -2.2 + i * 0.9, 0.3, 0.06, 0.5, 0xf8b132, flat)
    }),
    pod: make((v) => {
      v.box(-1.1, 0, -1.3, 2.2, 1.1, 2.6, 0xf08a2a)
      v.box(-0.8, 1.1, -0.9, 1.6, 0.2, 1.6, 0xc96a1a)
      v.box(-0.35, 0.3, 1.3, 0.7, 0.5, 1.2, 0x4a5d85)
      v.box(-0.25, 0.35, 2.5, 0.5, 0.4, 0.12, RED, glow)
      v.box(-0.3, 1.3, -0.3, 0.6, 0.12, 0.6, YELLOW, glow)
      pair(v, 1.1, 0.2, -0.9, 0.3, 0.6, 1.8, 0x24242c)
    }),
    icons: Object.fromEntries(PICKUPS.map((id) => [id, icon(id)])) as Record<PickupId, BufferGeometry>,
  }
}

interface Foe {
  kind: ShipId
  x: number
  z: number
  ox: number
  vx: number
  vz: number
  t: number
  i: number
  hp: number
  cool: number
  state: number
  a: number
  rot: number
  flash: number
  tint: number
  hidden: boolean
  // Escolta de otra nave: no cuenta para el marcador
  extra: boolean
  gone: boolean
}

const SHOTS = 180
const BULLETS = 340
const STARS = 220
const BLASTS = 28
const BEAMS = 8
const RING = 28

export function createShmup(ctx: StageCtx, def: StageDef) {
  const { pos } = ctx.player
  const { hx: HX, hz: HZ } = FIELD
  const lvl = def.ships
  const steps = LEVELS[lvl - 1] ?? LEVELS[0]
  const sp = 1 + def.level * 0.3
  const bs = 0.85 + def.level * 0.35
  const tough = 1 + (def.day - 1) * 0.03
  const models = buildShips()
  const rand = mulberry32(def.day * 131)
  const meshes: Mesh[] = []
  const add = <T extends Mesh>(mesh: T) => {
    mesh.frustumCulled = false
    ctx.scene.add(mesh)
    meshes.push(mesh)
    return mesh
  }
  const m4 = new Matrix4()
  const q = new Quaternion()
  const p = new Vector3()
  const sc = new Vector3()
  const up = new Vector3(0, 1, 0)
  const roll = new Vector3(0, 0, 1)
  const color = new Color()
  const hide = new Matrix4().makeScale(0, 0, 0)
  const WHITE = new Color(0xffffff)
  const Y = FIELD.y
  const wx = (x: number) => FIELD.x + x
  const wz = (z: number) => FIELD.z + z
  const instanced = (geo: BufferGeometry, count: number) => {
    const mesh = add(new InstancedMesh(geo, ctx.mat, count))
    for (let i = 0; i < count; i++) {
      mesh.setMatrixAt(i, hide)
      mesh.setColorAt(i, color.set(0xffffff))
    }
    mesh.count = 0
    return mesh
  }

  let time = 0
  let ended = false
  let px = 0
  let pz = 0
  const clampX = (x: number, margin = 0.8) => Math.max(-HX + margin, Math.min(HX - margin, x))
  const toward = (from: number, to: number, max: number) => from + Math.max(-max, Math.min(max, to - from))
  const aim = (x: number, z: number) => Math.atan2(px - x, pz - z)

  // Fondo: espacio, nebulosas y estrellas que pasan a distintas velocidades
  const backdrop = add(new Mesh(models.backdrop, ctx.mat))
  backdrop.position.set(FIELD.x, Y - 36, FIELD.z)
  for (const side of [-1, 1]) add(new Mesh(models.rail, ctx.mat)).position.set(wx(side * (HX + 0.9)), Y, FIELD.z)
  const haze = document.createElement('canvas')
  haze.width = haze.height = 64
  const g = haze.getContext('2d')!
  const fade = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  fade.addColorStop(0, 'rgba(255,255,255,0.9)')
  fade.addColorStop(0.5, 'rgba(255,255,255,0.3)')
  fade.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = fade
  g.fillRect(0, 0, 64, 64)
  const hazeTex = new CanvasTexture(haze)
  const nebulae = [0x8a2be2, 0xc2188f, 0x3b2bbf, 0x1d5fbf, 0x8a2be2, 0xc2188f].map((hex, i) => {
    const sprite = new Sprite(
      new SpriteMaterial({ map: hazeTex, color: hex, blending: AdditiveBlending, depthWrite: false, fog: false, opacity: 0.3 })
    )
    sprite.scale.setScalar(50 + rand() * 30)
    sprite.position.set(wx((rand() - 0.5) * 90), Y - 27, wz(-80 + i * 27))
    ctx.scene.add(sprite)
    return sprite
  })
  // Estrellas animadas en GPU: 0 matrices en CPU, 0 subidas por frame y 220 puntos en vez de 2.640 triángulos
  const starGeo = new BufferGeometry()
  const starPos = new Float32Array(STARS * 3)
  const starCol = new Float32Array(STARS * 3)
  const starMeta = new Float32Array(STARS * 2)
  for (let i = 0; i < STARS; i++) {
    const depth = 3 + rand() * 28
    starPos.set([wx((rand() - 0.5) * 120), Y - depth, (rand() - 0.5) * 90], i * 3)
    color.set([0xffffff, 0xbfd4ff, 0xffc8ec][i % 3]).multiplyScalar(0.35 + rand() * 0.65)
    starCol.set([color.r, color.g, color.b], i * 3)
    starMeta.set([26 / (1 + depth * 0.18), 0.2 + rand() * 0.35], i * 2)
  }
  starGeo.setAttribute('position', new BufferAttribute(starPos, 3))
  starGeo.setAttribute('color', new BufferAttribute(starCol, 3))
  starGeo.setAttribute('aMeta', new BufferAttribute(starMeta, 2))
  const starMat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCenterZ: { value: FIELD.z } },
    depthWrite: false,
    vertexShader: `
      attribute vec3 color;
      attribute vec2 aMeta;
      uniform float uTime;
      uniform float uCenterZ;
      varying vec3 vCol;
      void main() {
        vCol = color;
        float z = mod(position.z + uTime * aMeta.x + 45.0, 90.0) - 45.0 + uCenterZ;
        vec4 mv = modelViewMatrix * vec4(position.x, position.y, z, 1.0);
        gl_PointSize = max(1.5, (aMeta.y * 360.0) / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vCol;
      void main() {
        gl_FragColor = vec4(vCol, 1.0);
        #include <colorspace_fragment>
      }`,
  })
  const starPoints = new Points(starGeo, starMat)
  starPoints.frustumCulled = false
  ctx.scene.add(starPoints)
  const updateSpace = (dt: number) => {
    for (const sprite of nebulae) {
      sprite.position.z += dt * 1.6
      if (sprite.position.z > wz(80)) sprite.position.z -= 162
    }
    starMat.uniforms.uTime.value = time
  }

  // Destellos de las explosiones
  const blasts = instanced(models.bit, BLASTS)
  const blast = Array.from({ length: BLASTS }, () => ({ x: 0, z: 0, life: 0, total: 1, size: 1, hex: 0xffffff }))
  let blastNext = 0
  const boom = (x: number, z: number, size: number, hex: number) => {
    const i = blastNext++ % BLASTS
    const b = blast[i]
    b.x = x
    b.z = z
    b.size = size
    b.life = b.total = 0.16 + size * 0.07
    b.hex = hex
    ctx.burst(wx(x) - 0.5, Y, wz(z) - 0.5, hex, Math.min(14, 4 + Math.round(size * 3)))
  }
  const updateBlasts = (dt: number) => {
    let n = 0
    for (let i = 0; i < BLASTS; i++) {
      const item = blast[i]
      if (item.life <= 0) continue
      item.life -= dt
      if (item.life <= 0) continue
      const k = 1 - item.life / item.total
      const size = item.size * (0.6 + k * 2.4) * (1 - k * k)
      q.setFromAxisAngle(up, k * 1.6 + i)
      blasts.setMatrixAt(n, m4.compose(p.set(wx(item.x), Y + 1, wz(item.z)), q, sc.set(size, 0.4, size)))
      blasts.setColorAt(n, color.set(item.hex).lerp(WHITE, 0.45))
      n++
    }
    blasts.count = n
    if (n > 0) {
      blasts.instanceMatrix.needsUpdate = true
      blasts.instanceColor!.needsUpdate = true
    }
  }

  // Onda de la bomba
  const ring = instanced(models.bit, RING)
  let ringR = -1
  const updateRing = (dt: number) => {
    if (ringR < 0) return
    ringR += dt * 34
    if (ringR > 30) {
      ringR = -1
      ring.count = 0
      return
    }
    ring.count = RING
    for (let k = 0; k < RING; k++) {
      const a = (k / RING) * TAU
      ring.setMatrixAt(k, m4.makeScale(1.4, 0.5, 1.4).setPosition(pos.x + Math.cos(a) * ringR, Y + 0.5, pos.z + Math.sin(a) * ringR))
    }
    ring.instanceMatrix.needsUpdate = true
  }

  // Balas enemigas
  const bullets = instanced(models.bit, BULLETS)
  const bullet = Array.from({ length: BULLETS }, () => ({ x: 0, z: 0, vx: 0, vz: 0, on: false, size: 1, hex: 0xffffff }))
  let bulletNext = 0
  const shoot = (x: number, z: number, a: number, speed: number, hex: number, size = 1) => {
    if (ended) return
    for (let n = 0; n < BULLETS; n++) {
      const i = (bulletNext + n) % BULLETS
      if (bullet[i].on) continue
      bulletNext = i + 1
      const b = bullet[i]
      b.x = x
      b.z = z
      b.vx = Math.sin(a) * speed
      b.vz = Math.cos(a) * speed
      b.on = true
      b.size = size
      b.hex = hex
      return
    }
  }
  const circle = (x: number, z: number, n: number, speed: number, hex: number, offset = 0, size = 1) => {
    for (let i = 0; i < n; i++) shoot(x, z, offset + (i / n) * TAU, speed, hex, size)
  }
  const fan = (x: number, z: number, a: number, n: number, gap: number, speed: number, hex: number) => {
    for (let i = 0; i < n; i++) shoot(x, z, a + (i - (n - 1) / 2) * gap, speed, hex)
  }
  const clearBullets = () => {
    let sparks = 0
    for (const b of bullet) {
      if (b.on && sparks++ < 16) ctx.burst(wx(b.x) - 0.5, Y, wz(b.z) - 0.5, YELLOW, 2)
      b.on = false
    }
  }
  const updateBullets = (dt: number) => {
    q.setFromAxisAngle(up, time * 5)
    let n = 0
    for (let i = 0; i < BULLETS; i++) {
      const b = bullet[i]
      if (!b.on) continue
      b.x += b.vx * dt
      b.z += b.vz * dt
      if (Math.abs(b.x) > HX + 2 || Math.abs(b.z) > HZ + 3) {
        b.on = false
        continue
      }
      const dx = b.x - px
      const dz = b.z - pz
      const hitR = 0.2 + b.size * 0.22
      if (dx * dx + dz * dz < hitR * hitR) {
        b.on = false
        hitPlayer()
        continue
      }
      const size = b.size * (0.85 + Math.sin(time * 18 + i) * 0.12)
      bullets.setMatrixAt(n, m4.compose(p.set(wx(b.x), Y + 0.3, wz(b.z)), q, sc.set(size, size * 0.7, size)))
      bullets.setColorAt(n, color.set(b.hex))
      n++
    }
    bullets.count = n
    if (n > 0) {
      bullets.instanceMatrix.needsUpdate = true
      bullets.instanceColor!.needsUpdate = true
    }
  }

  // Rayos: una línea fina avisa y luego quema toda la columna hasta abajo
  const beamMesh = instanced(models.bit, BEAMS)
  const beams: { x: number; z: number; w: number; live: boolean }[] = []
  const updateBeams = () => {
    const n = Math.min(beams.length, BEAMS)
    beamMesh.count = n
    if (n === 0) return
    for (let i = 0; i < n; i++) {
      const b = beams[i]
      const length = HZ + 3 - b.z
      const wide = b.w * (b.live ? 1 + Math.sin(time * 40) * 0.12 : 1)
      beamMesh.setMatrixAt(i, m4.makeScale(wide * 2, 0.4, length * 2).setPosition(wx(b.x), Y + 0.2, wz(b.z + length / 2)))
      beamMesh.setColorAt(i, color.set(b.live ? 0xff5a7a : RED).multiplyScalar(b.live ? 1 : 0.45 + (Math.sin(time * 30) > 0 ? 0.4 : 0)))
      if (b.live && Math.abs(px - b.x) < b.w / 2 + 0.3 && pz > b.z) hitPlayer()
    }
    beamMesh.instanceMatrix.needsUpdate = true
    beamMesh.instanceColor!.needsUpdate = true
  }

  // Jugador: potencia del arma, escoltas, burbuja y bombas
  const ship = add(new Mesh(models.player, ctx.mat))
  const wingMesh = instanced(models.wing, 2)
  const bubbleMesh = add(new Mesh(models.bubble, ctx.mat))
  const wing = [-1, 1].map((side) => ({ side, x: 0, z: 0 }))
  let power = 1
  let wings = 0
  let bubble = false
  let bombs = 2
  let rapid = 0
  let missiles = 0
  let safe = 0
  let fireCool = 0.6
  let missileCool = 0
  let bombCool = 0
  let volley = 0
  let bank = 0
  let lastX = pos.x
  let kills = 0
  let sinceDrop = 0
  const total = steps.reduce((sum, step) => sum + ('kind' in step ? step.n * (PIECES[step.kind] ?? 1) : 'boss' in step ? 3 : 0), 0)
  const showScore = () => ctx.hud({ kills: [kills, total], bombs })
  const hitPlayer = () => {
    if (safe > 0 || ended) return
    safe = 1.3
    if (bubble) {
      bubble = false
      ctx.sound('clang')
      boom(px, pz, 2, 0x6fe8ff)
      return
    }
    const before = ctx.hearts()
    ctx.hurt(0, 0)
    if (ctx.hearts() >= before) return
    boom(px, pz, 2, 0xffffff)
    if (power > 1) power--
  }

  // Disparos del jugador: 0 cañón, 1 escolta, 2 misil que persigue
  const shots = instanced(models.bit, SHOTS)
  const shot = Array.from({ length: SHOTS }, () => ({ x: 0, z: 0, vx: 0, vz: 0, on: false, power: 1, type: 0 }))
  let shotNext = 0
  const SHOT_HEX = [0x6fe8ff, 0x7dffb0, 0xffa23a]
  const launch = (x: number, z: number, a: number, type = 0, power = 1) => {
    for (let n = 0; n < SHOTS; n++) {
      const i = (shotNext + n) % SHOTS
      if (shot[i].on) continue
      shotNext = i + 1
      const speed = type === 2 ? 19 : 34
      const s = shot[i]
      s.x = x
      s.z = z
      s.vx = Math.sin(a) * speed
      s.vz = -Math.cos(a) * speed
      s.on = true
      s.power = power
      s.type = type
      return
    }
  }
  // Desvío lateral, ángulo y daño de cada disparo según la potencia
  const VOLLEYS: [number, number, number][][] = [
    [[0, 0, 1.5]],
    [[-0.32, 0, 1.1], [0.32, 0, 1.1]],
    [[-0.32, 0, 1], [0.32, 0, 1], [-0.5, -0.14, 0.5], [0.5, 0.14, 0.5]],
    [[-0.45, 0, 1], [0, 0, 1], [0.45, 0, 1], [-0.6, -0.14, 0.4], [0.6, 0.14, 0.4]],
    [[-0.45, 0, 1], [0, 0, 1], [0.45, 0, 1], [-0.6, -0.14, 0.4], [0.6, 0.14, 0.4], [-0.8, -0.3, 0.4], [0.8, 0.3, 0.4]],
  ]
  const updatePlayer = (dt: number) => {
    safe -= dt
    rapid -= dt
    missiles -= dt
    bombCool -= dt
    fireCool -= dt
    missileCool -= dt
    if (fireCool <= 0) {
      fireCool = rapid > 0 ? 0.075 : 0.14
      for (const [ox, a, hit] of VOLLEYS[power - 1]) launch(px + ox, pz - 1.2, a, 0, hit)
      if (volley++ % 2 === 0) {
        for (let i = 0; i < wings; i++) launch(wing[i].x, wing[i].z - 0.6, 0, 1, 0.6)
        ctx.sound('shoot')
      }
    }
    if (missiles > 0 && missileCool <= 0) {
      missileCool = 0.45
      for (const side of [-1, 1]) launch(px + side * 0.9, pz, side * 0.7, 2, 3)
    }
    bank += ((pos.x - lastX) / Math.max(dt, 0.001) - bank) * Math.min(1, dt * 10)
    lastX = pos.x
    q.setFromAxisAngle(roll, Math.max(-0.6, Math.min(0.6, -bank * 0.035)))
    ship.position.set(pos.x, Y, pos.z)
    ship.quaternion.copy(q)
    ship.visible = safe <= 0 || Math.sin(time * 40) > 0
    wingMesh.count = wings
    if (wings > 0) {
      const k = Math.min(1, dt * 9)
      for (let i = 0; i < wings; i++) {
        const item = wing[i]
        item.x += (px + item.side * 1.9 - item.x) * k
        item.z += (pz + 0.9 - item.z) * k
        wingMesh.setMatrixAt(i, m4.makeTranslation(wx(item.x), Y, wz(item.z)))
      }
      wingMesh.instanceMatrix.needsUpdate = true
    }
    bubbleMesh.visible = bubble
    bubbleMesh.position.set(pos.x, Y, pos.z)
    bubbleMesh.rotation.y = time * 2
  }

  // Mejoras que sueltan las naves
  const pickup = Array.from({ length: 6 }, () => {
    const mesh = add(new Mesh(models.icons.power, ctx.mat))
    mesh.visible = false
    return { mesh, id: 'power' as PickupId, x: 0, z: 0, t: 0 }
  })
  let firstGift = true
  const nextDrop = (): PickupId => {
    if (firstGift) {
      firstGift = false
      return 'power'
    }
    const bag: PickupId[] = ['rapid', 'missile']
    if (power < 5) bag.push('power', 'power', 'power')
    if (wings < 2) bag.push('wing', 'wing')
    if (!bubble) bag.push('shield')
    if (ctx.hearts() < def.hearts) bag.push('heart', 'heart')
    if (bombs < 3) bag.push('bomb')
    return bag[Math.floor(Math.random() * bag.length)]
  }
  const drop = (x: number, z: number) => {
    const item = pickup.find((it) => !it.mesh.visible)
    if (!item) return
    sinceDrop = 0
    Object.assign(item, { id: nextDrop(), x: clampX(x, 1.2), z, t: 0 })
    item.mesh.geometry = models.icons[item.id]
    item.mesh.visible = true
  }
  const take = (id: PickupId) => {
    ctx.sound('checkpoint')
    if (id === 'power') {
      if (power < 5) ctx.say(++power === 5 ? '¡Potencia máxima!' : `¡Más potencia! Nivel ${power}`)
      else take('bomb')
    } else if (id === 'wing') {
      if (wings < 2) ctx.say(++wings === 2 ? '¡Escuadrón completo!' : '¡Nave escolta!')
      else take('rapid')
    } else if (id === 'shield') {
      bubble = true
      ctx.say('¡Burbuja protectora!')
    } else if (id === 'heart') {
      if (ctx.heal()) ctx.say('¡Corazón extra!')
      else take('shield')
    } else if (id === 'bomb') {
      bombs = Math.min(3, bombs + 1)
      ctx.say('¡Bomba!')
      showScore()
    } else if (id === 'rapid') {
      rapid = 9
      ctx.say('¡Fuego rápido!')
    } else {
      missiles = 11
      ctx.say('¡Misiles teledirigidos!')
    }
  }
  const updatePickups = (dt: number) => {
    for (const item of pickup) {
      if (!item.mesh.visible) continue
      item.t += dt
      const far = Math.hypot(px - item.x, pz - item.z)
      if (far < 4.5) {
        // De cerca se van solas hacia la nave
        item.x += ((px - item.x) / far) * 13 * dt
        item.z += ((pz - item.z) / far) * 13 * dt
      } else item.z += 2.6 * dt
      if (far < 1.2) {
        item.mesh.visible = false
        boom(item.x, item.z, 1.2, PICKUP_HEX[item.id])
        take(item.id)
      } else if (item.z > HZ + 2) item.mesh.visible = false
      item.mesh.position.set(wx(item.x), Y + 0.4, wz(item.z))
      item.mesh.scale.setScalar(1 + Math.sin(item.t * 8) * 0.12)
    }
  }

  // Naves enemigas
  const kinds = Object.keys(SHIPS) as ShipId[]
  const foeMesh = Object.fromEntries(kinds.map((kind) => [kind, instanced(models[kind], SHIPS[kind].cap)])) as Record<ShipId, InstancedMesh>
  const foeMeshList = Object.values(foeMesh)
  const foes: Foe[] = []
  const spawn = (kind: ShipId, x: number, i: number, extra = false) => {
    const side = x < 0 ? -1 : 1
    const foe: Foe = {
      kind, x: clampX(x, 1), z: -HZ - 2, ox: clampX(x, 1), vx: 0, vz: 0, t: 0, i,
      hp: Math.max(1, Math.round(SHIPS[kind].hp * tough)) * DAMAGE, cool: 0.8 + (i % 4) * 0.3, state: 0, a: 0, rot: 0,
      flash: 0, tint: 0, hidden: false, extra, gone: false,
    }
    if (kind === 'swarm') Object.assign(foe, { x: side * (HX + 1.5), vx: -side * 7.5, z: -HZ + 3, a: -HZ + 3, cool: 1.5 + Math.random() * 4 })
    else if (kind === 'bomber') Object.assign(foe, { x: side * (HX + 2), vx: -side * 4, z: -HZ + 2.5 + (i % 2) * 2 })
    else if (kind === 'saucer') foe.a = -HZ - 4
    else if (kind === 'coal') Object.assign(foe, { vz: 3 + (i % 3) * 0.9, vx: (((i * 37) % 7) - 3) * 0.3 })
    foes.push(foe)
    return foe
  }
  const kill = (e: Foe, reward = true) => {
    if (e.gone) return
    e.gone = true
    const spec = SHIPS[e.kind]
    const big = spec.r > 1.3
    boom(e.x, e.z, spec.r * 1.6, spec.hex)
    if (big) {
      ctx.sound('slam')
      ctx.shake(0.35)
      for (let k = 0; k < 3; k++) boom(e.x + (Math.random() - 0.5) * spec.r * 2, e.z + (Math.random() - 0.5) * spec.r * 2, spec.r, ORANGE)
    } else ctx.sound('hit')
    if (!reward) return
    if (!e.extra) {
      kills++
      showScore()
    }
    if (e.kind === 'splitter') for (const vx of [-3.2, 0, 3.2]) Object.assign(spawn('shard', e.x, e.i), { z: e.z, vx, extra: e.extra })
    if (e.kind === 'coal') for (const vx of [-2.6, 2.6]) Object.assign(spawn('ember', e.x, e.i), { z: e.z, vx, vz: 5, extra: e.extra })
    if (++sinceDrop >= 16 || Math.random() < spec.drop) drop(e.x, e.z)
    if (e.kind === 'carrier') drop(e.x + 2, e.z)
  }
  const harm = (e: Foe, amount: number) => {
    e.hp -= amount
    e.flash = 0.09
    if (e.hp <= 0.001) kill(e)
  }
  const canShoot = (e: Foe) => e.z > -HZ && e.z < HZ - 7
  const ready = (e: Foe, dt: number, next: number) => {
    if ((e.cool -= dt) > 0 || !canShoot(e)) return false
    e.cool = next
    return true
  }
  const bounce = (e: Foe, margin: number) => {
    if ((e.vx > 0 && e.x > HX - margin) || (e.vx < 0 && e.x < -HX + margin)) {
      e.vx = -e.vx
      return true
    }
    return false
  }
  const think = (e: Foe, dt: number) => {
    const { t } = e
    switch (e.kind) {
      case 'drone':
        e.z += 4.5 * sp * dt
        e.x = clampX(e.ox + Math.sin(t * 2 + e.i) * 1.2)
        if (lvl > 1 && !e.state && t > 1.3 && e.i % 3 === 0) {
          e.state = 1
          if (canShoot(e)) shoot(e.x, e.z + 0.8, aim(e.x, e.z), 7 * bs, RED)
        }
        break
      case 'zigzag':
        e.z += 3.4 * sp * dt
        e.x = clampX(e.ox + Math.sin(t * 2.4 + e.i * 0.6) * 4.2)
        e.rot = Math.cos(t * 2.4 + e.i * 0.6) * 0.6
        if (ready(e, dt, 2.4)) shoot(e.x, e.z + 0.8, aim(e.x, e.z), 7 * bs, YELLOW)
        break
      case 'gunner':
        if (t > 10) e.z += 6 * dt
        else if (e.z < -HZ + 4 + (e.i % 3) * 2.2) e.z += 7 * dt
        else {
          e.x = clampX(e.ox + Math.sin(t * 1.2 + e.i) * 1.2)
          if (ready(e, dt, 0)) {
            e.cool = ++e.state % 3 ? 0.16 : 2.3 / sp
            shoot(e.x, e.z + 1, aim(e.x, e.z), 8 * bs, ORANGE)
          }
        }
        break
      case 'kamikaze':
        if (e.state === 0) {
          e.z += 9 * dt
          if (e.z >= -HZ + 2.5) {
            e.state = 1
            e.cool = 0.85
          }
        } else if (e.state === 1) {
          e.a = e.rot = aim(e.x, e.z)
          e.tint = Math.sin(t * 30) > 0 ? 1 : 0
          if ((e.cool -= dt) <= 0) e.state = 2
        } else {
          e.tint = 0
          e.x += Math.sin(e.a) * 17 * sp * dt
          e.z += Math.cos(e.a) * 17 * sp * dt
        }
        break
      case 'spinner':
        e.z += 1.5 * sp * dt
        e.rot += dt * 3
        if (ready(e, dt, 1.9)) circle(e.x, e.z, 8, 5.5 * bs, PINK, e.rot)
        break
      case 'tank':
        e.z += 1.2 * sp * dt
        e.x = clampX(e.ox + Math.sin(t * 0.7) * 1.5, 1.6)
        if (ready(e, dt, 2.6)) fan(e.x, e.z + 1.2, aim(e.x, e.z), 5, 0.2, 6.5 * bs, ORANGE)
        break
      case 'sniper':
        if (t > 13) e.z += 5 * dt
        else if (e.z < -HZ + 2 + (e.i % 2) * 1.8) e.z += 6 * dt
        else {
          e.x = toward(e.x, px, 2 * dt)
          e.rot = aim(e.x, e.z)
          e.cool -= dt
          // Se pone rojo justo antes de disparar
          e.tint = e.cool < 0.7 ? 1 : 0
          if (e.cool <= 0) {
            e.cool = 3 / sp
            shoot(e.x, e.z + 1.4, e.rot, 17 * bs, RED, 1.2)
          }
        }
        break
      case 'swarm':
        e.x += e.vx * sp * dt
        if (bounce(e, 1)) e.a += 3.4
        e.z += (e.a - e.z) * Math.min(1, dt * 4)
        e.rot = e.vx > 0 ? 1.1 : -1.1
        if (ready(e, dt, 3 + Math.random() * 4)) shoot(e.x, e.z + 0.5, 0, 6 * bs, YELLOW, 0.8)
        break
      case 'bomber':
        e.x += e.vx * sp * dt
        if (bounce(e, 1.5)) e.state++
        if (e.state >= 3) e.z += 4 * dt
        e.rot = e.vx > 0 ? 1.57 : -1.57
        if (ready(e, dt, 1 / sp)) shoot(e.x, e.z + 0.8, 0, 5.5 * bs, YELLOW, 1.9)
        break
      case 'mine':
        e.z += 2 * sp * dt
        e.x = clampX(e.x + Math.sin(t + e.i) * 0.6 * dt)
        e.rot += dt
        if (!e.state && Math.hypot(px - e.x, pz - e.z) < 3.2) {
          e.state = 1
          e.cool = 0.6
        }
        if (e.state) {
          e.tint = Math.sin(t * 40) > 0 ? 1 : 0
          if ((e.cool -= dt) <= 0) {
            circle(e.x, e.z, 10, 7 * bs, RED)
            kill(e, false)
          }
        }
        break
      case 'splitter':
        e.z += 2.2 * sp * dt
        e.x = clampX(e.ox + Math.sin(t * 1.3 + e.i) * 2)
        e.rot = Math.sin(t) * 0.4
        break
      case 'shard':
      case 'ember':
      case 'coal':
        e.x += e.vx * dt
        bounce(e, 0.8)
        e.z += (e.kind === 'shard' ? 5.5 : e.vz) * sp * dt
        e.rot += dt * (e.kind === 'coal' ? 1 + (e.i % 3) : 5)
        break
      case 'laser':
        if (e.state === 0) {
          e.z += 6 * dt
          if (e.z >= -HZ + 3.5) {
            e.state = 1
            e.cool = 1.3
          }
        } else if (e.state === 5) e.z += 5 * dt
        else {
          e.cool -= dt
          if (e.state === 1) e.x = toward(e.x, px, 3.5 * dt)
          if (e.state < 3) beams.push({ x: e.x, z: e.z + 1.2, w: 0.12, live: false })
          else if (e.state === 3) beams.push({ x: e.x, z: e.z + 1.2, w: 1.3, live: true })
          if (e.cool <= 0) {
            e.state++
            e.cool = [0, 1.3, 0.45, 1, 1.4][e.state] ?? 0
            if (e.state === 3) ctx.sound('roar')
            if (e.state === 5 && ++e.a < 3) {
              e.state = 1
              e.cool = 1.3
            }
          }
        }
        break
      case 'saucer': {
        e.a += 1.3 * sp * dt
        const turn = t * 2.2 + e.i * 1.57
        e.x = clampX(e.ox + Math.cos(turn) * 2.6)
        e.z = e.a + Math.sin(turn) * 2.6
        e.rot += dt * 4
        if (ready(e, dt, 1.8)) shoot(e.x, e.z + 0.6, 0, 7.5 * bs, YELLOW)
        break
      }
      case 'ghost': {
        const hidden = (t + e.i * 0.7) % 3.2 > 2
        if (e.hidden && !hidden && canShoot(e)) fan(e.x, e.z + 0.8, aim(e.x, e.z), 3, 0.25, 7 * bs, RED)
        e.hidden = hidden
        e.z += 2 * sp * dt
        e.x = toward(e.x, px, (hidden ? 5 : 1.2) * dt)
        break
      }
      case 'gift':
        e.z += 3 * dt
        e.x = clampX(e.ox + Math.sin(t * 2))
        e.rot = Math.sin(t * 3) * 0.3
        break
      case 'carrier':
        if (e.z < -HZ + 4) e.z += 3 * dt
        else {
          e.x = toward(e.x, Math.sin(t * 0.5) * 5, 3 * dt)
          if (ready(e, dt, 3.2 / sp)) {
            if (e.state++ % 2) {
              for (let k = 0; k < 3; k++) Object.assign(spawn('swarm', 0, k, true), { x: e.x, z: e.z + 1.5, a: e.z + 3 + k, vx: k % 2 ? 7.5 : -7.5 })
            } else circle(e.x, e.z, 14, 6 * bs, ORANGE, e.state)
          }
        }
        break
    }
  }
  const updateFoes = (dt: number) => {
    for (let i = 0; i < foeMeshList.length; i++) foeMeshList[i].count = 0
    const count = foes.length
    for (let k = 0; k < count; k++) {
      const e = foes[k]
      e.t += dt
      e.flash -= dt
      think(e, dt)
      if (e.gone) continue
      const spec = SHIPS[e.kind]
      if (e.z > HZ + 3 || Math.abs(e.x) > HX + 4) {
        e.gone = true
        continue
      }
      const dx = px - e.x
      const dz = pz - e.z
      const hitR = spec.r + 0.35
      if (!e.hidden && dx * dx + dz * dz < hitR * hitR) {
        hitPlayer()
        if (spec.hp <= 9) harm(e, 8 * DAMAGE)
        if (e.gone) continue
      }
      const mesh = foeMesh[e.kind]
      const n = mesh.count
      if (n >= spec.cap) continue
      const size = spec.size * (e.hidden ? 0.6 : 1) * (e.flash > 0 ? 1.15 : 1)
      q.setFromAxisAngle(up, e.rot)
      mesh.setMatrixAt(n, m4.compose(p.set(wx(e.x), Y, wz(e.z)), q, sc.setScalar(size)))
      if (e.flash > 0) color.setScalar(5)
      else if (e.hidden) color.setRGB(0.25, 0.3, 0.5)
      else if (e.tint) color.setRGB(3, 0.5, 0.5)
      else color.setScalar(1)
      mesh.setColorAt(n, color)
      mesh.count = n + 1
    }
    for (let k = foes.length - 1; k >= 0; k--) if (foes[k].gone) foes.splice(k, 1)
    for (let i = 0; i < foeMeshList.length; i++) {
      const mesh = foeMeshList[i]
      if (mesh.count > 0) {
        mesh.instanceMatrix.needsUpdate = true
        mesh.instanceColor!.needsUpdate = true
      }
    }
  }

  // La Nodriza: dos cañones, el núcleo y una fase de furia
  const hasBoss = steps.some((step) => 'boss' in step)
  const boss = { on: false, x: 0, z: -HZ - 9, hp: 0, max: 0, t: 0, phase: 0, pt: -1, pat: 0, tick: 0, spin: 0, dying: 0, flash: 0, clang: 0, told: false }
  const pods = [-1, 1].map((side) => ({ side, hp: 0, max: 0, alive: false, flash: 0, cool: 1.2 + (side > 0 ? 0.85 : 0), burst: 0 }))
  const bossMesh = hasBoss ? add(new Mesh(models.boss, ctx.matFoe)) : null
  const podMesh = hasBoss ? instanced(models.pod, 2) : null
  if (bossMesh) bossMesh.visible = false
  const podX = (side: number) => boss.x + side * 4.7
  const showBoss = () => {
    const extra = pods.reduce((sum, pod) => sum + (pod.alive ? pod.hp : 0), 0)
    ctx.hud({ boss: { name: def.title, hp: Math.max(0, boss.hp) + extra, max: boss.max + pods[0].max * 2 } })
  }
  const startBoss = () => {
    boss.on = true
    boss.hp = boss.max = Math.round(620 * tough) * DAMAGE
    for (const pod of pods) {
      pod.hp = pod.max = Math.round(150 * tough) * DAMAGE
      pod.alive = true
    }
    if (bossMesh) bossMesh.visible = true
    ctx.sound('roar')
    ctx.say('¡Alerta! Se acerca la Nodriza Carbonera')
    showBoss()
  }
  const hitBoss = (amount: number) => {
    if (boss.phase < 2) {
      if (boss.clang <= 0) {
        boss.clang = 0.4
        ctx.sound('clang')
        if (!boss.told && boss.phase === 1) ctx.say('El núcleo está blindado: vuela primero los dos cañones')
        boss.told = true
      }
      return
    }
    boss.hp -= amount
    boss.flash = 0.12
    showBoss()
    if (boss.hp > 0.001) return
    boss.hp = 0
    boss.dying = 2.8
    clearBullets()
    for (const e of foes) kill(e, false)
    ctx.sound('bossdown')
    ctx.shake(0.8)
    ctx.say('GG. La Nodriza, hecha carbonilla')
  }
  const hitPod = (pod: (typeof pods)[number], amount: number) => {
    pod.hp -= amount
    pod.flash = 0.09
    if (pod.hp <= 0.001) {
      pod.alive = false
      kills++
      showScore()
      ctx.sound('slam')
      ctx.shake(0.5)
      for (let k = 0; k < 4; k++) boom(podX(pod.side) + (Math.random() - 0.5) * 2.5, boss.z + 0.6 + (Math.random() - 0.5) * 2.5, 2.4, ORANGE)
      drop(podX(pod.side), boss.z + 2)
      if (!pods.some((item) => item.alive)) {
        boss.phase = 2
        boss.pt = -1.5
        boss.pat = 0
        ctx.say('«¡Mis cañones!» El núcleo queda al descubierto')
      }
    }
    showBoss()
  }
  const escort = (kind: ShipId, x: number, i: number) => Object.assign(spawn(kind, x, i, true), { z: boss.z + 1 })
  const updateBoss = (dt: number) => {
    if (!boss.on || !bossMesh || !podMesh) return
    boss.t += dt
    boss.flash -= dt
    boss.clang -= dt
    ctx.foeFlash.value = Math.max(0, boss.flash / 0.12) * 0.4
    if (boss.dying > 0) {
      boss.dying -= dt
      bossMesh.rotation.z += dt * 0.5
      bossMesh.scale.multiplyScalar(Math.max(0, 1 - dt * 0.5))
      if (Math.random() < 0.4) boom(boss.x + (Math.random() - 0.5) * 9, boss.z + (Math.random() - 0.5) * 6, 1.5 + Math.random() * 2, Math.random() < 0.5 ? ORANGE : YELLOW)
      if (Math.random() < 0.1) ctx.sound('slam')
      ctx.shake(0.3)
      if (boss.dying <= 0) {
        boss.on = false
        bossMesh.visible = false
        ctx.foeFlash.value = 0
        kills++
        showScore()
        finish()
      }
      return
    }
    if (boss.phase === 0) {
      boss.z = Math.min(-HZ + 7, boss.z + 4 * dt)
      if (boss.z >= -HZ + 7) {
        boss.phase = 1
        ctx.say('«Este año, carbón hasta en el espacio»')
      }
    } else {
      const rage = boss.phase === 3
      const calm = rage && boss.pat % 3 === 2
      boss.x += (Math.sin(boss.t * 0.45) * (rage ? 5 : 3) - boss.x) * Math.min(1, dt * (calm ? 0.5 : 1.5))
    }
    const bx = boss.x
    const bz = boss.z
    if (Math.abs(px - bx) < 2.5 && Math.abs(pz - bz) < 3.2) hitPlayer()
    const prev = boss.pt
    const at = (when: number) => prev < when && boss.pt >= when
    const every = (gap: number) => {
      if ((boss.tick -= dt) > 0) return false
      boss.tick += gap
      return true
    }
    if (boss.phase === 1) {
      boss.pt += dt
      for (const pod of pods) {
        if (!pod.alive) continue
        if (Math.abs(px - podX(pod.side)) < 1.5 && Math.abs(pz - bz - 0.6) < 2) hitPlayer()
        if ((pod.cool -= dt) > 0) continue
        pod.cool = ++pod.burst % 3 ? 0.14 : 1.7 / sp
        shoot(podX(pod.side), bz + 3, aim(podX(pod.side), bz + 3), 8 * bs, ORANGE)
      }
      if (boss.pt > 5.5) {
        boss.pt = 0
        for (const pod of pods) if (pod.alive) fan(podX(pod.side), bz + 3, 0, 7, 0.24, 6.5 * bs, YELLOW)
      }
      if (every(3.6)) circle(bx, bz + 2, 10, 4.5 * bs, RED, boss.t)
    } else if (boss.phase >= 2) {
      boss.pt += dt
      const rage = boss.phase === 3
      const pat = boss.pat % 3
      if (!rage && boss.hp < boss.max * 0.45) {
        boss.phase = 3
        boss.pt = -1.5
        boss.pat = 0
        clearBullets()
        ctx.sound('roar')
        ctx.shake(0.6)
        ctx.say('«¡Carbón para todos!» La Nodriza entra en furia')
      } else if (boss.pt >= 0 && !rage) {
        if (pat === 0) {
          // Espiral de dos brazos
          if (every(0.1)) {
            boss.spin += 0.31
            shoot(bx, bz + 1, boss.spin, 6 * bs, ORANGE)
            shoot(bx, bz + 1, boss.spin + Math.PI, 6 * bs, ORANGE)
          }
        } else if (pat === 1) {
          if (boss.pt < 4.6) for (const side of [-1, 1]) beams.push({ x: bx + side * 3.2, z: bz + 2, w: boss.pt < 1.1 ? 0.12 : 1.5, live: boss.pt >= 1.1 })
          if (at(1.1)) ctx.sound('roar')
          if (every(0.75)) shoot(bx, bz + 3, aim(bx, bz + 3), 8 * bs, YELLOW)
        } else {
          if (at(0)) for (let k = 0; k < 6; k++) Object.assign(escort('swarm', 0, k), { x: bx + (k % 2 ? 3 : -3), a: bz + 4 + k * 0.8, vx: k % 2 ? 7.5 : -7.5 })
          if (at(0.6) || at(2.4) || at(4.2)) circle(bx, bz + 1, 16, 5.5 * bs, RED, boss.pt)
        }
      } else if (boss.pt >= 0) {
        if (pat === 0) {
          // Espiral de cuatro brazos que cambia de sentido
          if (every(0.15)) {
            boss.spin += boss.pat % 2 ? -0.23 : 0.23
            circle(bx, bz + 1, 4, 5.5 * bs, RED, boss.spin)
          }
          if (at(1.5) || at(3.5)) fan(bx, bz + 3, aim(bx, bz + 3), 5, 0.22, 8 * bs, YELLOW)
        } else if (pat === 1) {
          if (at(0)) for (const side of [-1, 1]) Object.assign(escort('kamikaze', bx + side * 4, side), { z: bz, state: 1, cool: 1 })
          if (at(0.3) || at(1.9) || at(3.5)) {
            // Cortina de balas con un único hueco
            const hole = clampX(px + (Math.random() - 0.5) * 8, 2.5)
            for (let x = -HX + 0.5; x <= HX; x += 1.05) if (Math.abs(x - hole) > 1.8) shoot(x, bz + 2.5, 0, 6 * bs, ORANGE)
          }
        } else {
          if (boss.pt < 4.6) beams.push({ x: bx, z: bz + 3, w: boss.pt < 1.3 ? 0.2 : 4.2, live: boss.pt >= 1.3 })
          if (at(1.3)) ctx.sound('roar')
          if (every(1.3)) for (const side of [-1, 1]) circle(bx + side * 4.7, bz + 0.6, 10, 5 * bs, YELLOW, boss.t)
        }
      }
      if (boss.pt > 5.5) {
        boss.pat++
        boss.pt = rage ? -0.7 : -1
        boss.tick = 0
      }
    }
    bossMesh.position.set(wx(bx), Y, wz(bz))
    let pn = 0
    for (let i = 0; i < pods.length; i++) {
      const pod = pods[i]
      pod.flash -= dt
      if (!pod.alive) continue
      podMesh.setMatrixAt(pn, m4.makeTranslation(wx(podX(pod.side)), Y, wz(bz + 0.6)))
      podMesh.setColorAt(pn, color.setScalar(pod.flash > 0 ? 5 : 1))
      pn++
    }
    podMesh.count = pn
    if (pn > 0) {
      podMesh.instanceMatrix.needsUpdate = true
      podMesh.instanceColor!.needsUpdate = true
    }
  }

  const updateShots = (dt: number) => {
    const fighting = boss.on && boss.phase > 0 && boss.dying <= 0
    let n = 0
    for (let i = 0; i < SHOTS; i++) {
      const b = shot[i]
      if (!b.on) continue
      if (b.type === 2) {
        // El misil gira hacia la nave más cercana
        let best = 400
        let tx = b.x
        let tz = b.z - 10
        const seek = (x: number, z: number) => {
          const d = (x - b.x) ** 2 + (z - b.z) ** 2
          if (d < best) {
            best = d
            tx = x
            tz = z
          }
        }
        for (const e of foes) if (!e.hidden && e.z > -HZ) seek(e.x, e.z)
        if (fighting) {
          for (const pod of pods) if (pod.alive) seek(podX(pod.side), boss.z + 0.6)
          if (boss.phase > 1) seek(boss.x, boss.z)
        }
        const d = Math.hypot(tx - b.x, tz - b.z) || 1
        const k = Math.min(1, dt * 7)
        b.vx += (((tx - b.x) / d) * 19 - b.vx) * k
        b.vz += (((tz - b.z) / d) * 19 - b.vz) * k
      }
      b.x += b.vx * dt
      b.z += b.vz * dt
      if (b.z < -HZ - 2 || b.z > HZ + 2 || Math.abs(b.x) > HX + 2) b.on = false
      const amount = ctx.strike(b.power)
      for (let k = 0; b.on && k < foes.length; k++) {
        const e = foes[k]
        const r = SHIPS[e.kind].r
        if (e.gone || e.hidden || e.z < -HZ - 1 || Math.abs(e.x - b.x) > r + 0.25 || Math.abs(e.z - b.z) > r + 0.5) continue
        b.on = false
        harm(e, amount)
      }
      if (b.on && fighting) {
        for (const pod of pods) {
          if (!b.on || !pod.alive || Math.abs(podX(pod.side) - b.x) > 1.3 || Math.abs(boss.z + 0.6 - b.z) > 1.8) continue
          b.on = false
          hitPod(pod, amount)
        }
        if (b.on && Math.abs(boss.x - b.x) < 2.3 && Math.abs(boss.z - b.z) < 3) {
          b.on = false
          hitBoss(amount)
        }
      }
      if (!b.on) {
        if (b.z > -HZ - 1 && Math.abs(b.x) < HX + 1) ctx.burst(wx(b.x) - 0.5, Y, wz(b.z) - 0.5, SHOT_HEX[b.type], 1)
        continue
      }
      q.setFromAxisAngle(up, Math.atan2(b.vx, b.vz))
      const wide = b.type === 2 ? 0.8 : 0.42
      shots.setMatrixAt(n, m4.compose(p.set(wx(b.x), Y + 0.3, wz(b.z)), q, sc.set(wide, wide, b.type === 2 ? 1.4 : 2.2)))
      shots.setColorAt(n, color.set(SHOT_HEX[b.type]))
      n++
    }
    shots.count = n
    if (n > 0) {
      shots.instanceMatrix.needsUpdate = true
      shots.instanceColor!.needsUpdate = true
    }
  }

  // Guion de oleadas
  let stepAt = 0
  let stepT = 0
  let endT = 0
  const queue: { t: number; kind: ShipId; x: number; i: number }[] = []
  const busy = () => queue.length > 0 || foes.some((e) => !e.extra)
  const updateScript = (dt: number) => {
    for (let k = queue.length - 1; k >= 0; k--) {
      if ((queue[k].t -= dt) > 0) continue
      const [item] = queue.splice(k, 1)
      spawn(item.kind, item.x, item.i)
    }
    stepT += dt
    while (stepAt < steps.length) {
      const step = steps[stepAt]
      if ('wait' in step && stepT < step.wait) break
      if ('clear' in step && busy() && stepT < step.clear) break
      if ('kind' in step) {
        for (let i = 0; i < step.n; i++) {
          const lane = step.kind === 'swarm' || step.kind === 'bomber' ? step.x : step.x + (i - (step.n - 1) / 2) * step.spread
          queue.push({ t: i * step.gap, kind: step.kind, x: lane, i })
        }
      } else {
        stepT = 0
        if ('boss' in step) startBoss()
      }
      stepAt++
    }
    if (hasBoss || stepAt < steps.length || busy()) return
    if ((endT += dt) > 1.2) finish()
  }

  // Una estrella por superar la fase, otra por perder un corazón como mucho y otra por derribar casi todo
  const finish = () => {
    if (ended) return
    ended = true
    const lost = def.hearts - ctx.hearts()
    ctx.win(1 + (lost <= def.bite ? 1 : 0) + (kills >= total * 0.85 ? 1 : 0))
  }

  showScore()
  ctx.hud({ coins: null, time: null, bonus: null })
  ctx.liquid(null)
  ctx.foeFlash.value = 0

  return {
    update(dt: number) {
      time += dt
      px = pos.x - FIELD.x
      pz = pos.z - FIELD.z
      beams.length = 0
      updateSpace(dt)
      updateScript(dt)
      updatePlayer(dt)
      updateFoes(dt)
      updateBoss(dt)
      updateShots(dt)
      updateBullets(dt)
      updateBeams()
      updatePickups(dt)
      updateBlasts(dt)
      updateRing(dt)
    },
    // Estado para las pruebas automáticas
    peek() {
      return {
        kills,
        total,
        step: stepAt,
        steps: steps.length,
        foes: foes.map((e) => ({ kind: e.kind, x: e.x, z: e.z })),
        bullets: bullet.filter((b) => b.on).length,
        power,
        wings,
        bombs,
        nodriza: boss.on ? { x: boss.x, hp: boss.hp, phase: boss.phase, pat: boss.pat, pods: pods.filter((pod) => pod.alive).length } : null,
      }
    },
    // La nave dispara sola
    attack() {
      return false
    },
    // Bomba: limpia las balas de la pantalla y daña a todo lo que haya
    special() {
      if (ended || bombs <= 0 || bombCool > 0) return false
      bombs--
      bombCool = 1
      safe = Math.max(safe, 1.2)
      ringR = 0.5
      clearBullets()
      const amount = ctx.strike(14)
      for (const e of foes.slice()) if (e.z > -HZ - 1) harm(e, amount)
      if (boss.on && boss.phase > 0 && boss.dying <= 0) {
        for (const pod of pods) if (pod.alive) hitPod(pod, amount * 2)
        if (boss.phase > 1) hitBoss(amount * 2)
      }
      ctx.sound('roar')
      ctx.sound('slam')
      ctx.shake(0.5)
      showScore()
      return true
    },
    dispose() {
      for (const mesh of meshes) {
        ctx.scene.remove(mesh)
        if (mesh instanceof InstancedMesh) mesh.dispose()
      }
      for (const sprite of nebulae) {
        ctx.scene.remove(sprite)
        sprite.material.dispose()
      }
      ctx.scene.remove(starPoints)
      starGeo.dispose()
      starMat.dispose()
      hazeTex.dispose()
      const { icons, ...rest } = models
      for (const geo of [...Object.values(rest), ...Object.values(icons)]) geo.dispose()
      ctx.foeFlash.value = 0
    },
  }
}
