// Niveles del jugador: cada uno sube con un punto
export interface PlayerStats {
  strength: number
  health: number
  speed: number
  defense: number
}
export const STAT_IDS = ['strength', 'health', 'speed', 'defense'] as const
export type StatId = (typeof STAT_IDS)[number]
export const STAT_MAX = 7
export const RELIC_COUNT = 4
export const STRENGTH_STEP = 0.15
// Daño de un golpe básico: vidas y daños van en esta escala para que los multiplicadores den enteros
export const DAMAGE = 10
export const SPEED_STEP = 0.04
// Segundos que tarda en recargarse el escudo según el nivel de defensa
export const shieldTime = (defense: number) => 30 - defense * 3
