import { useDao } from '../lib/store'
import { roleMembers } from '../lib/dao'
import { usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { TIER_COPY, TIER_LIMITS_USD, isTrusted, type MemberRecord } from '../lib/record'
import { Account, Avatar, Badge, Card, SectionTitle } from '../components/ui'

export default function Members() {
  const { dao } = useDao()
  if (!dao) return null
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Members and records</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Every record is computed from this DAO's own history on NEAR, so anyone can check it. A clean record earns the fast lane for small requests.
        </p>
      </div>
      <RecordsTable />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>How approvals work here</SectionTitle>
          <ul className="space-y-3 text-sm">
            <li><Badge tone="brand">{TIER_COPY.small.label}</Badge> <span className="ml-2">Up to ${TIER_LIMITS_USD.small}, from a member with a clean record: {TIER_COPY.small.rule.toLowerCase()}.</span></li>
            <li><Badge tone="brand">{TIER_COPY.mid.label}</Badge> <span className="ml-2">${TIER_LIMITS_USD.small}–${TIER_LIMITS_USD.mid}, or anyone without a record yet: {TIER_COPY.mid.rule.toLowerCase()}.</span></li>
            <li><Badge tone="brand">{TIER_COPY.large.label}</Badge> <span className="ml-2">Over ${TIER_LIMITS_USD.mid}: {TIER_COPY.large.rule.toLowerCase()}.</span></li>
          </ul>
          <p className="mt-4 text-xs text-muted">
            The DAO contract decides approvals by role. Terra sends each request to the right role by its size and the requester's record.
          </p>
        </Card>
        <Card>
          <SectionTitle>Roles in the DAO policy</SectionTitle>
          <ul className="space-y-3 text-sm">
            {dao.policy.roles.map((r) => (
              <li key={r.name}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-xs text-muted">{r.kind === 'Everyone' ? 'anyone' : `${roleMembers(r).length} member${roleMembers(r).length === 1 ? '' : 's'}`}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.permissions.map((perm) => (
                    <code key={perm} className="rounded bg-soft px-1.5 py-0.5 text-[11px] text-muted">{perm}</code>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

export function RecordsTable({ readOnly }: { readOnly?: boolean }) {
  const { records, nearUsd } = useDao()
  const rows = [...records.values()].sort((a, b) => b.approved - a.approved || b.votes - a.votes)
  const money = (y: bigint) => (y === 0n ? '—' : isFinite(nearUsd) ? usd(yoctoToNumber(y) * nearUsd) : `${yoctoToNear(y)} NEAR`)
  return (
    <Card className="overflow-x-auto !p-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-5 py-3 font-semibold">Member</th>
            <th className="px-3 py-3 font-semibold">Roles</th>
            <th className="px-3 py-3 text-right font-semibold">Asked</th>
            <th className="px-3 py-3 text-right font-semibold">Approved</th>
            <th className="px-3 py-3 text-right font-semibold">Rejected</th>
            <th className="px-3 py-3 text-right font-semibold">Approved total</th>
            <th className="px-3 py-3 text-right font-semibold">Chipped in</th>
            <th className="px-3 py-3 text-right font-semibold">Votes</th>
            <th className="px-5 py-3 font-semibold">Lane</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r: MemberRecord) => (
            <tr key={r.accountId}>
              <td className="px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <Avatar id={r.accountId} size={26} />
                  <Account id={r.accountId} />
                </div>
              </td>
              <td className="px-3 py-3 text-xs text-muted">{r.roles.join(', ') || 'none'}</td>
              <td className="px-3 py-3 text-right tabular-nums">{r.requested}</td>
              <td className="px-3 py-3 text-right tabular-nums">{r.approved}</td>
              <td className="px-3 py-3 text-right tabular-nums">{r.rejected}</td>
              <td className="px-3 py-3 text-right tabular-nums">{money(r.paidOut)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{money(r.chippedIn)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{r.votes}</td>
              <td className="px-5 py-3">{isTrusted(r) ? <Badge tone="good">Fast lane</Badge> : <Badge>Council</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && rows.length === 0 && <div className="p-5 text-sm text-muted">No members found in the policy.</div>}
    </Card>
  )
}
