import { CanvasTexture, Color, InstancedMesh, Matrix4, Mesh, Quaternion, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from 'three'
import type { BufferGeometry, Material, Scene } from 'three'
import { BOSSES, createBoss, type BossState, type Target } from './bosses'
import { createShmup } from './shmup'
import { DAMAGE } from './stats'
import { Voxels } from './voxels'
import type { StageDef } from './stages'

export interface StageHud {
  hearts: number
  boss: { name: string; hp: number; max: number } | null
  coins: [number, number] | null
  bonus: [number, number] | null
  time: number | null
  // Fases de naves: derribadas sobre el total y bombas que quedan
  kills: [number, number] | null
  bombs: number | null
  // Escudo de la defensa: null si no se tiene, false mientras se recarga
  shield: boolean | null
}

export type StageSound =
  | 'shoot'
  | 'swing'
  | 'hit'
  | 'clang'
  | 'slam'
  | 'roar'
  | 'coin'
  | 'checkpoint'
  | 'bossdown'

export interface StageCtx {
  scene: Scene
  mat: Material
  // Material del jefe: foeFlash lo lleva a blanco al recibir un golpe
  matFoe: Material
  foeFlash: { value: number }
  coinGeo: BufferGeometry
  player: { pos: Vector3; vel: Vector3 }
  solid: (x: number, y: number, z: number) => boolean
  // Quita un corazón y empuja al jugador en esa dirección
  hurt: (kx: number, kz: number) => void
  burst: (x: number, y: number, z: number, hex: number, amount: number) => void
  shake: (amount: number) => void
  sound: (name: StageSound) => void
  say: (text: string) => void
  hud: (patch: Partial<StageHud>) => void
  blob: (x: number, y: number, z: number, r: number) => void
  checkpoint: (x: number, y: number, z: number) => void
  liquid: (level: number | null) => void
  // Devuelve un corazón si falta alguno
  heal: () => boolean
  hearts: () => number
  // Daño entero de un golpe con esa potencia, ya con la fuerza del jugador
  strike: (power: number) => number
  win: (stars: number) => void
  lose: () => void
}

const flat = { jitter: 0 }
const glow = { jitter: 0, glow: true }

const MODEL_BUILDERS = {
  pig: () => {
    const pig = new Voxels(31)
    const pink = 0xf2a0b5
    pig.box(-1.6, 0.8, -2.2, 3.2, 2.6, 4.4, pink)
    pig.box(-1.3, 1.2, 2.2, 2.6, 2.2, 1.4, 0xf5b1c2)
    pig.box(-0.7, 1.5, 3.6, 1.4, 0.9, 0.5, 0xe07f9a)
    for (const x of [-0.45, 0.2]) {
      pig.box(x, 1.75, 4.1, 0.25, 0.4, 0.04, 0x8a3b55, flat)
      pig.box(x * 2 - 0.15, 2.7, 3.6, 0.5, 0.45, 0.04, 0xffffff, glow)
      pig.box(x * 2, 2.72, 3.63, 0.22, 0.3, 0.04, 0x1a1a2a, glow)
      pig.box(x * 2.4 - 0.2, 3.4, 2.4, 0.7, 0.6, 0.3, 0xe07f9a)
    }
    for (const x of [-1.5, 0.6]) for (const z of [-2, 1.1]) pig.box(x, 0, z, 0.9, 0.8, 0.9, 0xe07f9a)
    pig.box(-0.15, 2.4, -2.6, 0.3, 0.3, 0.4, 0xe07f9a)
    // La ranura de la hucha
    pig.box(-0.6, 3.4, -0.5, 1.2, 0.06, 0.3, 0x5a2038, flat)
    pig.box(-0.3, 3.4, -0.42, 0.6, 0.5, 0.14, 0xf8b132, glow)
    return pig.build()
  },
  golem: () => {
    const golem = new Voxels(32)
    const choc = 0x5a2d1a
    for (const x of [-1.3, 0.3]) golem.box(x, 0, -0.5, 1, 1.7, 1, 0x3d1c10)
    golem.box(-1.6, 1.6, -0.8, 3.2, 3, 1.6, choc)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) golem.box(-1.45 + i * 1, 1.75 + j * 0.95, 0.8, 0.9, 0.8, 0.14, 0x7a4428)
    golem.box(-0.5, 2.7, 0.92, 1, 0.8, 0.06, 0xf2e6c9, glow)
    golem.box(-0.9, 4.6, -0.7, 1.8, 1.4, 1.4, 0x6b3620)
    for (const x of [-0.6, 0.2]) golem.box(x, 5.2, 0.7, 0.4, 0.3, 0.04, 0xffd97a, glow)
    golem.box(-0.5, 4.8, 0.7, 1, 0.14, 0.04, 0x2a1108, flat)
    for (const x of [-2.6, 1.6]) {
      golem.box(x, 1.8, -0.6, 1, 2.8, 1.2, choc)
      golem.box(x - 0.1, 1.1, -0.7, 1.2, 0.9, 1.4, 0x3d1c10)
    }
    return golem.build()
  },
  glove: () => {
    const glove = new Voxels(33)
    const red = 0xc8323c
    glove.box(-1.6, 0, -1.4, 3.2, 2.6, 2.8, red)
    glove.box(1.6, 0.6, -0.6, 0.8, 1.4, 1.4, 0xa3232c)
    glove.box(-1.3, 2.6, -1.1, 2.6, 1.2, 2.2, 0xf2e6c9)
    glove.box(-1.35, 2.95, -1.15, 2.7, 0.3, 2.3, 0xf8b132)
    for (let i = 0; i < 3; i++) glove.box(-1.5 + i * 1.05, 0.02, 1.4, 0.9, 1.1, 0.06, 0xa3232c, flat)
    return glove.build()
  },
  dragon: () => {
    const dragon = new Voxels(34)
    const purple = 0x5b2fa0
    dragon.box(-0.7, 0.1, -2.4, 1.4, 1.1, 4, 0x47238a)
    dragon.box(-0.9, 0, 1.6, 1.8, 1.4, 2, purple)
    dragon.box(-0.6, 0, 3.6, 1.2, 0.8, 0.7, 0x6c3cc0)
    dragon.box(-0.35, 0.3, -4.4, 0.7, 0.6, 2, 0x47238a)
    dragon.box(-0.6, 0.2, -5, 1.2, 0.2, 0.8, 0x21c7b0)
    for (const x of [-0.8, 0.5]) {
      dragon.box(x, 1.4, 1.9, 0.3, 0.9, 0.3, 0x21c7b0)
      dragon.box(x + 0.02, 0.75, 3.6, 0.3, 0.35, 0.04, 0xffffff, glow)
      dragon.box(x + 0.1, 0.78, 3.63, 0.13, 0.25, 0.04, 0x10204a, glow)
    }
    for (const x of [-3.6, 0.7]) dragon.box(x, 0.9, -1.4, 2.9, 0.2, 2.4, 0x8a55e0)
    for (let i = 0; i < 4; i++) dragon.box(-0.15, 1.2, -2 + i * 0.9, 0.3, 0.4, 0.3, 0x8a55e0)
    return dragon.build()
  },
  hamster: () => {
    const hamster = new Voxels(35)
    hamster.box(-0.35, 0, -0.45, 0.7, 0.55, 0.9, 0xc98a4b)
    hamster.box(-0.25, 0.02, 0.2, 0.5, 0.3, 0.27, 0xf2e6c9)
    for (const x of [-0.32, 0.14]) {
      hamster.box(x, 0.55, 0.05, 0.18, 0.16, 0.1, 0xe0a070)
      hamster.box(x + 0.04, 0.33, 0.46, 0.1, 0.1, 0.03, 0x1a1a2a, glow)
    }
    hamster.box(-0.06, 0.2, 0.47, 0.12, 0.08, 0.03, 0xe07f9a, flat)
    return hamster.build()
  },
  tree: () => {
    const tree = new Voxels(44)
    tree.box(-0.6, 0, -0.6, 1.2, 1.4, 1.2, 0x5a3320)
    const tiers: [number, number, number][] = [[4.8, 1.2, 0x1c7a45], [3.8, 2.4, 0x239150], [2.8, 3.6, 0x1c7a45], [1.8, 4.8, 0x239150]]
    tiers.forEach(([w, y, hex], i) => {
      tree.box(-w / 2, y, -w / 2, w, 1.2, w, hex)
      const bauble = [0xc8323c, 0xf8b132, 0x21c7b0][i % 3]
      for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) tree.box((x * w) / 2 - 0.2, y - 0.3, (z * w) / 2 - 0.2, 0.4, 0.4, 0.4, bauble, glow)
    })
    tree.box(-0.45, 6, -0.45, 0.9, 0.9, 0.9, 0xffd97a, glow)
    for (const x of [-0.9, 0.3]) {
      tree.box(x, 2.75, 1.9, 0.6, 0.55, 0.05, 0xffffff, glow)
      tree.box(x + 0.2, 2.8, 1.93, 0.22, 0.3, 0.05, 0x1a1a2a, glow)
      tree.box(x - 0.05, 3.3, 1.9, 0.7, 0.14, 0.06, 0x0f3d24, flat)
    }
    return tree.build()
  },
  top: () => {
    const top = new Voxels(45)
    top.box(-0.2, 0, -0.2, 0.4, 0.6, 0.4, 0xdfe8ff)
    const rings: [number, number, number, number][] = [[1.4, 0.6, 0.5, 0xc8323c], [2.6, 1.1, 0.6, 0xf8b132], [3.6, 1.7, 0.8, 0x21c7b0], [2.8, 2.5, 0.6, 0xc8323c], [1.6, 3.1, 0.5, 0xf2e6c9]]
    for (const [w, y, h, hex] of rings) top.box(-w / 2, y, -w / 2, w, h, w, hex)
    top.box(-0.2, 3.6, -0.2, 0.4, 1, 0.4, 0x9a6b3a)
    for (const x of [-0.8, 0.3]) {
      top.box(x, 1.9, 1.8, 0.5, 0.45, 0.05, 0xffffff, glow)
      top.box(x + 0.15, 1.93, 1.83, 0.2, 0.28, 0.05, 0x1a1a2a, glow)
    }
    return top.build()
  },
  snowman: () => {
    const snowman = new Voxels(46)
    const snow = 0xf4f8ff
    snowman.box(-1.7, 0, -1.6, 3.4, 2.3, 3.2, snow)
    snowman.box(-1.25, 2.3, -1.15, 2.5, 1.8, 2.3, 0xe6eefc)
    snowman.box(-0.9, 4.1, -0.85, 1.8, 1.5, 1.7, snow)
    snowman.box(-1.3, 3.8, -1.2, 2.6, 0.35, 2.4, 0xc8323c)
    snowman.box(-1.1, 5.6, -1.05, 2.2, 0.2, 2.1, 0x1a1a2a)
    snowman.box(-0.7, 5.8, -0.65, 1.4, 1, 1.3, 0x24242c)
    snowman.box(-0.72, 5.8, -0.67, 1.44, 0.25, 1.34, 0xc8323c)
    snowman.box(-0.15, 4.6, 0.85, 0.3, 0.3, 0.9, 0xf08a2a)
    for (const x of [-0.55, 0.25]) snowman.box(x, 5, 0.85, 0.3, 0.3, 0.05, 0x1a1a2a, glow)
    for (const y of [1.2, 2.7, 3.3]) snowman.box(-0.15, y, y < 2 ? 1.6 : 1.15, 0.3, 0.3, 0.06, 0x1a1a2a, flat)
    for (const x of [-2.6, 1.2]) snowman.box(x, 3, -0.1, 1.4, 0.2, 0.2, 0x5a3320)
    return snowman.build()
  },
  train: () => {
    const train = new Voxels(47)
    train.box(-1.1, 0.6, 0.6, 2.2, 1.6, 3.6, 0xc8323c)
    train.box(-1.15, 2.2, 0.6, 2.3, 1.3, 1.5, 0xa3232c)
    train.box(-1.3, 3.5, 0.5, 2.6, 0.2, 1.7, 0xf8b132)
    train.box(-0.35, 2.2, 3, 0.7, 1.2, 0.7, 0x24242c)
    train.box(-0.45, 3.4, 2.9, 0.9, 0.2, 0.9, 0xf8b132)
    train.box(-1.2, 0.2, 4.2, 2.4, 0.6, 0.5, 0xf8b132)
    for (const x of [-0.7, 0.2]) {
      train.box(x, 1.4, 4.2, 0.5, 0.5, 0.05, 0xffffff, glow)
      train.box(x + 0.15, 1.45, 4.23, 0.2, 0.3, 0.05, 0x1a1a2a, glow)
    }
    train.box(-1, 0.6, -2.6, 2, 1.5, 2.8, 0x1c7a45)
    train.box(-1, 0.6, -5.8, 2, 1.5, 2.8, 0x3a74c4)
    train.box(-0.7, 2.1, -2.3, 1.4, 0.5, 2.2, 0x24242c)
    train.box(-0.7, 2.1, -5.5, 1.4, 0.6, 2.2, 0xf2e6c9)
    for (const z of [0.4, -2.8]) train.box(-0.15, 0.9, z - 0.2, 0.3, 0.3, 0.4, 0x24242c)
    for (const z of [3.2, 1.2, -1, -2.2, -4.2, -5.4]) for (const x of [-1.3, 1.05]) train.box(x, 0, z, 0.25, 0.8, 0.8, 0xf8b132)
    return train.build()
  },
  ghost: () => {
    const ghost = new Voxels(48)
    const sheet = 0xf2f6ff
    ghost.box(-1.3, 0.8, -1, 2.6, 3.2, 2, sheet)
    ghost.box(-1.05, 4, -0.85, 2.1, 0.6, 1.7, sheet)
    for (let i = 0; i < 4; i++) ghost.box(-1.3 + i * 0.7, i % 2 ? 0.2 : 0.45, -1, 0.5, 0.6, 2, 0xdfe6fa)
    for (const x of [-0.8, 0.25]) ghost.box(x, 2.9, 1, 0.55, 0.75, 0.05, 0x1a1a2a, glow)
    ghost.box(-0.35, 1.9, 1, 0.7, 0.6, 0.05, 0x3a2a55, glow)
    for (const x of [-1.2, 0.8]) ghost.box(x, 2.4, 1, 0.4, 0.25, 0.04, 0xe07f9a, flat)
    for (const x of [-2.1, 1.3]) ghost.box(x, 2.2, -0.3, 0.8, 0.6, 0.6, sheet)
    return ghost.build()
  },
  pinata: () => {
    const pinata = new Voxels(49)
    const paper = [0xe0489a, 0xf8b132, 0x21c7b0, 0x8a55e0]
    for (let i = 0; i < 4; i++) pinata.box(-0.9, 1.6, -1.6 + i * 0.8, 1.8, 1.5, 0.8, paper[i])
    for (const x of [-0.85, 0.35]) for (const z of [-1.5, 0.9]) {
      pinata.box(x, 0.8, z, 0.5, 0.8, 0.5, paper[z > 0 ? 1 : 2])
      pinata.box(x, 0, z, 0.5, 0.8, 0.5, paper[z > 0 ? 3 : 0])
    }
    pinata.box(-0.55, 2.7, 1.3, 1.1, 1.1, 0.8, paper[1])
    pinata.box(-0.6, 3.6, 1.5, 1.2, 1.1, 1.3, paper[0])
    pinata.box(-0.45, 3.6, 2.8, 0.9, 0.7, 0.6, paper[2])
    for (const x of [-0.6, 0.3]) {
      pinata.box(x, 4.7, 1.6, 0.3, 0.7, 0.3, paper[3])
      pinata.box(x * 1.1 + 0.02, 4.15, 2.8, 0.28, 0.32, 0.05, 0x1a1a2a, glow)
    }
    pinata.box(-0.15, 2.4, -2, 0.3, 0.3, 0.6, paper[3])
    return pinata.build()
  },
  robot: () => {
    const robot = new Voxels(50)
    const metal = 0x8fa3b8
    for (const x of [-1.2, 0.3]) robot.box(x, 0, -0.5, 0.9, 1.6, 1, 0x4a5d85)
    robot.box(-1.7, 1.6, -1, 3.4, 2.8, 2, metal)
    robot.box(-1.2, 2.6, 1, 2.4, 1.2, 0.08, 0x21c7b0, glow)
    robot.box(-1.72, 1.9, -1.02, 3.44, 0.4, 2.04, 0xf8b132)
    robot.box(-1, 4.4, -0.8, 2, 1.4, 1.6, 0xb8c6d6)
    robot.box(-0.8, 4.9, 0.8, 1.6, 0.4, 0.06, 0xff3b4a, glow)
    robot.box(-0.08, 5.8, -0.08, 0.16, 0.7, 0.16, 0x4a5d85)
    robot.box(-0.2, 6.5, -0.2, 0.4, 0.4, 0.4, 0xff3b4a, glow)
    for (const x of [-2.7, 1.7]) {
      robot.box(x, 2, -0.5, 1, 2.2, 1, 0x6b7f99)
      robot.box(x - 0.1, 1, -0.6, 0.45, 1, 1.2, 0xc8323c)
      robot.box(x + 0.65, 1, -0.6, 0.45, 1, 1.2, 0xc8323c)
      robot.box(x - 0.1, 0.7, -0.6, 0.45, 0.3, 1.2, 0xffffff)
      robot.box(x + 0.65, 0.7, -0.6, 0.45, 0.3, 1.2, 0xffffff)
    }
    return robot.build()
  },
  disco: () => {
    const disco = new Voxels(51)
    const facets = [0xe0489a, 0x21c7b0, 0xf8b132, 0x8a55e0]
    const slabs: [number, number, number][] = [[1.4, 0, 0.4], [2.3, 0.4, 0.5], [2.8, 0.9, 1], [2.3, 1.9, 0.5], [1.4, 2.4, 0.4]]
    slabs.forEach(([w, y, h], i) => {
      disco.box(-w / 2, y, -w / 2, w, h, w, i % 2 ? 0x9fb0c8 : 0xcfd8e8)
      for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        disco.box((x * w) / 2 - 0.2 + (z ? 0.5 : 0), y + h / 2 - 0.15, (z * w) / 2 - 0.2 + (x ? -0.5 : 0), 0.4, 0.3, 0.4, facets[(i + x + z + 2) % 4], glow)
      }
    })
    disco.box(-1.1, 1.3, 1.4, 2.2, 0.4, 0.06, 0x1a1a2a, flat)
    disco.box(-0.1, 2.8, -0.1, 0.2, 1.2, 0.2, 0x4a5d85)
    return disco.build()
  },
  clock: () => {
    const clock = new Voxels(52)
    const oak = 0x7a4f28
    clock.box(-1.4, 0, -1.2, 2.8, 1, 2.4, 0x5a3320)
    clock.box(-1.1, 1, -0.9, 2.2, 3, 1.8, oak)
    clock.box(-0.7, 1.4, 0.9, 1.4, 2.2, 0.06, 0x2a1a10, flat)
    clock.box(-0.3, 1.6, 0.94, 0.6, 0.6, 0.08, 0xf8b132, glow)
    clock.box(-0.06, 2.2, 0.94, 0.12, 1.3, 0.06, 0xf8b132)
    clock.box(-1.6, 4, -1.1, 3.2, 3, 2.2, 0x5a3320)
    clock.box(-1.25, 4.35, 1.1, 2.5, 2.3, 0.08, 0xf2e6c9, glow)
    for (const [x, y] of [[0, 2], [0, 0.1], [-1.1, 1.05], [1, 1.05]]) clock.box(x - 0.08, 4.4 + y, 1.18, 0.2, 0.2, 0.04, 0x1a1a2a, glow)
    clock.box(-0.07, 5.5, 1.19, 0.14, 0.95, 0.04, 0x1a1a2a, glow)
    clock.box(-0.07, 5.43, 1.19, 0.75, 0.14, 0.04, 0xc8323c, glow)
    for (const x of [-1.2, 0.4]) clock.box(x, 7, -0.4, 0.8, 0.8, 0.8, 0xf8b132)
    clock.box(-0.1, 7, -0.1, 0.2, 1.2, 0.2, 0x24242c)
    return clock.build()
  },
  king: () => {
    const king = new Voxels(53)
    const coal = 0x24242c
    for (const x of [-1.5, 0.5]) king.box(x, 0, -0.6, 1, 0.9, 1.2, 0x16161c)
    king.box(-2, 0.7, -1.7, 4, 3.6, 3.4, coal)
    king.box(-2.3, 1.4, -1.2, 0.5, 1.6, 2.2, 0x33333d)
    king.box(1.8, 2, -1.3, 0.5, 1.4, 2, 0x33333d)
    king.box(-1.4, 4.3, -1.2, 2.8, 0.5, 2.4, 0x2c2c36)
    for (const x of [-1.3, 0.4]) {
      king.box(x, 3, 1.7, 0.9, 0.45, 0.06, 0xff8a2a, glow)
      king.box(x - 0.1, 3.45, 1.7, 1.1, 0.16, 0.08, 0x0c0c10, flat)
    }
    king.box(-1, 1.6, 1.7, 2, 0.3, 0.06, 0xff5a1f, glow)
    for (const x of [-0.8, -0.1, 0.6]) king.box(x, 1.3, 1.7, 0.2, 0.3, 0.06, 0xff5a1f, glow)
    for (const x of [-3.3, 2.3]) {
      king.box(x, 1.6, -0.6, 1, 2.2, 1.2, coal)
      king.box(x - 0.1, 0.9, -0.7, 1.2, 0.8, 1.4, 0x16161c)
    }
    king.box(-1.3, 4.8, -1.1, 2.6, 0.5, 2.2, 0xf8b132)
    for (const x of [-1.3, -0.25, 0.8]) for (const z of [-1.1, 0.6]) king.box(x, 5.3, z, 0.5, 0.6, 0.5, 0xf8b132)
    king.box(-0.2, 4.9, 1.1, 0.4, 0.3, 0.06, 0xc8323c, glow)
    return king.build()
  },
  ginger: () => {
    const ginger = new Voxels(54)
    const cookie = 0xb5733a
    for (const x of [-0.3, 0.08]) ginger.box(x, 0, -0.12, 0.22, 0.38, 0.24, cookie)
    ginger.box(-0.3, 0.36, -0.12, 0.6, 0.55, 0.24, cookie)
    ginger.box(-0.26, 0.9, -0.13, 0.52, 0.44, 0.26, 0xc17f44)
    for (const x of [-0.56, 0.3]) ginger.box(x, 0.62, -0.1, 0.26, 0.18, 0.2, cookie)
    for (const x of [-0.17, 0.07]) ginger.box(x, 1.1, 0.13, 0.1, 0.1, 0.03, 0xffffff, glow)
    ginger.box(-0.12, 0.97, 0.13, 0.24, 0.05, 0.03, 0xffffff, glow)
    ginger.box(-0.06, 0.7, 0.12, 0.12, 0.1, 0.03, 0xc8323c, glow)
    ginger.box(-0.06, 0.48, 0.12, 0.12, 0.1, 0.03, 0x21c7b0, glow)
    return ginger.build()
  },
  mimic: () => {
    const mimic = new Voxels(58)
    mimic.box(-0.45, 0, -0.45, 0.9, 0.55, 0.9, 0xc8323c)
    mimic.box(-0.48, 0.62, -0.48, 0.96, 0.28, 0.96, 0xc8323c)
    mimic.box(-0.1, 0, -0.47, 0.2, 0.55, 0.94, 0xf8b132)
    mimic.box(-0.1, 0.62, -0.5, 0.2, 0.3, 1, 0xf8b132)
    mimic.box(-0.25, 0.9, -0.08, 0.5, 0.2, 0.16, 0xf8b132)
    mimic.box(-0.4, 0.55, -0.4, 0.8, 0.07, 0.8, 0x2a0a10, flat)
    for (let i = 0; i < 4; i++) mimic.box(-0.38 + i * 0.2, 0.5, 0.4, 0.14, 0.14, 0.06, 0xffffff, glow)
    for (const x of [-0.3, 0.14]) mimic.box(x, 0.7, 0.48, 0.16, 0.12, 0.03, 0xffe14a, glow)
    return mimic.build()
  },
  cloud: () => {
    const cloud = new Voxels(59)
    cloud.box(-3, 0, -2, 6, 1.6, 4, 0x3a3d4a)
    cloud.box(-2.2, 1.3, -1.4, 3.4, 1.2, 2.8, 0x4a4e5e)
    cloud.box(0.8, 1, -1.1, 2.6, 1, 2.2, 0x4a4e5e)
    cloud.box(-3.8, 0.3, -1.2, 1.2, 1, 2.4, 0x33363f)
    cloud.box(-0.3, -0.9, -0.3, 0.6, 0.9, 0.6, 0xffe14a, glow)
    for (const x of [-1.5, 0.7]) cloud.box(x, 0.5, 2, 0.8, 0.5, 0.05, 0xffe14a, glow)
    return cloud.build()
  },
  grape: () => {
    const grape = new Voxels(60)
    for (const [x, y, z] of [[0, 0, 0], [-0.3, 0.3, 0], [0.3, 0.3, 0], [0, 0.3, 0.3], [0, 0.3, -0.3], [0, 0.6, 0]]) {
      grape.box(x - 0.2, y - 0.4, z - 0.2, 0.4, 0.4, 0.4, 0x9be04a, glow)
    }
    grape.box(-0.04, 0.6, -0.04, 0.08, 0.3, 0.08, 0x5a3320)
    return grape.build()
  },
  balloon: () => {
    const balloon = new Voxels(55)
    balloon.box(-0.7, 0.5, -0.7, 1.4, 1.5, 1.4, 0xe0489a)
    balloon.box(-0.9, 0.8, -0.5, 1.8, 0.9, 1, 0xe0489a)
    balloon.box(-0.5, 0.8, -0.9, 1, 0.9, 1.8, 0xe0489a)
    balloon.box(-0.45, 0.25, -0.45, 0.9, 0.3, 0.9, 0xc93a86)
    balloon.box(-0.15, 0.05, -0.15, 0.3, 0.2, 0.3, 0xc93a86)
    balloon.box(-0.03, -1.1, -0.03, 0.06, 1.15, 0.06, 0xffffff, flat)
    balloon.box(-0.5, 1.5, 0.7, 0.3, 0.35, 0.04, 0xffffff, glow)
    return balloon.build()
  },
  marble: () => {
    const marble = new Voxels(56)
    marble.box(-0.6, -0.6, -0.6, 1.2, 1.2, 1.2, 0xffffff)
    marble.box(-0.8, -0.4, -0.4, 1.6, 0.8, 0.8, 0xe8e8e8)
    marble.box(-0.4, -0.8, -0.4, 0.8, 1.6, 0.8, 0xe8e8e8)
    marble.box(-0.4, -0.4, -0.8, 0.8, 0.8, 1.6, 0xe8e8e8)
    marble.box(-0.82, -0.12, -0.12, 1.64, 0.24, 0.24, 0xffffff, glow)
    return marble.build()
  },
  flame: () => {
    const flame = new Voxels(65)
    flame.box(-0.5, 0, -0.5, 1, 1, 1, 0xff7a1a, glow)
    flame.box(-0.52, 0, -0.3, 1.04, 0.8, 0.6, 0xffd23a, glow)
    flame.box(-0.3, 0, -0.52, 0.6, 0.8, 1.04, 0xffd23a, glow)
    return flame.build()
  },
  nozzle: () => {
    const nozzle = new Voxels(66)
    nozzle.box(-0.5, -1, -0.5, 1, 1, 1, 0x33363f)
    nozzle.box(-0.3, -14, -0.3, 0.6, 13, 0.6, 0x4a4e5e)
    nozzle.box(-0.4, 0, -0.4, 0.8, 0.08, 0.8, 0xff7a1a, glow)
    return nozzle.build()
  },
  press: () => {
    const press = new Voxels(67)
    press.box(-0.5, 0.3, -0.5, 1, 1.2, 1, 0x4a4e5e)
    press.box(-0.52, 0, -0.52, 1.04, 0.3, 1.04, 0xf8d02a)
    press.box(-0.15, 1.5, -0.15, 0.3, 14, 0.3, 0x8a90a0)
    return press.build()
  },
  camera: () => {
    // Cámara del directo: mira hacia +z
    const camera = new Voxels(57)
    for (const [x, z] of [[-1.2, -0.8], [1, -0.8], [-0.1, 0.9]]) camera.box(x, 0, z, 0.25, 3, 0.25, 0x24242c)
    camera.box(-0.2, 2.8, -0.2, 0.4, 0.8, 0.4, 0x4a5d85)
    camera.box(-1.3, 3.6, -1.8, 2.6, 2, 3.2, 0x33363f)
    camera.box(-0.8, 3.9, 1.4, 1.6, 1.4, 1, 0x24242c)
    camera.box(-0.55, 4.15, 2.4, 1.1, 0.9, 0.06, 0x6fd3ff, glow)
    camera.box(-1.6, 4.2, -1.2, 0.3, 0.9, 1.6, 0x4a5d85)
    camera.box(-1, 5.6, -1.4, 0.8, 0.8, 0.8, 0x24242c)
    camera.box(0.2, 5.6, -1.4, 0.8, 0.8, 0.8, 0x24242c)
    return camera.build()
  },
  lampOn: () => {
    const lampOn = new Voxels(62)
    lampOn.box(-0.5, 0, -0.5, 1, 1, 1, 0xff2a3a, glow)
    return lampOn.build()
  },
  lampOff: () => {
    const lampOff = new Voxels(63)
    lampOff.box(-0.5, 0, -0.5, 1, 1, 1, 0x3ddc6a, glow)
    return lampOff.build()
  },
  keeper: () => {
    const keeper = new Voxels(64)
    const kit = 0xf8d02a
    for (const x of [-0.8, 0.2]) {
      keeper.box(x, 0, -0.3, 0.6, 0.35, 0.9, 0xffffff)
      keeper.box(x, 0.35, -0.3, 0.6, 1.1, 0.6, 0x1a1a2a)
    }
    keeper.box(-0.9, 1.4, -0.45, 1.8, 0.5, 0.9, 0x1a1a2a)
    keeper.box(-1, 1.9, -0.5, 2, 1.7, 1, kit)
    keeper.box(-0.35, 2.5, 0.5, 0.7, 0.7, 0.05, 0x1a1a2a, flat)
    keeper.box(-0.65, 3.6, -0.55, 1.3, 1.2, 1.1, 0xf0c39a)
    keeper.box(-0.7, 4.6, -0.6, 1.4, 0.35, 1.2, kit)
    keeper.box(-0.7, 4.6, 0.6, 1.4, 0.12, 0.5, kit)
    for (const x of [-0.45, 0.15]) keeper.box(x, 4.1, 0.55, 0.28, 0.28, 0.05, 0x1a1a2a, glow)
    keeper.box(-0.3, 3.8, 0.55, 0.6, 0.12, 0.05, 0x7a2a2a, flat)
    for (const x of [-2.3, 1]) {
      keeper.box(x, 2.9, -0.3, 1.3, 0.6, 0.6, kit)
      keeper.box(x < 0 ? x - 0.6 : x + 0.9, 2.6, -0.5, 1, 1.2, 1, 0xffffff)
      keeper.box(x < 0 ? x - 0.62 : x + 0.88, 2.6, -0.52, 1.04, 0.3, 1.04, 0xc8323c)
    }
    return keeper.build()
  },
  shot: () => {
    const shot = new Voxels(36)
    shot.box(-0.22, -0.22, -0.22, 0.44, 0.44, 0.44, 0xffffff, glow)
    return shot.build()
  },
  goal: () => {
    const goal = new Voxels(37)
    goal.box(-0.7, -0.6, -0.7, 1.4, 1.2, 1.4, 0xf2e6c9, glow)
    goal.box(-0.2, -0.62, -0.72, 0.4, 1.24, 1.44, 0xc8323c, glow)
    goal.box(-0.72, -0.62, -0.2, 1.44, 1.24, 0.4, 0xc8323c, glow)
    goal.box(-0.35, 0.6, -0.12, 0.7, 0.3, 0.24, 0xf8b132, glow)
    return goal.build()
  },
  segment: () => {
    const segment = new Voxels(38)
    segment.box(-0.6, 0, -0.22, 1.2, 0.4, 0.44, 0xffffff, glow)
    return segment.build()
  },
  marker: () => {
    const marker = new Voxels(39)
    marker.box(-1, 0, -1, 2, 0.06, 2, 0xffffff, glow)
    marker.box(-0.7, 0.01, -0.7, 1.4, 0.07, 1.4, 0xbbbbbb, glow)
    return marker.build()
  },
  lake: () => {
    const lake = new Voxels(40)
    lake.box(-22, -0.4, -22, 44, 0.4, 44, 0x6b3620, flat)
    return lake.build()
  },
  sword: () => {
    const sword = new Voxels(41)
    sword.box(-0.04, 0, -0.02, 0.08, 0.7, 0.04, 0xdfe8ff, glow)
    sword.box(-0.02, 0.7, -0.02, 0.04, 0.06, 0.04, 0xdfe8ff, glow)
    sword.box(-0.14, -0.05, -0.04, 0.28, 0.06, 0.08, 0xf8b132)
    sword.box(-0.035, -0.26, -0.03, 0.07, 0.21, 0.06, 0x5a3320)
    return sword.build()
  },
  blaster: () => {
    const blaster = new Voxels(42)
    blaster.box(-0.07, -0.07, -0.42, 0.14, 0.14, 0.42, 0x3a74c4)
    blaster.box(-0.09, -0.09, -0.5, 0.18, 0.18, 0.1, 0xe8f1ff)
    blaster.box(-0.05, -0.24, -0.1, 0.1, 0.18, 0.1, 0x14306b)
    blaster.box(-0.06, 0.07, -0.3, 0.12, 0.08, 0.16, 0x21c7b0, glow)
    return blaster.build()
  },
  cube: () => {
    const cube = new Voxels(43)
    cube.box(-0.5, -0.5, -0.5, 1, 1, 1, 0xffffff)
    return cube.build()
  },
}

export type Models = { [K in keyof typeof MODEL_BUILDERS]: BufferGeometry }

const builtGeos = new WeakMap<Models, BufferGeometry[]>()

// Cada modelo se construye solo la primera vez que se usa
export function buildModels(): Models {
  const cache: Partial<Models> = {}
  const list: BufferGeometry[] = []
  const models = new Proxy(cache as Models, {
    get(target, prop: string) {
      if (prop in target) return target[prop as keyof Models]
      const build = MODEL_BUILDERS[prop as keyof typeof MODEL_BUILDERS]
      if (!build) return undefined
      const geo = build()
      target[prop as keyof Models] = geo
      list.push(geo)
      return geo
    },
  })
  builtGeos.set(models, list)
  return models
}

export function disposeModels(models: Models) {
  const list = builtGeos.get(models)
  if (!list) return
  for (const geo of list) geo.dispose()
  list.length = 0
}

const SHOTS = 96
const WAVES = 3
const SEGMENTS = 30
const MARKERS = 20
const BEAMS = 2
const BEAM_SEGMENTS = 14

export function createStage(ctx: StageCtx, def: StageDef, models: Models) {
  if (def.kind === 'ships') return createShmup(ctx, def)
  return createGround(ctx, def, models)
}

function createGround(ctx: StageCtx, def: StageDef, models: Models) {
  const { pos, vel } = ctx.player
  // Bichos y trastos van más deprisa en las últimas casillas
  const hard = 1 + def.level * 0.35
  const meshes: Mesh[] = []
  const add = <T extends Mesh>(mesh: T) => {
    mesh.frustumCulled = false
    mesh.layers.enable(1)
    ctx.scene.add(mesh)
    meshes.push(mesh)
    return mesh
  }
  const m4 = new Matrix4()
  const q = new Quaternion()
  const p = new Vector3()
  const s = new Vector3()
  const up = new Vector3(0, 1, 0)
  const color = new Color()
  const hide = new Matrix4().makeScale(0, 0, 0)
  const arena = def.arena ?? { x: 48, y: 8, z: 48, r: 16 }
  let time = 0
  let cooldown = 0
  let special = 0
  let ended = false

  // Lo que el jugador puede golpear: jefes y bichos
  const targets: Target[] = []

  // Números de daño que saltan del enemigo (texturas en caché para no subir a GPU en cada golpe)
  const NUMBER_LIFE = 0.75
  const numTexCache = new Map<string, CanvasTexture>()
  const numberTex = (text: string, big: boolean) => {
    const key = `${text}:${big ? 1 : 0}`
    let tex = numTexCache.get(key)
    if (tex) return tex
    const canvas = document.createElement('canvas')
    canvas.width = 192
    canvas.height = 96
    const g = canvas.getContext('2d')!
    g.font = `${big ? 76 : 60}px Pixel, monospace`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineJoin = 'round'
    g.lineWidth = 12
    g.strokeStyle = '#1a1024'
    g.fillStyle = big ? '#f8b132' : '#ffffff'
    g.strokeText(text, 96, 50)
    g.fillText(text, 96, 50)
    tex = new CanvasTexture(canvas)
    tex.colorSpace = SRGBColorSpace
    numTexCache.set(key, tex)
    return tex
  }
  const numbers = Array.from({ length: 10 }, () => {
    const sprite = new Sprite(new SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false }))
    sprite.visible = false
    sprite.renderOrder = 10
    ctx.scene.add(sprite)
    return { sprite, life: 0, vx: 0, vy: 0, vz: 0, size: 1 }
  })
  const pop = (x: number, y: number, z: number, amount: number, big: boolean) => {
    const n = numbers.find((item) => item.life <= 0) ?? numbers.reduce((a, b) => (a.life < b.life ? a : b))
    const tex = numberTex(String(Math.round(amount)), big)
    if (n.sprite.material.map !== tex) {
      n.sprite.material.map = tex
      n.sprite.material.needsUpdate = true
    }
    n.sprite.position.set(x + (Math.random() - 0.5) * 0.9, y, z + (Math.random() - 0.5) * 0.9)
    n.sprite.visible = true
    n.vx = (Math.random() - 0.5) * 1.6
    n.vz = (Math.random() - 0.5) * 1.6
    n.vy = 4.2
    n.size = big ? 1.3 : 1
    n.life = NUMBER_LIFE
  }
  const updateNumbers = (dt: number) => {
    for (const n of numbers) {
      if (n.life <= 0) continue
      n.life -= dt
      if (n.life <= 0) {
        n.sprite.visible = false
        continue
      }
      n.vy = Math.max(0.5, n.vy - 9 * dt)
      n.sprite.position.x += n.vx * dt
      n.sprite.position.y += n.vy * dt
      n.sprite.position.z += n.vz * dt
      const punch = 1 + Math.max(0, 1 - (NUMBER_LIFE - n.life) / 0.12) * 0.8
      const far = Math.hypot(n.sprite.position.x - pos.x, n.sprite.position.y - pos.y - 1.5, n.sprite.position.z - pos.z)
      const size = Math.min(3, Math.max(0.8, far * 0.14)) * n.size * punch
      n.sprite.scale.set(size * 2, size, 1)
      n.sprite.material.opacity = Math.min(1, n.life / 0.25)
    }
  }

  // Proyectiles del jugador y de los enemigos
  const shots = add(new InstancedMesh(models.shot, ctx.mat, SHOTS))
  const shot = Array.from({ length: SHOTS }, () => ({
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, foe: false, grav: 0, blast: 0, hex: 0xffffff, size: 1, power: 1,
  }))
  for (let i = 0; i < SHOTS; i++) {
    shots.setMatrixAt(i, hide)
    shots.setColorAt(i, color.set(0xffffff))
  }
  shots.count = 0
  const fire = (
    x: number, y: number, z: number, vx: number, vy: number, vz: number,
    foe: boolean, grav: number, hex: number, size = 1, blast = 0, power = 1
  ) => {
    const i = shot.findIndex((item) => item.life <= 0)
    if (i < 0) return
    Object.assign(shot[i], { x, y, z, vx, vy, vz, foe, grav, hex, size, blast, power, life: 4 })
  }
  const updateShots = (dt: number) => {
    let n = 0
    for (let i = 0; i < SHOTS; i++) {
      const b = shot[i]
      if (b.life <= 0) continue
      b.life -= dt
      b.vy -= b.grav * dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.z += b.vz * dt
      let dead = b.life <= 0 || ctx.solid(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z))
      const px = b.x - pos.x
      const py = b.y - (pos.y + 0.9)
      const pz = b.z - pos.z
      if (b.foe) {
        const distSq = px * px + py * py + pz * pz
        if (distSq < 0.75) {
          ctx.hurt(b.vx, b.vz)
          dead = true
        } else if (dead && b.blast && distSq < b.blast * b.blast) ctx.hurt(-px, -pz)
      } else {
        for (let t = 0; t < targets.length; t++) {
          const target = targets[t]
          const dx = b.x - target.x
          const dy = b.y - target.y
          const dz = b.z - target.z
          const rr = target.r + 0.35 * b.size
          if (dx * dx + dy * dy + dz * dz < rr * rr) {
            target.hit('snow', b.power)
            dead = true
            break
          }
        }
      }
      if (dead) {
        b.life = 0
        ctx.burst(b.x - 0.5, b.y - 0.5, b.z - 0.5, b.hex, b.blast ? 12 : 5)
        if (b.blast) ctx.sound('slam')
      } else {
        shots.setMatrixAt(n, m4.makeScale(b.size, b.size, b.size).setPosition(b.x, b.y, b.z))
        shots.setColorAt(n, color.set(b.hex))
        n++
      }
    }
    shots.count = n
    if (n > 0) {
      shots.instanceMatrix.needsUpdate = true
      shots.instanceColor!.needsUpdate = true
    }
  }

  // Ondas expansivas: hay que saltarlas
  const rings = add(new InstancedMesh(models.segment, ctx.mat, WAVES * SEGMENTS))
  const wave = Array.from({ length: WAVES }, () => ({ x: 0, y: 0, z: 0, r: 0, speed: 0, max: 0, on: false, hex: 0 }))
  for (let i = 0; i < WAVES * SEGMENTS; i++) {
    rings.setMatrixAt(i, hide)
    rings.setColorAt(i, color.set(0xffffff))
  }
  rings.count = 0
  const shock = (x: number, y: number, z: number, speed: number, max: number, hex: number) => {
    const i = wave.findIndex((item) => !item.on)
    if (i < 0) return
    Object.assign(wave[i], { x, y, z, speed, max, hex, r: 1.5, on: true })
  }
  const updateWaves = (dt: number) => {
    let n = 0
    for (let i = 0; i < WAVES; i++) {
      const w = wave[i]
      if (!w.on) continue
      w.r += w.speed * dt
      if (w.r > w.max) {
        w.on = false
        continue
      }
      const reach = Math.hypot(pos.x - w.x, pos.z - w.z)
      // Basta con estar en el aire, aunque sea por poco, para que la onda pase por debajo
      if (Math.abs(reach - w.r) < 0.45 && pos.y - w.y < 0.3) ctx.hurt(pos.x - w.x, pos.z - w.z)
      const stretch = (w.r * Math.PI * 2) / SEGMENTS / 1.2
      color.set(w.hex)
      for (let k = 0; k < SEGMENTS; k++) {
        const a = (k / SEGMENTS) * Math.PI * 2
        q.setFromAxisAngle(up, -a + Math.PI / 2)
        p.set(w.x + Math.cos(a) * w.r, w.y, w.z + Math.sin(a) * w.r)
        rings.setMatrixAt(n, m4.compose(p, q, s.set(stretch, 1 + Math.sin(time * 20 + k) * 0.3, 1)))
        rings.setColorAt(n, color)
        n++
      }
    }
    rings.count = n
    if (n > 0) {
      rings.instanceMatrix.needsUpdate = true
      rings.instanceColor!.needsUpdate = true
    }
  }

  // Avisos en el suelo de dónde va a caer algo
  const marks = add(new InstancedMesh(models.marker, ctx.mat, MARKERS))
  const mark = Array.from({ length: MARKERS }, () => ({ x: 0, z: 0, life: 0, size: 1, boom: false, hex: 0 }))
  for (let i = 0; i < MARKERS; i++) {
    marks.setMatrixAt(i, hide)
    marks.setColorAt(i, color.set(0xff3b4a))
  }
  marks.count = 0
  const warn = (x: number, z: number, life: number, size: number, slot = -1) => {
    const i = slot >= 0 ? slot : mark.findIndex((item) => item.life <= 0)
    if (i >= 0) Object.assign(mark[i], { x, z, life, size, boom: false })
  }
  const zap = (x: number, z: number, size: number, delay: number, hex: number) => {
    const i = mark.findIndex((item) => item.life <= 0)
    if (i >= 0) Object.assign(mark[i], { x, z, life: delay, size, boom: true, hex })
  }
  const updateMarks = (dt: number) => {
    let loud = false
    let n = 0
    for (let i = 0; i < MARKERS; i++) {
      const item = mark[i]
      if (item.life <= 0) continue
      item.life -= dt
      if (item.life <= 0) {
        if (item.boom) {
          item.boom = false
          ctx.burst(item.x - 0.5, arena.y, item.z - 0.5, item.hex, 10)
          if (!loud) ctx.sound('slam')
          loud = true
          const dx = pos.x - item.x
          const dz = pos.z - item.z
          if (dx * dx + dz * dz < item.size * item.size && pos.y < arena.y + 2.5) ctx.hurt(dx, dz)
        }
        continue
      }
      const pulse = item.size * (0.85 + Math.sin(time * 14) * 0.15)
      marks.setMatrixAt(n++, m4.makeScale(pulse, 1, pulse).setPosition(item.x, arena.y + 0.03, item.z))
    }
    marks.count = n
    if (n > 0) marks.instanceMatrix.needsUpdate = true
  }

  // Barras a ras de suelo que giran alrededor del jefe
  const bars = def.boss === 'clock' ? add(new InstancedMesh(models.segment, ctx.mat, BEAMS * BEAM_SEGMENTS)) : null
  const bar = Array.from({ length: BEAMS }, () => ({ a: 0, len: 0, on: false }))
  if (bars) for (let i = 0; i < BEAMS * BEAM_SEGMENTS; i++) bars.setMatrixAt(i, hide)
  const beam = (slot: number, a: number, len: number, hex: number) => {
    Object.assign(bar[slot], { a, len, on: true })
    for (let k = 0; k < BEAM_SEGMENTS; k++) bars?.setColorAt(slot * BEAM_SEGMENTS + k, color.set(hex))
  }
  const updateBeams = () => {
    if (!bars) return
    bar.forEach((b, i) => {
      const dx = Math.sin(b.a)
      const dz = Math.cos(b.a)
      const from = 2.2
      const piece = (b.len - from) / BEAM_SEGMENTS
      if (b.on) {
        const along = (pos.x - boss.x) * dx + (pos.z - boss.z) * dz
        const across = Math.abs((pos.x - boss.x) * dz - (pos.z - boss.z) * dx)
        if (along > from && along < b.len && across < 0.5 && pos.y - arena.y < 0.3) ctx.hurt(dz * Math.sign((pos.x - boss.x) * dz - (pos.z - boss.z) * dx), -dx * Math.sign((pos.x - boss.x) * dz - (pos.z - boss.z) * dx))
      }
      q.setFromAxisAngle(up, b.a - Math.PI / 2)
      for (let k = 0; k < BEAM_SEGMENTS; k++) {
        const d = from + (k + 0.5) * piece
        bars.setMatrixAt(i * BEAM_SEGMENTS + k, b.on ? m4.compose(p.set(boss.x + dx * d, arena.y, boss.z + dz * d), q, s.set(piece / 1.2, 1, 1)) : hide)
      }
      b.on = false
    })
    bars.instanceMatrix.needsUpdate = true
    if (bars.instanceColor) bars.instanceColor.needsUpdate = true
  }

  // Bichos: cada fase tiene su especie y su manera de moverse
  const CRITTER_DYING = 0.2
  const species = def.critter ?? { model: 'hamster' as const, mode: 'wander' as const, hex: 0xc98a4b }
  const { mode } = species
  const critter = def.critters.map((c, i) => ({
    ...c, hx: c.x, hz: c.z, a: i * 1.7, alive: true, hp: def.critterHp * DAMAGE, flash: 0, think: 0, dying: 0, wait: c.delay ?? 0, awake: mode !== 'mimic',
    target: null as unknown as Target,
  }))
  const critters = critter.length ? add(new InstancedMesh(models[species.model], ctx.mat, critter.length)) : null
  const counted = def.kind === 'horde' || def.kind === 'hunt'
  const horde = () => ctx.hud({ boss: { name: def.title, hp: critter.filter((c) => c.alive).length, max: critter.length } })
  critter.forEach((c, i) => {
    critters!.setColorAt(i, color.set(0xffffff))
    critters!.setMatrixAt(i, hide)
    c.target = {
      x: c.x, y: c.wait > 0 ? -100 : c.y + 0.3, z: c.z, r: 0.55,
      hit: (_how, power = 1) => {
        if (!c.alive) return
        const amount = ctx.strike(power)
        c.hp -= amount
        if (c.hp > 0.001) {
          // Aguanta el golpe: destello y un paso atrás
          c.flash = 0.18
          c.awake = true
          const away = Math.atan2(c.x - pos.x, c.z - pos.z)
          if (free(c, away, 1.4)) {
            c.x += Math.sin(away)
            c.z += Math.cos(away)
          }
          critters!.setColorAt(i, color.setScalar(5))
          critters!.instanceColor!.needsUpdate = true
          pop(c.x, c.y + 0.9, c.z, amount, false)
          ctx.sound('hit')
          return
        }
        c.alive = false
        c.dying = CRITTER_DYING
        targets.splice(targets.indexOf(c.target), 1)
        // El color de instancia por encima de 1 lo quema a blanco
        critters!.setColorAt(i, color.setScalar(5))
        critters!.instanceColor!.needsUpdate = true
        pop(c.x, c.y + 0.9, c.z, amount, power > 1)
        ctx.burst(c.x - 0.5, c.y, c.z - 0.5, species.hex, 12)
        ctx.shake(0.12)
        ctx.sound('hit')
        if (!counted) return
        horde()
        if (!critter.some((item) => item.alive)) finish()
      },
    }
    targets.push(c.target)
  })
  if (counted) horde()
  const AXES = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
  const free = (c: { x: number; y: number; z: number }, a: number, d: number) =>
    !ctx.solid(Math.floor(c.x + Math.sin(a) * d), Math.floor(c.y + 0.3), Math.floor(c.z + Math.cos(a) * d))
  const updateCritters = (dt: number) => {
    if (!critters) return
    critter.forEach((c, i) => {
      if (!c.alive) {
        if (c.dying <= 0) return critters.setMatrixAt(i, hide)
        c.dying -= dt
        const k = 1 - Math.max(0, c.dying) / CRITTER_DYING
        q.setFromAxisAngle(up, c.a)
        const size = 1.25 - k * 0.5
        return critters.setMatrixAt(i, m4.compose(p.set(c.x, c.y + Math.sin(k * Math.PI) * 0.6, c.z), q, s.set(size, size, size)))
      }
      if (c.wait > 0) {
        // Todavía no ha salido del horno
        c.wait -= dt
        if (c.wait > 0) return
        c.target.y = c.y + 0.3
        ctx.burst(c.x - 0.5, c.y, c.z - 0.5, species.hex, 8)
      }
      if (c.flash > 0) {
        c.flash -= dt
        if (c.flash <= 0) {
          critters.setColorAt(i, color.set(0xffffff))
          critters.instanceColor!.needsUpdate = true
        }
      }
      const far = Math.hypot(pos.x - c.x, pos.z - c.z)
      let speed = 0
      let hop = 0.12
      if (mode === 'chase') {
        c.a = Math.atan2(pos.x - c.x, pos.z - c.z) + Math.sin(time * 2 + i * 2.1) * 0.6
        speed = 2.5 + (i % 3) * 0.35
        hop = 0.22
      } else if (!c.awake) {
        // Un regalo como otro cualquiera hasta que te acercas
        hop = 0
        if (far < 4.5 && Math.abs(pos.y - c.y) < 2) {
          c.awake = true
          ctx.sound('roar')
          ctx.say('¡Ese regalo muerde!')
        }
      } else {
        // Laberinto: deambula y persigue de cerca
        speed = mode === 'mimic' ? 3.1 : 2
        hop = mode === 'mimic' ? 0.3 : 0.12
        c.think -= dt
        const blocked = !free(c, c.a, 0.8)
        if (blocked || c.think <= 0) {
          c.think = 0.9
          const chase = Math.abs(pos.x - c.x) > Math.abs(pos.z - c.z) ? (pos.x > c.x ? Math.PI / 2 : -Math.PI / 2) : pos.z > c.z ? 0 : Math.PI
          const options = (far < 9 && !blocked ? [chase] : []).concat(AXES.slice().sort(() => Math.random() - 0.5))
          c.a = options.find((a) => free(c, a, 0.9)) ?? c.a
        }
      }
      c.x += Math.sin(c.a) * speed * hard * dt
      c.z += Math.cos(c.a) * speed * hard * dt
      c.target.x = c.x
      c.target.z = c.z
      if (c.awake && far < 0.75 && Math.abs(pos.y - c.y) < 1.2) ctx.hurt(pos.x - c.x, pos.z - c.z)
      q.setFromAxisAngle(up, c.a)
      critters.setMatrixAt(i, m4.compose(p.set(c.x, c.y + Math.abs(Math.sin(time * 9 + i)) * hop, c.z), q, s.set(1, 1, 1)))
      ctx.blob(c.x, c.y, c.z, 0.45)
    })
    critters.instanceMatrix.needsUpdate = true
  }

  // Monedas del laberinto y cuenta atrás
  const coinLeft = def.coins.map(() => true)
  const coins = def.coins.length ? add(new InstancedMesh(ctx.coinGeo, ctx.mat, def.coins.length)) : null
  let timeLeft = def.time
  let shownTime = -1
  const updateCoins = () => {
    if (!coins) return
    q.setFromAxisAngle(up, time * 2.4)
    def.coins.forEach((c, i) => {
      if (coinLeft[i] && Math.hypot(c[0] - pos.x, c[1] - pos.y - 0.9, c[2] - pos.z) < 1.3) {
        coinLeft[i] = false
        const left = coinLeft.filter(Boolean).length
        ctx.sound('coin')
        ctx.burst(c[0] - 0.5, c[1] - 0.5, c[2] - 0.5, 0xf8b132, 12)
        ctx.hud({ coins: [def.coins.length - left, def.coins.length] })
        if (!left) finish()
      }
      coins.setMatrixAt(i, coinLeft[i] ? m4.compose(p.set(c[0], c[1] + Math.sin(time * 2 + i) * 0.12, c[2]), q, s.set(1.4, 1.4, 1.4)) : hide)
    })
    coins.instanceMatrix.needsUpdate = true
  }

  // Meta y puntos de control de las fases de plataformas
  const goal = def.goal ? add(new Mesh(models.goal, ctx.mat)) : null
  let checkpoint = 0

  // Chocolate que sube
  const lake = def.rise ? add(new Mesh(models.lake, ctx.mat)) : null
  let level = def.rise?.from ?? 0

  // Mundial de Globos: el globo no puede tocar el suelo
  const TOUCHES = 15
  const globe = { x: arena.x, y: arena.y + 7, z: arena.z, vx: 0, vy: 0, vz: 0, hits: 0, safe: 0, wind: 0 }
  const globeMesh = def.kind === 'balloon' ? add(new Mesh(models.balloon, ctx.mat)) : null
  const globeTarget: Target = {
    x: 0, y: 0, z: 0, r: 1.1,
    hit: () => {
      if (globe.safe > 0 || ended) return
      globe.safe = 0.3
      globe.hits++
      const d = Math.hypot(globe.x - pos.x, globe.z - pos.z) || 1
      globe.vy = 7
      globe.vx = ((globe.x - pos.x) / d) * 2.5 + (Math.random() - 0.5) * 5
      globe.vz = ((globe.z - pos.z) / d) * 2.5 + (Math.random() - 0.5) * 5
      pop(globe.x, globe.y + 1.6, globe.z, globe.hits, globe.hits % 5 === 0)
      ctx.sound('hit')
      ctx.burst(globe.x - 0.5, globe.y, globe.z - 0.5, 0xe0489a, 6)
      ctx.hud({ boss: { name: 'Toques', hp: TOUCHES - globe.hits, max: TOUCHES } })
      if (globe.hits === 5) ctx.say('¡Bien! Ahora baja más rápido')
      if (globe.hits === 10) ctx.say('¡Cinco más y es tuyo!')
      if (globe.hits >= TOUCHES) {
        ctx.say('¡Campeón del Mundial de Globos!')
        finish()
      }
    },
  }
  if (globeMesh) {
    targets.push(globeTarget)
    ctx.hud({ boss: { name: 'Toques', hp: TOUCHES, max: TOUCHES } })
  }
  const updateGlobe = (dt: number) => {
    if (!globeMesh || ended) return
    globe.safe -= dt
    globe.wind += dt * 0.5
    // Cada toque lo hace caer más deprisa y el aire lo va moviendo
    const fall = (globe.hits ? 1.9 + globe.hits * 0.13 : 0.9) * (1 + def.level * 0.3)
    globe.vy = Math.max(-fall, globe.vy - 9 * dt)
    globe.vx += (Math.cos(globe.wind * 1.3) * 1.2 - globe.vx) * Math.min(1, dt * 0.9)
    globe.vz += (Math.sin(globe.wind) * 1.2 - globe.vz) * Math.min(1, dt * 0.9)
    globe.x += globe.vx * dt
    globe.y = Math.min(arena.y + 9, globe.y + globe.vy * dt)
    globe.z += globe.vz * dt
    const d = Math.hypot(globe.x - arena.x, globe.z - arena.z)
    if (d > arena.r - 3) {
      globe.x = arena.x + ((globe.x - arena.x) / d) * (arena.r - 3)
      globe.z = arena.z + ((globe.z - arena.z) / d) * (arena.r - 3)
      globe.vx *= -0.6
      globe.vz *= -0.6
    }
    if (time > 2 && globe.y <= arena.y + 0.2) {
      // Ha tocado el suelo: un corazón menos y vuelve a subir
      ctx.hurt(0, 0)
      ctx.say('¡Ha tocado el suelo!')
      ctx.burst(globe.x - 0.5, arena.y, globe.z - 0.5, 0xe0489a, 14)
      Object.assign(globe, { y: arena.y + 7, vx: 0, vy: 0, vz: 0 })
    }
    globeMesh.position.set(globe.x, globe.y, globe.z)
    globeMesh.rotation.set(globe.vz * 0.08, time * 0.6, -globe.vx * 0.08)
    globeMesh.scale.setScalar(1.15 + Math.max(0, globe.safe) * 0.8)
    Object.assign(globeTarget, { x: globe.x, y: globe.y + 1.2, z: globe.z })
    ctx.blob(globe.x, arena.y, globe.z, 0.9)
    warn(globe.x, globe.z, 0.1, 0.5 + Math.max(0, globe.y - arena.y) * 0.12, 0)
  }

  // Canicas que bajan la rampa sin frenar
  const lane = def.lane
  const laneTop = (z: number) => (lane ? lane.y + 1 + (lane.step ? Math.max(0, Math.floor((80 - Math.max(z, lane.z1)) / lane.step)) : 0) : 0)
  const MARBLES = [0xe0489a, 0x21c7b0, 0xf8b132, 0x8a55e0, 0x3a74c4, 0xc8323c, 0x9be04a]
  const marble = Array.from({ length: def.kind === 'ramp' ? MARBLES.length + Math.round(def.level * 4) : 0 }, (_, i) => ({ x: 0, y: 0, z: 0, vx: 0, vz: 0, wait: 2 + i * 1.3, roll: 0 }))
  const marbles = marble.length ? add(new InstancedMesh(models.marble, ctx.mat, marble.length)) : null
  marble.forEach((_, i) => {
    marbles!.setColorAt(i, color.set(MARBLES[i % MARBLES.length]))
    marbles!.setMatrixAt(i, hide)
  })
  const axis = new Vector3(1, 0, 0)
  const updateMarbles = (dt: number) => {
    if (!marbles || !lane) return
    marble.forEach((item, i) => {
      if (item.wait > 0) {
        item.wait -= dt
        if (item.wait > 0) return marbles.setMatrixAt(i, hide)
        // Sale de arriba por un carril al azar; algunas bajan haciendo eses
        Object.assign(item, {
          x: lane.x0 + 1 + Math.random() * (lane.x1 - lane.x0 - 1), z: lane.z1 - 2, y: laneTop(lane.z1) + 0.8,
          vz: (6.5 + Math.random() * 3.5) * hard, vx: i % 3 === 0 ? (Math.random() < 0.5 ? 3 : -3) : 0,
        })
      }
      item.z += item.vz * dt
      item.x += item.vx * dt
      if (item.x < lane.x0 + 0.8 || item.x > lane.x1 + 0.2) item.vx = Math.abs(item.vx) * (item.x < lane.x0 + 0.8 ? 1 : -1)
      // Cae de escalón en escalón
      item.y = Math.max(laneTop(item.z) + 0.8, item.y - 14 * dt)
      item.roll += item.vz * dt
      if (item.z > lane.z0 + 1) item.wait = 0.4 + Math.random() * 1.6
      if (Math.hypot(pos.x - item.x, pos.y + 0.9 - item.y, pos.z - item.z) < 1.35) ctx.hurt(pos.x - item.x, 1)
      q.setFromAxisAngle(axis, item.roll / 0.8)
      marbles.setMatrixAt(i, m4.compose(p.set(item.x, item.y, item.z), q, s.set(1, 1, 1)))
      ctx.blob(item.x, item.y - 0.8, item.z, 0.8)
    })
    marbles.instanceMatrix.needsUpdate = true
  }

  // Trampas del parkour: los sopletes avisan con una llama pequeña y las prensas tiemblan antes de caer
  const JET = { off: 1.3, warn: 0.5, on: 1.2 }
  const PRESS = { up: 1.9, warn: 0.6, fall: 0.15, down: 0.5, rise: 0.45, lift: 4.6 }
  const jets = def.traps.filter((t) => t.kind === 'jet')
  const presses = def.traps.filter((t) => t.kind === 'press').map((t) => ({ ...t, down: false }))
  const flames = jets.length ? add(new InstancedMesh(models.flame, ctx.mat, jets.length)) : null
  const nozzles = jets.length ? add(new InstancedMesh(models.nozzle, ctx.mat, jets.length)) : null
  const rams = presses.length ? add(new InstancedMesh(models.press, ctx.mat, presses.length)) : null
  jets.forEach((t, i) => nozzles!.setMatrixAt(i, m4.compose(p.set(t.x, t.y, t.z), q.identity(), s.set(t.w + 0.1, 1, t.d + 0.1))))
  const inside = (t: { x: number; z: number; w: number; d: number }, margin: number) =>
    Math.abs(pos.x - t.x) < t.w / 2 + margin && Math.abs(pos.z - t.z) < t.d / 2 + margin
  const updateTraps = () => {
    jets.forEach((t, i) => {
      const at = (time * hard + t.phase) % (JET.off + JET.warn + JET.on)
      const lit = at - JET.off - JET.warn
      const tall = lit > 0 ? t.h * Math.min(1, lit * 8) : at > JET.off ? 0.6 + Math.sin(time * 40 + i) * 0.25 : 0
      const flick = 0.9 + Math.sin(time * 33 + i * 2) * 0.1
      flames!.setMatrixAt(i, tall ? m4.compose(p.set(t.x, t.y, t.z), q.identity(), s.set(t.w * flick, tall, t.d * flick)) : hide)
      if (lit > 0 && !ended && inside(t, 0.1) && pos.y + 1.8 > t.y && pos.y < t.y + t.h) ctx.hurt(0, 0)
    })
    if (flames) flames.instanceMatrix.needsUpdate = true
    presses.forEach((t, i) => {
      const at = (time * hard + t.phase) % (PRESS.up + PRESS.warn + PRESS.fall + PRESS.down + PRESS.rise)
      const fall = at - PRESS.up - PRESS.warn
      const rise = fall - PRESS.fall - PRESS.down
      const lift = (fall < 0 ? 1 : rise > 0 ? rise / PRESS.rise : Math.max(0, 1 - fall / PRESS.fall)) * PRESS.lift
      const shake = fall < 0 && at > PRESS.up ? Math.sin(time * 60) * 0.05 : 0
      const down = lift === 0
      if (down && !t.down) {
        const far = Math.hypot(pos.x - t.x, pos.y - t.y, pos.z - t.z)
        if (far < 18) ctx.sound('slam')
        if (far < 7) ctx.shake(0.15)
        for (const ox of [-1, 1]) for (const oz of [-1, 1]) ctx.burst(t.x - 0.5 + (ox * t.w) / 2, t.y, t.z - 0.5 + (oz * t.d) / 2, 0xdfe8ff, 3)
      }
      t.down = down
      rams!.setMatrixAt(i, m4.compose(p.set(t.x + shake, t.y + lift, t.z), q.identity(), s.set(t.w - 0.1, 1, t.d - 0.1)))
      ctx.blob(t.x, t.y, t.z, Math.max(t.w, t.d) * 0.55)
      if (lift < 1.7 && !ended && inside(t, 0.2) && pos.y > t.y - 0.6 && pos.y < t.y + 1.5) ctx.hurt(0, 0)
    })
    if (rams) rams.instanceMatrix.needsUpdate = true
  }

  // La cámara del directo: cuando está en rojo no hay que moverse
  const cam = def.kind === 'freeze' && lane ? add(new Mesh(models.camera, ctx.mat)) : null
  const lampOn = cam ? add(new Mesh(models.lampOn, ctx.mat)) : null
  const lampOff = cam ? add(new Mesh(models.lampOff, ctx.mat)) : null
  const live = { state: 'off', t: 5, turn: Math.PI, last: new Vector3(), moved: 0 }
  const updateLive = (dt: number) => {
    if (!cam || !lane || !lampOn || !lampOff) return
    const cz = lane.z1 - 5.5
    live.t -= ended ? 0 : dt
    if (live.t <= 0) {
      if (live.state === 'off') {
        live.state = 'warn'
        live.t = 0.8 / hard
        ctx.sound('checkpoint')
        ctx.say('Tres, dos, uno…')
      } else if (live.state === 'warn') {
        live.state = 'live'
        live.t = 1.8 + Math.random() * 1.6
        live.moved = 0
        ctx.sound('roar')
        ctx.say('¡EN DIRECTO! No te muevas')
      } else {
        live.state = 'off'
        live.t = (2.2 + Math.random() * 2.2) / hard
        ctx.say('Corten. ¡Corre!')
      }
    }
    const on = live.state === 'live'
    // Un respiro al principio de cada directo y nada de castigar el empujón del golpe
    const speed = Math.hypot(pos.x - live.last.x, pos.z - live.last.z) / Math.max(dt, 0.001)
    live.last.copy(pos)
    live.moved = on && speed > 0.9 && speed < 30 ? live.moved + dt : 0
    if (on && live.moved > 0.12 && !ended) {
      live.moved = 0
      ctx.say('¡Te han pillado en directo!')
      ctx.hurt(0, 1)
      pos.z = Math.min(lane.z0 - 2, pos.z + 5)
      live.last.copy(pos)
    }
    live.turn += ((on ? 0 : Math.PI) - live.turn) * Math.min(1, dt * (on ? 14 : 5))
    cam.position.set(48.5, lane.y + 1, cz)
    cam.rotation.y = live.turn
    cam.scale.setScalar(1.6)
    const blink = live.state === 'warn' && Math.sin(time * 30) > 0
    lampOn.visible = on || blink
    lampOff.visible = !lampOn.visible
    for (const lamp of [lampOn, lampOff]) {
      lamp.position.set(48.5, lane.y + 12.5, cz)
      lamp.scale.setScalar(on ? 2.6 + Math.sin(time * 10) * 0.3 : 2)
    }
  }

  // El nubarrón persigue al jugador y suelta carbón debajo
  const cloud = def.kind === 'rain' ? add(new Mesh(models.cloud, ctx.mat)) : null
  const storm = { x: arena.x, z: arena.z - 6, drop: 3, n: 0 }
  const updateStorm = (dt: number) => {
    if (!cloud || ended) return
    const d = Math.hypot(pos.x - storm.x, pos.z - storm.z)
    const speed = (3.6 + (1 - timeLeft / def.time) * 1.6) * hard
    if (d > 0.1) {
      storm.x += ((pos.x - storm.x) / d) * Math.min(speed * dt, d)
      storm.z += ((pos.z - storm.z) / d) * Math.min(speed * dt, d)
    }
    const top = arena.y + 11
    cloud.position.set(storm.x, top + Math.sin(time * 2) * 0.3, storm.z)
    cloud.scale.setScalar(1.2 + Math.sin(time * 5) * 0.03)
    ctx.blob(storm.x, arena.y, storm.z, 3)
    storm.drop -= dt
    if (storm.drop > 0) return
    storm.drop = 0.6 / hard
    // Uno de cada tres cae lejos, para que no haya rincón seguro
    const stray = storm.n++ % 3 === 2
    const a = Math.random() * Math.PI * 2
    const r = stray ? Math.random() * (arena.r - 1) : Math.random() * 2.6
    const x = (stray ? arena.x : storm.x) + Math.cos(a) * r
    const z = (stray ? arena.z : storm.z) + Math.sin(a) * r
    fire(x, top, z, 0, -4, 0, true, 16, 0x2a2a33, 1.8, 1.9)
    warn(x, z, 0.95, 1.9)
  }

  // Chocolatinas doradas opcionales
  const bonusLeft = def.bonus.map(() => true)
  const bonus = def.bonus.length ? add(new InstancedMesh(ctx.coinGeo, ctx.mat, def.bonus.length)) : null
  const updateBonus = () => {
    if (!bonus) return
    q.setFromAxisAngle(up, -time * 3)
    def.bonus.forEach((c, i) => {
      if (bonusLeft[i] && Math.hypot(c[0] - pos.x, c[1] - pos.y - 0.9, c[2] - pos.z) < 1.3) {
        bonusLeft[i] = false
        ctx.sound('coin')
        ctx.burst(c[0] - 0.5, c[1] - 0.5, c[2] - 0.5, 0xffe08a, 16)
        ctx.hud({ bonus: [bonusLeft.filter((left) => !left).length, def.bonus.length] })
        ctx.say(bonusLeft.some(Boolean) ? 'Chocolatina dorada' : '¡Todas las chocolatinas doradas!')
      }
      bonus.setMatrixAt(i, bonusLeft[i] ? m4.compose(p.set(c[0], c[1] + Math.sin(time * 3 + i) * 0.15, c[2]), q, s.set(2, 2, 2)) : hide)
    })
    bonus.instanceMatrix.needsUpdate = true
  }

  // Regalos que suelta el avión en los combates: un corazón o unos segundos de golpes dorados
  const gift = { x: 0, y: 0, z: 0, on: false, life: 0, next: 14 }
  let golden = 0
  const giftMesh = (def.boss && def.boss !== 'keeper') || def.kind === 'horde' ? add(new Mesh(models.goal, ctx.mat)) : null
  if (giftMesh) giftMesh.visible = false
  const updateGift = (dt: number) => {
    if (!giftMesh || ended) return
    golden -= dt
    gift.next -= dt
    if (!gift.on && gift.next <= 0) {
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * arena.r * 0.6
      Object.assign(gift, { x: arena.x + Math.cos(a) * r, y: arena.y + 14, z: arena.z + Math.sin(a) * r, on: true, life: 14 })
      ctx.say('¡El avión de Big Ibai suelta un regalo!')
    }
    giftMesh.visible = gift.on
    if (!gift.on) return
    gift.y = Math.max(arena.y + 0.8, gift.y - 7 * dt)
    gift.life -= dt
    giftMesh.position.set(gift.x, gift.y + Math.sin(time * 3) * 0.1, gift.z)
    giftMesh.rotation.y = time * 2
    giftMesh.scale.setScalar(0.7)
    ctx.blob(gift.x, gift.y - 0.7, gift.z, 0.6)
    const taken = Math.hypot(gift.x - pos.x, gift.y - pos.y - 0.9, gift.z - pos.z) < 1.6
    if (taken) {
      ctx.sound('checkpoint')
      ctx.burst(gift.x - 0.5, gift.y - 0.5, gift.z - 0.5, 0xf8b132, 20)
      if (ctx.heal()) ctx.say('¡Corazón extra!')
      else {
        golden = 8
        ctx.say(def.weapon === 'snow' ? '¡Bolas de oro! Doble daño' : '¡Espada de oro! Doble daño')
      }
    }
    if (taken || gift.life <= 0) {
      gift.on = false
      gift.next = 16
    }
  }

  // Una estrella por superar la fase, otra por perder un corazón como mucho y otra por el reto extra
  const finish = () => {
    if (ended) return
    ended = true
    const lost = def.hearts - ctx.hearts()
    const extra = def.bonus.length ? !bonusLeft.some(Boolean) : def.time ? timeLeft >= def.time * 0.35 : lost === 0
    ctx.win(1 + (lost <= def.bite ? 1 : 0) + (extra ? 1 : 0))
  }

  // Jefes: cada uno vive en bosses.ts y aquí se le da con qué atacar
  const boss: BossState = {
    x: arena.x, y: arena.y, z: arena.z - 6, a: 0, hp: 1, max: 1, state: 'walk', t: 2, cycle: 0,
    vx: 0, vz: 0, flash: 0, hop: 0, dying: 0, count: 0, weak: false, immune: false,
  }
  const FLASH = 0.16
  const HOP = 0.24
  ctx.foeFlash.value = 0
  const bossMesh = def.boss ? add(new Mesh(models[def.boss], ctx.matFoe)) : null
  const bossTarget: Target = { x: 0, y: 0, z: 0, r: 2.6, hit: () => {} }
  const showBoss = () => ctx.hud({ boss: { name: def.title, hp: Math.max(0, boss.hp), max: boss.max } })
  const damage = (amount: number, big = false) => {
    if (boss.dying) return
    boss.hp -= amount
    boss.flash = FLASH
    boss.hop = HOP
    pop(bossTarget.x, bossTarget.y + bossTarget.r * 0.9, bossTarget.z, amount, big)
    ctx.shake(big ? 0.22 : 0.12)
    ctx.sound('hit')
    ctx.burst(bossTarget.x - 0.5, bossTarget.y, bossTarget.z - 0.5, BOSSES[def.boss!].hex, big ? 16 : 8)
    showBoss()
    if (boss.hp > 0.001) return
    boss.hp = 0
    boss.dying = 1.6
    ctx.sound('bossdown')
    ctx.shake(0.8)
    ctx.say(`GG. ${BOSSES[def.boss!].lines[2]}`)
  }
  const touch = (r: number, top: number, harmless = false, ox = 0, oz = 0) => {
    const x = boss.x + ox
    const z = boss.z + oz
    const d = Math.hypot(pos.x - x, pos.z - z)
    if (d >= r || pos.y >= boss.y + top || pos.y + 1.8 <= boss.y) return
    if (!boss.weak && !harmless) ctx.hurt(pos.x - x, pos.z - z)
    // Nadie atraviesa a un jefe: se empuja al jugador hacia fuera
    if (d > 0.01 && d < r * 0.8) {
      pos.x = x + ((pos.x - x) / d) * r * 0.8
      pos.z = z + ((pos.z - z) / d) * r * 0.8
    }
  }
  const stayInside = (margin: number) => {
    const d = Math.hypot(boss.x - arena.x, boss.z - arena.z)
    if (d <= arena.r - margin) return false
    boss.x = arena.x + ((boss.x - arena.x) / d) * (arena.r - margin)
    boss.z = arena.z + ((boss.z - arena.z) / d) * (arena.r - margin)
    return true
  }
  let think: ((dt: number) => void) | null = null
  // Cada jefe saluda al empezar y protesta cuando va perdiendo
  let taunts = 0
  if (def.boss && bossMesh) {
    // Los jefes aguantan más cada casilla, al ritmo al que sube la fuerza; uvas y goles van contados
    const { hp } = BOSSES[def.boss]
    boss.hp = boss.max = def.boss === 'clock' || def.boss === 'keeper' ? hp : Math.round(hp * (1 + (def.day - 1) * 0.04)) * DAMAGE
    think = createBoss({
      ctx, def, models, arena, boss, mesh: bossMesh, target: bossTarget, now: () => time,
      add, damage, fire, shock, warn, zap, beam, touch, stayInside,
      aim: (target) => targets.push(target),
    })
    bossTarget.hit = (how, power = 1) => {
      if (boss.dying) return
      // La espada solo hace daño a un jefe sin fuerzas
      if (boss.immune || (how === 'sword' && !boss.weak)) {
        ctx.sound('clang')
        if (how !== 'sword') return
        const push = Math.atan2(pos.x - boss.x, pos.z - boss.z)
        vel.x += Math.sin(push) * 9
        vel.z += Math.cos(push) * 9
        return
      }
      const mult = (boss.weak && how === 'snow' ? 2 : 1) * power
      damage(ctx.strike(mult), mult > 1)
    }
    targets.push(bossTarget)
    showBoss()
  }

  let hopY = 0
  const updateBoss = (dt: number) => {
    if (!bossMesh || !think) return
    boss.flash = Math.max(0, boss.flash - dt)
    boss.hop = Math.max(0, boss.hop - dt)
    ctx.foeFlash.value = boss.flash / FLASH
    if (boss.dying) {
      boss.dying -= dt
      bossMesh.rotation.z += dt * 3
      bossMesh.scale.multiplyScalar(Math.max(0, 1 - dt * 1.4))
      if (Math.random() < 0.5) ctx.burst(boss.x - 0.5 + (Math.random() - 0.5) * 3, boss.y + Math.random() * 3, boss.z - 0.5 + (Math.random() - 0.5) * 3, 0xf8b132, 4)
      if (boss.dying <= 0) {
        boss.dying = 0
        bossMesh.visible = false
        targets.splice(targets.indexOf(bossTarget), 1)
        finish()
      }
      return
    }
    if (ended) return
    const { lines } = BOSSES[def.boss!]
    if ((taunts === 0 && time > 4.4) || (taunts === 1 && boss.hp < boss.max / 2)) {
      if (lines[taunts]) ctx.say(`«${lines[taunts]}»`)
      taunts++
    }
    boss.t -= dt
    think(dt)
    // Destello, brinco y un pequeño estirón con cada golpe
    const punch = boss.flash / FLASH
    bossMesh.scale.x *= 1 + punch * 0.06
    bossMesh.scale.y *= 1 + punch * 0.14
    bossMesh.scale.z *= 1 + punch * 0.06
    hopY = Math.sin((1 - boss.hop / HOP) * Math.PI) * 0.55
    bossMesh.position.y += hopY
  }

  ctx.hud({ coins: coins ? [0, def.coins.length] : null, time: def.time || null, bonus: bonus ? [0, def.bonus.length] : null })
  ctx.liquid(def.rise ? level : null)

  return {
    update(dt: number) {
      time += dt
      cooldown -= dt
      updateBoss(dt)
      if (bossMesh?.visible) ctx.blob(bossMesh.position.x, bossMesh.position.y - hopY, bossMesh.position.z, 1.9 * bossMesh.scale.x)
      updateBeams()
      updateCritters(dt)
      updateGlobe(dt)
      updateMarbles(dt)
      updateTraps()
      updateLive(dt)
      updateStorm(dt)
      updateNumbers(dt)
      updateShots(dt)
      updateWaves(dt)
      updateMarks(dt)
      updateCoins()
      updateBonus()
      updateGift(dt)
      special -= dt

      if (goal && def.goal) {
        goal.position.set(def.goal[0], def.goal[1] + Math.sin(time * 2) * 0.25, def.goal[2])
        goal.rotation.y = time * 1.5
        ctx.blob(def.goal[0], def.goal[1] - 1, def.goal[2], 0.8)
        if (Math.hypot(def.goal[0] - pos.x, def.goal[1] - pos.y - 1, def.goal[2] - pos.z) < 2) finish()
      }
      for (let i = checkpoint + 1; i < def.checkpoints.length; i++) {
        const c = def.checkpoints[i]
        if (Math.hypot(c[0] - pos.x, c[1] - pos.y, c[2] - pos.z) < 1.6) {
          checkpoint = i
          ctx.checkpoint(c[0], c[1], c[2])
          ctx.sound('checkpoint')
          ctx.say('Punto de control')
        }
      }
      if (lake && def.rise) {
        if (time > 6) level += def.rise.speed * dt
        lake.position.set(48, level, 48)
        ctx.liquid(level)
        // El chocolate quema: quita un corazón y te lanza hacia arriba para darte otra oportunidad
        if (pos.y + 0.5 < level) {
          ctx.hurt(0, 0)
          vel.y = Math.max(vel.y, 16)
        }
      }
      if (def.time && !ended) {
        timeLeft -= dt
        const whole = Math.max(0, Math.ceil(timeLeft))
        if (whole !== shownTime) ctx.hud({ time: (shownTime = whole) })
        if (timeLeft <= 0) {
          ended = true
          ctx.lose()
        }
      }
    },
    // Estado para las pruebas automáticas
    peek() {
      return {
        arena,
        boss: def.boss ? { x: boss.x, y: boss.y, z: boss.z, weak: boss.weak, hp: boss.hp, state: boss.state, lane: boss.vz, aim: bossTarget.y } : null,
        waves: wave.filter((w) => w.on).map((w) => ({ x: w.x, z: w.z, r: w.r })),
        coins: def.coins.filter((_, i) => coinLeft[i]),
        critters: critter.filter((c) => c.alive).map((c) => ({ x: c.x, y: c.y, z: c.z })),
        level,
        traps: def.traps,
      }
    },
    // Devuelve si ha habido ataque, para animar el arma
    attack(eye: Vector3, dir: Vector3) {
      if (cooldown > 0 || ended) return false
      if (def.weapon === 'snow') {
        cooldown = 0.24
        const gold = golden > 0
        fire(eye.x + dir.x * 0.7, eye.y - 0.15 + dir.y * 0.7, eye.z + dir.z * 0.7, dir.x * 32, dir.y * 32 + 1, dir.z * 32, false, 5, gold ? 0xf8b132 : 0xffffff, gold ? 1.4 : 1, 0, gold ? 2 : 1)
        ctx.sound('shoot')
        return true
      }
      cooldown = 0.36
      ctx.sound('swing')
      for (const target of targets.slice()) {
        p.set(target.x - eye.x, target.y - eye.y, target.z - eye.z)
        const reach = p.length()
        if (reach < 3.3 + target.r && p.dot(dir) / reach > 0.3) target.hit('sword', golden > 0 ? 2 : 1)
      }
      return true
    },
    // Ataque especial con recarga: bola gigante o giro de espada alrededor
    special(eye: Vector3, dir: Vector3) {
      if (special > 0 || ended) return false
      special = 2.5
      if (def.weapon === 'snow') {
        fire(eye.x + dir.x, eye.y - 0.1 + dir.y, eye.z + dir.z, dir.x * 24, dir.y * 24 + 1.5, dir.z * 24, false, 6, 0x9fe8ff, 2.6, 0, 5)
        ctx.sound('roar')
        return true
      }
      ctx.sound('swing')
      ctx.shake(0.25)
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        ctx.burst(pos.x - 0.5 + Math.cos(a) * 2.6, pos.y + 0.6, pos.z - 0.5 + Math.sin(a) * 2.6, 0xdfe8ff, 2)
      }
      for (const target of targets.slice()) {
        if (Math.hypot(target.x - pos.x, target.z - pos.z) < 4 + target.r && Math.abs(target.y - pos.y - 0.9) < 4) target.hit('sword', 2)
      }
      return true
    },
    dispose() {
      for (const mesh of meshes) {
        ctx.scene.remove(mesh)
        if (mesh instanceof InstancedMesh) mesh.dispose()
      }
      for (const n of numbers) {
        ctx.scene.remove(n.sprite)
        n.sprite.material.dispose()
      }
      for (const tex of numTexCache.values()) tex.dispose()
      numTexCache.clear()
      ctx.foeFlash.value = 0
      ctx.liquid(null)
    },
  }
}

export type StageRuntime = ReturnType<typeof createStage>
