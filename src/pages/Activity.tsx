import { useState } from 'react'
import type { ActivityItem } from '../lib/activity'
import { useDao } from '../lib/store'
import { shortName, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { decodeDescription, isExpired, isNearTransfer, type Proposal } from '../lib/dao'
import { RowText, TxLink } from '../components/ui'

type Filter = 'All' | 'Money in' | 'Money out' | 'Requests'

export default function Activity() {
  const { activity } = useDao()
  const [filter, setFilter] = useState<Filter>('All')
  const items = (activity?.items ?? []).filter((a) => {
    if (filter === 'Money in') return a.kind === 'chip-in'
    if (filter === 'Money out') return a.kind === 'payout'
    if (filter === 'Requests') return a.kind === 'request' || a.kind === 'approve' || a.kind === 'reject'
    return true
  })
  return (
    <div>
      <div className="text-[13px] text-muted">Activity</div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[32px] font-light tracking-[-0.03em]">Everything in and out</h1>
        <div className="flex flex-wrap gap-1 text-[13px]">
          {(['All', 'Money in', 'Money out', 'Requests'] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-3 py-1.5 ${filter === f ? 'bg-card ring-1 ring-line' : 'text-muted hover:text-ink'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-8 max-w-[960px]">
        <ActivityList items={activity ? items : undefined} loading={!activity} />
        {activity?.source === 'proposals-only' && (
          <p className="mt-3 text-[12px] text-muted">The transaction indexer is unavailable right now, so only payouts are listed.</p>
        )}
      </div>
    </div>
  )
}

function dayLabel(d: Date): string {
  const today = new Date()
  const y = new Date(today)
  y.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, y)) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

/** Rows grouped by day: description · receipt · amount. */
export function ActivityList({ items, loading }: { items?: ActivityItem[]; loading?: boolean }) {
  const { dao, nearUsd } = useDao()
  if (loading)
    return (
      <div className="space-y-4" aria-busy>
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
        <div className="skeleton h-4 w-4/6" />
      </div>
    )
  if (!items?.length) return <div className="border-y border-line py-8 text-[13.5px] text-muted">Nothing here yet. Chip in or request money to get things going.</div>
  const byId = new Map(dao?.proposals.map((p) => [p.id, p]))
  const money = (y?: string) => (y ? (isFinite(nearUsd) ? usd(yoctoToNumber(y) * nearUsd) : `${yoctoToNear(y)} NEAR`) : '')

  const groups: { label: string; rows: ActivityItem[] }[] = []
  for (const a of items) {
    const label = dayLabel(a.time)
    const g = groups[groups.length - 1]
    if (g && g.label === label) g.rows.push(a)
    else groups.push({ label, rows: [a] })
  }

  return (
    <div className="text-[13.5px]">
      {groups.map((g, gi) => (
        <div key={g.label + gi} className={gi ? 'mt-6' : ''}>
          <div className="border-b border-line pb-2 text-[12px] text-muted">{g.label}</div>
          {g.rows.map((a, i) => {
            const p = a.proposalId != null ? byId.get(a.proposalId) : undefined
            const { text, amount, tone } = describe(a, p, money, dao ? (q: Proposal) => isExpired(q, dao.policy) : () => false)
            return (
              <div key={(a.txHash ?? '') + a.kind + i} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-4 border-b border-line py-3.5 last:border-0 sm:gap-8">
                <span className="flex min-w-0 items-baseline gap-2">
                  {text}
                  {!a.ok && <span className="shrink-0 text-[12px] text-bad">failed</span>}
                </span>
                {a.txHash ? <TxLink hash={a.txHash} label="Receipt" /> : <span />}
                <span className={`tnum w-24 text-right ${tone}`}>{amount}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function describe(a: ActivityItem, p: Proposal | undefined, money: (y?: string) => string, expired: (p: Proposal) => boolean) {
  const meta = p ? decodeDescription(p.description) : undefined
  const title = meta?.title
  const wants = meta?.wants?.replace(/\s+to\s+\S+$/, '')
  const who = shortName(a.who)
  const votes = p ? Object.values(p.votes) : []
  const yes = votes.filter((v) => v === 'Approve').length
  const row = (main: string, detail?: string) => <RowText main={main} detail={detail} />
  switch (a.kind) {
    case 'chip-in':
      return { text: row(`${who} chipped in`, `${yoctoToNear(a.amount ?? '0')} NEAR`), amount: `+${money(a.amount)}`, tone: 'text-good' }
    case 'payout': {
      const bits = [`paid to ${shortName(a.to ?? '')}`, wants ? `asked for ${wants}` : '', yes ? `${yes} approval${yes === 1 ? '' : 's'}` : ''].filter(Boolean)
      return { text: row(title ?? 'Payout', bits.join(' · ')), amount: `−${money(a.amount)}`, tone: '' }
    }
    case 'request': {
      const status = !p ? '' : p.status === 'InProgress' ? (expired(p) ? 'expired' : `waiting, ${yes} approval${yes === 1 ? '' : 's'}`) : p.status === 'Approved' ? 'paid' : p.status.toLowerCase()
      const isMoney = p && isNearTransfer(p.kind)
      return {
        text: row(title ?? `request #${a.proposalId}`, [`${who} ${isMoney ? 'asked for money' : 'proposed a change'}`, status].filter(Boolean).join(' · ')),
        amount: a.amount ? money(a.amount) : '',
        tone: 'text-muted',
      }
    }
    case 'approve':
    case 'reject':
      return { text: row(title ?? `request #${a.proposalId}`, `${a.kind === 'approve' ? 'approved' : 'declined'} by ${who}`), amount: '', tone: '' }
    default:
      return { text: row(`${who} sent a transaction`), amount: '', tone: '' }
  }
}
