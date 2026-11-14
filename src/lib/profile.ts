// Member profiles: the standard NEAR Social profile (profile/name, profile/description,
// profile/linktree/*), so a name set in Terra shows up in every NEAR app, and vice versa.
// Reads are batched into one SocialDB `get` per render pass and cached; writes are signed
// by the member and only touch the fields they changed.

import { useEffect, useReducer } from 'react'
import { ONE_NEAR, TGAS, view } from './near'
import { SOCIAL_CONTRACT, type AvatarChoice } from './avatar'
import { shortName } from './format'
import type { Tx } from './dao'

export const NAME_MAX = 40
export const BIO_MAX = 160
export const LINK_KEYS = ['twitter', 'github', 'website', 'telegram'] as const
export type LinkKey = (typeof LINK_KEYS)[number]

export interface Profile {
  name?: string
  description?: string
  linktree: Partial<Record<LinkKey, string>>
}

export const LINK_LABELS: Record<LinkKey, string> = { twitter: 'X', github: 'GitHub', website: 'Website', telegram: 'Telegram' }

// ---------- links: accept https URLs or handles, store handles (the NEAR Social convention) ----------

const HANDLE: Record<Exclude<LinkKey, 'website'>, { re: RegExp; hosts: string[]; url: (h: string) => string }> = {
  twitter: { re: /^[A-Za-z0-9_]{1,15}$/, hosts: ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'], url: (h) => `https://x.com/${h}` },
  github: { re: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, hosts: ['github.com', 'www.github.com'], url: (h) => `https://github.com/${h}` },
  telegram: { re: /^[A-Za-z0-9_]{4,32}$/, hosts: ['t.me', 'telegram.me', 'www.t.me'], url: (h) => `https://t.me/${h}` },
}
const HOST = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

/** Turn what a member typed into the stored value, or an error. Empty input means "no link". */
export function normalizeLink(key: LinkKey, input: string): { value: string } | { error: string } {
  const s = input.trim()
  if (!s) return { value: '' }
  if (key === 'website') {
    let u: URL
    try {
      u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`)
    } catch {
      return { error: 'Use an https:// address.' }
    }
    if (u.protocol !== 'https:' || !HOST.test(u.hostname) || u.username || u.password) return { error: 'Use an https:// address.' }
    const rest = (u.pathname === '/' ? '' : u.pathname) + u.search
    return { value: `${u.hostname}${rest}`.slice(0, 200) }
  }
  const h = HANDLE[key]
  let handle = s.replace(/^@/, '')
  if (/^[a-z]+:\/\//i.test(s)) {
    let u: URL
    try {
      u = new URL(s)
    } catch {
      return { error: 'Use a handle or an https:// link.' }
    }
    if (u.protocol !== 'https:' || !h.hosts.includes(u.hostname.toLowerCase())) return { error: `Use a handle or an https://${h.hosts[0]}/… link.` }
    handle = u.pathname.split('/').filter(Boolean)[0] ?? ''
  }
  if (!h.re.test(handle)) return { error: 'That handle looks wrong.' }
  return { value: handle }
}

/** A safe https URL for a stored link value, or null if it doesn't validate (data from other apps is untrusted). */
export function linkUrl(key: LinkKey, stored: string | undefined): string | null {
  if (!stored) return null
  const n = normalizeLink(key, stored)
  if ('error' in n || !n.value) return null
  return key === 'website' ? `https://${n.value}` : HANDLE[key].url(n.value)
}

export function linkText(key: LinkKey, stored: string): string {
  const n = normalizeLink(key, stored)
  if ('error' in n) return stored
  return key === 'website' ? n.value.replace(/\/$/, '') : `@${n.value}`
}

function clean(s: unknown, max: number): string | undefined {
  if (typeof s !== 'string') return undefined
  // eslint-disable-next-line no-control-regex
  const t = s.replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : undefined
}

interface RawProfile {
  profile?: { name?: unknown; description?: unknown; linktree?: Record<string, unknown> }
}

function parse(raw: RawProfile | undefined): Profile {
  const p = raw?.profile
  const linktree: Profile['linktree'] = {}
  for (const k of LINK_KEYS) {
    const v = p?.linktree?.[k]
    if (typeof v === 'string' && v.trim()) linktree[k] = v.trim().slice(0, 200)
  }
  return { name: clean(p?.name, NAME_MAX), description: clean(p?.description, 600), linktree }
}

// ---------- batched reads with a shared cache ----------

const TTL = 5 * 60_000
const STORE_KEY = 'terra:profiles:v1'
const cache = new Map<string, { p: Profile; at: number }>()
const pending = new Set<string>()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null

// Names from the last visit show instantly; a fresh read replaces them.
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, Profile>
  for (const [id, p] of Object.entries(saved)) cache.set(id, { p: { ...p, linktree: p.linktree ?? {} }, at: 0 })
} catch {
  /* storage unavailable */
}

function persist() {
  try {
    const out: Record<string, Profile> = {}
    for (const [id, v] of cache) if (v.p.name || v.p.description || Object.keys(v.p.linktree).length) out[id] = v.p
    localStorage.setItem(STORE_KEY, JSON.stringify(out))
  } catch {
    /* ignore */
  }
}

// Dev only: log SocialDB profile reads, to check they're batched (window.__terraProfileReads).
function countRead(ids: string[]) {
  if (import.meta.env.DEV) {
    const w = window as unknown as { __terraProfileReads?: string[][] }
    ;(w.__terraProfileReads ??= []).push(ids)
  }
}

function keysFor(id: string) {
  return [`${id}/profile/name`, `${id}/profile/description`, `${id}/profile/linktree/**`]
}

async function flush() {
  timer = null
  const ids = [...pending]
  pending.clear()
  if (!ids.length) return
  try {
    countRead(ids)
    const data = await view<Record<string, RawProfile>>(SOCIAL_CONTRACT, 'get', { keys: ids.flatMap(keysFor) })
    const now = Date.now()
    for (const id of ids) cache.set(id, { p: parse(data?.[id]), at: now })
    persist()
  } catch {
    // Keep whatever we had; try again on the next request.
    for (const id of ids) if (!cache.has(id)) cache.set(id, { p: { linktree: {} }, at: Date.now() - TTL + 15_000 })
  }
  listeners.forEach((l) => l())
}

function fresh(id: string) {
  const hit = cache.get(id)
  return !!hit && Date.now() - hit.at < TTL
}

function request(id: string, force = false) {
  if (!id || pending.has(id)) return
  if (!force && fresh(id)) return
  pending.add(id)
  if (!timer) timer = setTimeout(flush, 30)
}

/**
 * Every member of the group in one `get` call. If any member is missing or stale,
 * the whole group is read together (rather than topping up one by one).
 */
export function prefetchProfiles(ids: Iterable<string>) {
  const list = [...new Set(ids)]
  const force = list.some((id) => !fresh(id) && !pending.has(id))
  if (force) for (const id of list) request(id, true)
}

export function invalidateProfile(id: string) {
  cache.delete(id)
  request(id)
}

function useProfilesVersion() {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    listeners.add(bump)
    return () => {
      listeners.delete(bump)
    }
  }, [])
}

export function getProfile(id: string): Profile | undefined {
  return cache.get(id)?.p
}

/** Display name if set, else the short account id. Also queues a read if this id isn't cached. */
export function displayName(id: string): string {
  if (!id) return ''
  request(id)
  return cache.get(id)?.p.name || shortName(id)
}

/** One member's profile (undefined until the first read lands). */
export function useProfile(id: string | null | undefined): Profile | undefined {
  useProfilesVersion()
  useEffect(() => {
    if (id) request(id)
  }, [id])
  return id ? getProfile(id) : undefined
}

/**
 * A `name(id)` function for pages that print many members in strings:
 * display name if set, else the short account id. Re-renders when names arrive.
 */
export function useNames(): (id: string | null | undefined) => string {
  useProfilesVersion()
  return (id) => (id ? displayName(id) : '')
}

// ---------- write ----------

export interface ProfileDraft {
  name: string
  description: string
  linktree: Record<LinkKey, string>
  avatar?: AvatarChoice | null
}

/** Read straight from the chain (no cache): the form's starting point and the save's read-back. */
export async function readProfileFresh(id: string): Promise<{ profile: Profile; avatar: string | null }> {
  const data = await view<Record<string, RawProfile & { terra?: { avatar?: string } }>>(SOCIAL_CONTRACT, 'get', {
    keys: [...keysFor(id), `${id}/terra/avatar`],
  })
  return { profile: parse(data?.[id]), avatar: data?.[id]?.terra?.avatar ?? null }
}

type Patch = { profile?: Record<string, unknown>; terra?: { avatar: string } }

/** Only the fields that differ from what's on chain. null deletes a field in SocialDB. */
export function diffProfile(before: Profile, beforeAvatar: string | null, draft: ProfileDraft): Patch {
  const profile: Record<string, unknown> = {}
  const name = clean(draft.name, NAME_MAX) ?? ''
  const desc = clean(draft.description, BIO_MAX) ?? ''
  if (name !== (before.name ?? '')) profile.name = name || null
  if (desc !== (before.description ?? '')) profile.description = desc || null
  const lt: Record<string, string | null> = {}
  for (const k of LINK_KEYS) {
    const v = draft.linktree[k]?.trim() ?? ''
    const was = before.linktree[k] ?? ''
    const wasNorm = (() => {
      const n = normalizeLink(k, was)
      return 'value' in n ? n.value : was
    })()
    // Untouched links stay as they are, even if another app stored them in a different shape.
    if (v !== was && v !== wasNorm) lt[k] = v || null
  }
  if (Object.keys(lt).length) profile.linktree = lt
  const patch: Patch = {}
  if (Object.keys(profile).length) patch.profile = profile
  if (draft.avatar) {
    const a = JSON.stringify(draft.avatar)
    if (a !== beforeAvatar) patch.terra = { avatar: a }
  }
  return patch
}

export function isEmptyPatch(p: Patch) {
  return !p.profile && !p.terra
}

/** Does what's on chain now match the patch we sent? */
export function patchLanded(after: { profile: Profile; avatar: string | null }, patch: Patch): boolean {
  const p = patch.profile as { name?: string | null; description?: string | null; linktree?: Record<string, string | null> } | undefined
  if (p?.name !== undefined && (after.profile.name ?? null) !== (p.name ?? null)) return false
  if (p?.description !== undefined && (after.profile.description ?? null) !== (p.description ?? null)) return false
  for (const [k, v] of Object.entries(p?.linktree ?? {})) if ((after.profile.linktree[k as LinkKey] ?? null) !== (v ?? null)) return false
  if (patch.terra && after.avatar !== patch.terra.avatar) return false
  return true
}

/**
 * The signed SocialDB `set`. Adds a storage deposit only when the member's SocialDB
 * storage can't hold the new bytes (rough estimate: payload plus per-key overhead).
 */
export async function saveProfileTx(accountId: string, patch: Patch): Promise<{ tx: Tx; deposit: bigint }> {
  const data = { [accountId]: patch }
  const bytes = new TextEncoder().encode(JSON.stringify(data)).length
  const keys = JSON.stringify(patch).split(':').length
  const need = BigInt(bytes + keys * 60 + 200)
  const perByte = 10n ** 19n
  let deposit = 0n
  try {
    const st = await view<{ used_bytes: number; available_bytes: number } | null>(SOCIAL_CONTRACT, 'get_account_storage', { account_id: accountId })
    if (!st) deposit = maxBig(ONE_NEAR / 20n, need * perByte) // first write: 0.05 NEAR covers ~5 kB
    else if (BigInt(st.available_bytes) < need) deposit = maxBig(ONE_NEAR / 100n, (need - BigInt(st.available_bytes) + 500n) * perByte)
  } catch {
    deposit = ONE_NEAR / 20n
  }
  return {
    deposit,
    tx: {
      receiverId: SOCIAL_CONTRACT,
      actions: [
        {
          type: 'FunctionCall',
          params: { methodName: 'set', args: { data }, gas: (100n * TGAS).toString(), deposit: deposit.toString() },
        },
      ],
    },
  }
}

function maxBig(a: bigint, b: bigint) {
  return a > b ? a : b
}

/** Cache the saved profile right away, so names update everywhere before the next read. */
export function rememberSaved(id: string, p: Profile) {
  cache.set(id, { p, at: Date.now() })
  persist()
  listeners.forEach((l) => l())
}
