// Minimal NEAR JSON-RPC helpers. Reads go straight to a public RPC; writes go
// through the wallet the member signed in with (see wallet.ts).

export const NETWORK = 'testnet' as const
// FastNEAR first; dRPC answers browsers with CORS when FastNEAR rate-limits; FastNEAR archival last.
export const RPC_URLS = ['https://test.rpc.fastnear.com', 'https://near-testnet.drpc.org', 'https://archival-rpc.testnet.fastnear.com']
export const FACTORY = 'sputnikv2.testnet'
export const EXPLORER = 'https://testnet.nearblocks.io'

export const ONE_NEAR = 10n ** 24n
export const TGAS = 10n ** 12n

let rpcIndex = 0
// Endpoints that rate-limited us recently are skipped until this time (ms).
const coolOff = new Map<string, number>()

// Keep request bursts small so a cold page load doesn't trip public rate limits.
let inFlight = 0
const waiting: (() => void)[] = []
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= 6) await new Promise<void>((r) => waiting.push(r))
  inFlight++
  try {
    return await fn()
  } finally {
    inFlight--
    waiting.shift()?.()
  }
}

function isRateLimit(e: unknown): boolean {
  return e instanceof RateLimited
}

class RateLimited extends Error {}

async function rpc<T>(method: string, params: unknown): Promise<T> {
  let lastErr: unknown
  for (let round = 0; round < 2; round++) {
    for (let attempt = 0; attempt < RPC_URLS.length; attempt++) {
      const url = RPC_URLS[(rpcIndex + attempt) % RPC_URLS.length]
      if ((coolOff.get(url) ?? 0) > Date.now() && round === 0) continue
      try {
        const json = await slot(async () => {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 'terra', method, params }),
          })
          if (res.status === 429) throw new RateLimited('rate limited')
          if (!res.ok) throw new Error(`RPC ${res.status}`)
          return res.json()
        })
        if (json.error) {
          if (json.error.code === -429 || /rate limit/i.test(String(json.error.message))) throw new RateLimited('rate limited')
          const cause = json.error.cause?.name ?? json.error.name
          const msg = json.error.data ?? json.error.message
          throw new RpcError(String(cause ?? 'RPC_ERROR'), typeof msg === 'string' ? msg : JSON.stringify(msg))
        }
        rpcIndex = (rpcIndex + attempt) % RPC_URLS.length
        return json.result as T
      } catch (e) {
        lastErr = e
        if (e instanceof RpcError) throw e
        // A 429 often arrives without CORS headers and surfaces as a network error, so
        // treat any failure as a reason to rest this endpoint briefly and try the next one.
        coolOff.set(url, Date.now() + (isRateLimit(e) ? 30_000 : 10_000))
      }
    }
    // Every endpoint failed: wait a moment, then give them one more try.
    await new Promise((r) => setTimeout(r, 1200))
  }
  throw lastErr
}

export class RpcError extends Error {
  readonly cause: string
  constructor(cause: string, message: string) {
    super(message)
    this.cause = cause
  }
}

function toBase64(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)))
}

export async function view<T>(accountId: string, method: string, args: object = {}): Promise<T> {
  const result = await rpc<{ result?: number[]; error?: string }>('query', {
    request_type: 'call_function',
    finality: 'optimistic',
    account_id: accountId,
    method_name: method,
    args_base64: toBase64(JSON.stringify(args)),
  })
  if (result.error) throw new RpcError('CONTRACT_ERROR', result.error)
  const text = new TextDecoder().decode(new Uint8Array(result.result ?? []))
  return JSON.parse(text) as T
}

export interface AccountState {
  amount: string
  locked: string
  storage_usage: number
  code_hash: string
}

export async function viewAccount(accountId: string): Promise<AccountState | null> {
  try {
    return await rpc<AccountState>('query', { request_type: 'view_account', finality: 'optimistic', account_id: accountId })
  } catch (e) {
    if (e instanceof RpcError && /UNKNOWN_ACCOUNT|does not exist/i.test(e.cause + e.message)) return null
    throw e
  }
}

/** NEAR reserves 1 NEAR per 100 kB of storage; that part of the balance can't be spent. */
export function spendableBalance(a: AccountState): bigint {
  const storageCost = BigInt(a.storage_usage) * 10n ** 19n
  const free = BigInt(a.amount) - storageCost
  return free > 0n ? free : 0n
}

export function txUrl(hash: string): string {
  return `${EXPLORER}/txns/${hash}`
}

export function accountUrl(id: string): string {
  return `${EXPLORER}/address/${id}`
}

export function isValidAccountId(id: string): boolean {
  return id.length >= 2 && id.length <= 64 && /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(id)
}
