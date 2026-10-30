// points.json y details/ se generan desde tiendas.csv con `bun run stores`
export const RETAILERS = [
  { name: 'Eroski', color: '#fb923c' },
  { name: 'El Corte Inglés', color: '#34d399' },
  { name: 'Carrefour', color: '#7aa7ff' },
  { name: 'Alcampo', color: '#fb7185' },
  { name: 'Lidl', color: '#fde047' },
] as const

export const COORDINATE_SCALE = 1e5
export const DETAILS_PER_FILE = 32

export type StoreDetails = [address: string, place: string]
