import { ONE_NEAR } from './near'
import { formatDate, formatRelative, getLocale } from '../i18n'

/**
 * Display a yoctoNEAR amount, grouped and with the decimal mark of the current language.
 * Pass `onChain = true` for text that is written to the chain (proposal descriptions): that stays en-US.
 */
export function yoctoToNear(yocto: string | bigint, digits = 2, onChain = false): string {
  const v = typeof yocto === 'bigint' ? yocto : BigInt(yocto || '0')
  const neg = v < 0n
  const abs = neg ? -v : v
  const whole = abs / ONE_NEAR
  const frac = abs % ONE_NEAR
  const fracStr = frac.toString().padStart(24, '0').slice(0, digits)
  const lang = onChain ? 'en-US' : getLocale()
  const wholeStr = whole.toLocaleString(lang)
  const dec = onChain ? '.' : (new Intl.NumberFormat(lang).formatToParts(1.5).find((p) => p.type === 'decimal')?.value ?? '.')
  const out = digits > 0 ? `${wholeStr}${dec}${fracStr}` : wholeStr
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
  return n.toLocaleString(getLocale(), { style: 'currency', currency: 'USD', maximumFractionDigits: n >= 1000 ? 0 : 2 })
}

export function nanoToDate(ns: string | number): Date {
  return new Date(Number(BigInt(ns) / 1_000_000n))
}

/** "just now", "3 min ago", "vor 3 Min." … then a short date after 30 days. */
export function timeAgo(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000)
  if (s < 60) return formatRelative(0, 'second')
  const m = Math.round(s / 60)
  if (m < 60) return formatRelative(-m, 'minute')
  const h = Math.round(m / 60)
  if (h < 24) return formatRelative(-h, 'hour')
  const days = Math.round(h / 24)
  if (days < 30) return formatRelative(-days, 'day')
  return formatDate(d)
}

/** "noor.grapevine-hq.testnet" -> "noor" for display; full id stays in title attributes. */
export function shortName(accountId: string): string {
  if (/^[0-9a-f]{64}$/.test(accountId)) return accountId.slice(0, 6) + '…' + accountId.slice(-4)
  return accountId.split('.')[0]
}

/** "$1,240.00" → ["$1,240", ".00"] (or "1.240" / ",00 $" in German), so cents can be muted. */
export function splitUsd(n: number): [string, string] {
  if (!isFinite(n)) return ['$—', '']
  const parts = new Intl.NumberFormat(getLocale(), { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(n)
  const i = parts.findIndex((p) => p.type === 'decimal')
  if (i < 0) return [parts.map((p) => p.value).join(''), '']
  return [parts.slice(0, i).map((p) => p.value).join(''), parts.slice(i).map((p) => p.value).join('')]
}

