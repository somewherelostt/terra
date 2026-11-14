import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { loadDao, type Dao } from './dao'
import { invalidateActivity, loadActivity, type ActivityResult } from './activity'
import { getNearUsdPrice } from './intents'
import { computeRecords, type MemberRecord } from './record'
import { t } from '../i18n'

export const DEMO_DAO = import.meta.env.VITE_DEMO_DAO || 'nearhack-community.sputnikv2.testnet'
export const STAKING_POOL = import.meta.env.VITE_STAKING_POOL || 'aurora.pool.f863973.m0'

// ---------- tiny router: ?dao=<id>#/<page> ----------

export type Page = 'home' | 'pay' | 'approve' | 'members' | 'activity' | 'board' | 'earn' | 'create' | 'signin' | 'join' | 'allowances' | 'messages' | 'docs'
const PAGES: Page[] = ['home', 'pay', 'approve', 'members', 'activity', 'board', 'earn', 'create', 'signin', 'join', 'allowances', 'messages', 'docs']

function readRoute(): { page: Page; daoId: string | null; params: URLSearchParams } {
  const url = new URL(window.location.href)
  const hash = url.hash.replace(/^#\/?/, '')
  const [path, query = ''] = hash.split('?')
  const page = (PAGES as string[]).includes(path) ? (path as Page) : 'home'
  return { page, daoId: url.searchParams.get('dao'), params: new URLSearchParams(query) }
}

export function useRoute() {
  const [route, setRoute] = useState(readRoute)
  useEffect(() => {
    const on = () => setRoute(readRoute())
    window.addEventListener('hashchange', on)
    window.addEventListener('popstate', on)
    return () => {
      window.removeEventListener('hashchange', on)
      window.removeEventListener('popstate', on)
    }
  }, [])
  return route
}

export function go(page: Page, query?: Record<string, string>) {
  const q = query ? '?' + new URLSearchParams(query).toString() : ''
  window.location.hash = `/${page}${q}`
}

export function openDao(daoId: string | null, page: Page = 'home') {
  const url = new URL(window.location.href)
  if (daoId) url.searchParams.set('dao', daoId)
  else url.searchParams.delete('dao')
  url.hash = `/${page}`
  window.history.pushState({}, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
  try {
    if (daoId) localStorage.setItem('terra:lastDao', daoId)
  } catch {
    /* storage unavailable */
  }
}

export function lastDao(): string | null {
  try {
    return localStorage.getItem('terra:lastDao')
  } catch {
    return null
  }
}

export function shareUrl(daoId: string, page: Page = 'board', query?: Record<string, string>): string {
  const url = new URL(window.location.origin + window.location.pathname)
  url.searchParams.set('dao', daoId)
  url.hash = `/${page}${query ? '?' + new URLSearchParams(query).toString() : ''}`
  return url.toString()
}

// ---------- DAO data ----------

/** RPC errors in plain words for someone who typed or followed a treasury link. */
function friendlyLoadError(daoId: string, msg: string): string {
  if (/does not exist|UNKNOWN_ACCOUNT|not found/i.test(msg)) return t('store.noAccount', { id: daoId })
  if (/CodeDoesNotExist|MethodNotFound|MethodResolveError/i.test(msg)) return t('store.notDao', { id: daoId })
  return msg
}

/** Live payout tracker shown on a request card after "Approve and pay". */
export interface TrackStep {
  label: string
  done: boolean
  at?: string
  hash?: string
}
export interface Track {
  steps: TrackStep[]
  eta: string
  finished: boolean
  paid: boolean
  bubble?: string
}

interface DaoState {
  dao: Dao | null
  activity: ActivityResult | null
  records: Map<string, MemberRecord>
  nearUsd: number
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  tracks: Record<number, Track>
  setTrack: (id: number, t: Track | null) => void
}

// eslint-disable-next-line react-refresh/only-export-components
export const DaoContext = createContext<DaoState | null>(null)

// ---------- last-seen snapshot ----------
// The last copy of each group (and its activity) is kept in this browser, so opening a group or
// its board paints at once and refreshes from NEAR in the background. A week old at most.
const SNAP_MAX_AGE = 7 * 24 * 3600 * 1000
const snapKey = (kind: 'dao' | 'act', id: string) => `terra:snap:${kind}:${id}`
function writeSnap(kind: 'dao' | 'act', id: string, value: unknown) {
  try {
    const json = JSON.stringify({ v: 1, at: Date.now(), value }, (_k, v) =>
      typeof v === 'bigint' ? { __big: v.toString() } : v instanceof Map ? { __map: [...v] } : v,
    )
    if (json.length < 1_500_000) localStorage.setItem(snapKey(kind, id), json)
  } catch {
    /* storage full or unavailable: the snapshot is only a speed-up */
  }
}
function readSnap<T>(kind: 'dao' | 'act', id: string, dates = false): T | null {
  try {
    const raw = localStorage.getItem(snapKey(kind, id))
    if (!raw) return null
    const o = JSON.parse(raw, (k, v) => {
      if (v && typeof v === 'object' && typeof v.__big === 'string') return BigInt(v.__big)
      if (v && typeof v === 'object' && Array.isArray(v.__map)) return new Map(v.__map)
      if (dates && k === 'time' && typeof v === 'string') return new Date(v)
      return v
    })
    if (o?.v !== 1 || Date.now() - o.at > SNAP_MAX_AGE) return null
    return o.value as T
  } catch {
    return null
  }
}
function readPrice(): number {
  try {
    const o = JSON.parse(localStorage.getItem('terra:nearUsd') ?? 'null')
    return o && Date.now() - o.at < 3600 * 1000 && isFinite(o.v) ? o.v : NaN
  } catch {
    return NaN
  }
}

export function DaoProvider({ daoId, children }: { daoId: string | null; children: ReactNode }) {
  const [dao, setDao] = useState<Dao | null>(null)
  const [activity, setActivity] = useState<ActivityResult | null>(null)
  const [nearUsd, setNearUsd] = useState(readPrice)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tracks, setTracks] = useState<Record<number, Track>>({})
  const setTrack = useCallback((id: number, t: Track | null) => {
    setTracks((all) => {
      const next = { ...all }
      if (t) next[id] = t
      else delete next[id]
      return next
    })
  }, [])

  useEffect(() => {
    getNearUsdPrice()
      .then((v) => {
        setNearUsd(v)
        try {
          localStorage.setItem('terra:nearUsd', JSON.stringify({ v, at: Date.now() }))
        } catch {
          /* ignore */
        }
      })
      .catch(() => setNearUsd((p) => p))
  }, [])

  const loadedFor = useRef<string | null>(null)
  const hasData = useRef(false)
  const loadSeq = useRef(0)
  const refresh = useCallback(async () => {
    if (!daoId) return
    setLoading(true)
    setError(null)
    // The first load may use the short-lived cache; later refreshes follow a transaction.
    if (loadedFor.current === daoId) invalidateActivity(daoId)
    loadedFor.current = daoId
    // Only the newest load may land: after a group switch, a slower read of the previous group
    // must not replace the group now on screen.
    const seq = ++loadSeq.current
    const current = () => seq === loadSeq.current
    try {
      const d = await loadDao(daoId, STAKING_POOL)
      if (!current()) return
      setDao(d)
      hasData.current = true
      setLoading(false)
      writeSnap('dao', daoId, d)
      // Saved at every stage, so even the first, payouts-only paint is ready next time.
      loadActivity(d, (r) => {
        writeSnap('act', daoId, r)
        if (current()) setActivity(r)
      }).catch(() => undefined)
    } catch (e) {
      if (!current()) return
      // With a recent snapshot on screen, a failed refresh keeps it rather than blanking the page.
      if (!hasData.current) setError(friendlyLoadError(daoId, e instanceof Error ? e.message : String(e)))
      setLoading(false)
    }
  }, [daoId])

  useEffect(() => {
    const snap = daoId ? readSnap<Dao>('dao', daoId) : null
    const act = daoId && snap ? readSnap<ActivityResult>('act', daoId, true) : null
    hasData.current = !!snap
    setDao(snap)
    setActivity(act)
    refresh()
  }, [daoId, refresh])

  // Dev builds only: lets the motion be checked in the browser without signing.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __terra?: unknown }).__terra = { setTrack, refresh }
  }, [setTrack, refresh])

  const records = useMemo(() => (dao ? computeRecords(dao, activity?.items ?? []) : new Map()), [dao, activity])

  const value = useMemo(
    () => ({ dao, activity, records, nearUsd, loading, error, refresh, tracks, setTrack }),
    [dao, activity, records, nearUsd, loading, error, refresh, tracks, setTrack],
  )
  return <DaoContext.Provider value={value}>{children}</DaoContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDao(): DaoState {
  const ctx = useContext(DaoContext)
  if (!ctx) throw new Error('useDao outside DaoProvider')
  return ctx
}
