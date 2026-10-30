// Configuración central de la campaña. Cambiar de fase (abrir/cerrar registro, publicar
// ganadores, apagar la experiencia) se hace aquí, sin tocar páginas ni componentes.
//
// Las fechas son ISO 8601 con offset explícito (hora peninsular española):
// +02:00 en horario de verano (hasta el último domingo de octubre) y +01:00 en invierno.
export const CAMPAIGN = {
  year: 2026,
  name: 'Big Ibai 2026',
  timeZone: 'Europe/Madrid',
  totalDays: 24,

  // Inicio de sesión y alta de cuentas (Google y enlace mágico).
  // Desactivado mientras se limpia la base de datos de la edición anterior.
  signInEnabled: false,
  // Enlace mágico por email (solo cuenta si signInEnabled está activo). Con false solo se entra
  // con Google.
  emailSignInEnabled: true,

  // Pendientes de las bases legales 2026. Mientras sean null el registro no se abre.
  // Referencia 2025: '2025-10-22T00:00:00+02:00' → '2025-12-23T23:59:59+01:00'
  registrationOpensAt: null as string | null,
  registrationClosesAt: null as string | null,

  // Referencia 2025: '2025-12-24T18:00:00+01:00'
  winnersPublishedAt: null as string | null,

  // Fecha a partir de la cual se apaga la experiencia (casillas y juegos).
  // También se puede apagar en cualquier momento con EXPERIENCE_ENABLED=false.
  experienceEndsAt: null as string | null,
}

export const NOTICES = {
  gamesAreOptional:
    'Jugar es opcional y no aumenta tus probabilidades de ganar. Todos los calendarios registrados participan en el sorteo según las bases legales.',
  prizeIsNotWon:
    'Descubrir el premio no significa haberlo ganado: solo te mostramos lo que se sortea en esta casilla.',
}
