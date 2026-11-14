// Join by QR: invite links, join requests and the policy switch that allows them.
// A join request is an ordinary Sputnik AddMemberToRole proposal filed by the person joining.

import { kindName, roleMembers, type Dao, type Policy, type Proposal, type Role, type Tx } from './dao'
import { TGAS } from './near'

/** The role a newcomer joins as: a plain member with no fast-lane powers. */
export const MEMBER_ROLE = 'member'
const JOIN_PERMISSION = 'add_member_to_role:AddProposal'

export function joinLink(daoId: string, role: string): string {
  const url = new URL(window.location.origin + window.location.pathname)
  url.searchParams.set('dao', daoId)
  url.hash = `/join?role=${encodeURIComponent(role)}`
  return url.toString()
}

export interface JoinRequest {
  member: string
  role: string
}

export function joinRequestOf(p: Proposal): JoinRequest | null {
  if (kindName(p.kind) !== 'AddMemberToRole' || typeof p.kind !== 'object') return null
  const k = (p.kind as { AddMemberToRole: { member_id: string; role: string } }).AddMemberToRole
  return { member: k.member_id, role: k.role }
}

/** A join request is one someone filed for themselves (an invite filed by a member isn't "asking"). */
export function isSelfJoin(p: Proposal): boolean {
  const j = joinRequestOf(p)
  return !!j && j.member === p.proposer
}

function everyone(policy: Policy): Role | undefined {
  return policy.roles.find((r) => r.kind === 'Everyone')
}

/** Can anyone outside the group file a request to join? */
export function joinRequestsOpen(policy: Policy): boolean {
  const all = everyone(policy)
  return !!all && all.permissions.some((p) => p === JOIN_PERMISSION || p === 'add_member_to_role:*' || p === '*:AddProposal' || p === '*:*')
}

/** Roles a person can be invited into (named groups only). */
export function invitableRoles(policy: Policy): string[] {
  return policy.roles.filter((r) => r.kind !== 'Everyone').map((r) => r.name)
}

export function defaultJoinRole(policy: Policy): string {
  const names = invitableRoles(policy)
  if (names.includes(MEMBER_ROLE)) return MEMBER_ROLE
  return names.find((n) => n !== 'council') ?? names[0] ?? MEMBER_ROLE
}

export function pendingJoinFor(dao: Dao, accountId: string): Proposal | undefined {
  return dao.proposals.find((p) => p.status === 'InProgress' && joinRequestOf(p)?.member === accountId)
}

export function isMember(policy: Policy, accountId: string): boolean {
  return policy.roles.some((r) => roleMembers(r).includes(accountId))
}

/**
 * The policy with join requests switched on: everyone may file AddMemberToRole,
 * and there is a plain "member" role (no voting powers) to join into.
 */
export function policyWithJoinRequests(policy: Policy): Policy {
  const roles = policy.roles.map((r) =>
    r.kind === 'Everyone' && !r.permissions.includes(JOIN_PERMISSION) ? { ...r, permissions: [...r.permissions, JOIN_PERMISSION] } : r,
  )
  if (!roles.some((r) => r.kind === 'Everyone')) roles.push({ name: 'all', kind: 'Everyone', permissions: ['transfer:AddProposal', JOIN_PERMISSION], vote_policy: {} })
  if (!roles.some((r) => r.name === MEMBER_ROLE)) roles.push({ name: MEMBER_ROLE, kind: { Group: [] }, permissions: ['transfer:AddProposal'], vote_policy: {} })
  return { ...policy, roles }
}

/** A council proposal to switch join requests on, voted on like any policy change. */
export function allowJoinRequestsTx(dao: Dao): Tx {
  return {
    receiverId: dao.id,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'add_proposal',
          args: {
            proposal: {
              description:
                '* Title: Let people ask to join <br>* Notes: Anyone can file a request to join as a member, by scanning the group\'s invite QR. The council still approves each one. <br>* Via: Terra',
              kind: { ChangePolicy: { policy: policyWithJoinRequests(dao.policy) } },
            },
          },
          gas: (100n * TGAS).toString(),
          deposit: dao.policy.proposal_bond,
        },
      },
    ],
  }
}
