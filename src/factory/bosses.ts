import { Mesh, Vector3 } from 'three'
import type { Models, StageCtx } from './actors'
import type { BossId, StageDef } from './stages'

export interface BossState {
  x: number
  y: number
  z: number
  a: number
  hp: number
  max: number
  state: string
  t: number
  cycle: number
  vx: number
  vz: number
  flash: number
  hop: number
  dying: number
  count: number
  weak: boolean
  // Ni la espada ni la nieve le hacen nada
  immune: boolean
}

export interface Target {
  x: number
  y: number
  z: number
  r: number
  hit: (how: 'sword' | 'snow', power?: number) => void
}

export interface BossKit {
  ctx: StageCtx
  def: StageDef
  models: Models
  arena: { x: number; y: number; z: number; r: number }
  boss: BossState
  mesh: Mesh
  target: Target
  // Añade algo más a lo que se le puede dar
  aim: (target: Target) => void
  now: () => number
  add: <T extends Mesh>(mesh: T) => T
  damage: (amount: number, big?: boolean) => void
  fire: (
    x: number, y: number, z: number, vx: number, vy: number, vz: number,
    foe: boolean, grav: number, hex: number, size?: number, blast?: number
  ) => void
  shock: (x: number, y: number, z: number, speed: number, max: number, hex: number) => void
  warn: (x: number, z: number, life: number, size: number, slot?: number) => void
  // Baldosa que estalla al cabo de un rato
  zap: (x: number, z: number, size: number, delay: number, hex: number) => void
  // Barra a ras de suelo que sale del jefe: hay que saltarla
  beam: (slot: number, angle: number, length: number, hex: number) => void
  touch: (r: number, top: number, harmless?: boolean, ox?: number, oz?: number) => void
  stayInside: (margin: number) => boolean
}

// Vida, color de las chispas y lo que dice al empezar, al ir perdiendo y al caer
export const BOSSES: Record<BossId, { hp: number; hex: number; lines: [string, string, string] }> = {
  pig: { hp: 110, hex: 0xf2a0b5, lines: ['¡Oink! De esta hucha no sale ni un euro', '¡Que me rompes la hucha!', 'La hucha, reventada'] },
  golem: { hp: 12, hex: 0x7a4428, lines: ['Soy 99 % cacao y 100 % mala leche', '¡Me estás derritiendo!', 'Tableta hecha onzas'] },
  glove: { hp: 14, hex: 0xc8323c, lines: ['¡Tres asaltos y a dormir!', '¡Esto no estaba en el contrato!', 'K. O. técnico en la Velada'] },
  tree: { hp: 100, hex: 0x239150, lines: ['¿Quién me ha colgado estas bolas?', '¡Se me caen las agujas!', 'Abeto talado'] },
  top: { hp: 15, hex: 0x21c7b0, lines: ['¡A que no me pillas!', '¡Uy, que me mareo!', 'La peonza ya no baila'] },
  dragon: { hp: 80, hex: 0x8a55e0, lines: ['Nadie toca el estanque del KOI', '¡Ahora sí que te vas a enterar!', 'El dragón vuelve al estanque'] },
  snowman: { hp: 16, hex: 0xffffff, lines: ['¿Tienes frío? Yo no', '¡Que me deshago!', 'Solo queda un charco'] },
  train: { hp: 115, hex: 0xc8323c, lines: ['¡Chu, chu! Que sube el hype', '¡Más carbón a la caldera!', 'Fin de trayecto'] },
  ghost: { hp: 16, hex: 0xf2f6ff, lines: ['Buuu… F en el chat', '¡Baneadme si podéis!', 'Fantasma baneado del chat'] },
  pinata: { hp: 95, hex: 0xe0489a, lines: ['¡A ver si me das!', '¡Que se me salen los caramelos!', 'Caramelos para todo el chat'] },
  robot: { hp: 18, hex: 0x8fa3b8, lines: ['Paquete detectado: tú', 'Error 404: paciencia no encontrada', 'Robot devuelto a fábrica'] },
  disco: { hp: 105, hex: 0xcfd8e8, lines: ['¡Que no pare la fiesta!', '¡Subid la música!', 'Se acabó la fiesta'] },
  clock: { hp: 12, hex: 0xf8b132, lines: ['Tic, tac… ¿ya tienes las uvas?', '¡Que no llegas a las doce!', '¡Feliz año nuevo!'] },
  keeper: { hp: 7, hex: 0xf8d02a, lines: ['Por aquí no pasa ni el aire', '¡Árbitro, eso es falta!', 'Goleada histórica'] },
  king: { hp: 180, hex: 0xff8a2a, lines: ['Este año, carbón para todos', '', 'La Navidad está salvada'] },
}

const BAUBLES = [0xc8323c, 0xf8b132, 0x21c7b0]
const CANDY = [0xe0489a, 0xf8b132, 0x21c7b0, 0x8a55e0]
const COAL = 0x2a2a33
const TAU = Math.PI * 2

export function createBoss(kit: BossKit): (dt: number) => void {
  const { ctx, def, arena, boss, mesh, target, now, fire, shock, warn, zap, beam, touch, stayInside } = kit
  const { pos } = ctx.player
  const { tier } = def
  const p = new Vector3()
  const enter = (state: string, t: number) => {
    boss.state = state
    boss.t = t
  }
  const toPlayer = () => Math.atan2(pos.x - boss.x, pos.z - boss.z)
  const reach = () => Math.hypot(pos.x - boss.x, pos.z - boss.z)
  // Los jefes de las últimas casillas van más deprisa desde el principio
  const pace = 1 + def.level * 0.25
  const angry = () => boss.hp < boss.max / 2
  const rage = () => (angry() ? 1.3 : 1) * pace
  const walk = (speed: number, keep: number, dt: number) => {
    boss.a = toPlayer()
    if (reach() <= keep) return
    boss.x += Math.sin(boss.a) * speed * dt
    boss.z += Math.cos(boss.a) * speed * dt
  }
  // Un punto dentro de la sala
  const inside = (x: number, z: number, margin: number): [number, number] => {
    const d = Math.hypot(x - arena.x, z - arena.z)
    const max = arena.r - margin
    return d <= max ? [x, z] : [arena.x + ((x - arena.x) / d) * max, arena.z + ((z - arena.z) / d) * max]
  }
  const anywhere = (margin: number): [number, number] => {
    const a = Math.random() * TAU
    const d = Math.sqrt(Math.random()) * (arena.r - margin)
    return [arena.x + Math.cos(a) * d, arena.z + Math.sin(a) * d]
  }
  // Lanza algo en parábola que revienta al caer, con su aviso en el suelo
  const lob = (tx: number, tz: number, air: number, hex: number, from = 5, blast = 2.3) => {
    const y = boss.y + from
    fire(boss.x, y, boss.z, (tx - boss.x) / air, (arena.y - y + 9 * air * air) / air, (tz - boss.z) / air, true, 18, hex, 2.2, blast)
    warn(tx, tz, air, blast)
  }
  const lobNear = (spread: number, air: number, hex: number, from = 5) => {
    const [tx, tz] = inside(pos.x + (Math.random() - 0.5) * spread, pos.z + (Math.random() - 0.5) * spread, 1)
    lob(tx, tz, air, hex, from)
  }
  // Bolas que ruedan a ras de suelo
  const roll = (a: number, speed: number, hex: number, size: number, from = 2.4) => {
    fire(boss.x + Math.sin(a) * from, arena.y + 0.7, boss.z + Math.cos(a) * from, Math.sin(a) * speed, 0, Math.cos(a) * speed, true, 0, hex, size)
  }
  const circle = (n: number, offset: number, speed: number, hex: number, size: number) => {
    for (let i = 0; i < n; i++) roll(offset + (i / n) * TAU, speed, hex, size)
  }
  const ringAround = (x: number, z: number, r: number, n: number, delay: number, hex: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU
      zap(...inside(x + Math.cos(a) * r, z + Math.sin(a) * r, 0.5), 2, delay, hex)
    }
  }

  const pig = (dt: number) => {
    boss.weak = boss.state === 'stun'
    if (boss.state === 'walk') {
      walk(2.2 * rage(), 4, dt)
      if (boss.t <= 0) boss.cycle++ % 2 ? enter('aim', 0.9) : ((boss.count = 2), enter('spit', 0.5))
    } else if (boss.state === 'spit') {
      boss.a = toPlayer()
      if (boss.t <= 0) {
        for (let i = 0; i < 3; i++) {
          const a = boss.a + (i - 1) * 0.22
          fire(boss.x + Math.sin(boss.a) * 3.6, boss.y + 2, boss.z + Math.cos(boss.a) * 3.6, Math.sin(a) * 12, 2.5, Math.cos(a) * 12, true, 6, 0x7a4428, 1.3)
        }
        ctx.sound('shoot')
        --boss.count > 0 ? enter('spit', 0.7) : enter('walk', 2.4 / rage())
      }
    } else if (boss.state === 'aim') {
      boss.a = toPlayer() + Math.sin(now() * 40) * 0.08
      if (boss.t <= 0) {
        boss.vx = Math.sin(boss.a)
        boss.vz = Math.cos(boss.a)
        ctx.sound('roar')
        enter('charge', 2.2)
      }
    } else if (boss.state === 'charge') {
      boss.x += boss.vx * 15 * rage() * dt
      boss.z += boss.vz * 15 * rage() * dt
      if (stayInside(2.8)) {
        ctx.shake(0.6)
        ctx.sound('slam')
        ctx.say('¡Se ha mareado! Aprovecha')
        enter('stun', 2.8)
      } else if (boss.t <= 0) enter('walk', 1.6)
    } else if (boss.t <= 0) enter('walk', 2 / rage())
    stayInside(2.8)
    touch(3, 3.6)
    mesh.rotation.set(0, boss.a + (boss.weak ? Math.sin(now() * 6) * 0.5 : 0), boss.weak ? Math.sin(now() * 5) * 0.12 : 0)
    mesh.scale.setScalar(1.1)
    mesh.position.set(boss.x, boss.y + (boss.state === 'walk' ? Math.abs(Math.sin(now() * 6)) * 0.25 : 0), boss.z)
    Object.assign(target, { x: boss.x, y: boss.y + 2, z: boss.z, r: 2.8 })
  }

  const golem = (dt: number) => {
    boss.weak = boss.state === 'tired'
    let lift = 0
    let squash = 1
    if (boss.state === 'walk') {
      walk(1.7 * rage(), 3.5, dt)
      if (boss.t <= 0) boss.cycle++ % 2 ? ((boss.count = 3), enter('throw', 0.5)) : enter('windup', 0.8)
    } else if (boss.state === 'windup') {
      lift = (1 - boss.t / 0.8) * 2.2
      if (boss.t <= 0) {
        shock(boss.x, arena.y, boss.z, 8, arena.r + 3, 0xf2e6c9)
        ctx.shake(0.7)
        ctx.sound('slam')
        enter('slam', 0.55)
      }
    } else if (boss.state === 'slam') {
      squash = 0.8
      if (boss.t <= 0) {
        ctx.say('¡Está agotada! Dale con la espada')
        enter('tired', 3)
      }
    } else if (boss.state === 'throw') {
      boss.a = toPlayer()
      if (boss.t <= 0) {
        lobNear(4, 1.3, 0x5a2d1a)
        ctx.sound('shoot')
        --boss.count > 0 ? enter('throw', 0.4) : enter('walk', 2.2 / rage())
      }
    } else if (boss.state === 'tired') {
      squash = 0.72
      // Al recuperarse avisa: un momento para apartarse antes de que vuelva a hacer daño
      if (boss.t <= 0) enter('rise', 0.9)
    } else {
      squash = 0.72 + (1 - boss.t / 0.9) * 0.28
      if (boss.t <= 0) enter('walk', 2.2 / rage())
    }
    touch(2.7, 6, boss.state === 'rise')
    mesh.rotation.y = boss.a
    mesh.scale.set(1.15, 1.15 * squash, 1.15)
    mesh.position.set(boss.x, boss.y + lift, boss.z)
    Object.assign(target, { x: boss.x, y: boss.y + 2.6 * squash + lift, z: boss.z, r: 2.5 })
  }

  const glove = (dt: number) => {
    const hover = arena.y + 7
    boss.weak = boss.state === 'stuck'
    let tilt = 0
    if (boss.state === 'track') {
      const d = reach()
      const speed = Math.min(d / dt, 7.5)
      if (d > 0.05) {
        boss.x += ((pos.x - boss.x) / d) * speed * dt
        boss.z += ((pos.z - boss.z) / d) * speed * dt
      }
      boss.y += (hover - boss.y) * Math.min(1, dt * 6)
      warn(boss.x, boss.z, 0.2, 2.4, 0)
      if (boss.t <= 0) enter('warn', 0.38)
    } else if (boss.state === 'warn') {
      boss.y = hover + Math.sin(now() * 50) * 0.15
      warn(boss.x, boss.z, 0.2, 2.6, 0)
      if (boss.t <= 0) enter('drop', 1)
    } else if (boss.state === 'drop') {
      boss.y -= 34 * dt
      if (boss.y <= arena.y) {
        boss.y = arena.y
        ctx.shake(0.7)
        ctx.sound('slam')
        ctx.burst(boss.x - 0.5, arena.y, boss.z - 0.5, 0xf2e6c9, 16)
        if (reach() < 2.5 && pos.y < arena.y + 1.5) ctx.hurt(pos.x - boss.x, pos.z - boss.z)
        enter('stuck', 2.3)
      }
    } else if (boss.state === 'stuck') {
      if (boss.t <= 0) {
        if (boss.cycle++ % 3 === 2) {
          // Gancho: cruza el ring a la altura del jugador; hay que apartarse de su carril
          boss.vx = boss.cycle % 2 ? 1 : -1
          boss.vz = Math.max(arena.z - arena.r + 2, Math.min(arena.z + arena.r - 2, pos.z))
          ctx.say('¡Que viene el gancho!')
          ctx.sound('roar')
          enter('wind', 1.1)
        } else enter('track', 2 / rage())
      }
    } else if (boss.state === 'wind') {
      const k = Math.min(1, dt * 7)
      boss.x += (arena.x - boss.vx * (arena.r + 1) - boss.x) * k
      boss.z += (boss.vz - boss.z) * k
      boss.y += (arena.y + 0.4 - boss.y) * k
      tilt = -boss.vx * (Math.PI / 2)
      for (let i = 1; i < 5; i++) warn(arena.x - arena.r + (i * arena.r * 2) / 5, boss.vz, 0.2, 2, i)
      if (boss.t <= 0) enter('hook', 3)
    } else if (boss.state === 'hook') {
      tilt = -boss.vx * (Math.PI / 2)
      boss.x += boss.vx * 21 * dt
      touch(2.3, 3)
      if (Math.abs(boss.x - arena.x) > arena.r + 1 && Math.sign(boss.x - arena.x) === boss.vx) enter('track', 2 / rage())
    }
    if (boss.weak) touch(2.2, 3)
    mesh.rotation.set(0, 0, tilt)
    mesh.scale.setScalar(1)
    mesh.position.set(boss.x, boss.y + (tilt ? 1.6 : 0), boss.z)
    Object.assign(target, { x: boss.x, y: boss.y + 1.4, z: boss.z, r: 2.2 })
  }

  const dragon = (dt: number) => {
    boss.weak = boss.state === 'tired'
    let pitch = 0
    if (boss.state === 'circle') {
      boss.cycle += dt * 0.63 * rage()
      const tx = arena.x + Math.cos(boss.cycle) * 12
      const tz = arena.z + Math.sin(boss.cycle) * 12
      const k = Math.min(1, dt * 3)
      boss.a = Math.atan2(tx - boss.x, tz - boss.z)
      boss.x += (tx - boss.x) * k
      boss.z += (tz - boss.z) * k
      boss.y += (arena.y + 8.5 + Math.sin(now() * 1.3) - boss.y) * k
      boss.vx -= dt
      if (boss.vx <= 0) {
        boss.vx = 2.35 / rage()
        p.set(pos.x - boss.x, pos.y + 0.6 - boss.y, pos.z - boss.z).normalize()
        fire(boss.x, boss.y + 0.5, boss.z, p.x * 14, p.y * 14, p.z * 14, true, 0, 0xff8a2a, 1.6, 1.7)
        ctx.sound('shoot')
      }
      if (boss.t <= 0) {
        ctx.say('¡Que viene en picado!')
        ctx.sound('roar')
        enter('roar', 0.8)
      }
    } else if (boss.state === 'roar') {
      boss.a = toPlayer()
      if (boss.t <= 0) {
        const d = reach() || 1
        boss.vx = (pos.x - boss.x) / d
        boss.vz = (pos.z - boss.z) / d
        enter('swoop', 1.9)
      }
    } else if (boss.state === 'swoop') {
      boss.x += boss.vx * 17 * dt
      boss.z += boss.vz * 17 * dt
      boss.y += (arena.y + 1.2 - boss.y) * Math.min(1, dt * 5)
      pitch = 0.25
      touch(2.6, 2.4)
      if (boss.t <= 0 || Math.hypot(boss.x - arena.x, boss.z - arena.z) > arena.r + 6) enter('land', 1.2)
    } else if (boss.state === 'land') {
      const k = Math.min(1, dt * 3.5)
      boss.x += (arena.x - boss.x) * k
      boss.z += (arena.z - boss.z) * k
      boss.y += (arena.y - boss.y) * k
      boss.a = toPlayer()
      if (boss.t <= 0) {
        ctx.say('¡Ha aterrizado! Dale ahora')
        enter('tired', 3.1)
      }
    } else if (boss.t <= 0) enter('circle', 8)
    if (boss.weak) touch(2.4, 2.4)
    mesh.rotation.set(pitch + (boss.weak ? 0 : Math.sin(now() * 3) * 0.08), boss.a, boss.weak ? 0 : Math.sin(now() * 2) * 0.15, 'YXZ')
    mesh.scale.setScalar(1.25)
    mesh.position.set(boss.x, boss.y, boss.z)
    Object.assign(target, { x: boss.x, y: boss.y + 0.9, z: boss.z, r: 2.5 })
  }

  // Plantado en el centro: espirales de bolas y estrellas que caen
  const tree = (dt: number) => {
    boss.weak = boss.state === 'tired'
    if (boss.state === 'spiral') {
      boss.vx -= dt
      if (boss.vx <= 0) {
        boss.vx = 0.18
        boss.cycle += 0.47
        const arms = angry() ? 2 : 1
        for (let i = 0; i < arms; i++) roll(boss.cycle + i * Math.PI, 8, BAUBLES[boss.vz++ % 3], 1.3)
      }
      if (boss.t <= 0) {
        boss.count = 3
        ctx.say('¡Cuidado con la estrella!')
        ctx.sound('roar')
        enter('star', 0.7)
      }
    } else if (boss.state === 'star') {
      if (boss.t <= 0) {
        lobNear(5, 1.2, 0xffd97a, 6.5)
        ctx.sound('shoot')
        if (--boss.count > 0) enter('star', 0.5)
        else {
          ctx.say('¡Se le han fundido las luces! Dispara')
          enter('tired', 3.2)
        }
      }
    } else if (boss.t <= 0) enter('spiral', 5)
    touch(2.4, 7)
    mesh.rotation.set(0, boss.weak ? Math.sin(now() * 5) * 0.3 : now() * 0.6, boss.weak ? Math.sin(now() * 4) * 0.1 : 0)
    mesh.scale.setScalar(1.2)
    mesh.position.set(boss.x, boss.y, boss.z)
    Object.assign(target, { x: boss.x, y: boss.y + 3.2, z: boss.z, r: 2.6 })
  }

  // Rebota por las paredes hasta quedarse sin fuelle
  const top = (dt: number) => {
    boss.weak = boss.state === 'wobble'
    let lift = 0
    if (boss.state === 'rev') {
      lift = (1 - boss.t / 1.2) * 1.2
      boss.a = toPlayer()
      if (boss.t <= 0) {
        boss.vx = Math.sin(boss.a)
        boss.vz = Math.cos(boss.a)
        shock(boss.x, arena.y, boss.z, 8, 9, 0xf8b132)
        ctx.sound('roar')
        enter('spin', 7)
      }
    } else if (boss.state === 'spin') {
      const speed = (5 + boss.t) * rage()
      boss.x += boss.vx * speed * dt
      boss.z += boss.vz * speed * dt
      const d = Math.hypot(boss.x - arena.x, boss.z - arena.z)
      const nx = (boss.x - arena.x) / (d || 1)
      const nz = (boss.z - arena.z) / (d || 1)
      const out = boss.vx * nx + boss.vz * nz
      if (d > arena.r - 2.2 && out > 0) {
        // Rebota y corrige un poco el rumbo hacia el jugador
        const a = toPlayer()
        const rx = (boss.vx - 2 * out * nx) * 0.65 + Math.sin(a) * 0.35
        const rz = (boss.vz - 2 * out * nz) * 0.65 + Math.cos(a) * 0.35
        const len = Math.hypot(rx, rz) || 1
        boss.vx = rx / len
        boss.vz = rz / len
        ctx.sound('clang')
        ctx.shake(0.25)
        ctx.burst(boss.x - 0.5, arena.y + 1, boss.z - 0.5, 0xf8b132, 8)
      }
      stayInside(2.2)
      if (boss.t <= 0) {
        ctx.say('¡Pierde fuelle! Dale con la espada')
        enter('wobble', 3.2)
      }
    } else if (boss.t <= 0) enter('rev', 1.2)
    touch(2.3, 4.5, boss.state === 'rev')
    boss.cycle += dt * (boss.weak ? 4 : 18)
    mesh.rotation.set(boss.weak ? 0.4 : boss.state === 'spin' ? 0.12 : 0, boss.cycle, 0, 'YXZ')
    mesh.scale.setScalar(1.2)
    mesh.position.set(boss.x, boss.y + lift, boss.z)
    Object.assign(target, { x: boss.x, y: boss.y + 2 + lift, z: boss.z, r: 2.4 })
  }

  // Lanza bolas que ruedan por el suelo y acaba derritiéndose
  const snowman = (dt: number) => {
    boss.weak = boss.state === 'tired'
    let squash = 1
    const melt = () => {
      ctx.say('¡Se derrite! Dale con la espada')
      enter('tired', 3)
    }
    if (boss.state === 'walk') {
      walk(1.6 * rage(), 5, dt)
      if (boss.t <= 0) boss.cycle++ % 2 ? ((boss.count = 2), enter('ring', 0.7)) : ((boss.count = 3), enter('roll', 0.6))
    } else if (boss.state === 'roll') {
      boss.a = toPlayer()
      if (boss.t <= 0) {
        for (const off of [-0.32, 0, 0.32]) roll(boss.a + off, 10, 0xffffff, 2.2)
        ctx.sound('shoot')
        --boss.count > 0 ? enter('roll', 0.8 / rage()) : melt()
      }
    } else if (boss.state === 'ring') {
      if (boss.t <= 0) {
        circle(12 + tier, boss.count * 0.26, 7, 0xdfeaff, 2)
        ctx.shake(0.4)
        ctx.sound('slam')
        --boss.count > 0 ? enter('ring', 1.1 / rage()) : melt()
      }
    } else if (boss.state === 'tired') {
      squash = 0.6
      if (boss.t <= 0) enter('rise', 0.9)
    } else {
      squash = 0.6 + (1 - boss.t / 0.9) * 0.4
      if (boss.t <= 0) enter('walk', 2 / rage())
    }
    stayInside(2.5)
    touch(2.4, 6, boss.state === 'rise')
    mesh.rotation.set(0, boss.a, boss.state === 'walk' ? Math.sin(now() * 5) * 0.06 : 0)
    mesh.scale.set(1.1 + (1 - squash) * 0.5, 1.1 * squash, 1.1 + (1 - squash) * 0.5)
    mesh.position.set(boss.x, boss.y, boss.z)
    Object.assign(target, { x: boss.x, y: boss.y + 3 * squash, z: boss.z, r: 2.5 })
  }

  // Da vueltas a la sala echando carbón y de vez en cuando la cruza a toda máquina
  const train = (dt: number) => {
    const lane = arena.r - 3
    boss.weak = boss.state === 'steam'
    let tilt = 0
    if (boss.state === 'lap') {
      boss.cycle += dt * 0.8 * rage()
      const k = Math.min(1, dt * 5)
      boss.x += (arena.x + Math.cos(boss.cycle) * lane - boss.x) * k
      boss.z += (arena.z + Math.sin(boss.cycle) * lane - boss.z) * k
      boss.a = Math.atan2(-Math.sin(boss.cycle), Math.cos(boss.cycle))
      boss.vx -= dt
      if (boss.vx <= 0) {
        boss.vx = 1.7 / rage()
        lobNear(5, 1.2, COAL, 3.5)
        ctx.sound('shoot')
      }
      if (boss.t <= 0) {
        ctx.say('¡Pita! Sal de la vía')
        ctx.sound('roar')
        enter('whistle', 1)
      }
    } else if (boss.state === 'whistle') {
      boss.a = toPlayer()
      for (let i = 1; i <= 6; i++) warn(boss.x + Math.sin(boss.a) * i * 4, boss.z + Math.cos(boss.a) * i * 4, 0.2, 1.8, i)
      if (boss.t <= 0) {
        boss.vx = Math.sin(boss.a)
        boss.vz = Math.cos(boss.a)
        enter('cross', 3)
      }
    } else if (boss.state === 'cross') {
      boss.x += boss.vx * 20 * dt
      boss.z += boss.vz * 20 * dt
      if (boss.t < 2.7 && stayInside(3)) {
        ctx.shake(0.6)
        ctx.sound('slam')
        ctx.say('¡Ha descarrilado! Dispara')
        enter('steam', 3)
      }
    } else if (boss.t <= 0) {
      boss.cycle = Math.atan2(boss.z - arena.z, boss.x - arena.x)
      boss.vx = 1
      enter('lap', 6)
    } else {
      tilt = 0.45
      if (Math.random() < 0.3) ctx.burst(boss.x - 0.5, boss.y + 3, boss.z - 0.5, 0xf2e6c9, 2)
    }
    for (const off of [-4.2, -1.2, 2]) touch(2, 3.6, false, Math.sin(boss.a) * off, Math.cos(boss.a) * off)
    mesh.rotation.set(0, boss.a, tilt, 'YXZ')
    mesh.scale.setScalar(1)
    mesh.position.set(boss.x, boss.y + (tilt ? 0.5 : 0), boss.z)
    Object.assign(target, { x: boss.x - Math.sin(boss.a), y: boss.y + 1.6, z: boss.z - Math.cos(boss.a), r: 3.2 })
  }

  // Desaparece, reaparece cerca del jugador y embiste
  const ghost = (dt: number) => {
    boss.weak = boss.state === 'tired'
    let size = 1
    const vanish = () => {
      const a = Math.random() * TAU
      ;[boss.x, boss.z] = inside(pos.x + Math.sin(a) * 6.5, pos.z + Math.cos(a) * 6.5, 2.5)
      ctx.burst(boss.x - 0.5, arena.y + 1, boss.z - 0.5, 0xf2f6ff, 6)
      enter('hide', 1.3 / rage())
    }
    if (boss.state === 'hide') {
      size = 0
      if (boss.t < 0.7) warn(boss.x, boss.z, 0.2, 1.6, 0)
      if (boss.t <= 0) enter('appear', 0.45)
    } else if (boss.state === 'appear') {
      size = 1 - boss.t / 0.45
      boss.a = toPlayer()
      if (boss.t <= 0) {
        boss.vx = Math.sin(boss.a)
        boss.vz = Math.cos(boss.a)
        ctx.sound('roar')
        enter('lunge', 0.75)
      }
    } else if (boss.state === 'lunge') {
      boss.x += boss.vx * 13 * rage() * dt
      boss.z += boss.vz * 13 * rage() * dt
      stayInside(1.5)
      touch(1.9, 4.5)
      if (boss.t <= 0) {
        if (--boss.count > 0) vanish()
        else {
          circle(8 + tier, Math.random(), 7, 0xc9b8ff, 1.4)
          ctx.say('¡Se ha quedado sin memes! Dale con la espada')
          enter('tired', 3.2)
        }
      }
    } else if (boss.t <= 0) {
      boss.count = angry() ? 4 : 3
      vanish()
    }
    if (boss.weak) touch(1.9, 4.5)
    mesh.rotation.set(0, boss.a + (boss.weak ? Math.sin(now() * 6) * 0.6 : 0), boss.state === 'lunge' ? 0 : Math.sin(now() * 2.5) * 0.08)
    mesh.scale.setScalar(1.1 * size)
    mesh.position.set(boss.x, boss.y + (boss.weak ? 0 : 0.5 + Math.sin(now() * 3) * 0.2), boss.z)
    Object.assign(target, { x: boss.x, y: size ? boss.y + 2.6 : -100, z: boss.z, r: 2.1 })
  }

  // Se columpia por el aire soltando caramelos
  const pinata = (dt: number) => {
    boss.weak = boss.state === 'low'
    const span = arena.r - 4
    const grounded = boss.state === 'low' || (boss.state === 'fall' && boss.t < 0.8)
    boss.cycle += dt * (grounded ? 0 : 1.1) * rage()
    boss.vz += dt * 0.2
    const swing = Math.sin(boss.cycle)
    const tx = grounded ? arena.x : arena.x + Math.cos(boss.vz) * swing * span
    const tz = grounded ? arena.z : arena.z + Math.sin(boss.vz) * swing * span
    const ty = grounded ? arena.y + 0.3 : arena.y + 5 + swing * swing * 3
    const k = Math.min(1, dt * 4)
    boss.x += (tx - boss.x) * k
    boss.y += (ty - boss.y) * k
    boss.z += (tz - boss.z) * k
    if (boss.state === 'swing') {
      boss.vx -= dt
      if (boss.vx <= 0) {
        boss.vx = 0.8 / rage()
        const air = Math.sqrt((2 * (boss.y - 0.5 - arena.y)) / 14)
        fire(boss.x, boss.y - 0.5, boss.z, 0, 0, 0, true, 14, CANDY[boss.count++ % 4], 1.5, 1.8)
        warn(boss.x, boss.z, air, 1.8)
      }
      if (boss.t <= 0) {
        boss.count = 2
        ctx.say('¡Lluvia de caramelos!')
        ctx.sound('roar')
        enter('rain', 0.6)
      }
    } else if (boss.state === 'rain') {
      if (boss.t <= 0) {
        zap(pos.x, pos.z, 2, 1.1, CANDY[0])
        for (let i = 0; i < 7; i++) zap(...anywhere(1), 2, 1.1 + i * 0.05, CANDY[i % 4])
        ctx.sound('shoot')
        --boss.count > 0 ? enter('rain', 1.5) : enter('fall', 2)
      }
    } else if (boss.state === 'fall') {
      if (boss.t <= 0) {
        ctx.say('¡Ha bajado! Dispara')
        enter('low', 3.4)
      }
    } else if (boss.t <= 0) {
      boss.vx = 1
      enter('swing', 7)
    }
    if (boss.y < arena.y + 2) touch(2, 5, true)
    mesh.rotation.set(0, boss.vz + Math.PI / 2, grounded ? Math.sin(now() * 6) * 0.08 : Math.cos(boss.cycle) * 0.45)
    mesh.scale.setScalar(1.15)
    mesh.position.set(boss.x, boss.y, boss.z)
    Object.assign(target, { x: boss.x, y: boss.y + 2.6, z: boss.z, r: 2.3 })
  }

  // Un imán que arrastra al jugador y un pisotón que hay que saltar
  const robot = (dt: number) => {
    boss.weak = boss.state === 'tired'
    let squash = 1
    let lift = 0
    if (boss.state === 'walk') {
      walk(1.8 * rage(), 4, dt)
      if (boss.t <= 0) {
        if (boss.cycle++ % 2) {
          boss.count = 3
          enter('pack', 0.5)
        } else {
          ctx.say('¡Imán! Corre hacia fuera')
          ctx.sound('roar')
          enter('magnet', 2.6)
        }
      }
    } else if (boss.state === 'magnet') {
      boss.a = toPlayer()
      const d = reach()
      if (d > 2.6 && pos.y < arena.y + 3) {
        pos.x -= ((pos.x - boss.x) / d) * 3.3 * rage() * dt
        pos.z -= ((pos.z - boss.z) / d) * 3.3 * rage() * dt
      }
      if (Math.random() < 0.6) {
        const along = Math.random()
        ctx.burst(boss.x + (pos.x - boss.x) * along - 0.5, arena.y + 1.5, boss.z + (pos.z - boss.z) * along - 0.5, 0xff3b4a, 1)
      }
      lift = (1 - boss.t / 2.6) * 1.6
      if (boss.t <= 0) {
        shock(boss.x, arena.y, boss.z, 9, arena.r + 3, 0x21c7b0)
        boss.count = angry() ? 1 : 0
        ctx.shake(0.7)
        ctx.sound('slam')
        enter('slam', 0.6)
      }
    } else if (boss.state === 'slam') {
      squash = 0.85
      if (boss.t <= 0) {
        if (boss.count-- > 0) {
          shock(boss.x, arena.y, boss.z, 9, arena.r + 3, 0xff3b4a)
          ctx.sound('slam')
          enter('slam', 0.6)
        } else {
          ctx.say('¡Se ha recalentado! Dale con la espada')
          enter('tired', 3)
        }
      }
    } else if (boss.state === 'pack') {
      boss.a = toPlayer()
      if (boss.t <= 0) {
        lobNear(5, 1.2, 0x9a6b3a)
        ctx.sound('shoot')
        --boss.count > 0 ? enter('pack', 0.45) : enter('walk', 1.8 / rage())
      }
    } else if (boss.state === 'tired') {
      squash = 0.75
      if (Math.random() < 0.3) ctx.burst(boss.x - 0.5, boss.y + 5, boss.z - 0.5, 0xdfe8ff, 2)
      if (boss.t <= 0) enter('rise', 0.9)
    } else {
      squash = 0.75 + (1 - boss.t / 0.9) * 0.25
      if (boss.t <= 0) enter('walk', 2 / rage())
    }
    stayInside(2.5)
    touch(2.6, 6.5, boss.state === 'rise')
    mesh.rotation.set(0, boss.a, 0)
    mesh.scale.set(1.1, 1.1 * squash, 1.1)
    mesh.position.set(boss.x, boss.y + lift, boss.z)
    Object.assign(target, { x: boss.x, y: boss.y + 2.8 * squash + lift, z: boss.z, r: 2.5 })
  }

  // Flota sobre la pista y enciende baldosas que estallan
  const disco = (dt: number) => {
    boss.weak = boss.state === 'low'
    let high = true
    if (boss.state === 'lights') {
      if (boss.t <= 0) {
        const delay = 1.15 / rage()
        const figure = boss.cycle++ % 3
        if (figure === 0) {
          zap(pos.x, pos.z, 2, delay, 0xe0489a)
          ringAround(pos.x, pos.z, 4.6, 8, delay + 0.25, 0x21c7b0)
        } else if (figure === 1) {
          const a = Math.random() * Math.PI
          for (let i = -3; i <= 3; i++) {
            zap(arena.x + Math.cos(a) * i * 3.8, arena.z + Math.sin(a) * i * 3.8, 2, delay, 0xf8b132)
            if (i) zap(arena.x - Math.sin(a) * i * 3.8, arena.z + Math.cos(a) * i * 3.8, 2, delay, 0x8a55e0)
          }
        } else {
          zap(pos.x, pos.z, 2, delay, 0xe0489a)
          for (let i = 0; i < 10; i++) zap(...anywhere(1), 2, delay + i * 0.06, CANDY[i % 4])
        }
        p.set(pos.x - boss.x, pos.y + 0.8 - boss.y, pos.z - boss.z).normalize()
        fire(boss.x, boss.y, boss.z, p.x * 13, p.y * 13, p.z * 13, true, 0, 0xff5ad1, 1.4)
        ctx.sound('shoot')
        --boss.count > 0 ? enter('lights', 1.8 / rage()) : enter('fall', 2.2)
      }
    } else if (boss.state === 'fall') {
      high = boss.t > 0.7
      if (boss.t <= 0) {
        ctx.say('¡Se ha fundido! Dispara')
        enter('low', 3.4)
      }
    } else {
      high = false
      if (boss.t <= 0) {
        boss.count = angry() ? 4 : 3
        enter('lights', 1.5)
      }
    }
    boss.y += ((high ? arena.y + 8 + Math.sin(now() * 1.5) * 0.4 : arena.y + 0.4) - boss.y) * Math.min(1, dt * 4)
    if (boss.y < arena.y + 2) touch(2.1, 4, true)
    mesh.rotation.set(0, boss.weak ? Math.sin(now() * 4) * 0.4 : now() * 1.6, 0)
    mesh.scale.setScalar(1.4)
    mesh.position.set(boss.x, boss.y, boss.z)
    Object.assign(target, { x: boss.x, y: boss.y + 1.9, z: boss.z, r: 2.2 })
  }

  // No se le puede pegar: cada uva recogida es una campanada
  const grape = { mesh: null as Mesh | null, x: 0, z: 0 }
  const serve = () => ([grape.x, grape.z] = anywhere(2.5))
  const clock = (dt: number) => {
    const eaten = boss.max - boss.hp
    const hurry = (1 + eaten / boss.max) * pace
    boss.cycle += dt * 0.9 * hurry
    boss.vz -= dt * 0.4 * hurry
    beam(0, boss.cycle, arena.r - 1, 0xf8b132)
    beam(1, boss.vz, 8, 0xc8323c)
    grape.mesh!.position.set(grape.x, arena.y + 1 + Math.sin(now() * 3) * 0.15, grape.z)
    grape.mesh!.rotation.y = now() * 2
    grape.mesh!.scale.setScalar(1.5)
    ctx.blob(grape.x, arena.y, grape.z, 0.6)
    if (Math.hypot(grape.x - pos.x, grape.z - pos.z) < 1.4 && pos.y < arena.y + 2.5) {
      ctx.sound('coin')
      ctx.burst(grape.x - 0.5, arena.y + 0.5, grape.z - 0.5, 0x9be04a, 14)
      shock(boss.x, arena.y, boss.z, 9, arena.r + 3, 0xf2e6c9)
      kit.damage(1)
      if (boss.hp > 0) {
        ctx.say(`Campanada ${eaten + 1} de ${boss.max}`)
        serve()
        // Nunca tan cerca que no dé tiempo a ver la siguiente
        while (Math.hypot(grape.x - pos.x, grape.z - pos.z) < 6 || Math.hypot(grape.x - arena.x, grape.z - arena.z) < 4) serve()
      } else grape.mesh!.visible = false
    }
    touch(2.3, 9, true)
    mesh.rotation.set(0, 0, Math.sin(now() * 6) * 0.02 * hurry)
    mesh.scale.setScalar(1.15)
    mesh.position.set(boss.x, boss.y, boss.z)
    Object.assign(target, { x: boss.x, y: boss.y + 3.5, z: boss.z, r: 2.4 })
  }

  // Portero: no se le hace daño, se le marcan goles
  const GOAL_Z = arena.z - arena.r + 1.2
  const net = { open: true, targets: [] as Target[] }
  const keeper = (dt: number) => {
    const post = 4.2
    if (boss.state === 'walk' || boss.state === 'guard') {
      // Se coloca tapando el tiro y de vez en cuando se lanza a un palo
      const want = Math.max(-post, Math.min(post, (pos.x - arena.x) * 0.5))
      boss.x += Math.max(-6.5 * rage() * dt, Math.min(6.5 * rage() * dt, arena.x + want - boss.x))
      boss.vx -= dt
      if (boss.vx <= 0) {
        boss.vx = 3.4 / rage()
        boss.count = 3
        enter('kick', 0.5)
      } else if (boss.t <= 0) {
        boss.vz = Math.random() < 0.5 ? -1 : 1
        enter('dive', 0.55)
      }
    } else if (boss.state === 'dive') {
      boss.x = Math.max(arena.x - post, Math.min(arena.x + post, boss.x + boss.vz * 13 * dt))
      if (boss.t <= 0) enter('guard', 1.2 + Math.random() * 1.2)
    } else if (boss.state === 'kick') {
      if (boss.t <= 0) {
        roll(toPlayer() + (Math.random() - 0.5) * 0.5, 11, 0xffffff, 1.7, 2)
        ctx.sound('shoot')
        --boss.count > 0 ? enter('kick', 0.35) : enter('guard', 1.2)
      }
    } else if (boss.t <= 0) {
      net.open = true
      boss.vx = 0.4
      enter('guard', 1)
    }
    boss.a = toPlayer()
    const angry = boss.state === 'angry'
    net.targets.forEach((t) => (t.y = Math.abs(t.y) * (net.open ? 1 : -1)))
    touch(1.8, 5)
    mesh.rotation.set(0, angry ? now() * 14 : boss.a * 0.4, boss.state === 'dive' ? -boss.vz * 0.9 : 0)
    mesh.scale.setScalar(1.15)
    mesh.position.set(boss.x, boss.y + (angry ? Math.abs(Math.sin(now() * 12)) * 0.8 : boss.state === 'dive' ? 0.6 : 0), boss.z)
    Object.assign(target, { x: boss.x, y: boss.y + 2.4, z: boss.z, r: 1.9 })
  }

  // El jefe final: con cada tercio de vida que pierde suma un ataque
  const MOVES = [['lob', 'stomp'], ['embers', 'lob', 'stomp'], ['charge', 'embers', 'lob', 'stomp']]
  let stage = 0
  const king = (dt: number) => {
    const phase = boss.hp > boss.max * 0.66 ? 0 : boss.hp > boss.max * 0.33 ? 1 : 2
    const fast = (1 + phase * 0.2) * pace
    if (phase !== stage) {
      stage = phase
      ctx.say(phase === 1 ? '¡El Rey Carbón se enciende!' : '¡Está al rojo vivo!')
      ctx.sound('roar')
      ctx.shake(0.7)
      circle(12, 0, 7, 0xff8a2a, 1.5)
    }
    boss.weak = boss.state === 'tired' || boss.state === 'stun'
    let squash = 1
    let lift = 0
    if (boss.state === 'walk') {
      walk(1.8 * fast, 4.5, dt)
      if (boss.t <= 0) {
        const move = MOVES[phase][boss.cycle++ % MOVES[phase].length]
        if (move === 'lob') {
          boss.count = 3 + phase
          enter('lob', 0.5)
        } else if (move === 'embers') {
          boss.count = 2
          enter('embers', 0.6)
        } else if (move === 'charge') {
          boss.count = 2
          enter('aim', 0.8)
        } else enter('windup', 0.8)
      }
    } else if (boss.state === 'lob') {
      boss.a = toPlayer()
      if (boss.t <= 0) {
        lobNear(5, 1.25, COAL)
        ctx.sound('shoot')
        --boss.count > 0 ? enter('lob', 0.45 / fast) : enter('walk', 1.6 / fast)
      }
    } else if (boss.state === 'windup') {
      lift = (1 - boss.t / 0.8) * 2.2
      if (boss.t <= 0) {
        shock(boss.x, arena.y, boss.z, 9, arena.r + 3, 0xff8a2a)
        boss.count = phase
        ctx.shake(0.7)
        ctx.sound('slam')
        enter('slam', 0.6)
      }
    } else if (boss.state === 'slam') {
      squash = 0.8
      if (boss.t <= 0) {
        if (boss.count-- > 0) {
          shock(boss.x, arena.y, boss.z, 9, arena.r + 3, 0xc8323c)
          ctx.sound('slam')
          enter('slam', 0.6)
        } else {
          ctx.say('¡Se ha quedado sin fuelle! Dispara')
          enter('tired', 2.6)
        }
      }
    } else if (boss.state === 'embers') {
      boss.a = toPlayer()
      if (boss.t <= 0) {
        zap(pos.x, pos.z, 2, 1.1, 0xff8a2a)
        ringAround(pos.x, pos.z, 4.6, 8, 1.35, 0xff5a1f)
        circle(10 + phase * 2, boss.count * 0.3, 7, 0xff8a2a, 1.5)
        ctx.sound('shoot')
        --boss.count > 0 ? enter('embers', 1.4 / fast) : enter('walk', 1.8 / fast)
      }
    } else if (boss.state === 'aim') {
      boss.a = toPlayer() + Math.sin(now() * 40) * 0.08
      if (boss.t <= 0) {
        boss.vx = Math.sin(boss.a)
        boss.vz = Math.cos(boss.a)
        ctx.sound('roar')
        enter('charge', 2)
      }
    } else if (boss.state === 'charge') {
      boss.x += boss.vx * 16 * dt
      boss.z += boss.vz * 16 * dt
      if (stayInside(3)) {
        ctx.shake(0.6)
        ctx.sound('slam')
        if (--boss.count > 0) enter('aim', 0.7)
        else {
          ctx.say('¡Se ha mareado! Aprovecha')
          enter('stun', 2.8)
        }
      } else if (boss.t <= 0) enter('walk', 1)
    } else {
      squash = 0.8
      if (boss.t <= 0) enter('walk', 1.6 / fast)
    }
    stayInside(3)
    touch(3, 6.5)
    mesh.rotation.set(0, boss.a + (boss.state === 'stun' ? Math.sin(now() * 6) * 0.5 : 0), 0)
    mesh.scale.set(1.2, 1.2 * squash, 1.2)
    mesh.position.set(boss.x, boss.y + lift + (boss.state === 'walk' ? Math.abs(Math.sin(now() * 5)) * 0.2 : 0), boss.z)
    Object.assign(target, { x: boss.x, y: boss.y + 2.8 * squash + lift, z: boss.z, r: 2.9 })
  }

  const id = def.boss!
  if (id === 'glove') {
    boss.y = arena.y + 7
    enter('track', 2.2)
  } else if (id === 'dragon') enter('circle', 9)
  else if (id === 'tree') {
    boss.z = arena.z
    enter('spiral', 5)
  } else if (id === 'top') enter('rev', 2.2)
  else if (id === 'train') {
    boss.cycle = -Math.PI / 2
    boss.z = arena.z - (arena.r - 3)
    boss.vx = 3
    enter('lap', 7)
  } else if (id === 'ghost') boss.count = 3
  else if (id === 'pinata') {
    boss.y = arena.y + 7
    boss.vx = 3
    enter('swing', 8)
  } else if (id === 'disco') {
    boss.z = arena.z
    boss.y = arena.y + 8
    boss.count = 3
    enter('lights', 2.5)
  } else if (id === 'keeper') {
    boss.z = GOAL_Z + 2.3
    boss.immune = true
    boss.vx = 5
    enter('guard', 3)
    for (const y of [1.3, 3]) {
      for (let x = -4.5; x <= 4.5; x += 1.5) {
        const goal: Target = {
          x: arena.x + x, y: arena.y + y, z: GOAL_Z, r: 1,
          hit: () => {
            if (!net.open || boss.dying) return
            net.open = false
            ctx.sound('checkpoint')
            ctx.shake(0.5)
            ctx.burst(goal.x - 0.5, goal.y, goal.z - 0.5, 0xf8d02a, 20)
            if (boss.hp > 1) ctx.say(`¡GOOOL! Te faltan ${boss.hp - 1}`)
            kit.damage(1)
            enter('angry', 1.3)
          },
        }
        net.targets.push(goal)
        kit.aim(goal)
      }
    }
  } else if (id === 'clock') {
    boss.z = arena.z
    boss.immune = true
    grape.mesh = kit.add(new Mesh(kit.models.grape, ctx.mat))
    serve()
  }
  return { pig, golem, glove, dragon, tree, top, snowman, train, ghost, pinata, robot, disco, clock, keeper, king }[id]
}
