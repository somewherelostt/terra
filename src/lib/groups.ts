// "My groups": every group a person belongs to or has opened, one click to switch.
//
// Sources, merged:
//  1. groups saved on the member's NEAR Social profile at `<id>/terra/groups`
//     (so the list follows them to any device), mirrored in localStorage for speed;
//  2. groups created or joined through Terra (rememberGroup), kept locally until saved;
//  3. groups where the policy lists the account (council, trusted, member), detected
//     from each known group's policy;
//  4. groups visited in this browser (no sign-in needed).
//
// The profile copy is signed only when the list changed in a way that matters
// (a group you belong to, created or joined isn't saved yet). Visits alone never ask
// for a signature; they ride along with the next save.

import { useEffect, useReducer } from 'react'
import { view, viewAccount, spendableBalance } from './near'
import { isExpired, rolesOf, type DaoConfig, type Policy, type Proposal, type Tx } from './dao'
import { joinRequestOf } from './join'
import { readBack, socialGet, socialSetTx } from './social'
import { t } from '../i18n'

export type Via = 'member' | 'created' | 'joined' | 'joining' | 'visited'

export interface GroupRef {
  id: string
  via: Via
  at: number // last opened or added (ms)
}

export interface GroupSummary {
  id: string
  name: string
  spendable: string // yocto
  roles: string[] // role names for this account (not "Everyone")
  open: number // open requests
  joining: boolean // this account has an open request to join
  at: number
}

const MAX = 24
const VISITED_KEY = 'terra:groups:visited:v1'
const accountKey = (id: string) => `terra:groups:${id}:v1`
const SUMMARY_KEY = 'terra:groups:summary:v1'
const SUMMARY_TTL = 90_000

// ---------- local state ----------

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* storage unavailable */
  }
}

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Strongest reason wins when the same group comes from two sources. */
const RANK: Record<Via, number> = { created: 5, member: 4, joined: 3, joining: 2, visited: 1 }

export function mergeRefs(...lists: GroupRef[][]): GroupRef[] {
  const out = new Map<string, GroupRef>()
  for (const list of lists)
    for (const r of list) {
      if (!r || typeof r.id !== 'string' || !isLikelyDao(r.id)) continue
      const was = out.get(r.id)
      if (!was) out.set(r.id, { id: r.id, via: RANK[r.via] ? r.via : 'visited', at: Number(r.at) || 0 })
      else out.set(r.id, { id: r.id, via: RANK[r.via] > RANK[was.via] ? r.via : was.via, at: Math.max(was.at, Number(r.at) || 0) })
    }
  return [...out.values()].sort((a, b) => b.at - a.at).slice(0, MAX)
}

function isLikelyDao(id: string) {
  return id.length <= 64 && /^[a-z\d][a-z\d_.-]*\.(testnet|near)$/.test(id)
}

export function visitedGroups(): GroupRef[] {
  const list = load<GroupRef[]>(VISITED_KEY, [])
  // Older builds only remembered the last group.
  try {
    const last = localStorage.getItem('terra:lastDao')
    if (last && !list.some((r) => r.id === last)) list.push({ id: last, via: 'visited', at: 0 })
  } catch {
    /* ignore */
  }
  return mergeRefs(list)
}

/** Called whenever a group is opened. Local only; never asks for a signature. */
export function recordVisit(daoId: string) {
  if (!isLikelyDao(daoId)) return
  const list = load<GroupRef[]>(VISITED_KEY, [])
  const next = mergeRefs([{ id: daoId, via: 'visited', at: Date.now() }], list)
  save(VISITED_KEY, next)
  emit()
}

/** Call after creating or joining a group through Terra. Saved to the profile on the next save. */
export function rememberGroup(accountId: string | null, daoId: string, via: 'created' | 'joined' | 'joining') {
  if (!isLikelyDao(daoId)) return
  if (accountId) save(accountKey(accountId), mergeRefs([{ id: daoId, via, at: Date.now() }], load<GroupRef[]>(accountKey(accountId), [])))
  recordVisit(daoId)
}

function localFor(accountId: string): GroupRef[] {
  return load<GroupRef[]>(accountKey(accountId), [])
}

// ---------- NEAR Social copy ----------

interface Stored {
  v: 1
  groups: { id: string; via: Via; at?: number }[]
}

const onChain = new Map<string, { refs: GroupRef[]; raw: string | null; at: number }>()

function parseStored(raw: unknown): GroupRef[] {
  if (typeof raw !== 'string') return []
  try {
    const s = JSON.parse(raw) as Stored
    if (!s || !Array.isArray(s.groups)) return []
    return mergeRefs(s.groups.map((g) => ({ id: String(g.id), via: g.via, at: Number(g.at) || 0 })))
  } catch {
    return []
  }
}

export async function readStoredGroups(accountId: string): Promise<{ refs: GroupRef[]; raw: string | null }> {
  const data = await socialGet<Record<string, { terra?: { groups?: string } }>>([`${accountId}/terra/groups`])
  const raw = data?.[accountId]?.terra?.groups ?? null
  return { refs: parseStored(raw), raw }
}

async function refreshStored(accountId: string) {
  try {
    const r = await readStoredGroups(accountId)
    onChain.set(accountId, { ...r, at: Date.now() })
    // Mirror into the local list so the next load is instant.
    save(accountKey(accountId), mergeRefs(localFor(accountId), r.refs))
  } catch {
    /* keep the local copy */
  }
  emit()
}

/** The value written to `<id>/terra/groups`. Visits are kept, but capped. */
export function encodeGroups(refs: GroupRef[]): string {
  const keep = refs.filter((r) => r.via !== 'joining').slice(0, MAX)
  const s: Stored = { v: 1, groups: keep.map((r) => ({ id: r.id, via: r.via, at: Math.round(r.at / 1000) * 1000 })) }
  return JSON.stringify(s)
}

/** Groups worth a signature: ones you belong to, created or joined, that aren't on your profile yet. */
export function unsavedGroups(accountId: string, all: GroupRef[]): GroupRef[] {
  const chain = onChain.get(accountId)
  if (!chain) return []
  const saved = new Set(chain.refs.filter((r) => r.via !== 'visited').map((r) => r.id))
  return all.filter((r) => (r.via === 'member' || r.via === 'created' || r.via === 'joined') && !saved.has(r.id))
}

export async function saveGroupsTx(accountId: string, refs: GroupRef[]): Promise<{ tx: Tx; value: string }> {
  const value = encodeGroups(refs)
  return { tx: await socialSetTx(accountId, { terra: { groups: value } }), value }
}

/** Read the profile until it holds `value`. The explorer may say "failed" even when it landed. */
export async function confirmGroupsSaved(accountId: string, value: string): Promise<boolean> {
  const ok = await readBack(async () => (await readStoredGroups(accountId)).raw === value)
  await refreshStored(accountId)
  return ok
}

// ---------- per-group summaries (name, balance, your role, open requests) ----------

const summaries = new Map<string, GroupSummary & { for: string }>(Object.entries(load<Record<string, GroupSummary & { for: string }>>(SUMMARY_KEY, {})))
const inflight = new Set<string>()

function persistSummaries() {
  const out: Record<string, GroupSummary & { for: string }> = {}
  for (const [k, v] of summaries) out[k] = v
  save(SUMMARY_KEY, out)
}

const sKey = (daoId: string, accountId: string | null) => `${daoId}|${accountId ?? ''}`

export function getSummary(daoId: string, accountId: string | null): GroupSummary | undefined {
  return summaries.get(sKey(daoId, accountId))
}

export async function loadSummary(daoId: string, accountId: string | null, force = false): Promise<GroupSummary | null> {
  const key = sKey(daoId, accountId)
  const hit = summaries.get(key)
  if (!force && hit && Date.now() - hit.at < SUMMARY_TTL) return hit
  if (inflight.has(key)) return hit ?? null
  inflight.add(key)
  try {
    const [config, policy, account, last] = await Promise.all([
      view<DaoConfig>(daoId, 'get_config'),
      view<Policy>(daoId, 'get_policy'),
      viewAccount(daoId),
      view<number>(daoId, 'get_last_proposal_id'),
    ])
    if (!account) throw new Error('not found')
    const from = Math.max(0, last - 60)
    const proposals = last > 0 ? await view<Proposal[]>(daoId, 'get_proposals', { from_index: from, limit: 60 }) : []
    const live = proposals.filter((p) => p.status === 'InProgress' && !isExpired(p, policy))
    const s: GroupSummary & { for: string } = {
      id: daoId,
      name: config.name,
      spendable: spendableBalance(account).toString(),
      roles: rolesOf(policy, accountId)
        .filter((r) => r.kind !== 'Everyone')
        .map((r) => r.name),
      open: live.length,
      joining: !!accountId && live.some((p) => joinRequestOf(p)?.member === accountId),
      at: Date.now(),
      for: accountId ?? '',
    }
    summaries.set(key, s)
    persistSummaries()
    return s
  } catch {
    return hit ?? null
  } finally {
    inflight.delete(key)
    emit()
  }
}

/** "Council", "Trusted", "Member", "Asked to join", or "Visitor". */
export function roleLabel(s: GroupSummary | undefined, signedIn: boolean): string {
  if (!s) return ''
  if (s.roles.includes('council')) return t('groups.role.council')
  if (s.roles.includes('trusted')) return t('groups.role.trusted')
  if (s.roles.length) return t('groups.role.member')
  if (s.joining) return t('groups.role.askedToJoin')
  return signedIn ? t('groups.role.notMember') : t('groups.role.visitor')
}

// ---------- the list a page renders ----------

export interface GroupRow {
  ref: GroupRef
  summary?: GroupSummary
}

/**
 * Signed out: visited groups only. Signed in: profile + Terra-created/joined + detected
 * membership + visited. Membership is detected from every known group's policy as its
 * summary loads, and promotes a visit to "member".
 */
export function myGroups(accountId: string | null, probe: string[] = []): GroupRow[] {
  const visited = visitedGroups()
  // Probed groups (e.g. the demo community) only show once the policy says you're in them.
  const probed = accountId
    ? probe.filter((id) => {
        const s = getSummary(id, accountId)
        return !!s && (s.roles.length > 0 || s.joining)
      })
    : []
  const known = mergeRefs(
    accountId ? localFor(accountId) : [],
    accountId ? (onChain.get(accountId)?.refs ?? []) : [],
    visited,
    probed.map((id) => ({ id, via: 'visited' as Via, at: 0 })),
  )
  const refs = known.map((r) => {
    const s = getSummary(r.id, accountId)
    if (!accountId || !s) return r
    if (s.roles.length && RANK[r.via] < RANK.member) return { ...r, via: 'member' as Via }
    if (s.joining && RANK[r.via] < RANK.joining) return { ...r, via: 'joining' as Via }
    return r
  })
  return refs.map((ref) => ({ ref, summary: getSummary(ref.id, accountId) }))
}

/** Live rows for the switcher. `probe` lists groups to check for membership (shown only if you're in). */
export function useMyGroups(accountId: string | null, probe: string[] = []) {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    listeners.add(bump)
    return () => {
      listeners.delete(bump)
    }
  }, [])
  useEffect(() => {
    if (accountId) {
      const c = onChain.get(accountId)
      if (!c || Date.now() - c.at > 60_000) refreshStored(accountId)
    }
  }, [accountId])
  const rows = myGroups(accountId, probe)
  const ids = [...new Set([...rows.map((r) => r.ref.id), ...(accountId ? probe : [])])].join(',')
  useEffect(() => {
    for (const id of ids.split(',').filter(Boolean)) loadSummary(id, accountId)
  }, [ids, accountId])

  // Promote detected membership into the local list, so it's saved with the next signature.
  useEffect(() => {
    if (!accountId) return
    const promote = rows.filter((r) => r.ref.via === 'member' && !localFor(accountId).some((l) => l.id === r.ref.id && RANK[l.via] >= RANK.member))
    if (promote.length) save(accountKey(accountId), mergeRefs(promote.map((r) => r.ref), localFor(accountId)))
  })

  const refs = rows.map((r) => r.ref)
  return {
    rows,
    unsaved: accountId ? unsavedGroups(accountId, refs) : [],
    loadedFromChain: accountId ? onChain.has(accountId) : true,
    refs,
  }
}
