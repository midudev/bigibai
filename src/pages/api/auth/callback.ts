import { createClient } from '@/supabase'
import { type APIRoute } from 'astro'
import { CAMPAIGN } from '@/data/campaign'

const allowedPaths = ['/dashboard', '/registro', '/']

// Función para validar si una ruta es segura
function isSafeRedirect(path: string): boolean {
  // Permitir rutas que empiezan con /casilla- (para las casillas del calendario)
  if (path.startsWith('/casilla-')) {
    return true
  }
  // Permitir rutas explícitamente permitidas
  return allowedPaths.includes(path)
}

export const GET: APIRoute = async ({ request, url, cookies, redirect }) => {
  if (!CAMPAIGN.signInEnabled) return redirect('/registro')

  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') || '/dashboard'
  const safePath = isSafeRedirect(next) ? next : '/dashboard'
  const providerType = url.searchParams.get('type') || 'google'

  if (!code) {
    return redirect('/registro?error=no_code')
  }

  // Los enlaces del email llegan con type=otp: sin esto se podría seguir entrando con uno
  // pedido directamente a la API de Supabase
  if (providerType === 'otp' && !CAMPAIGN.emailSignInEnabled) {
    return redirect('/registro?error=email_disabled')
  }

  const supabase = createClient({ request, cookies })

  try {
    const verifyCodePromise =
      providerType === 'otp'
        ? supabase.auth.verifyOtp({
            token_hash: code,
            type: 'email',
          })
        : supabase.auth.exchangeCodeForSession(code)

    const { data, error } = await verifyCodePromise

    if (error) {
      console.error('Error exchanging code for session:', error)
      return redirect('/registro?error=auth_failed')
    }

    if (data.session) {
      // Las cookies se guardan automáticamente por el storage personalizado
      return redirect(safePath)
    }
  } catch (error) {
    console.error('Unexpected error in OAuth callback:', error)
    return redirect(`/registro?error=auth_failed`)
  }

  return redirect(safePath)
}
