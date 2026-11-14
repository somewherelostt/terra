import { useState, type ReactNode } from 'react'
import type { ActivityItem } from '../lib/activity'
import { go, useDao } from '../lib/store'
import { usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { displayName, useNames } from '../lib/profile'
import { decodeDescription, isExpired, isNearTransfer, type Proposal } from '../lib/dao'
import { Avatar, Button, EmptyState, RowText, TxLink } from '../components/ui'
import { formatDate, t as translate, tr, useT } from '../i18n'

type Filter = 'all' | 'in' | 'out' | 'requests'

export default function Activity() {
  const t = useT()
  const { activity } = useDao()
  const [filter, setFilter] = useState<Filter>('all')
  const items = (activity?.items ?? []).filter((a) => {
    if (filter === 'in') return a.kind === 'chip-in'
    if (filter === 'out') return a.kind === 'payout'
    if (filter === 'requests') return a.kind === 'request' || a.kind === 'approve' || a.kind === 'reject'
    return true
  })
  const filterLabels: Record<Filter, string> = {
    all: t('activity.filter.all'),
    in: t('activity.filter.in'),
    out: t('activity.filter.out'),
    requests: t('activity.filter.requests'),
  }
  return (
    <div>
      <div className="text-[13px] text-muted">{t('activity.eyebrow')}</div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[32px] font-light tracking-[-0.03em]">{t('activity.title')}</h1>
        <div className="flex flex-wrap gap-1 text-[13px]">
          {(['all', 'in', 'out', 'requests'] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-3 py-3 sm:py-1.5 ${filter === f ? 'bg-card ring-1 ring-line' : 'text-muted hover:text-ink'}`}>
              {filterLabels[f]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-8 max-w-[960px]">
        <ActivityList items={activity ? items : undefined} loading={!activity} />
        {activity?.source === 'proposals-only' && (
          <p className="mt-3 text-[12px] text-muted">{t('activity.indexerDown')}</p>
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
  if (same(d, today)) return translate('activity.today')
  if (same(d, y)) return translate('activity.yesterday')
  return formatDate(d, { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

/** Rows grouped by day: description · receipt · amount. */
export function ActivityList({ items, loading }: { items?: ActivityItem[]; loading?: boolean }) {
  const t = useT()
  useNames()
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
  if (!items?.length)
    return (
      <EmptyState icon="list" title={t('activity.empty.title')} text={t('activity.empty.text')}>
        <Button onClick={() => go('home', { chip: '1' })}>{t('activity.empty.chipIn')}</Button>
        <Button variant="secondary" onClick={() => go('pay')}>{t('activity.empty.request')}</Button>
      </EmptyState>
    )
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
              <div key={(a.txHash ?? '') + a.kind + i} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-line py-3.5 last:border-0 sm:gap-8">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar id={a.kind === 'payout' ? (a.to ?? a.who) : a.who} size={22} />
                  {text}
                  {!a.ok && <span className="shrink-0 text-[12px] text-bad">{t('activity.failed')}</span>}
                </span>
                <span className="hidden sm:inline">{a.txHash ? <TxLink hash={a.txHash} label={t('activity.receipt')} /> : null}</span>
                <span className={`tnum w-20 text-end sm:w-24 ${tone}`}>{amount}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Request status words, by Sputnik proposal status. */
function statusText(status: Proposal['status']): string {
  switch (status) {
    case 'Approved':
      return translate('activity.status.paid')
    case 'Rejected':
      return translate('activity.status.rejected')
    case 'Removed':
      return translate('activity.status.removed')
    case 'Expired':
      return translate('activity.status.expired')
    case 'Moved':
      return translate('activity.status.moved')
    case 'Failed':
      return translate('activity.status.failed')
    default:
      return String(status).toLowerCase()
  }
}

function describe(a: ActivityItem, p: Proposal | undefined, money: (y?: string) => string, expired: (p: Proposal) => boolean) {
  const meta = p ? decodeDescription(p.description) : undefined
  const title = meta?.title
  const wants = meta?.wants?.replace(/\s+to\s+\S+$/, '')
  const who = displayName(a.who)
  const votes = p ? Object.values(p.votes) : []
  const yes = votes.filter((v) => v === 'Approve').length
  const row = (main: ReactNode, detail?: ReactNode) => <RowText main={main} detail={detail} />
  const request = title ?? translate('activity.requestNumber', { id: String(a.proposalId ?? '') })
  switch (a.kind) {
    case 'chip-in':
      return { text: row(tr('activity.row.chippedIn', { name: who }), `${yoctoToNear(a.amount ?? '0')} NEAR`), amount: `+${money(a.amount)}`, tone: 'text-good' }
    case 'payout': {
      const bits = [
        translate('activity.row.paidTo', { name: displayName(a.to ?? '') }),
        wants ? translate('activity.row.askedFor', { amount: wants }) : '',
        yes ? translate('activity.row.approvals', { count: yes }) : '',
      ].filter(Boolean)
      return { text: row(title ?? translate('activity.row.payout'), bits.join(' · ')), amount: `−${money(a.amount)}`, tone: '' }
    }
    case 'request': {
      const status = !p
        ? ''
        : p.status === 'InProgress'
          ? expired(p)
            ? translate('activity.status.expired')
            : translate('activity.status.waiting', { count: yes })
          : statusText(p.status)
      const isMoney = p && isNearTransfer(p.kind)
      const action = isMoney ? translate('activity.row.askedForMoney', { name: who }) : translate('activity.row.proposedChange', { name: who })
      return {
        text: row(request, [action, status].filter(Boolean).join(' · ')),
        amount: a.amount ? money(a.amount) : '',
        tone: 'text-muted',
      }
    }
    case 'approve':
    case 'reject':
      return { text: row(request, translate(a.kind === 'approve' ? 'activity.row.approvedBy' : 'activity.row.declinedBy', { name: who })), amount: '', tone: '' }
    default:
      return { text: row(tr('activity.row.sentTx', { name: who })), amount: '', tone: '' }
  }
}
