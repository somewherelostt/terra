import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadDao, type Dao } from './dao'
import { invalidateActivity, loadActivity, type ActivityResult } from './activity'
import { getNearUsdPrice } from './intents'
import { computeRecords, type MemberRecord } from './record'

export const DEMO_DAO = import.meta.env.VITE_DEMO_DAO || 'riverside-coop.sputnikv2.testnet'
export const STAKING_POOL = import.meta.env.VITE_STAKING_POOL || 'aurora.pool.f863973.m0'

// ---------- tiny router: ?dao=<id>#/<page> ----------

export type Page = 'home' | 'pay' | 'approve' | 'members' | 'activity' | 'board' | 'earn' | 'create' | 'signin'
const PAGES: Page[] = ['home', 'pay', 'approve', 'members', 'activity', 'board', 'earn', 'create', 'signin']

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

interface DaoState {
  dao: Dao | null
  activity: ActivityResult | null
  records: Map<string, MemberRecord>
  nearUsd: number
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

// eslint-disable-next-line react-refresh/only-export-components
export const DaoContext = createContext<DaoState | null>(null)

export function DaoProvider({ daoId, children }: { daoId: string | null; children: ReactNode }) {
  const [dao, setDao] = useState<Dao | null>(null)
  const [activity, setActivity] = useState<ActivityResult | null>(null)
  const [nearUsd, setNearUsd] = useState(NaN)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getNearUsdPrice().then(setNearUsd).catch(() => setNearUsd(NaN))
  }, [])

  const refresh = useCallback(async () => {
    if (!daoId) return
    setLoading(true)
    setError(null)
    invalidateActivity(daoId)
    try {
      const d = await loadDao(daoId, STAKING_POOL)
      setDao(d)
      setLoading(false)
      loadActivity(d).then(setActivity).catch(() => setActivity(null))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setLoading(false)
    }
  }, [daoId])

  useEffect(() => {
    setDao(null)
    setActivity(null)
    refresh()
  }, [refresh])

  const records = useMemo(() => (dao ? computeRecords(dao, activity?.items ?? []) : new Map()), [dao, activity])

  const value = useMemo(
    () => ({ dao, activity, records, nearUsd, loading, error, refresh }),
    [dao, activity, records, nearUsd, loading, error, refresh],
  )
  return <DaoContext.Provider value={value}>{children}</DaoContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDao(): DaoState {
  const ctx = useContext(DaoContext)
  if (!ctx) throw new Error('useDao outside DaoProvider')
  return ctx
}
