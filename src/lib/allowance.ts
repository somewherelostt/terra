// Allowances: small budgets with hard limits, enforced by the allowance contract
// (contracts/allowance). See design/ALLOWANCES.md.
//
// The DAO owns the contract. Creating, changing or unfreezing an allowance is a
// normal DAO FunctionCall proposal; council members (guardians) can freeze
// instantly; a spender calls `pay` directly, with no vote.

import { addFunctionCallProposalTx, type Dao, type Tx } from './dao'
import { ONE_NEAR, TGAS, view } from './near'

/** Which allowance contract belongs to which group. Extend with VITE_ALLOWANCE_CONTRACTS="dao=contract,dao2=contract2". */
const BUILT_IN: Record<string, string> = {
  'terra-demo.sputnikv2.testnet': 'allowance.terra-ben.testnet',
  'terra-qa-club.sputnikv2.testnet': 'allowance.terra-cy.testnet',
}

function contractMap(): Record<string, string> {
  const map = { ...BUILT_IN }
  const extra = (import.meta.env.VITE_ALLOWANCE_CONTRACTS as string | undefined) ?? ''
  for (const pair of extra.split(',')) {
    const [dao, contract] = pair.split('=').map((s) => s.trim())
    if (dao && contract) map[dao] = contract
  }
  return map
}

export function allowanceContractFor(daoId: string): string | null {
  return contractMap()[daoId] ?? null
}

export interface AllowanceState {
  owner: string
  guardians: string[]
  frozen: boolean
  balance: string
}

export interface Allowance {
  account_id: string
  daily_cap: string
  per_payment_max: string
  expires_at: string
  spent_today: string
  left_today: string
}

export interface AllowanceInfo {
  contractId: string
  state: AllowanceState
  allowances: Allowance[]
}

/** Reads the contract and checks the DAO really owns it; returns null if not set up. */
export async function loadAllowances(daoId: string): Promise<AllowanceInfo | null> {
  const contractId = allowanceContractFor(daoId)
  if (!contractId) return null
  const [state, allowances] = await Promise.all([
    view<AllowanceState>(contractId, 'get_state'),
    view<Allowance[]>(contractId, 'get_allowances'),
  ])
  if (state.owner !== daoId) return null
  return { contractId, state, allowances }
}

export function isActive(a: Allowance, now = Date.now()): boolean {
  return BigInt(a.expires_at) > BigInt(now) * 1_000_000n
}

/** How much the account can pay right now: min(per-payment max, left today, pool). 0 if none. */
export function spendableNow(info: AllowanceInfo, a: Allowance | undefined): bigint {
  if (!a || info.state.frozen || !isActive(a)) return 0n
  const limits = [BigInt(a.per_payment_max), BigInt(a.left_today), BigInt(info.state.balance)]
  return limits.reduce((m, x) => (x < m ? x : m))
}

/** $ → yoctoNEAR at the given NEAR price, rounded to 1e-6 NEAR. */
export function usdToYocto(usdAmount: number, nearUsd: number): bigint | null {
  if (!isFinite(usdAmount) || usdAmount <= 0 || !isFinite(nearUsd) || nearUsd <= 0) return null
  return BigInt(Math.round((usdAmount / nearUsd) * 1e6)) * (ONE_NEAR / 1_000_000n)
}

// ----- Transactions -----

export interface NewAllowance {
  accountId: string
  dailyCap: bigint
  perPaymentMax: bigint
  expiresAt: Date
  funding: bigint
  label: string // shown in the request, e.g. "$5 a day, $2 a payment, until 21 Nov"
}

/** A DAO request that creates (or replaces) an allowance and funds the contract in one go. */
export function proposeAllowanceTx(dao: Dao, contractId: string, a: NewAllowance): Tx {
  return addFunctionCallProposalTx(
    dao,
    contractId,
    'set_allowance',
    {
      account_id: a.accountId,
      daily_cap: a.dailyCap.toString(),
      per_payment_max: a.perPaymentMax.toString(),
      expires_at: (BigInt(a.expiresAt.getTime()) * 1_000_000n).toString(),
    },
    a.funding,
    30n * TGAS,
    {
      title: `Allowance for ${a.accountId}: ${a.label}`,
      notes: `Small payments from this budget skip the vote. Limits are enforced by the allowance contract ${contractId}; the council can freeze it at any time.`,
    },
  )
}

function ownerCallProposal(dao: Dao, contractId: string, method: string, args: object, title: string): Tx {
  return addFunctionCallProposalTx(dao, contractId, method, args, 0n, 30n * TGAS, { title })
}

export const unfreezeProposalTx = (dao: Dao, contractId: string) =>
  ownerCallProposal(dao, contractId, 'unfreeze', {}, 'Unfreeze allowances')

export const removeAllowanceProposalTx = (dao: Dao, contractId: string, accountId: string) =>
  ownerCallProposal(dao, contractId, 'remove_allowance', { account_id: accountId }, `End the allowance for ${accountId}`)

function call(contractId: string, methodName: string, args: object): Tx {
  return { receiverId: contractId, actions: [{ type: 'FunctionCall', params: { methodName, args, gas: (30n * TGAS).toString(), deposit: '0' } }] }
}

/** Instant, no vote. Works for council members the contract lists as guardians. */
export const freezeTx = (contractId: string) => call(contractId, 'freeze', {})

export const payFromAllowanceTx = (contractId: string, receiverId: string, amount: bigint) =>
  call(contractId, 'pay', { receiver_id: receiverId, amount: amount.toString() })

// ----- Helper key: a function-call key that can only call `pay` -----

export const HELPER_GAS_ALLOWANCE = ONE_NEAR / 4n

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function base58(bytes: Uint8Array): string {
  let n = 0n
  for (const b of bytes) n = n * 256n + BigInt(b)
  let out = ''
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out
    n /= 58n
  }
  for (const b of bytes) {
    if (b !== 0) break
    out = '1' + out
  }
  return out
}

/** Makes an ed25519 key pair in the browser. The secret is shown once and never stored. */
export async function newHelperKey(): Promise<{ publicKey: string; secretKey: string }> {
  const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey))
  const seed = pkcs8.slice(pkcs8.length - 32)
  const full = new Uint8Array(64)
  full.set(seed)
  full.set(pub, 32)
  return { publicKey: `ed25519:${base58(pub)}`, secretKey: `ed25519:${base58(full)}` }
}

/** Signed by the helper account's owner: adds a key that can only call `pay` on the contract. */
export function addHelperKeyTx(helperAccountId: string, contractId: string, publicKey: string): Tx {
  return {
    receiverId: helperAccountId,
    actions: [
      {
        type: 'AddKey',
        params: {
          publicKey,
          accessKey: { permission: { receiverId: contractId, methodNames: ['pay'], allowance: HELPER_GAS_ALLOWANCE.toString() } },
        },
      },
    ],
  } as unknown as Tx
}
