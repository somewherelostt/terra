// Private 1-to-1 messages between members, with no backend (see design/DMS.md).
//
// Keys: each member makes an X25519 keypair (tweetnacl `box`) in this browser. The secret key
// stays in localStorage; the public key is published at `<id>/terra/dmkey` on NEAR Social.
// Messages: `nacl.box` with a random 24-byte nonce, written by the sender to
// `<sender>/terra/dm/<recipient>/<msgId>`. Only ciphertext, nonce and the two public keys go
// on chain. Who talks to whom, and when, is public.

import nacl from 'tweetnacl'
import { view } from './near'
import { SOCIAL_CONTRACT, cleanText as cleanSocialText, socialSetTx, type SocialTree } from './social'
import type { Tx } from './dao'
import { t } from '../i18n'

export const DM_MAX = 500
export const POLL_MS = 10_000

// ---------- base64 ----------

export function toB64(u: Uint8Array): string {
  let s = ''
  for (const b of u) s += String.fromCharCode(b)
  return btoa(s)
}

export function fromB64(s: string): Uint8Array | null {
  try {
    const bin = atob(s)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

// ---------- this device's key ----------

export interface DmKey {
  publicKey: Uint8Array
  secretKey: Uint8Array
}

const skKey = (id: string) => `terra:dm:sk:${id}`

export function loadLocalKey(accountId: string): DmKey | null {
  try {
    const raw = localStorage.getItem(skKey(accountId))
    const sk = raw ? fromB64(raw) : null
    if (!sk || sk.length !== nacl.box.secretKeyLength) return null
    return nacl.box.keyPair.fromSecretKey(sk)
  } catch {
    return null
  }
}

/** A fresh keypair, saved in this browser only. Replaces any earlier key on this device. */
export function createLocalKey(accountId: string): DmKey {
  const kp = nacl.box.keyPair()
  localStorage.setItem(skKey(accountId), toB64(kp.secretKey))
  return kp
}

// ---------- published public keys ----------

function validPk(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const b = fromB64(v)
  return b && b.length === nacl.box.publicKeyLength ? v : null
}

/** Published DM public keys (base64) for these accounts; null where none is set. */
export async function readPublicKeys(ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  if (!ids.length) return out
  const data = await view<Record<string, { terra?: { dmkey?: unknown } }>>(SOCIAL_CONTRACT, 'get', {
    keys: ids.map((id) => `${id}/terra/dmkey`),
  })
  for (const id of ids) out.set(id, validPk(data?.[id]?.terra?.dmkey))
  return out
}

// ---------- SocialDB writes ----------

/** A SocialDB `set` (shared helper in social.ts) plus the storage deposit it carries, for the UI. */
async function dmSetTx(accountId: string, value: SocialTree): Promise<{ tx: Tx; deposit: bigint }> {
  const tx = await socialSetTx(accountId, value)
  const a = tx.actions[0]
  return { tx, deposit: BigInt(a.params.deposit) }
}

export function publishKeyTx(accountId: string, key: DmKey) {
  return dmSetTx(accountId, { terra: { dmkey: toB64(key.publicKey) } })
}

// ---------- messages ----------

/** Plain text only (see cleanText in social.ts), at most DM_MAX characters. */
export function cleanText(s: string): string {
  return cleanSocialText(s, DM_MAX)
}

/** The on-chain value of one message. */
interface Envelope {
  v: 1
  n: string // nonce, base64
  c: string // ciphertext, base64
  k: string // sender's DM public key, base64
  r: string // recipient's DM public key, base64
}

export interface DmMessage {
  id: string
  from: string
  to: string
  at: number // ms, from the message id (the sender's clock)
  text: string | null // null when this device can't open it
  mine: boolean
}

/** Message ids: base36 milliseconds plus 4 random characters, so keys sort by time. */
function newId(): string {
  const r = nacl.randomBytes(3)
  return Date.now().toString(36).padStart(9, '0') + toB64(r).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 4).padEnd(4, '0')
}

function idTime(id: string): number {
  const t = parseInt(id.slice(0, 9), 36)
  return Number.isFinite(t) ? t : 0
}

export function encryptMessage(text: string, me: DmKey, theirPkB64: string): Envelope {
  const theirPk = fromB64(theirPkB64)
  if (!theirPk || theirPk.length !== nacl.box.publicKeyLength) throw new Error(t('dm.badKey'))
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const c = nacl.box(new TextEncoder().encode(text), nonce, theirPk, me.secretKey)
  return { v: 1, n: toB64(nonce), c: toB64(c), k: toB64(me.publicKey), r: theirPkB64 }
}

export async function sendMessageTx(from: string, to: string, text: string, me: DmKey, theirPkB64: string) {
  const clean = cleanText(text)
  if (!clean) throw new Error(t('dm.empty'))
  const env = encryptMessage(clean, me, theirPkB64)
  const id = newId()
  const { tx, deposit } = await dmSetTx(from, { terra: { dm: { [to]: { [id]: JSON.stringify(env) } } } })
  return { tx, deposit, id, envelope: env, text: clean }
}

function parseEnvelope(raw: unknown): Envelope | null {
  if (typeof raw !== 'string' || raw.length > 4000) return null
  try {
    const e = JSON.parse(raw) as Envelope
    if (e?.v !== 1 || typeof e.n !== 'string' || typeof e.c !== 'string' || !validPk(e.k) || !validPk(e.r)) return null
    return e
  } catch {
    return null
  }
}

/** Open one envelope with this device's key. The shared key is the same in both directions. */
export function openEnvelope(e: Envelope, me: DmKey, mine: boolean): string | null {
  const myPk = toB64(me.publicKey)
  // A message I sent was sealed with my key `k`; one sent to me was sealed for my key `r`.
  if ((mine ? e.k : e.r) !== myPk) return null
  const other = fromB64(mine ? e.r : e.k)
  const nonce = fromB64(e.n)
  const c = fromB64(e.c)
  if (!other || !nonce || !c || nonce.length !== nacl.box.nonceLength) return null
  const m = nacl.box.open(c, nonce, other, me.secretKey)
  if (!m) return null
  try {
    return cleanText(new TextDecoder('utf-8', { fatal: true }).decode(m))
  } catch {
    return null
  }
}

type DmTree = Record<string, { terra?: { dm?: Record<string, Record<string, unknown>> } }>

function collect(data: DmTree | null, me: string, key: DmKey | null, pairs: [string, string][]): DmMessage[] {
  const out: DmMessage[] = []
  for (const [from, to] of pairs) {
    const msgs = data?.[from]?.terra?.dm?.[to]
    if (!msgs || typeof msgs !== 'object') continue
    for (const [id, raw] of Object.entries(msgs)) {
      if (!/^[0-9a-z]{9,20}$/.test(id)) continue
      const env = parseEnvelope(raw)
      if (!env) continue
      const mine = from === me
      out.push({ id, from, to, at: idTime(id), text: key ? openEnvelope(env, key, mine) : null, mine })
    }
  }
  return out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
}

/** Both directions of one conversation, oldest first. */
export async function readThread(me: string, other: string, key: DmKey | null): Promise<DmMessage[]> {
  const data = await view<DmTree>(SOCIAL_CONTRACT, 'get', { keys: [`${me}/terra/dm/${other}/*`, `${other}/terra/dm/${me}/*`] })
  return collect(data, me, key, [
    [me, other],
    [other, me],
  ])
}

export interface Conversation {
  with: string
  last: DmMessage
  count: number
}

/**
 * Every conversation between me and the group's members, newest first. One SocialDB `get`:
 * what I wrote to anyone, plus what each member wrote to me (no indexer, no global scan).
 */
export async function readConversations(me: string, members: string[], key: DmKey | null): Promise<Conversation[]> {
  const others = members.filter((m) => m !== me)
  if (!others.length) return []
  const data = await view<DmTree>(SOCIAL_CONTRACT, 'get', {
    keys: [`${me}/terra/dm/*/*`, ...others.map((m) => `${m}/terra/dm/${me}/*`)],
  })
  const convs: Conversation[] = []
  for (const o of others) {
    const msgs = collect(data, me, key, [
      [me, o],
      [o, me],
    ])
    if (msgs.length) convs.push({ with: o, last: msgs[msgs.length - 1], count: msgs.length })
  }
  return convs.sort((a, b) => b.last.at - a.last.at)
}

// ---------- read markers (this device only) ----------

const readKey = (me: string) => `terra:dm:read:${me}`

export function lastRead(me: string, other: string): number {
  try {
    return (JSON.parse(localStorage.getItem(readKey(me)) ?? '{}') as Record<string, number>)[other] ?? 0
  } catch {
    return 0
  }
}

export function markRead(me: string, other: string, at: number) {
  try {
    const all = JSON.parse(localStorage.getItem(readKey(me)) ?? '{}') as Record<string, number>
    if ((all[other] ?? 0) >= at) return
    all[other] = at
    localStorage.setItem(readKey(me), JSON.stringify(all))
  } catch {
    /* storage unavailable */
  }
}
