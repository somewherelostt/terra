// Shared NEAR Social (SocialDB) helpers: reads through the contract's `get`/`keys` views
// (no backend, no indexer), and signed `set` transactions with a storage deposit only when
// the account's SocialDB storage can't hold the new bytes.
//
// Used by groups (My groups list), comments on requests, and anything else that keeps
// member data on NEAR Social. Testnet contract: v1.social08.testnet.
//
// Note: explorers often label SocialDB `set` transactions "failed" even when the data
// landed (a refund receipt fails). Always confirm a write by reading it back.

import { ONE_NEAR, TGAS, view } from './near'
import { SOCIAL_CONTRACT } from './avatar'
import type { Tx } from './dao'

export { SOCIAL_CONTRACT }

export type SocialTree = { [k: string]: string | SocialTree | null }

/** SocialDB `get`. Keys may use `*` for any account and `**` for a whole subtree. */
export async function socialGet<T = Record<string, SocialTree>>(keys: string[], options?: { with_block_height?: boolean }): Promise<T> {
  return view<T>(SOCIAL_CONTRACT, 'get', options ? { keys, options } : { keys })
}

/** SocialDB `keys`: which keys exist (values not returned). */
export async function socialKeys<T = Record<string, SocialTree>>(keys: string[], options?: { return_type?: 'True' | 'BlockHeight'; values_only?: boolean }): Promise<T> {
  return view<T>(SOCIAL_CONTRACT, 'keys', options ? { keys, options } : { keys })
}

const PER_BYTE = 10n ** 19n

/** Deposit needed for a write of `data` by `accountId` (0 when its storage already covers it). */
export async function storageDepositFor(accountId: string, data: unknown): Promise<bigint> {
  const json = JSON.stringify(data)
  const bytes = new TextEncoder().encode(json).length
  const keys = json.split(':').length
  const need = BigInt(bytes + keys * 60 + 200)
  try {
    const st = await view<{ used_bytes: number; available_bytes: number } | null>(SOCIAL_CONTRACT, 'get_account_storage', { account_id: accountId })
    if (!st) return max(ONE_NEAR / 20n, need * PER_BYTE) // first write: 0.05 NEAR covers ~5 kB
    if (BigInt(st.available_bytes) < need) return max(ONE_NEAR / 100n, (need - BigInt(st.available_bytes) + 500n) * PER_BYTE)
    return 0n
  } catch {
    return ONE_NEAR / 20n
  }
}

/** A signed SocialDB `set` of `{ [accountId]: patch }`. */
export async function socialSetTx(accountId: string, patch: SocialTree): Promise<Tx> {
  const data = { [accountId]: patch }
  const deposit = await storageDepositFor(accountId, data)
  return {
    receiverId: SOCIAL_CONTRACT,
    actions: [
      {
        type: 'FunctionCall',
        params: { methodName: 'set', args: { data }, gas: (100n * TGAS).toString(), deposit: deposit.toString() },
      },
    ],
  }
}

/**
 * Poll until `check` sees the write (or give up). Returns true once it landed.
 * Use after a `set`, since the explorer label can't be trusted.
 */
export async function readBack(check: () => Promise<boolean>, tries = 8, gapMs = 1200): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      if (await check()) return true
    } catch {
      /* RPC hiccup: try again */
    }
    await new Promise((r) => setTimeout(r, gapMs))
  }
  return false
}

/** Strip control and bidi characters, collapse whitespace, cap the length. Plain text only. */
export function cleanText(s: unknown, maxLen: number): string {
  if (typeof s !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxLen)
}

function max(a: bigint, b: bigint) {
  return a > b ? a : b
}
