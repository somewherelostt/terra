// Sputnik DAO v2/v3 reads and transaction builders.
// Contract: https://github.com/near-daos/sputnik-dao-contract

import { FACTORY, ONE_NEAR, TGAS, toBase64, view, viewAccount, spendableBalance, type AccountState } from './near'

export type RoleKind = 'Everyone' | { Group: string[] } | { Member: string }

export interface VotePolicy {
  weight_kind: 'RoleWeight' | 'TokenWeight'
  quorum: string
  threshold: [number, number] | string
}

export interface Role {
  name: string
  kind: RoleKind
  permissions: string[]
  vote_policy: Record<string, VotePolicy>
}

export interface Policy {
  roles: Role[]
  default_vote_policy: VotePolicy
  proposal_bond: string
  proposal_period: string
  bounty_bond: string
  bounty_forgiveness_period: string
}

export interface DaoConfig {
  name: string
  purpose: string
  metadata: string
}

export type ProposalStatus = 'InProgress' | 'Approved' | 'Rejected' | 'Removed' | 'Expired' | 'Moved' | 'Failed'

export interface TransferKind {
  Transfer: { token_id: string; receiver_id: string; amount: string; msg?: string | null }
}

// Kinds are passed back to act_proposal verbatim, so keep them as raw objects.
export type ProposalKind = TransferKind | Record<string, unknown> | string

export interface Proposal {
  id: number
  proposer: string
  description: string
  kind: ProposalKind
  status: ProposalStatus
  vote_counts: Record<string, [string | number, string | number, string | number]>
  votes: Record<string, 'Approve' | 'Reject' | 'Remove'>
  submission_time: string
}

export interface Dao {
  id: string
  config: DaoConfig
  policy: Policy
  account: AccountState
  spendable: bigint
  staked: bigint
  proposals: Proposal[]
  lastProposalId: number
}

export function kindName(kind: ProposalKind): string {
  return typeof kind === 'string' ? kind : Object.keys(kind)[0] ?? 'Unknown'
}

export function isTransfer(kind: ProposalKind): kind is TransferKind {
  return typeof kind === 'object' && kind !== null && 'Transfer' in kind
}

/** Native NEAR transfers only; token transfers are shown but not summed. */
export function isNearTransfer(kind: ProposalKind): kind is TransferKind {
  return isTransfer(kind) && (kind.Transfer.token_id === '' || kind.Transfer.token_id === 'near')
}

// Policy label used by Sputnik for each proposal kind (permissions look like "transfer:VoteApprove").
const KIND_LABELS: Record<string, string> = {
  ChangeConfig: 'config',
  ChangePolicy: 'policy',
  AddMemberToRole: 'add_member_to_role',
  RemoveMemberFromRole: 'remove_member_from_role',
  FunctionCall: 'call',
  UpgradeSelf: 'upgrade_self',
  UpgradeRemote: 'upgrade_remote',
  Transfer: 'transfer',
  SetStakingContract: 'set_vote_token',
  AddBounty: 'add_bounty',
  BountyDone: 'bounty_done',
  Vote: 'vote',
  FactoryInfoUpdate: 'factory_info_update',
  ChangePolicyAddOrUpdateRole: 'policy_add_or_update_role',
  ChangePolicyRemoveRole: 'policy_remove_role',
  ChangePolicyUpdateDefaultVotePolicy: 'policy_update_default_vote_policy',
  ChangePolicyUpdateParameters: 'policy_update_parameters',
}

export function kindLabel(kind: ProposalKind): string {
  return KIND_LABELS[kindName(kind)] ?? kindName(kind)
}

/** Role names are free text in Sputnik ("council", "Council"); compare them loosely. */
export function isRole(name: string, wanted: 'council' | 'trusted'): boolean {
  return name.trim().toLowerCase() === wanted
}

export function roleMembers(role: Role): string[] {
  if (typeof role.kind === 'object' && 'Group' in role.kind) return role.kind.Group
  if (typeof role.kind === 'object' && 'Member' in role.kind) return [role.kind.Member]
  return []
}

export function rolesOf(policy: Policy, accountId: string | null): Role[] {
  return policy.roles.filter((r) => r.kind === 'Everyone' || (accountId != null && roleMembers(r).includes(accountId)))
}

function hasPermission(role: Role, label: string, action: string): boolean {
  return role.permissions.some((p) => {
    const [l, a] = p.split(':')
    return (l === '*' || l === label) && (a === '*' || a === action)
  })
}

export function can(policy: Policy, accountId: string | null, label: string, action: string): boolean {
  return rolesOf(policy, accountId).some((r) => hasPermission(r, label, action))
}

export function allMembers(policy: Policy): string[] {
  const set = new Set<string>()
  for (const r of policy.roles) roleMembers(r).forEach((m) => set.add(m))
  return [...set]
}

/** Roles whose votes count for a proposal kind, with how many approvals each needs. */
export function approvalRules(policy: Policy, kind: ProposalKind) {
  const label = kindLabel(kind)
  return policy.roles
    .filter((r) => r.kind !== 'Everyone' && hasPermission(r, label, 'VoteApprove'))
    .map((r) => {
      const vp = r.vote_policy[label] ?? policy.default_vote_policy
      const size = roleMembers(r).length
      let needed = 1
      if (Array.isArray(vp.threshold)) {
        const [num, den] = vp.threshold
        // Sputnik: approved when votes > size * num / den, capped at size; also at least quorum.
        needed = Math.min(Math.floor((size * num) / den) + 1, size)
      } else {
        needed = Number(vp.threshold)
      }
      needed = Math.max(needed, Number(vp.quorum || 0))
      return { role: r.name, members: roleMembers(r), needed, size }
    })
}

export function approvalsSoFar(p: Proposal, members: string[]): number {
  return members.filter((m) => p.votes[m] === 'Approve').length
}

export function isExpired(p: Proposal, policy: Policy): boolean {
  if (p.status !== 'InProgress') return p.status === 'Expired'
  const end = BigInt(p.submission_time) + BigInt(policy.proposal_period)
  return BigInt(Date.now()) * 1_000_000n > end
}

// ----- Description format -----
// Terra writes descriptions that Trezu and other Sputnik UIs can show as plain text:
// "* Title: ... <br>* Notes: ... <br>* Recipient wants: ..."

export interface RequestMeta {
  title: string
  notes?: string
  wants?: string
  quote?: string
  tier?: string
}

export function encodeDescription(m: RequestMeta): string {
  const parts = [`* Title: ${m.title}`]
  if (m.notes) parts.push(`* Notes: ${m.notes}`)
  if (m.wants) parts.push(`* Recipient wants: ${m.wants}`)
  if (m.quote) parts.push(`* Intents quote: ${m.quote}`)
  if (m.tier) parts.push(`* Tier: ${m.tier}`)
  parts.push('* Via: Terra')
  return parts.join(' <br>')
}

export function decodeDescription(d: string): RequestMeta {
  const fields: Record<string, string> = {}
  const chunks = d.split(/<br\s*\/?>|\n/)
  for (const c of chunks) {
    const m = c.match(/^\s*\*?\s*([A-Za-z ]+):\s*(.*)$/)
    if (m) fields[m[1].trim().toLowerCase()] = m[2].trim()
  }
  if (!fields.title) {
    // Astro DAO style "title$$$$link" or plain text.
    const plain = d.split('$$$$')[0].replace(/<[^>]+>/g, ' ').trim()
    return { title: plain || 'Untitled request' }
  }
  return {
    title: fields.title,
    notes: fields.notes,
    wants: fields['recipient wants'],
    quote: fields['intents quote'],
    tier: fields.tier,
  }
}

// ----- Reads -----

export async function isDao(id: string): Promise<boolean> {
  try {
    await view<Policy>(id, 'get_policy')
    return true
  } catch {
    return false
  }
}

/** Full, fully decided proposal pages per DAO (see loadDao). */
const settledPages = new Map<string, Map<number, Proposal[]>>()

export async function loadDao(id: string, stakingPool?: string | null): Promise<Dao> {
  const [config, policy, account, lastProposalId] = await Promise.all([
    view<DaoConfig>(id, 'get_config'),
    view<Policy>(id, 'get_policy'),
    viewAccount(id),
    view<number>(id, 'get_last_proposal_id'),
  ])
  if (!account) throw new Error(`Account ${id} not found`)
  // The whole history, so member records remember every paid and turned-down request.
  // Pages of 100 go out together; near.ts caps how many run at once. A full page whose
  // proposals are all decided can't change, so it's reused instead of fetched again.
  const cache = settledPages.get(id) ?? new Map<number, Proposal[]>()
  settledPages.set(id, cache)
  const starts: number[] = []
  for (let i = 0; i < lastProposalId; i += 100) starts.push(i)
  const pages = await Promise.all(
    starts.map(async (i) => {
      const hit = cache.get(i)
      if (hit) return hit
      const page = await view<Proposal[]>(id, 'get_proposals', { from_index: i, limit: 100 })
      if (page.length === 100 && page.every((p) => p.status !== 'InProgress')) cache.set(i, page)
      return page
    }),
  )
  const proposals: Proposal[] = pages.flat()
  let staked = 0n
  if (stakingPool) {
    try {
      staked = BigInt(await view<string>(stakingPool, 'get_account_total_balance', { account_id: id }))
    } catch {
      staked = 0n
    }
  }
  return {
    id,
    config,
    policy,
    account,
    spendable: spendableBalance(account),
    staked,
    proposals: proposals.sort((a, b) => b.id - a.id),
    lastProposalId,
  }
}

export async function listFactoryDaos(): Promise<string[]> {
  return view<string[]>(FACTORY, 'get_dao_list')
}

// ----- Transaction builders (near-connect "ConnectorAction" format) -----

export interface Tx {
  receiverId: string
  actions: Array<{ type: 'FunctionCall'; params: { methodName: string; args: object; gas: string; deposit: string } } | { type: 'Transfer'; params: { deposit: string } }>
}

export function chipInTx(daoId: string, amount: bigint): Tx {
  return { receiverId: daoId, actions: [{ type: 'Transfer', params: { deposit: amount.toString() } }] }
}

export function addTransferProposalTx(dao: Dao, receiverId: string, amount: bigint, meta: RequestMeta): Tx {
  return {
    receiverId: dao.id,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'add_proposal',
          args: {
            proposal: {
              description: encodeDescription(meta),
              kind: { Transfer: { token_id: '', receiver_id: receiverId, amount: amount.toString() } },
            },
          },
          gas: (100n * TGAS).toString(),
          deposit: dao.policy.proposal_bond,
        },
      },
    ],
  }
}

export function addFunctionCallProposalTx(
  dao: Dao,
  receiverId: string,
  methodName: string,
  args: object,
  deposit: bigint,
  gas: bigint,
  meta: RequestMeta,
): Tx {
  return {
    receiverId: dao.id,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'add_proposal',
          args: {
            proposal: {
              description: encodeDescription(meta),
              kind: {
                FunctionCall: {
                  receiver_id: receiverId,
                  actions: [{ method_name: methodName, args: toBase64(JSON.stringify(args)), deposit: deposit.toString(), gas: gas.toString() }],
                },
              },
            },
          },
          gas: (100n * TGAS).toString(),
          deposit: dao.policy.proposal_bond,
        },
      },
    ],
  }
}

export type VoteAction = 'VoteApprove' | 'VoteReject'

export function actProposalTx(daoId: string, p: Proposal, action: VoteAction): Tx {
  return {
    receiverId: daoId,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'act_proposal',
          // v3 contracts require the proposal kind back, so a vote can't land on a swapped proposal.
          args: { id: p.id, action, proposal: p.kind },
          gas: (250n * TGAS).toString(),
          deposit: '0',
        },
      },
    ],
  }
}

export interface NewGroupInput {
  displayName?: string // shown in the app, e.g. "Riverside Club"
  name: string // sub-account name, e.g. "riverside-club"
  purpose: string
  council: string[]
  trusted: string[]
  deposit: bigint
}

/**
 * A Terra-shaped policy:
 *  - council: can do everything; transfers need a majority of the council;
 *  - trusted: can request money and give the one approval that small requests need
 *    (threshold 1 for transfers only). Kept apart from the council: Sputnik approves a
 *    proposal as soon as any one role reaches its threshold, so a council member who is
 *    also trusted could pay out any amount with a single vote;
 *  - member: people who joined (starts empty); they can ask for money;
 *  - all: anyone can file a payment request or ask to join (add_member_to_role).
 * Amount limits for each tier are enforced in the app (see README).
 */
/** Trusted accounts that aren't also on the council (see newGroupPolicy). */
export function trustedOnly(council: string[], trusted: string[]): string[] {
  return trusted.filter((a) => !council.includes(a))
}

export function newGroupPolicy(input: NewGroupInput): Policy {
  return {
    roles: [
      {
        name: 'council',
        kind: { Group: input.council },
        permissions: ['*:*'],
        vote_policy: {},
      },
      {
        name: 'trusted',
        kind: { Group: trustedOnly(input.council, input.trusted) },
        permissions: ['transfer:AddProposal', 'transfer:VoteApprove', 'transfer:VoteReject', 'transfer:Finalize'],
        vote_policy: { transfer: { weight_kind: 'RoleWeight', quorum: '0', threshold: [1, 100] } },
      },
      {
        // Members who joined (for example by QR). They can ask for money; their record decides the rest.
        name: 'member',
        kind: { Group: [] },
        permissions: ['transfer:AddProposal'],
        vote_policy: {},
      },
      {
        name: 'all',
        kind: 'Everyone',
        permissions: ['transfer:AddProposal', 'add_member_to_role:AddProposal'],
        vote_policy: {},
      },
    ],
    default_vote_policy: { weight_kind: 'RoleWeight', quorum: '0', threshold: [1, 2] },
    proposal_bond: (ONE_NEAR / 100n).toString(),
    proposal_period: (7n * 24n * 3600n * 1_000_000_000n).toString(),
    bounty_bond: (ONE_NEAR / 100n).toString(),
    bounty_forgiveness_period: (24n * 3600n * 1_000_000_000n).toString(),
  }
}

export function createGroupTx(input: NewGroupInput): Tx {
  const args = {
    config: { name: input.displayName?.trim() || input.name, purpose: input.purpose, metadata: '' },
    policy: newGroupPolicy(input),
  }
  return {
    receiverId: FACTORY,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'create',
          args: { name: input.name, args: toBase64(JSON.stringify(args)) },
          gas: (300n * TGAS).toString(),
          deposit: input.deposit.toString(),
        },
      },
    ],
  }
}

/** "Invite": a request to add an account to a role, voted on like any other change. */
export function addMemberProposalTx(dao: Dao, memberId: string, role: string): Tx {
  return {
    receiverId: dao.id,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'add_proposal',
          args: {
            proposal: {
              description: encodeDescription({ title: `Add ${memberId} as ${role}` }),
              kind: { AddMemberToRole: { member_id: memberId, role } },
            },
          },
          gas: (100n * TGAS).toString(),
          deposit: dao.policy.proposal_bond,
        },
      },
    ],
  }
}
