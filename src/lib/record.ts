// Member records and payout tiers, computed only from the DAO's own history.

import { allMembers, approvalRules, isExpired, isNearTransfer, roleMembers, type Dao, type Proposal } from './dao'
import type { ActivityItem } from './activity'
import { yoctoToNumber } from './format'

export interface MemberRecord {
  accountId: string
  roles: string[]
  requested: number
  approved: number
  rejected: number
  paidOut: bigint
  chippedIn: bigint
  votes: number
  proposals: number[]
}

export function computeRecords(dao: Dao, activity: ActivityItem[]): Map<string, MemberRecord> {
  const map = new Map<string, MemberRecord>()
  const get = (id: string) => {
    let r = map.get(id)
    if (!r) {
      r = {
        accountId: id,
        roles: dao.policy.roles.filter((role) => roleMembers(role).includes(id)).map((role) => role.name),
        requested: 0,
        approved: 0,
        rejected: 0,
        paidOut: 0n,
        chippedIn: 0n,
        votes: 0,
        proposals: [],
      }
      map.set(id, r)
    }
    return r
  }
  allMembers(dao.policy).forEach(get)
  for (const p of dao.proposals) {
    if (!isNearTransfer(p.kind)) continue
    const r = get(p.proposer)
    r.requested++
    r.proposals.push(p.id)
    if (p.status === 'Approved') {
      r.approved++
      r.paidOut += BigInt(p.kind.Transfer.amount)
    } else if (p.status === 'Rejected' || p.status === 'Removed') {
      r.rejected++
    }
  }
  for (const p of dao.proposals) {
    for (const voter of Object.keys(p.votes)) {
      if (map.has(voter)) map.get(voter)!.votes++
    }
  }
  for (const a of activity) {
    if (a.kind === 'chip-in' && a.ok && a.amount) get(a.who).chippedIn += BigInt(a.amount)
  }
  return map
}

export function isTrusted(r: MemberRecord | undefined): boolean {
  if (!r) return false
  if (r.roles.includes('council') || r.roles.includes('trusted')) return true
  return r.approved >= 1 && r.rejected === 0
}

export type Tier = 'small' | 'mid' | 'large'

export const TIER_LIMITS_USD = { small: 50, mid: 500 }

export function tierFor(amountUsd: number): Tier {
  if (amountUsd <= TIER_LIMITS_USD.small) return 'small'
  if (amountUsd <= TIER_LIMITS_USD.mid) return 'mid'
  return 'large'
}

export const TIER_COPY: Record<Tier, { label: string; rule: string }> = {
  small: { label: 'Fast lane', rule: 'One nod from any trusted member' },
  mid: { label: 'Council nod', rule: 'The council approves at its usual threshold' },
  large: { label: 'Full vote', rule: 'The council votes; every member sees it on the board' },
}

export interface TierRoute {
  tier: Tier
  effectiveTier: Tier
  /** Who may give the approvals that count for this request in Terra. */
  voters: string[]
  needed: number
  reason: string
}

/**
 * Sputnik decides approval per role, not per amount, so Terra routes each request:
 * small requests from members with a clean record may be approved by one trusted member,
 * mid requests by one council member, large ones need the council's normal threshold.
 */
export function routeRequest(dao: Dao, p: Proposal, nearUsd: number, records: Map<string, MemberRecord>): TierRoute {
  const amount = isNearTransfer(p.kind) ? yoctoToNumber(p.kind.Transfer.amount) * nearUsd : Infinity
  const tier = tierFor(amount)
  const rules = approvalRules(dao.policy, p.kind)
  const council = rules.find((r) => r.role === 'council') ?? rules[0]
  const trusted = rules.find((r) => r.role === 'trusted')
  const clean = isTrusted(records.get(p.proposer))
  let effectiveTier: Tier = tier
  if (tier === 'small' && !clean) effectiveTier = 'mid'

  if (effectiveTier === 'small' && trusted) {
    return { tier, effectiveTier, voters: [...new Set([...trusted.members, ...(council?.members ?? [])])], needed: 1, reason: 'Small request from a member with a clean record' }
  }
  if (effectiveTier !== 'large' && council) {
    return {
      tier,
      effectiveTier: effectiveTier === 'small' ? 'mid' : effectiveTier,
      voters: council.members,
      needed: council.needed,
      reason: tier === 'small' && !clean ? 'Small, but the requester has no track record yet' : 'Mid-size request',
    }
  }
  return {
    tier,
    effectiveTier: 'large',
    voters: council?.members ?? [],
    needed: council?.needed ?? 1,
    reason: 'Large request: full council vote',
  }
}

export function openRequests(dao: Dao): Proposal[] {
  return dao.proposals.filter((p) => p.status === 'InProgress' && !isExpired(p, dao.policy))
}
