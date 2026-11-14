// Comments on requests, stored on NEAR Social (SocialDB), read with the contract's `get`
// view: no backend and no indexer needed.
//
// Each comment is written by its author, in their own SocialDB namespace:
//   <author>/terra/comments/<daoId>/<proposalId>/<ms>  = JSON {"text": "...", "v": 1}
// plus the standard NEAR Social comment pattern, so other NEAR Social apps and indexers
// can find it too:
//   <author>/post/comment  = JSON {"type":"md","text":"...","item":{...}}
//   <author>/index/comment = JSON {"key":{"type":"terra/request","path":"<daoId>/proposal/<id>"},"value":{"type":"md"}}
//
// Reading one request (or a whole group) is a single wildcard `get`:
//   */terra/comments/<daoId>/<proposalId>/*   or   */terra/comments/<daoId>/**

import { useContext, useEffect, useReducer } from 'react'
import { allMembers, type Tx } from './dao'
import { DaoContext } from './store'
import { cleanText, readBack, socialGet, socialSetTx, type SocialTree } from './social'

export const COMMENT_MAX = 280

export interface Comment {
  author: string
  daoId: string
  proposalId: number
  key: string // the <ms> key; also the time it was written
  at: Date
  text: string
  pending?: boolean // posted from this tab, not yet read back
}

export function commentItem(daoId: string, proposalId: number) {
  return { type: 'terra/request', path: `${daoId}/proposal/${proposalId}` }
}

type Tree = Record<string, { terra?: { comments?: Record<string, Record<string, Record<string, string | null>>> } }>

function parseTree(data: Tree | null | undefined, daoId: string): Comment[] {
  const out: Comment[] = []
  for (const [author, v] of Object.entries(data ?? {})) {
    const byPid = v?.terra?.comments?.[daoId]
    if (!byPid || typeof byPid !== 'object') continue
    for (const [pid, entries] of Object.entries(byPid)) {
      const proposalId = Number(pid)
      if (!Number.isInteger(proposalId) || proposalId < 0 || !entries || typeof entries !== 'object') continue
      for (const [key, raw] of Object.entries(entries)) {
        if (typeof raw !== 'string' || !/^\d{10,16}$/.test(key)) continue
        let text = ''
        try {
          text = cleanText((JSON.parse(raw) as { text?: unknown }).text, COMMENT_MAX)
        } catch {
          continue
        }
        if (!text) continue
        out.push({ author, daoId, proposalId, key, at: new Date(Number(key)), text })
      }
    }
  }
  return out.sort((a, b) => Number(a.key) - Number(b.key))
}

// ---------- one cached read per group ----------

interface GroupComments {
  list: Comment[]
  at: number
  loading: boolean
  error: boolean
}

const TTL = 30_000
const groups = new Map<string, GroupComments>()
const pendingByGroup = new Map<string, Comment[]>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export async function readGroupComments(daoId: string): Promise<Comment[]> {
  const data = await socialGet<Tree>([`*/terra/comments/${daoId}/**`])
  return parseTree(data, daoId)
}

export async function readRequestComments(daoId: string, proposalId: number): Promise<Comment[]> {
  const data = await socialGet<Tree>([`*/terra/comments/${daoId}/${proposalId}/*`])
  return parseTree(data, daoId)
}

export async function loadComments(daoId: string, force = false) {
  const hit = groups.get(daoId)
  if (hit?.loading) return
  if (!force && hit && Date.now() - hit.at < TTL) return
  groups.set(daoId, { list: hit?.list ?? [], at: hit?.at ?? 0, loading: true, error: false })
  emit()
  try {
    const list = await readGroupComments(daoId)
    groups.set(daoId, { list, at: Date.now(), loading: false, error: false })
    // Drop optimistic copies that have now landed.
    const keys = new Set(list.map((c) => `${c.author}/${c.key}`))
    pendingByGroup.set(daoId, (pendingByGroup.get(daoId) ?? []).filter((c) => !keys.has(`${c.author}/${c.key}`)))
  } catch {
    groups.set(daoId, { list: hit?.list ?? [], at: Date.now() - TTL + 10_000, loading: false, error: !hit })
  }
  emit()
}

/** All comments for one group, grouped by proposal id. Re-renders when they change. */
export function useGroupComments(daoId: string | null | undefined) {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    listeners.add(bump)
    return () => {
      listeners.delete(bump)
    }
  }, [])
  useEffect(() => {
    if (daoId) loadComments(daoId)
  }, [daoId])
  const g = daoId ? groups.get(daoId) : undefined
  const all = daoId ? [...(g?.list ?? []), ...(pendingByGroup.get(daoId) ?? [])] : []
  // Anyone can write to SocialDB, so only show comments from group members and the request's
  // own proposer. Everything else is counted and collapsed, never shown by default.
  const ctx = useContext(DaoContext)
  const dao = ctx?.dao && ctx.dao.id === daoId ? ctx.dao : null
  const members = dao ? new Set(allMembers(dao.policy)) : null
  const proposerOf = dao ? new Map(dao.proposals.map((p) => [p.id, p.proposer])) : null
  const trustedAuthor = (c: Comment) => !members || members.has(c.author) || proposerOf?.get(c.proposalId) === c.author
  const visible = all.filter(trustedAuthor)
  return {
    loading: !g || (g.loading && !g.at),
    error: !!g?.error,
    forRequest: (proposalId: number) => visible.filter((c) => c.proposalId === proposalId),
    count: (proposalId: number) => visible.reduce((n, c) => n + (c.proposalId === proposalId ? 1 : 0), 0),
    hiddenFor: (proposalId: number) => all.filter((c) => c.proposalId === proposalId && !trustedAuthor(c)),
    refresh: () => (daoId ? loadComments(daoId, true) : Promise.resolve()),
  }
}

// ---------- write ----------

export function validateComment(input: string): { text: string } | { error: string } {
  const text = cleanText(input, COMMENT_MAX + 1)
  if (!text) return { error: 'Write something first.' }
  if (text.length > COMMENT_MAX) return { error: `Keep it to ${COMMENT_MAX} characters.` }
  return { text }
}

export async function postCommentTx(author: string, daoId: string, proposalId: number, text: string): Promise<{ tx: Tx; key: string }> {
  const key = String(Date.now())
  const item = commentItem(daoId, proposalId)
  const patch: SocialTree = {
    terra: { comments: { [daoId]: { [String(proposalId)]: { [key]: JSON.stringify({ text, v: 1 }) } } } },
    post: { comment: JSON.stringify({ type: 'md', text, item }) },
    index: { comment: JSON.stringify({ key: item, value: { type: 'md' } }) },
  }
  return { tx: await socialSetTx(author, patch), key }
}

/** Show the comment right away, marked as sending, until the read-back confirms it. */
export function addPending(c: Comment) {
  pendingByGroup.set(c.daoId, [...(pendingByGroup.get(c.daoId) ?? []), { ...c, pending: true }])
  emit()
}

export function dropPending(daoId: string, author: string, key: string) {
  pendingByGroup.set(daoId, (pendingByGroup.get(daoId) ?? []).filter((c) => !(c.author === author && c.key === key)))
  emit()
}

/** Confirm by reading the comment back (explorers label SocialDB writes "failed" even when they land). */
export async function confirmComment(author: string, daoId: string, proposalId: number, key: string): Promise<boolean> {
  const ok = await readBack(async () => {
    const data = await socialGet<Tree>([`${author}/terra/comments/${daoId}/${proposalId}/${key}`])
    return typeof data?.[author]?.terra?.comments?.[daoId]?.[String(proposalId)]?.[key] === 'string'
  })
  await loadComments(daoId, true)
  return ok
}
