import { ONE_NEAR } from './near'

export function yoctoToNear(yocto: string | bigint, digits = 2): string {
  const v = typeof yocto === 'bigint' ? yocto : BigInt(yocto || '0')
  const neg = v < 0n
  const abs = neg ? -v : v
  const whole = abs / ONE_NEAR
  const frac = abs % ONE_NEAR
  const fracStr = frac.toString().padStart(24, '0').slice(0, digits)
  const wholeStr = whole.toLocaleString('en-US')
  const out = digits > 0 ? `${wholeStr}.${fracStr}` : wholeStr
  return (neg ? '-' : '') + out
}

export function yoctoToNumber(yocto: string | bigint): number {
  const v = typeof yocto === 'bigint' ? yocto : BigInt(yocto || '0')
  return Number(v / 10n ** 18n) / 1e6
}

/** Parse a human NEAR amount ("2.5") into yoctoNEAR. Returns null if invalid. */
export function nearToYocto(input: string): bigint | null {
  const s = input.trim()
  if (!/^\d+(\.\d{0,24})?$/.test(s)) return null
  const [w, f = ''] = s.split('.')
  return BigInt(w) * ONE_NEAR + BigInt(f.padEnd(24, '0'))
}

export function usd(n: number): string {
  if (!isFinite(n)) return '$—'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n >= 1000 ? 0 : 2 })
}

export function nanoToDate(ns: string | number): Date {
  return new Date(Number(BigInt(ns) / 1_000_000n))
}

export function timeAgo(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const days = Math.round(h / 24)
  if (days < 30) return `${days} d ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "noor.grapevine-hq.testnet" -> "noor" for display; full id stays in title attributes. */
export function shortName(accountId: string): string {
  if (/^[0-9a-f]{64}$/.test(accountId)) return accountId.slice(0, 6) + '…' + accountId.slice(-4)
  return accountId.split('.')[0]
}
