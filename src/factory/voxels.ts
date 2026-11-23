import { BufferAttribute, BufferGeometry, Color, Matrix4, Vector3 } from 'three'

type Vec3 = [number, number, number]

export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Voxels {
  private pos: number[] = []
  private nrm: number[] = []
  private col: number[] = []
  private uv: number[] = []
  private idx: number[] = []
  private color = new Color()
  private v = new Vector3()
  private n = new Vector3()
  private rand: () => number
  xf: Matrix4 | null = null

  constructor(seed = 1) {
    this.rand = mulberry32(seed)
  }

  private pushQuad(
    x0: number, y0: number, z0: number, u0: number, v0: number,
    x1: number, y1: number, z1: number, u1: number, v1: number,
    x2: number, y2: number, z2: number, u2: number, v2: number,
    x3: number, y3: number, z3: number, u3: number, v3: number,
    nx: number, ny: number, nz: number,
    r: number, g: number, b: number, emissive: number
  ) {
    const base = this.pos.length / 3
    if (this.xf) {
      const m = this.xf
      this.n.set(nx, ny, nz).transformDirection(m)
      nx = this.n.x
      ny = this.n.y
      nz = this.n.z
      this.v.set(x0, y0, z0).applyMatrix4(m)
      this.pos.push(this.v.x, this.v.y, this.v.z)
      this.v.set(x1, y1, z1).applyMatrix4(m)
      this.pos.push(this.v.x, this.v.y, this.v.z)
      this.v.set(x2, y2, z2).applyMatrix4(m)
      this.pos.push(this.v.x, this.v.y, this.v.z)
      this.v.set(x3, y3, z3).applyMatrix4(m)
      this.pos.push(this.v.x, this.v.y, this.v.z)
    } else {
      this.pos.push(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3)
    }
    this.nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz)
    this.col.push(r, g, b, emissive, r, g, b, emissive, r, g, b, emissive, r, g, b, emissive)
    this.uv.push(u0, v0, u1, v1, u2, v2, u3, v3)
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  quad(verts: Vec3[], uvs: [number, number][], hex: number, shade = 1, emissive = 0) {
    this.color.set(hex)
    const r = this.color.r * shade
    const g = this.color.g * shade
    const b = this.color.b * shade
    const ax = verts[1][0] - verts[0][0]
    const ay = verts[1][1] - verts[0][1]
    const az = verts[1][2] - verts[0][2]
    const bx = verts[2][0] - verts[0][0]
    const by = verts[2][1] - verts[0][1]
    const bz = verts[2][2] - verts[0][2]
    let nx = ay * bz - az * by
    let ny = az * bx - ax * bz
    let nz = ax * by - ay * bx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len
    ny /= len
    nz /= len
    this.pushQuad(
      verts[0][0], verts[0][1], verts[0][2], uvs[0][0], uvs[0][1],
      verts[1][0], verts[1][1], verts[1][2], uvs[1][0], uvs[1][1],
      verts[2][0], verts[2][1], verts[2][2], uvs[2][0], uvs[2][1],
      verts[3][0], verts[3][1], verts[3][2], uvs[3][0], uvs[3][1],
      nx, ny, nz, r, g, b, emissive
    )
  }

  // Caja desde su esquina mínima. glow: sin sombreado, para luces y huecos iluminados
  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    hex: number,
    { jitter = 0.05, glow = false } = {}
  ) {
    const x1 = x + w
    const y1 = y + h
    const z1 = z + d
    const k = 1 + (this.rand() - 0.5) * 2 * jitter
    const s = glow ? 1 : k
    const em = glow ? 2 : 0
    this.color.set(hex)
    const r = this.color.r * s
    const g = this.color.g * s
    const b = this.color.b * s
    const ux0 = x * 0.5
    const ux1 = x1 * 0.5
    const uy0 = y * 0.5
    const uy1 = y1 * 0.5
    const uz0 = z * 0.5
    const uz1 = z1 * 0.5

    // +X
    this.pushQuad(x1, y, z1, uz1, uy0, x1, y, z, uz0, uy0, x1, y1, z, uz0, uy1, x1, y1, z1, uz1, uy1, 1, 0, 0, r, g, b, em)
    // -X
    this.pushQuad(x, y, z, uz0, uy0, x, y, z1, uz1, uy0, x, y1, z1, uz1, uy1, x, y1, z, uz0, uy1, -1, 0, 0, r, g, b, em)
    // +Y
    this.pushQuad(x, y1, z1, ux0, uz1, x1, y1, z1, ux1, uz1, x1, y1, z, ux1, uz0, x, y1, z, ux0, uz0, 0, 1, 0, r, g, b, em)
    // -Y
    this.pushQuad(x, y, z, ux0, uz0, x1, y, z, ux1, uz0, x1, y, z1, ux1, uz1, x, y, z1, ux0, uz1, 0, -1, 0, r, g, b, em)
    // +Z
    this.pushQuad(x, y, z1, ux0, uy0, x1, y, z1, ux1, uy0, x1, y1, z1, ux1, uy1, x, y1, z1, ux0, uy1, 0, 0, 1, r, g, b, em)
    // -Z
    this.pushQuad(x1, y, z, ux1, uy0, x, y, z, ux0, uy0, x, y1, z, ux0, uy1, x1, y1, z, ux1, uy1, 0, 0, -1, r, g, b, em)
  }

  // Caja centrada en (cx, cz) y apoyada en y
  cbox(cx: number, y: number, cz: number, w: number, h: number, d: number, hex: number, opts = {}) {
    this.box(cx - w / 2, y, cz - d / 2, w, h, d, hex, opts)
  }

  build() {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3))
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3))
    geo.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 4))
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2))
    const count = this.pos.length / 3
    geo.setIndex(
      new BufferAttribute(count > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1)
    )
    geo.computeBoundingSphere()
    return geo
  }
}
