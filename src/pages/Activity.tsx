import type { ActivityItem } from '../lib/activity'
import { useDao } from '../lib/store'
import { shortName, timeAgo, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { decodeDescription } from '../lib/dao'
import { Account, Avatar, Card, Empty, SectionTitle, Spinner, TxLink } from '../components/ui'

export default function Activity() {
  const { activity } = useDao()
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
      <Card>
        <SectionTitle>Every chip-in, request, approval and payout</SectionTitle>
        <ActivityList items={activity?.items} loading={!activity} full />
        {activity?.source === 'proposals-only' && (
          <p className="mt-3 text-xs text-muted">The transaction indexer is unavailable right now, so only payouts are listed.</p>
        )}
      </Card>
    </div>
  )
}

export function ActivityList({ items, loading, full }: { items?: ActivityItem[]; loading?: boolean; full?: boolean }) {
  const { dao, nearUsd } = useDao()
  if (loading)
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted">
        <Spinner /> Loading history…
      </div>
    )
  if (!items?.length) return <Empty>Nothing yet. Chip in or ask for money to get things going.</Empty>
  const byId = new Map(dao?.proposals.map((p) => [p.id, p]))
  return (
    <ul className="divide-y divide-line">
      {items.map((a, i) => {
        const p = a.proposalId != null ? byId.get(a.proposalId) : undefined
        const title = p ? decodeDescription(p.description).title : undefined
        const amt = a.amount ? `${isFinite(nearUsd) ? usd(yoctoToNumber(a.amount) * nearUsd) + ' · ' : ''}${yoctoToNear(a.amount)} NEAR` : ''
        let text: React.ReactNode
        switch (a.kind) {
          case 'chip-in':
            text = <><Account id={a.who} /> chipped in <b>{amt}</b></>
            break
          case 'request':
            text = <><Account id={a.who} /> asked for {a.amount ? <b>{amt}</b> : 'a change'}{title ? <> · <span className="text-muted">{title}</span></> : null}</>
            break
          case 'approve':
            text = <><Account id={a.who} /> approved {a.proposalId != null ? `request #${a.proposalId}` : 'a request'}{title ? <> · <span className="text-muted">{title}</span></> : null}</>
            break
          case 'reject':
            text = <><Account id={a.who} /> rejected {a.proposalId != null ? `request #${a.proposalId}` : 'a request'}{title ? <> · <span className="text-muted">{title}</span></> : null}</>
            break
          case 'payout':
            text = <>The treasury paid <b>{amt}</b> to <Account id={a.to!} />{title ? <> · <span className="text-muted">{title}</span></> : null}</>
            break
          default:
            text = <><Account id={a.who} /> sent a transaction</>
        }
        return (
          <li key={(a.txHash ?? '') + a.kind + i} className="flex items-start gap-3 py-3">
            {a.kind === 'payout' ? <PayoutIcon /> : <Avatar id={a.who} size={30} />}
            <div className="min-w-0 flex-1">
              <div className="text-sm leading-snug">
                {text}
                {!a.ok && <span className="ml-2 text-xs font-semibold text-bad">failed</span>}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                <span title={a.time.toISOString()}>{timeAgo(a.time)}</span>
                {full && a.kind !== 'payout' && <span title={a.who}>{shortName(a.who) !== a.who ? a.who : ''}</span>}
                <TxLink hash={a.txHash} label="Transaction" />
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function PayoutIcon() {
  return (
    <span className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-good-soft text-good">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </span>
  )
}
