import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { COORDINATE_SCALE, DETAILS_PER_FILE, RETAILERS, type StoreDetails } from '../src/data/stores'

type Store = { lat: number; lon: number; retail: number; details: StoreDetails }

const dir = new URL('../src/data/stores/', import.meta.url)

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char !== '"') field += char
      else if (text[i + 1] === '"') field += text[++i]
      else quoted = false
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') field += char
  }
  if (field || row.length) rows.push([...row, field])
  return rows
}

// Divide por el lado más largo hasta que cada trozo cabe en un fichero de details/
function spatialOrder(stores: Store[]): Store[] {
  if (stores.length <= DETAILS_PER_FILE) return stores
  const lats = stores.map((store) => store.lat)
  const lons = stores.map((store) => store.lon)
  const minLat = Math.min(...lats)
  const latSpan = Math.max(...lats) - minLat
  const lonSpan =
    (Math.max(...lons) - Math.min(...lons)) * Math.cos(((minLat + latSpan / 2) * Math.PI) / 180)
  const axis = latSpan > lonSpan ? 'lat' : 'lon'
  const sorted = stores.toSorted((a, b) => a[axis] - b[axis])
  const cut = Math.max(
    DETAILS_PER_FILE,
    Math.round(stores.length / 2 / DETAILS_PER_FILE) * DETAILS_PER_FILE
  )
  return [...spatialOrder(sorted.slice(0, cut)), ...spatialOrder(sorted.slice(cut))]
}

const [, ...rows] = parseCsv(readFileSync(new URL('tiendas.csv', dir), 'utf8'))
const stores: Store[] = []
rows.forEach(([name, latitude, longitude, address, place], i) => {
  const line = i + 2
  const retail = RETAILERS.findIndex((retailer) => retailer.name === name)
  if (retail === -1) throw new Error(`tiendas.csv:${line}: cadena desconocida "${name}"`)
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!latitude || !longitude || !(lat >= 27 && lat <= 44 && lon >= -19 && lon <= 5)) {
    console.warn(`tiendas.csv:${line}: coordenadas no válidas, se omite`)
    return
  }
  stores.push({ lat, lon, retail, details: [address, place] })
})

const ordered = spatialOrder(stores)
const toLines = (items: unknown[]) => `[\n${items.map((item) => JSON.stringify(item)).join(',\n')}\n]\n`

let lat = 0
let lon = 0
const points = ordered.map((store) => {
  const nextLat = Math.round(store.lat * COORDINATE_SCALE)
  const nextLon = Math.round(store.lon * COORDINATE_SCALE)
  const point = [nextLat - lat, nextLon - lon, store.retail]
  lat = nextLat
  lon = nextLon
  return point
})
writeFileSync(new URL('points.json', dir), `[\n${points.map((point) => point.join(',')).join(',\n')}\n]\n`)

const detailsDir = new URL('details/', dir)
rmSync(detailsDir, { recursive: true, force: true })
mkdirSync(detailsDir)
for (let file = 0; file * DETAILS_PER_FILE < ordered.length; file++) {
  const block = ordered.slice(file * DETAILS_PER_FILE, (file + 1) * DETAILS_PER_FILE)
  writeFileSync(new URL(`${file}.json`, detailsDir), toLines(block.map((store) => store.details)))
}

console.log(`${ordered.length} tiendas, ${Math.ceil(ordered.length / DETAILS_PER_FILE)} ficheros de detalles`)
