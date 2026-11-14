// Activity feed: transactions sent to the DAO account (NearBlocks testnet API),
// decoded with the archival RPC so each vote and request links to its proposal.

import { isNearTransfer, type Dao } from './dao'

const NEARBLOCKS_API = 'https://api-testnet.nearblocks.io/v1'
const TX_RPCS = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org', 'https://archival-rpc.testnet.fastnear.com']

export type ActivityKind = 'chip-in' | 'request' | 'approve' | 'reject' | 'vote' | 'payout' | 'other'

export interface ActivityItem {
  kind: ActivityKind
  who: string
  time: Date
  txHash?: string
  amount?: string // yocto
  proposalId?: number
  to?: string
  ok: boolean
}

interface NbTxn {
  transaction_hash: string
  signer_account_id: string
  receiver_account_id: string
  block_timestamp: string
  actions: { action: string; method: string | null; deposit: number | string | null }[]
  actions_agg?: { deposit: number | string }
  outcomes?: { status: boolean | null }
}

interface DecodedCall {
  method: string
  args: Record<string, unknown>
  returnValue?: unknown
  deposit?: string
}

/** NearBlocks returns deposits as JS numbers; keep them as exact yocto strings where we can. */
function toYoctoString(v: number | string | null | undefined): string {
  if (v == null) return '0'
  if (typeof v === 'string' && /^\d+$/.test(v)) return v
  const n = Number(v)
  if (!isFinite(n) || n <= 0) return '0'
  return (BigInt(Math.round(n / 1e12)) * 10n ** 12n).toString()
}

const decodeCache = new Map<string, DecodedCall | null>()

// Keep RPC load polite: a few requests at a time.
let active = 0
const queue: (() => void)[] = []
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 6) await new Promise<void>((r) => queue.push(r))
  active++
  try {
    return await fn()
  } finally {
    active--
    queue.shift()?.()
  }
}

async function fetchTx(hash: string, signer: string): Promise<{ result?: any } | null> {
  for (const url of TX_RPCS) {
    try {
      const res = await limited(() =>
        fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 'terra', method: 'tx', params: { tx_hash: hash, sender_account_id: signer, wait_until: 'NONE' } }),
        }),
      )
      if (!res.ok) continue
      const json = await res.json()
      if (json.result) return json
    } catch {
      /* try the next endpoint */
    }
  }
  return null
}

function readStored(hash: string): DecodedCall | undefined {
  try {
    const v = localStorage.getItem('terra:tx:' + hash)
    return v ? (JSON.parse(v) as DecodedCall) : undefined
  } catch {
    return undefined
  }
}

function store(hash: string, d: DecodedCall) {
  decodeCache.set(hash, d)
  try {
    localStorage.setItem('terra:tx:' + hash, JSON.stringify(d))
  } catch {
    /* storage full or blocked */
  }
}

async function decodeTx(hash: string, signer: string): Promise<DecodedCall | null> {
  if (decodeCache.has(hash)) return decodeCache.get(hash)!
  const stored = readStored(hash)
  if (stored) {
    decodeCache.set(hash, stored)
    return stored
  }
  try {
    const json = await fetchTx(hash, signer)
    if (!json) return null
    const actions: unknown[] = json.result?.transaction?.actions ?? []
    const transfer = actions.find((a) => typeof a === 'object' && a && 'Transfer' in a) as { Transfer: { deposit: string } } | undefined
    if (transfer) {
      const out = { method: '', args: {}, deposit: transfer.Transfer.deposit }
      store(hash, out)
      return out
    }
    const action = actions.find((a) => typeof a === 'object' && a && 'FunctionCall' in a) as { FunctionCall: { method_name: string; args: string } } | undefined
    if (!action) {
      decodeCache.set(hash, null)
      return null
    }
    const fc = action.FunctionCall
    const args = JSON.parse(atob(fc.args || '') || '{}')
    let returnValue: unknown
    const sv = json.result?.status?.SuccessValue
    if (sv) {
      try {
        returnValue = JSON.parse(atob(sv))
      } catch {
        returnValue = undefined
      }
    }
    const out = { method: fc.method_name, args, returnValue }
    store(hash, out)
    return out
  } catch {
    return null
  }
}

function nsToDate(ns: string): Date {
  return new Date(Number(BigInt(ns) / 1_000_000n))
}

const txnsCache = new Map<string, { at: number; txns: NbTxn[] }>()

/** NearBlocks' free API is rate limited, so cache for 20 s and retry once on 429. */
const inflight = new Map<string, Promise<NbTxn[]>>()

function fetchTxns(daoId: string): Promise<NbTxn[]> {
  const hit = txnsCache.get(daoId)
  if (hit && Date.now() - hit.at < 20_000) return Promise.resolve(hit.txns)
  let p = inflight.get(daoId)
  if (!p) {
    p = fetchTxnsNow(daoId).finally(() => inflight.delete(daoId))
    inflight.set(daoId, p)
  }
  return p
}

async function fetchTxnsNow(daoId: string): Promise<NbTxn[]> {
  const hit = txnsCache.get(daoId)
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${NEARBLOCKS_API}/account/${daoId}/txns-only?per_page=40`)
    if (res.ok) {
      const txns = ((await res.json()).txns ?? []) as NbTxn[]
      txnsCache.set(daoId, { at: Date.now(), txns })
      return txns
    }
    if (res.status !== 429) throw new Error(String(res.status))
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
  }
  if (hit) return hit.txns
  throw new Error('rate limited')
}

/** After a transaction, wait for the indexer before re-reading. */
export function invalidateActivity(daoId: string) {
  const hit = txnsCache.get(daoId)
  if (hit) hit.at = 0
}

export interface ActivityResult {
  items: ActivityItem[]
  /** proposal id -> hash of the tx that created it */
  proposalTx: Map<number, string>
  /** proposal id -> hash of the vote that executed it (best effort) */
  payoutTx: Map<number, string>
  source: 'nearblocks' | 'proposals-only'
}

/**
 * Builds the feed in stages so it never sits on a skeleton: payouts straight from the DAO,
 * then rows from the indexer, then the same rows enriched as transactions are decoded.
 */
export async function loadActivity(dao: Dao, onUpdate?: (r: ActivityResult) => void): Promise<ActivityResult> {
  onUpdate?.(buildActivity(dao, [], [], 'nearblocks'))
  let txns: NbTxn[] = []
  let source: ActivityResult['source'] = 'nearblocks'
  try {
    txns = await fetchTxns(dao.id)
  } catch {
    source = 'proposals-only'
  }
  const decoded: (DecodedCall | null)[] = txns.map((t) => decodeCache.get(t.transaction_hash) ?? readStored(t.transaction_hash) ?? null)
  onUpdate?.(buildActivity(dao, txns, decoded, source))

  let last = Date.now()
  await Promise.all(
    txns.map(async (t, i) => {
      if (decoded[i]) return
      const a = t.actions[0]
      if (a?.action === 'TRANSFER' || (a?.action === 'FUNCTION_CALL' && (a.method === 'add_proposal' || a.method === 'act_proposal'))) {
        decoded[i] = await decodeTx(t.transaction_hash, t.signer_account_id)
        // Re-render at most every 300 ms while decodes stream in.
        if (onUpdate && Date.now() - last > 300) {
          last = Date.now()
          onUpdate(buildActivity(dao, txns, decoded, source))
        }
      }
    }),
  )
  const result = buildActivity(dao, txns, decoded, source)
  onUpdate?.(result)
  return result
}

function buildActivity(dao: Dao, txns: NbTxn[], decoded: (DecodedCall | null)[], source: ActivityResult['source']): ActivityResult {
  const proposalTx = new Map<number, string>()
  const payoutTx = new Map<number, string>()
  const items: ActivityItem[] = []
  const byId = new Map(dao.proposals.map((p) => [p.id, p]))

  // Oldest first so the last approving vote on an approved proposal is the payout.
  const ordered = txns.map((t, i) => ({ t, d: decoded[i] })).reverse()
  for (const { t, d } of ordered) {
    if (t.receiver_account_id !== dao.id) continue
    const ok = t.outcomes?.status !== false
    const base = { who: t.signer_account_id, time: nsToDate(t.block_timestamp), txHash: t.transaction_hash, ok }
    const a = t.actions[0]
    if (!a) continue
    if (a.action === 'TRANSFER') {
      items.push({ ...base, kind: 'chip-in', amount: d?.deposit ?? toYoctoString(t.actions_agg?.deposit ?? a.deposit) })
      continue
    }
    if (a.method === 'add_proposal') {
      const id = typeof d?.returnValue === 'number' ? d.returnValue : undefined
      if (id != null && ok) proposalTx.set(id, t.transaction_hash)
      const p = id != null ? byId.get(id) : undefined
      const amount = p && isNearTransfer(p.kind) ? p.kind.Transfer.amount : undefined
      const to = p && isNearTransfer(p.kind) ? p.kind.Transfer.receiver_id : undefined
      items.push({ ...base, kind: 'request', proposalId: id, amount, to })
      continue
    }
    if (a.method === 'act_proposal') {
      const id = typeof d?.args?.id === 'number' ? (d.args.id as number) : undefined
      const action = d?.args?.action
      const kind: ActivityKind = action === 'VoteApprove' ? 'approve' : action === 'VoteReject' ? 'reject' : 'vote'
      items.push({ ...base, kind, proposalId: id })
      const p = id != null ? byId.get(id) : undefined
      if (p && ok && kind === 'approve' && p.status === 'Approved') payoutTx.set(p.id, t.transaction_hash)
      continue
    }
    items.push({ ...base, kind: 'other' })
  }

  // Payouts come from approved transfer proposals (the DAO itself sends the money).
  for (const p of dao.proposals) {
    if (p.status === 'Approved' && isNearTransfer(p.kind)) {
      const hash = payoutTx.get(p.id)
      const voteItem = hash ? items.find((i) => i.txHash === hash) : undefined
      items.push({
        kind: 'payout',
        who: dao.id,
        to: p.kind.Transfer.receiver_id,
        amount: p.kind.Transfer.amount,
        proposalId: p.id,
        time: voteItem ? new Date(voteItem.time.getTime() + 1) : nsToDate(p.submission_time),
        txHash: hash,
        ok: true,
      })
    }
  }

  items.sort((a, b) => b.time.getTime() - a.time.getTime())
  return { items, proposalTx, payoutTx, source }
}
