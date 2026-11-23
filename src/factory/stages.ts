import { mulberry32 } from './voxels'
import { B, D, H, W, at } from './world'

export type StageKind = 'parkour' | 'climb' | 'maze' | 'hunt' | 'horde' | 'rain' | 'balloon' | 'ramp' | 'freeze' | 'boss' | 'ships'
export type BossId =
  | 'pig' | 'golem' | 'glove' | 'tree' | 'top' | 'dragon' | 'snowman'
  | 'train' | 'ghost' | 'pinata' | 'robot' | 'disco' | 'clock' | 'keeper' | 'king'
export type CritterId = 'hamster' | 'ginger' | 'mimic'
export type CritterMode = 'wander' | 'chase' | 'mimic'
export type Weapon = 'sword' | 'snow' | 'ship'
type Vec3 = [number, number, number]

// Campo de las fases de naves: centro y medio ancho y alto
export const FIELD = { x: 48, y: 20, z: 48, hx: 9.5, hz: 15 }

export interface StageDef {
  day: number
  kind: StageKind
  boss: BossId | null
  // Nivel de las fases de naves, 0 en las demás
  ships: number
  // Especie de los bichos de la fase
  critter: { model: CritterId; mode: CritterMode; hex: number } | null
  // 0-3: sube con los días
  tier: number
  // 0-1: dificultad de la casilla, pensada para el nivel con el que se llega a ella
  level: number
  // Corazones que quita cada golpe enemigo
  bite: number
  critterHp: number
  title: string
  intro: string
  weapon: Weapon
  hearts: number
  blocks: Uint8Array
  spawn: { x: number; y: number; z: number; yaw: number }
  checkpoints: Vec3[]
  // Sitios donde se pisa, en orden, en las fases de plataformas
  route: Vec3[]
  // Chocolatinas doradas opcionales: cogerlas todas da la tercera estrella
  bonus: Vec3[]
  goal: Vec3 | null
  // Trampas del parkour: sopletes en los huecos y prensas sobre las plataformas
  traps: { kind: 'jet' | 'press'; x: number; y: number; z: number; w: number; d: number; h: number; phase: number }[]
  coins: Vec3[]
  critters: { x: number; y: number; z: number; range: number; delay?: number }[]
  arena: { x: number; y: number; z: number; r: number } | null
  rise: { from: number; speed: number } | null
  // Pasillo recto hacia -z: escalera de canicas o pista del directo
  lane: { x0: number; x1: number; z0: number; z1: number; y: number; step: number } | null
  time: number
  // Hora fija del cielo de la fase
  hour: number
  // Caja delimitadora de los bloques no vacíos (null si el escenario está vacío, p. ej. naves)
  bounds: [number, number, number, number, number, number] | null
}

interface Plan {
  kind: StageKind
  title: string
  intro: string
  weapon: Weapon
  hearts: number
  hour: number
  boss?: BossId
  ships?: number
  critter?: StageDef['critter']
  // Suelo A, suelo B y muro
  look?: [number, number, number]
}

// Una fase distinta detrás de cada puerta: ningún enemigo se repite
const PLAN: Plan[] = [
  {
    kind: 'parkour', title: 'Parkour de la fábrica', weapon: 'sword', hearts: 4, hour: 13,
    intro: 'Llega al regalo gigante sin caerte. Mide bien cuándo saltar: los sopletes queman y las prensas aplastan. Los bloques dorados guardan tu avance.',
  },
  {
    kind: 'boss', boss: 'pig', title: 'El Porcino de la Hucha', weapon: 'snow', hearts: 5, hour: 12,
    intro: 'Dispárale bolas de nieve. Si se estrella contra el muro, se queda mareado.',
    look: [B.SNOW, B.FLOOR_B, B.WOOD],
  },
  {
    kind: 'maze', title: 'El laberinto de los hámsters', weapon: 'sword', hearts: 4, hour: 22,
    intro: 'Recoge todas las monedas antes de que se acabe el tiempo. Los hámsters muerden.',
    critter: { model: 'hamster', mode: 'wander', hex: 0xc98a4b },
    look: [B.SNOW, B.SNOW, B.GREEN],
  },
  {
    kind: 'boss', boss: 'golem', title: 'La Tableta Suprema', weapon: 'sword', hearts: 5, hour: 17.6,
    intro: 'Salta sus ondas y dale con la espada cuando se quede sin fuerzas.',
    look: [B.CHOC, B.CHOC_LIGHT, B.CHOC],
  },
  {
    kind: 'climb', title: '¡Que sube el chocolate!', weapon: 'sword', hearts: 3, hour: 18.1,
    intro: 'Sube a lo más alto antes de que te alcance el chocolate caliente.',
  },
  {
    kind: 'boss', boss: 'glove', title: 'El Guante de la Velada', weapon: 'sword', hearts: 5, hour: 21,
    intro: 'Esquiva el puñetazo y contraataca con la espada mientras esté clavado en la lona.',
    look: [B.CREAM, B.VAT, B.RED],
  },
  {
    kind: 'horde', title: 'La rebelión de las galletas', weapon: 'sword', hearts: 5, hour: 16,
    intro: 'Las galletas de jengibre se han escapado del horno. Que no quede ni una.',
    critter: { model: 'ginger', mode: 'chase', hex: 0xb5733a },
    look: [B.CREAM, B.CHOC_LIGHT, B.WOOD],
  },
  {
    kind: 'ships', ships: 1, title: 'Escuadrón Polar', weapon: 'ship', hearts: 5, hour: 12,
    intro: 'Pilota la nave con el ratón, el dedo o WASD: dispara sola. Recoge las mejoras y guarda las bombas (clic derecho, Espacio o su botón) para los apuros.',
  },
  {
    kind: 'balloon', title: 'El Mundial de Globos', weapon: 'sword', hearts: 4, hour: 10,
    intro: 'Que el globo no toque el suelo: mira hacia arriba y dale 15 toques con la espada.',
    look: [B.CREAM, B.VAT, B.STEEL_LIGHT],
  },
  {
    kind: 'boss', boss: 'top', title: 'La Peonza Loca', weapon: 'sword', hearts: 5, hour: 15,
    intro: 'Rebota por toda la sala. Espera a que pierda fuelle y dale con la espada.',
    look: [B.WOOD, B.CREAM, B.RED],
  },
  {
    kind: 'rain', title: 'El Nubarrón de Carbón', weapon: 'sword', hearts: 4, hour: 19,
    intro: 'El nubarrón te persigue soltando carbón. Recoge todas las monedas sin quedarte debajo.',
    look: [B.SNOW, B.FLOOR_B, B.STEEL],
  },
  {
    kind: 'boss', boss: 'dragon', title: 'El Dragón Koi', weapon: 'snow', hearts: 5, hour: 23,
    intro: 'Derríbalo a bolazos. Cúbrete tras las columnas cuando escupa fuego.',
    look: [B.FLOOR_A, B.PURPLE, B.STEEL],
  },
  {
    kind: 'ramp', title: 'La carrera de canicas', weapon: 'sword', hearts: 4, hour: 8,
    intro: 'Sube la rampa a contracorriente. Las canicas no frenan: apártate de su carril.',
  },
  {
    kind: 'ships', ships: 2, title: 'Lluvia de carbón', weapon: 'ship', hearts: 5, hour: 12,
    intro: 'Rompe los pedruscos de carbón, no te arrimes a las minas y derriba a los bombarderos antes de que crucen.',
  },
  {
    kind: 'freeze', title: '¡Estamos en directo!', weapon: 'sword', hearts: 4, hour: 17,
    intro: 'Cruza el plató hasta el regalo. Cuando la cámara se ponga en rojo, ni pestañees.',
  },
  {
    kind: 'boss', boss: 'train', title: 'El Tren del Hype', weapon: 'snow', hearts: 5, hour: 14,
    intro: 'Dispárale mientras da vueltas. Cuando pite, sal de su vía: si descarrila, duele el doble.',
    look: [B.FLOOR_B, B.STEEL_LIGHT, B.STEEL_DARK],
  },
  {
    kind: 'boss', boss: 'keeper', title: 'Penalti presidente', weapon: 'snow', hearts: 5, hour: 21.5,
    intro: 'Métele 7 goles al portero. Chuta a donde no esté y salta los balones que te devuelve.',
    look: [B.CREAM, B.CREAM, B.STEEL_DARK],
  },
  {
    kind: 'ships', ships: 3, title: 'La flota fantasma', weapon: 'ship', hearts: 5, hour: 12,
    intro: 'Las naves fantasma solo reciben daño cuando se dejan ver. Si ves una línea roja, apártate: detrás viene el láser.',
  },
  {
    kind: 'hunt', title: 'El almacén de regalos', weapon: 'sword', hearts: 5, hour: 23.5,
    intro: 'Algunos regalos tienen dientes. Búscalos por el almacén y ábrelos a espadazos antes de que te muerdan.',
    critter: { model: 'mimic', mode: 'mimic', hex: 0xc8323c },
    look: [B.WOOD, B.CREAM, B.PURPLE],
  },
  {
    kind: 'boss', boss: 'pinata', title: 'La Piñata', weapon: 'snow', hearts: 5, hour: 11,
    intro: 'Se columpia soltando caramelos. No te quedes debajo y dispárale cuando baje.',
    look: [B.CREAM, B.RED, B.TEAL],
  },
  {
    kind: 'boss', boss: 'robot', title: 'El Robot Empaquetador', weapon: 'sword', hearts: 5, hour: 6.5,
    intro: 'Su imán te arrastra: corre hacia fuera, salta la onda y dale cuando se recaliente.',
    look: [B.STEEL, B.STEEL_LIGHT, B.STEEL_DARK],
  },
  {
    kind: 'ships', ships: 4, title: 'La Nodriza Carbonera', weapon: 'ship', hearts: 5, hour: 12,
    intro: 'La nave insignia del Rey Carbón. Ábrete paso entre su escolta, vuela sus dos cañones y dispara al núcleo.',
  },
  {
    kind: 'boss', boss: 'clock', title: 'El Reloj de las Campanadas', weapon: 'sword', hearts: 5, hour: 23.9,
    intro: 'No se le puede pegar: cómete las 12 uvas saltando las agujas. Cada uva es una campanada.',
    look: [B.CREAM, B.WOOD, B.GOLD],
  },
  {
    kind: 'boss', boss: 'king', title: 'El Rey Carbón', weapon: 'snow', hearts: 6, hour: 4,
    intro: 'El jefe final. Cada tercio de vida aprende trucos nuevos: dispara sin parar y no dejes de moverte.',
    look: [B.STEEL_DARK, B.FLOOR_A, B.RED],
  },
]

export function buildStage(day: number): StageDef {
  const plan = PLAN[day - 1]
  const { kind } = plan
  const tier = Math.floor((day - 1) / 6)
  const level = (day - 1) / (PLAN.length - 1)
  const bite = day >= 17 ? 2 : 1
  const rand = mulberry32(day * 7919)
  const blocks = new Uint8Array(W * H * D)
  let minX = W, minY = H, minZ = D
  let maxX = -1, maxY = -1, maxZ = -1
  const set = (x: number, y: number, z: number, t: number) => {
    if (x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D) {
      blocks[at(x, y, z)] = t
      if (t !== B.AIR) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
        if (z < minZ) minZ = z
        if (z > maxZ) maxZ = z
      }
    }
  }
  const fill = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, t: number) => {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, y, z, t)
  }
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)]

  const def: StageDef = {
    day,
    kind,
    boss: plan.boss ?? null,
    ships: plan.ships ?? 0,
    critter: plan.critter ?? null,
    tier,
    level,
    bite,
    critterHp: day >= 13 ? 2 : 1,
    title: plan.title,
    intro: bite > 1 ? `${plan.intro} Aquí cada golpe quita ${bite} corazones.` : plan.intro,
    weapon: plan.weapon,
    hearts: plan.hearts,
    blocks,
    spawn: { x: 48.5, y: 8, z: 48.5, yaw: 0 },
    checkpoints: [],
    route: [],
    bonus: [],
    goal: null,
    traps: [],
    coins: [],
    critters: [],
    arena: null,
    rise: null,
    lane: null,
    time: 0,
    hour: plan.hour,
    bounds: null,
  }

  if (kind === 'ships') def.spawn = { x: FIELD.x, y: FIELD.y, z: FIELD.z + FIELD.hz - 4, yaw: 0 }

  if (kind === 'parkour') {
    const themes = [
      [B.FLOOR_B, B.STEEL_LIGHT],
      [B.CHOC, B.CHOC_LIGHT],
      [B.SNOW, B.VAT],
      [B.PURPLE, B.TEAL],
    ]
    const [blockA, blockB] = themes[tier]
    let x = 12
    let y = 12
    let z = 14
    let dir = 1
    let lateral = 0
    // Cuánto sobresale la última plataforma en el sentido en que se construyó y de lado
    let built = { along: 2, across: 2, alongX: true }
    fill(x - 2, y, z - 2, x + 2, y, z + 2, B.CREAM)
    def.spawn = { x: x + 0.5, y: y + 1, z: z + 0.5, yaw: -Math.PI / 2 }
    def.checkpoints.push([x + 0.5, y + 1, z + 0.5])
    const total = 14 + tier * 5
    for (let i = 1; i <= total; i++) {
      // Serpentea por filas para no salirse del mundo ni cruzarse consigo mismo
      if (!lateral && (x + dir * 12 > 88 || x + dir * 12 < 8)) {
        lateral = 2
        dir = -dir
      }
      const dx = lateral ? 0 : dir
      const dz = lateral ? 1 : 0
      if (lateral) lateral--
      const last = i === total
      // El borde desde el que se salta depende de si se sigue recto o se gira
      const reach = (dx !== 0) === built.alongX ? built.along : built.across
      // Arriba del todo ya no hay camas elásticas: no queda altura para la siguiente plataforma
      const special = last ? '' : i % 5 === 3 && y <= 18 ? 'bounce' : i % 5 === 1 && tier > 0 ? 'belt' : ''
      const golden = !last && i % 6 === 0
      const shape = rand()
      let gap = 1 + Math.floor(rand() * (tier > 1 ? 3 : 2))
      // Tras una cama elástica o un salto largo se aterriza siempre en una plataforma amplia
      const roomy = golden || last || special === 'bounce' || gap === 3
      const single = tier > 1 && shape > 0.75 && !roomy
      const beam = !single && !roomy && shape > 0.45 + (tier > 1 ? 0 : 0.25)
      const half = last ? 2 : special === 'belt' ? 3 : single ? 0 : 1
      const wide = special === 'belt' || beam ? 0 : half
      let rise = pick([-1, 0, 0, 1])
      // Los saltos de tres bloques piden carrerilla: nunca hacia arriba ni contra una cinta
      if (rise > 0 || special === 'belt') gap = Math.min(gap, 2)
      if (y + rise < 6 || y + rise > 24) rise = 0
      if (special === 'bounce') {
        // Cama elástica en el borde: la siguiente plataforma queda cinco bloques más arriba
        set(x + dx * reach, y, z + dz * reach, B.BOUNCE)
        def.route.push([x + dx * reach + 0.5, y + 1, z + dz * reach + 0.5])
        rise = 5
      }
      x += dx * (reach + gap + half + 1)
      z += dz * (reach + gap + half + 1)
      y += rise
      built = { along: half, across: wide, alongX: dx !== 0 }
      def.route.push([x + 0.5, y + 1, z + 0.5])
      if ([0.25, 0.5, 0.75].some((part) => i === Math.round(total * part))) def.bonus.push([x + 0.5, y + 3.7, z + 0.5])
      if (last || i % 5 === 2 || (i % 5 === 1 && i > 1 && !special)) {
        // Soplete en mitad del hueco: se cruza cuando se apaga
        const back = half + (gap + 1) / 2
        def.traps.push({
          kind: 'jet', x: x + 0.5 - dx * back, y: Math.min(y, y - rise) + 0.5, z: z + 0.5 - dz * back,
          w: dx ? 0.7 : 3, d: dx ? 3 : 0.7, h: Math.abs(rise) + 5, phase: i * 0.8,
        })
      } else if (!golden && !special && i % 5 === 4) {
        // Prensa que cubre la plataforma entera, nunca junto a un soplete
        def.traps.push({
          kind: 'press', x: x + 0.5, y: y + 1, z: z + 0.5,
          w: (dx ? half : wide) * 2 + 1, d: (dz ? half : wide) * 2 + 1, h: 0, phase: i * 0.8,
        })
      }
      if (special === 'belt') {
        // Una cinta larga y estrecha que empuja hacia atrás
        const belt = dx > 0 ? B.BELT_XN : dx < 0 ? B.BELT_XP : B.BELT_ZN
        for (let n = -3; n <= 3; n++) set(x + dx * n, y, z + dz * n, belt)
        continue
      }
      // Plataforma cuadrada, o una viga estrecha en el sentido de la marcha
      const block = last ? B.CREAM : golden ? B.GOLD : i % 2 ? blockA : blockB
      fill(x - (dx ? half : wide), y, z - (dz ? half : wide), x + (dx ? half : wide), y, z + (dz ? half : wide), block)
      if (last) {
        fill(x, y, z - 2, x, y, z + 2, B.RED)
        fill(x - 2, y, z, x + 2, y, z, B.RED)
        def.goal = [x + 0.5, y + 2.2, z + 0.5]
      } else if (golden) {
        set(x, y, z, B.GLOW)
        def.checkpoints.push([x + 0.5, y + 1, z + 0.5])
      }
    }
  }

  if (kind === 'climb') {
    fill(38, 2, 38, 58, 3, 58, B.STEEL_DARK)
    let angle = 0
    let y = 4
    const steps: [number, number, number, number][] = []
    def.spawn = { x: 48.5, y: 4, z: 53.5, yaw: 0 }
    while (y < 33) {
      angle += 0.55 + rand() * 0.25
      // Los últimos escalones se arriman a la columna para que el salto final sea limpio
      const r = Math.min(3.6 + rand() * 1.8, 2.6 + Math.max(0, 32 - y) * 0.7)
      const bouncy = y > 6 && y < 26 && rand() < 0.16
      const belt = !bouncy && tier > 1 && rand() < 0.2
      const block = bouncy ? B.BOUNCE : belt ? pick([B.BELT_XP, B.BELT_ZN]) : y % 2 ? B.VAT : B.STEEL_LIGHT
      steps.push([Math.round(48 + Math.cos(angle) * r), y, Math.round(48 + Math.sin(angle) * r), block])
      y += bouncy ? 5 : 1
    }
    // La columna termina donde acaba la escalera: la meta está en su cima
    fill(47, 4, 47, 49, y - 1, 49, B.CHOC)
    for (let band = 6; band < y - 1; band += 4) fill(47, band, 47, 49, band, 49, B.CHOC_LIGHT)
    // Se empieza justo delante del primer escalón, por el lado de fuera
    const [sx, , sz] = steps[0]
    const out = Math.hypot(sx + 1 - 48.5, sz + 1 - 48.5)
    def.spawn = {
      x: sx + 1 + ((sx + 1 - 48.5) / out) * 2.6,
      y: 4,
      z: sz + 1 + ((sz + 1 - 48.5) / out) * 2.6,
      yaw: Math.atan2(sx + 1 - 48.5, sz + 1 - 48.5),
    }
    for (const [px, py, pz, block] of steps) {
      fill(px, py, pz, px + 1, py, pz + 1, block)
      def.route.push([px + 1, py + 1, pz + 1])
    }
    def.route.push([48.5, y + 1, 48.5])
    // Tres chocolatinas doradas repartidas por la subida, nunca sobre una cama elástica
    for (const part of [0.25, 0.5, 0.75]) {
      const step = steps.slice(Math.round(steps.length * part)).find((item) => item[3] !== B.BOUNCE)
      if (step) def.bonus.push([step[0] + 1, step[1] + 3.7, step[2] + 1])
    }
    fill(47, y, 47, 49, y, 49, B.CREAM)
    fill(48, y, 47, 48, y, 49, B.RED)
    fill(47, y, 48, 49, y, 48, B.RED)
    def.goal = [48.5, y + 2.4, 48.5]
    def.rise = { from: 2.5, speed: 0.34 * (1 + level * 0.5) }
  }

  if (kind === 'maze' || kind === 'hunt') {
    const n = kind === 'hunt' ? 8 : 7
    const size = n * 4 + 1
    const o = 48 - Math.floor(size / 2)
    const [, ground, hedge] = plan.look!
    fill(o - 1, 6, o - 1, o + size, 7, o + size, ground)
    fill(o, 8, o, o + size - 1, 10, o + size - 1, hedge)
    const seen = new Uint8Array(n * n)
    const carve = (cx: number, cz: number) => fill(o + cx * 4 + 1, 8, o + cz * 4 + 1, o + cx * 4 + 3, 10, o + cz * 4 + 3, B.AIR)
    const open = (cx: number, cz: number, ox: number, oz: number) => {
      const x = o + cx * 4 + 2 + ox * 2
      const z = o + cz * 4 + 2 + oz * 2
      fill(x - (ox ? 0 : 1), 8, z - (oz ? 0 : 1), x + (ox ? 0 : 1), 10, z + (oz ? 0 : 1), B.AIR)
    }
    const stack: [number, number][] = [[0, 0]]
    seen[0] = 1
    carve(0, 0)
    while (stack.length) {
      const [cx, cz] = stack[stack.length - 1]
      const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(
        ([ox, oz]) => cx + ox >= 0 && cz + oz >= 0 && cx + ox < n && cz + oz < n && !seen[cx + ox + (cz + oz) * n]
      )
      if (!next.length) {
        stack.pop()
        continue
      }
      const [ox, oz] = pick(next)
      open(cx, cz, ox, oz)
      carve(cx + ox, cz + oz)
      seen[cx + ox + (cz + oz) * n] = 1
      stack.push([cx + ox, cz + oz])
    }
    // Algunos atajos para que no haya un único camino
    for (let i = 0; i < n * 2; i++) open(Math.floor(rand() * (n - 1)), Math.floor(rand() * (n - 1)), rand() < 0.5 ? 1 : 0, 0)
    for (let i = 0; i < n; i++) open(Math.floor(rand() * (n - 1)), Math.floor(rand() * (n - 1)), 0, 1)
    const cells = Array.from({ length: n * n - 1 }, (_, i) => i + 1).sort(() => rand() - 0.5)
    const center = (cell: number): Vec3 => [o + (cell % n) * 4 + 2.5, 8.6, o + Math.floor(cell / n) * 4 + 2.5]
    if (kind === 'maze') for (const cell of cells.slice(0, 6)) def.coins.push(center(cell))
    for (const cell of cells.slice(-(kind === 'hunt' ? 10 : 3) - Math.round(level * 4))) {
      const [x, , z] = center(cell)
      def.critters.push({ x, y: 8, z, range: 0 })
    }
    for (let i = 0; i < n; i += 2) set(o + i * 4 + 2, 11, o, B.GLOW), set(o + i * 4 + 2, 11, o + size - 1, B.GLOW)
    def.spawn = { x: o + 2.5, y: 8, z: o + 2.5, yaw: Math.PI }
    if (kind === 'maze') def.time = 95
  }

  if (kind === 'ramp' || kind === 'freeze') {
    // Un pasillo largo: se empieza en z alto y la meta está al fondo
    const stairs = kind === 'ramp'
    const lane = { x0: stairs ? 44 : 43, x1: stairs ? 52 : 53, z0: 82, z1: 16, y: 7, step: stairs ? 3 : 0 }
    const top = (z: number) => lane.y + (stairs ? Math.max(0, Math.floor((80 - z) / 3)) : 0)
    for (let z = lane.z1 - 6; z <= lane.z0 + 2; z++) {
      const y = top(Math.max(z, lane.z1))
      const band = stairs ? Math.floor((80 - z) / 3) % 2 : (z >> 2) % 2
      fill(lane.x0, y - 1, z, lane.x1, y, z, stairs ? (band ? B.WOOD : B.CREAM) : band ? B.FLOOR_A : B.FLOOR_B)
      for (const x of [lane.x0 - 1, lane.x1 + 1]) fill(x, y - 1, z, x, y + 1, z, stairs ? B.RED : B.STEEL_DARK)
      if (z % 8 === 0) for (const x of [lane.x0 - 1, lane.x1 + 1]) set(x, y + 2, z, B.GLOW)
    }
    if (!stairs) {
      // Cintas que te mueven aunque te quedes quieto
      for (const z0 of [58, 36]) fill(lane.x0, lane.y, z0, lane.x1, lane.y, z0 + 3, B.BELT_ZP)
    }
    const end = top(lane.z1)
    fill(lane.x0, end, lane.z1 - 4, lane.x1, end, lane.z1 - 4, B.RED)
    def.lane = lane
    def.spawn = { x: 48.5, y: lane.y + 1, z: 80.5, yaw: 0 }
    def.goal = [48.5, end + 2.2, lane.z1 - 3.5]
    for (const part of [0.25, 0.5, 0.75]) {
      const z = Math.round(80 - (80 - lane.z1) * part)
      const x = lane.x0 + 1 + Math.floor(rand() * (lane.x1 - lane.x0 - 1))
      def.bonus.push([x + 0.5, top(z) + 2.6, z + 0.5])
      if (stairs) {
        fill(lane.x0, top(z), z, lane.x1, top(z), z, B.GOLD)
        def.checkpoints.push([48.5, top(z) + 1, z + 0.5])
      }
    }
    if (stairs) def.checkpoints.unshift([def.spawn.x, def.spawn.y, def.spawn.z])
  }

  if (kind === 'boss' || kind === 'horde' || kind === 'rain' || kind === 'balloon') {
    const boss = plan.boss
    const r = boss === 'pig' ? 17 : 15
    const square = boss === 'glove'
    const [floorA, floorB, wall] = plan.look!
    for (let z = 48 - r - 2; z <= 48 + r + 2; z++) {
      for (let x = 48 - r - 2; x <= 48 + r + 2; x++) {
        const d = square ? Math.max(Math.abs(x - 47.5), Math.abs(z - 47.5)) : Math.hypot(x - 47.5, z - 47.5)
        if (d > r + 1.5) continue
        const rim = d > r
        // Cada sala tiene su dibujo en el suelo: damero, anillos o gajos
        const tile =
          boss === 'top' || boss === 'disco' || boss === 'clock'
            ? Math.floor(d / 3) % 2
            : boss === 'train' || boss === 'pinata' || kind === 'rain' || kind === 'balloon'
              ? Math.floor((Math.atan2(z - 47.5, x - 47.5) / Math.PI + 1) * 6) % 2
              : boss === 'keeper'
                ? (z >> 2) % 2
                : ((x >> 2) + (z >> 2)) % 2
        fill(x, 5, z, x, 7, z, rim ? wall : boss === 'keeper' && z % 8 ? B.GREEN : tile ? floorA : floorB)
        if (rim) fill(x, 8, z, x, square ? 8 : 10, z, wall)
        if (rim && (x + z) % 6 === 0) set(x, square ? 9 : 11, z, wall === B.TEAL || boss === 'dragon' ? B.TEAL : B.GLOW)
      }
    }
    if (square) {
      // Cuerdas del ring
      for (const c of [48 - r - 1, 48 + r]) {
        for (const e of [48 - r - 1, 48 + r]) fill(c, 8, e, c, 11, e, B.STEEL_LIGHT)
      }
      for (let i = 48 - r; i < 48 + r; i += 2) {
        for (const c of [48 - r - 1, 48 + r]) set(i, 10, c, B.RED), set(c, 10, i, B.RED)
      }
    }
    if (boss === 'keeper') {
      // La portería, al fondo
      for (const x of [42, 54]) fill(x, 8, 35, x, 12, 35, B.CREAM)
      fill(42, 12, 35, 54, 12, 35, B.CREAM)
      fill(42, 12, 33, 54, 12, 34, B.STEEL_LIGHT)
      fill(43, 7, 35, 53, 7, 35, B.CREAM)
    }
    // Columnas para cubrirse del fuego del dragón
    if (boss === 'dragon') {
      for (const [ox, oz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) fill(47 + ox, 8, 47 + oz, 48 + ox, 12, 48 + oz, wall)
    }
    def.arena = { x: 48, y: 8, z: 48, r: r - 0.5 }
    def.spawn = { x: 48, y: 8, z: 48 + r - 4, yaw: 0 }
    const spot = (min: number, max: number): [number, number] => {
      const a = rand() * Math.PI * 2
      const d = min + rand() * (max - min)
      return [48 + Math.cos(a) * d, 48 + Math.sin(a) * d]
    }
    if (kind === 'horde') {
      // Tres hornadas de galletas que salen del borde
      for (let wave = 0; wave < 3; wave++) {
        for (let i = 0; i < 5 + wave + Math.round(level * 4); i++) {
          const [x, z] = spot(r - 3, r - 2)
          def.critters.push({ x, y: 8, z, range: 0, delay: 2 + wave * 13 + i * 0.5 })
        }
      }
    }
    if (kind === 'rain') {
      for (let i = 0; i < 14; i++) {
        const [x, z] = spot(3, r - 3)
        def.coins.push([x, 8.6, z])
      }
      def.time = 80
    }
  }

  def.bounds = maxX >= 0 ? [minX, minY, minZ, maxX, maxY, maxZ] : null
  return def
}
