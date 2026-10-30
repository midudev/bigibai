import { EXPERIENCE_ENABLED } from 'astro:env/server'
import { CAMPAIGN } from '@/data/campaign'

export type CampaignPhase = 'upcoming' | 'registration' | 'closed' | 'winners'

interface ZonedDateTime {
  year: number
  month: number
  day: number
  hour?: number
  minute?: number
  second?: number
}

const DAY_MS = 24 * 60 * 60 * 1000

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPAIGN.timeZone,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
})

const dayMonthFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: CAMPAIGN.timeZone,
  day: 'numeric',
  month: 'long',
})

const timeFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: CAMPAIGN.timeZone,
  hour: '2-digit',
  minute: '2-digit',
})

const dateTimeFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: CAMPAIGN.timeZone,
  dateStyle: 'medium',
  timeStyle: 'short',
})

/**
 * Descompone un instante en fecha y hora peninsular española
 */
export function getZonedParts(date: Date): Required<ZonedDateTime> {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(date).map(({ type, value }) => [type, Number(value)])
  )

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

/**
 * Convierte una fecha y hora peninsular española en el instante real que representa
 */
export function zonedTimeToDate({ year, month, day, hour = 0, minute = 0, second = 0 }: ZonedDateTime) {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  const zoned = getZonedParts(new Date(asUtc))
  const offset =
    Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second) - asUtc

  return new Date(asUtc - offset)
}

/**
 * Último día del calendario desbloqueado (0 = ninguno).
 * Pasado el día 24 todos siguen disponibles mientras la experiencia esté activa.
 */
export function getCampaignDay(now: Date): number {
  const { year, month, day } = getZonedParts(now)

  if (year < CAMPAIGN.year || (year === CAMPAIGN.year && month < 12)) return 0
  if (year > CAMPAIGN.year) return CAMPAIGN.totalDays

  return Math.min(day, CAMPAIGN.totalDays)
}

export function isDayUnlocked(day: number, now: Date): boolean {
  return day >= 1 && day <= getCampaignDay(now)
}

/**
 * Instante en el que se desbloquea una casilla: 00:00 hora peninsular del día de diciembre
 */
export function getDayUnlockDate(day: number): Date {
  return zonedTimeToDate({ year: CAMPAIGN.year, month: 12, day })
}

export function getDaysUntilUnlock(day: number, now: Date): number {
  return Math.max(0, Math.ceil((getDayUnlockDate(day).getTime() - now.getTime()) / DAY_MS))
}

export function getDaysUntilChristmas(now: Date): number {
  const christmas = zonedTimeToDate({ year: CAMPAIGN.year, month: 12, day: 25 })
  return Math.max(0, Math.ceil((christmas.getTime() - now.getTime()) / DAY_MS))
}

const hasPassed = (isoDate: string | null, now: Date) =>
  isoDate !== null && now.getTime() >= new Date(isoDate).getTime()

export function getCampaignPhase(now: Date): CampaignPhase {
  if (hasPassed(CAMPAIGN.winnersPublishedAt, now)) return 'winners'
  if (hasPassed(CAMPAIGN.registrationClosesAt, now)) return 'closed'
  if (hasPassed(CAMPAIGN.registrationOpensAt, now)) return 'registration'
  return 'upcoming'
}

/**
 * Indica si la experiencia (casillas y juegos) está activa.
 * Se apaga con EXPERIENCE_ENABLED=false o al llegar a CAMPAIGN.experienceEndsAt
 */
export function isExperienceEnabled(now: Date): boolean {
  return EXPERIENCE_ENABLED && !hasPassed(CAMPAIGN.experienceEndsAt, now)
}

/**
 * Formatea una fecha de la campaña como "23 de diciembre"
 */
export function formatCampaignDate(isoDate: string): string {
  return dayMonthFormatter.format(new Date(isoDate))
}

export function formatCampaignTime(isoDate: string): string {
  return timeFormatter.format(new Date(isoDate))
}

export function formatCampaignDateTime(date: Date): string {
  return dateTimeFormatter.format(date)
}

/**
 * Interpreta una fecha simulada en hora peninsular: YYYY-MM-DD o YYYY-MM-DDTHH:mm[:ss]
 */
export function parseSimulatedDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!match) return null

  const [year, month, day, hour = 0, minute = 0, second = 0] = match.slice(1).map((part) =>
    part === undefined ? undefined : Number(part)
  ) as number[]

  const date = zonedTimeToDate({ year, month, day, hour, minute, second })
  const zoned = getZonedParts(date)

  // Descarta fechas imposibles (31 de febrero, 25:00...) que Date desbordaría al mes siguiente
  if (zoned.year !== year || zoned.month !== month || zoned.day !== day || zoned.hour !== hour) {
    return null
  }

  return date
}
