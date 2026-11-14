// Member records and payout tiers, computed only from the DAO's own history.

import { allMembers, approvalRules, isExpired, isNearTransfer, isRole, roleMembers, type Dao, type Proposal } from './dao'
import type { ActivityItem } from './activity'
import { yoctoToNumber } from './format'
import { t } from '../i18n'

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
  if (r.roles.some((n) => isRole(n, 'council') || isRole(n, 'trusted'))) return true
  return r.approved >= 1 && r.rejected === 0
}

export type Tier = 'small' | 'mid' | 'large'

export const TIER_LIMITS_USD = { small: 50, mid: 500 }

export function tierFor(amountUsd: number): Tier {
  if (amountUsd <= TIER_LIMITS_USD.small) return 'small'
  if (amountUsd <= TIER_LIMITS_USD.mid) return 'mid'
  return 'large'
}

/** English tier copy. Pay writes `label` into the proposal description, so this stays English (chain text). */
export const TIER_COPY: Record<Tier, { label: string; rule: string }> = {
  small: { label: 'Fast lane', rule: 'One nod from a trusted member other than the requester' },
  mid: { label: 'Council nod', rule: 'The council approves at its usual threshold' },
  large: { label: 'Full vote', rule: 'The council votes at its usual threshold; it stays on the public board while open' },
}

/** On-screen tier name in the current language. Use TIER_COPY for text sent on chain. */
export function tierLabel(tier: Tier): string {
  return { small: t('record.tier.small.label'), mid: t('record.tier.mid.label'), large: t('record.tier.large.label') }[tier]
}

/** On-screen approval rule for a tier, in the current language. */
export function tierRule(tier: Tier): string {
  return { small: t('record.tier.small.rule'), mid: t('record.tier.mid.rule'), large: t('record.tier.large.rule') }[tier]
}

export interface TierRoute {
  tier: Tier
  effectiveTier: Tier
  /** Who may give the approvals that count for this request in Terra. */
  voters: string[]
  needed: number
  /** Shown on screen, in the current language. */
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
  const council = rules.find((r) => isRole(r.role, 'council')) ?? rules[0]
  const trusted = rules.find((r) => isRole(r.role, 'trusted'))
  const clean = isTrusted(records.get(p.proposer))
  let effectiveTier: Tier = tier
  let noNodder = false
  if (tier === 'small' && !clean) effectiveTier = 'mid'

  if (effectiveTier === 'small' && trusted) {
    // Fast lane: one trusted member who isn't the requester. Only the trusted role's
    // threshold is 1, so council-only members can't give the single nod.
    const nodders = trusted.members.filter((m) => m !== p.proposer)
    if (nodders.length) return { tier, effectiveTier, voters: nodders, needed: 1, reason: t('record.reason.smallClean') }
    effectiveTier = 'mid'
    noNodder = true
  }
  if (effectiveTier !== 'large' && council) {
    return {
      tier,
      effectiveTier: effectiveTier === 'small' ? 'mid' : effectiveTier,
      voters: council.members,
      needed: council.needed,
      reason:
        tier === 'small' && !clean
          ? t('record.reason.smallNoRecord')
          : noNodder
            ? t('record.reason.smallNoNodder')
            : t('record.reason.mid'),
    }
  }
  return {
    tier,
    effectiveTier: 'large',
    voters: council?.members ?? [],
    needed: council?.needed ?? 1,
    reason: t('record.reason.large'),
  }
}

export function openRequests(dao: Dao): Proposal[] {
  return dao.proposals.filter((p) => p.status === 'InProgress' && !isExpired(p, dao.policy))
}
