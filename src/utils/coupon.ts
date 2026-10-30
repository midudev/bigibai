const COUPON_CHARS = '[A-HJ-NP-Z1-9]'
const COUPON_PATTERN = new RegExp(`^${COUPON_CHARS}{4}-${COUPON_CHARS}{4}-${COUPON_CHARS}{4}$`)

export function normalizeCoupon(coupon: string): string {
  const chars = coupon
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/I/g, '1')

  if (chars.length !== 12) return chars

  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`
}

export function isValidCouponFormat(coupon: string): boolean {
  return COUPON_PATTERN.test(coupon)
}
