// Tiny in-house i18n: flat JSON catalogs (one per locale in ./locales), English bundled,
// every other locale lazy-loaded on demand. `t(key, vars)` returns a string; `tr(key, vars)`
// returns React nodes so a translation can wrap parts of itself in elements (<b>…</b>).
// Components call `useT()` so they re-render when the language changes.
//
// Catalog rules (checked by scripts/i18n-check.mjs):
//  - keys are flat and dotted: "footer.tagline"
//  - placeholders are {name}; rich-text tags are <name>…</name> (no nesting)
//  - plurals: "key_one", "key_other" (plus "_zero", "_two", "_few", "_many" where a language has them),
//    picked by Intl.PluralRules from vars.count
import { Fragment, useSyncExternalStore, type ReactNode } from 'react'
import en from './locales/en.json'

export type Catalog = Record<string, string>
type Vars = Record<string, string | number>
type RichVars = Record<string, ReactNode | ((chunk: ReactNode) => ReactNode)>

export type Locale = { code: string; name: string; english: string; dir?: 'rtl' }

/** Shown in the pickers in this order. Names are written in their own language. */
export const LOCALES: Locale[] = [
  { code: 'en', name: 'English', english: 'English' },
  { code: 'es', name: 'Español', english: 'Spanish' },
  { code: 'pt-BR', name: 'Português (Brasil)', english: 'Portuguese (Brazil)' },
  { code: 'fr', name: 'Français', english: 'French' },
  { code: 'de', name: 'Deutsch', english: 'German' },
  { code: 'tr', name: 'Türkçe', english: 'Turkish' },
  { code: 'id', name: 'Bahasa Indonesia', english: 'Indonesian' },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi' },
  { code: 'ar', name: 'العربية', english: 'Arabic', dir: 'rtl' },
  { code: 'zh-CN', name: '简体中文', english: 'Chinese (Simplified)' },
  { code: 'ja', name: '日本語', english: 'Japanese' },
  { code: 'ko', name: '한국어', english: 'Korean' },
]

const STORAGE = 'terra:lang'
const loaders = import.meta.glob<{ default: Catalog }>(['./locales/*.json', '!./locales/en.json'])
/** Only languages that have a catalog are offered. */
export const AVAILABLE: Locale[] = LOCALES.filter((l) => l.code === 'en' || `./locales/${l.code}.json` in loaders)
const CODES = AVAILABLE.map((l) => l.code)

let locale = 'en'
let catalog: Catalog = en as Catalog
const listeners = new Set<() => void>()
const cache: Record<string, Catalog> = { en: en as Catalog }

/** Match "pt", "pt-PT", "zh-Hans-CN", "en-GB"… to one of ours. */
export function matchLocale(input: string | null | undefined): string | null {
  if (!input) return null
  const want = input.toLowerCase()
  const exact = CODES.find((c) => c.toLowerCase() === want)
  if (exact) return exact
  const base = want.split('-')[0]
  return CODES.find((c) => c.toLowerCase().split('-')[0] === base) ?? null
}

function urlLang(): string | null {
  try {
    const url = new URL(window.location.href)
    const hashQuery = url.hash.split('?')[1] ?? ''
    return url.searchParams.get('lang') ?? new URLSearchParams(hashQuery).get('lang')
  } catch {
    return null
  }
}

/** ?lang= first, then the saved choice, then the browser's languages, then English. */
export function detectLocale(): string {
  const fromUrl = matchLocale(urlLang())
  if (fromUrl) return fromUrl
  try {
    const saved = matchLocale(localStorage.getItem(STORAGE))
    if (saved) return saved
  } catch {
    /* storage unavailable */
  }
  for (const l of navigator.languages ?? [navigator.language]) {
    const m = matchLocale(l)
    if (m) return m
  }
  return 'en'
}

async function load(code: string): Promise<Catalog> {
  if (cache[code]) return cache[code]
  const loader = loaders[`./locales/${code}.json`]
  if (!loader) return cache.en
  cache[code] = (await loader()).default
  return cache[code]
}

function applyDocument(code: string) {
  const el = document.documentElement
  el.lang = code
  el.dir = LOCALES.find((l) => l.code === code)?.dir ?? 'ltr'
}

/** Call once before the first render, so the first paint is already in the right language. */
export async function initI18n(): Promise<void> {
  const code = detectLocale()
  try {
    catalog = await load(code)
    locale = code
  } catch {
    locale = 'en'
    catalog = cache.en
  }
  applyDocument(locale)
}

/** Switch language: loads the catalog, remembers it, updates <html lang dir> and any ?lang= in the URL. */
export async function setLocale(code: string): Promise<void> {
  const next = matchLocale(code) ?? 'en'
  catalog = await load(next)
  locale = next
  applyDocument(next)
  try {
    localStorage.setItem(STORAGE, next)
  } catch {
    /* storage unavailable */
  }
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.has('lang')) {
      url.searchParams.set('lang', next)
      window.history.replaceState(window.history.state, '', url)
    }
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f())
}

export function getLocale(): string {
  return locale
}

export function isRtl(): boolean {
  return LOCALES.find((l) => l.code === locale)?.dir === 'rtl'
}

function subscribe(f: () => void) {
  listeners.add(f)
  return () => {
    listeners.delete(f)
  }
}

/** Re-renders the caller when the language changes; returns the current locale code. */
export function useLocale(): string {
  return useSyncExternalStore(subscribe, getLocale, getLocale)
}

/** Use in components: `const t = useT()`. Same function as the exported `t`, plus a re-render on change. */
export function useT(): typeof t {
  useLocale()
  return t
}

function pick(key: string, vars?: Vars | RichVars): string {
  const count = vars && typeof vars.count === 'number' ? vars.count : null
  if (count !== null) {
    const rule = new Intl.PluralRules(locale).select(count)
    const k = count === 0 && catalog[`${key}_zero`] !== undefined ? `${key}_zero` : `${key}_${rule}`
    return catalog[k] ?? catalog[`${key}_other`] ?? cache.en[`${key}_${new Intl.PluralRules('en').select(count)}`] ?? cache.en[`${key}_other`] ?? key
  }
  return catalog[key] ?? cache.en[key] ?? key
}

/** Translate `key`, filling {placeholders}. Numbers are formatted for the current locale. */
export function t(key: string, vars?: Vars): string {
  const s = pick(key, vars)
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = vars[name]
    if (v === undefined) return m
    return typeof v === 'number' ? formatNumber(v) : String(v)
  })
}

/**
 * Rich translate: `tr('x', { b: (c) => <b>{c}</b>, name: <Account id={id} /> })`.
 * `<b>…</b>` in the string calls vars.b with the inner text; `{name}` inserts vars.name.
 */
export function tr(key: string, vars: RichVars & { count?: number }): ReactNode {
  const s = pick(key, vars as Vars)
  const out: ReactNode[] = []
  const re = /<(\w+)>(.*?)<\/\1>|\{(\w+)\}/gs
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (mm, n: string) => {
    const v = vars[n]
    return typeof v === 'string' ? v : typeof v === 'number' ? formatNumber(v) : mm
  })
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    if (m[1]) {
      const f = vars[m[1]]
      const inner = fill(m[2])
      out.push(<Fragment key={i++}>{typeof f === 'function' ? f(inner) : inner}</Fragment>)
    } else {
      const v = vars[m[3]]
      out.push(<Fragment key={i++}>{typeof v === 'number' ? formatNumber(v) : typeof v === 'function' ? m[0] : (v ?? m[0])}</Fragment>)
    }
    last = re.lastIndex
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

// ---------- Intl helpers ----------

export function formatNumber(n: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, opts).format(n)
}

export function formatDate(d: Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  return new Intl.DateTimeFormat(locale, opts).format(d)
}

/** "3 min ago", "vor 3 Min.", "منذ 3 دقائق"… */
export function formatRelative(value: number, unit: Intl.RelativeTimeFormatUnit): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }).format(value, unit)
}

/** "German", "Allemand"… the name of a language in the current language. */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}
