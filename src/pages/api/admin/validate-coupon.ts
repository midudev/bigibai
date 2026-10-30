import type { APIRoute } from 'astro'
import { supabaseAdmin } from '@/supabase-admin'
import { isAdmin } from '@/utils/admin'
import { hashCoupon } from '@/utils/crypto'
import { normalizeCoupon } from '@/utils/coupon'

export const POST: APIRoute = async ({ request, locals }) => {
  // Verificar autenticación
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'No autenticado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verificar que sea admin
  if (!isAdmin(locals.user.id)) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = await request.json().catch(() => null)
  const couponCode = typeof body?.coupon === 'string' ? normalizeCoupon(body.coupon) : ''

  if (!couponCode) {
    return new Response(JSON.stringify({ error: 'Cupón no proporcionado' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const couponHash = hashCoupon(couponCode)
    
    // Buscar el cupón por hash exacto o como duplicado
    // Primero intentamos con el hash exacto
    let { data: coupon, error: couponError } = await supabaseAdmin
      .from('coupons')
      .select('id, hash, is_used, used_at, used_by, used_ip, is_reactivable')
      .eq('hash', couponHash)
      .single()

    // Si el cupón no existe, devolver error
    if (couponError || !coupon) {
      return new Response(JSON.stringify({ error: 'Cupón no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Si el cupón no ha sido usado, devolver solo la info básica
    if (!coupon?.is_used) {
      return new Response(
        JSON.stringify({
          id: coupon.id,
          hash: coupon.hash,
          is_used: false,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Si el cupón ha sido usado, buscar si tiene un segundo uso
    const duplicateHash = `${couponHash}_1`
    const { data: duplicateCoupon, error: duplicateError } = await supabaseAdmin
      .from('coupons')
      .select('id, hash, is_used, used_at, used_by, used_ip')
      .eq('hash', duplicateHash)
      .single()

    // Si el cupón ha sido usado, obtener información del usuario
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(
      coupon.used_by
    )

    const userData = {
      user_email: user?.user?.email || null,
      user_name:
        user?.user?.user_metadata?.full_name ||
        user?.user?.user_metadata?.name ||
        user?.user?.user_metadata?.display_name ||
        null,
    }

    let duplicateUserData = {}

    if (duplicateCoupon) {
      // si el cupon ha sido usado por el duplicado, entonces recuperamos ese usuario también
      const { data: duplicateUser } = await supabaseAdmin.auth.admin.getUserById(
        duplicateCoupon.used_by
      )

      duplicateUserData = {
        user_email: duplicateUser?.user?.email || null,
        user_name:
          duplicateUser?.user?.user_metadata?.full_name ||
          duplicateUser?.user?.user_metadata?.name ||
          duplicateUser?.user?.user_metadata?.display_name ||
          null,
      }
    }

    return new Response(
      JSON.stringify({
        id: coupon.id,
        hash: coupon.hash,
        is_used: true,
        used_at: coupon.used_at,
        used_by: coupon.used_by,
        used_ip: coupon.used_ip,
        is_reactivable: coupon.is_reactivable || false,
        is_duplicate: !!duplicateCoupon,
        ...userData,
        duplicate_usage: {
          id: duplicateCoupon?.id || null,
          hash: duplicateCoupon?.hash || null,
          is_used: duplicateCoupon?.is_used || false,
          used_at: duplicateCoupon?.used_at || null,
          used_by: duplicateCoupon?.used_by || null,
          used_ip: duplicateCoupon?.used_ip || null,
          ...duplicateUserData,
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error al validar cupón:', error)
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
