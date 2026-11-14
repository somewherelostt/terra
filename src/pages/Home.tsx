import { useEffect, useRef, useState } from 'react'
import { go, shareUrl, useDao, useRoute, type Page } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { allMembers, chipInTx, decodeDescription } from '../lib/dao'
import { nearToYocto, splitUsd, timeAgo, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { displayName, useNames } from '../lib/profile'
import { openRequests } from '../lib/record'
import type { ActivityItem } from '../lib/activity'
import { Avatar, Button, RowText, TxLink, TxStatus, useTx } from '../components/ui'
import { prettyName } from '../App'
import { useCountUp, useDelta } from '../lib/motion'
import { RequestCard } from './Approve'
import { AddNameNudge, openProfileSheet } from '../components/ProfileSheet'

export default function Home() {
  useNames()
  const { dao, nearUsd, activity, refresh, tracks } = useDao()
  const { accountId } = useWallet()
  const [copied, setCopied] = useState(false)
  const route = useRoute()
  const [chipOpen, setChipOpen] = useState(() => route.params.get('chip') === '1')
  if (!dao) return null
  const open = openRequests(dao)
  const members = allMembers(dao.policy)
  const total = dao.spendable + dao.staked
  const balanceUsd = yoctoToNumber(total) * nearUsd
  const name = prettyName(dao.config.name)
  const empty = total === 0n
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime()
  const paidThisYear = (activity?.items ?? []).filter((a) => a.kind === 'payout' && a.time.getTime() >= yearStart).reduce((s, a) => s + BigInt(a.amount ?? '0'), 0n)
  const waits = (activity?.items ?? [])
    .filter((a) => a.kind === 'payout' && a.txHash && a.proposalId != null)
    .map((a) => {
      const p = dao.proposals.find((x) => x.id === a.proposalId)
      return p ? (a.time.getTime() - Number(BigInt(p.submission_time) / 1_000_000n)) / 60000 : NaN
    })
    .filter((m) => isFinite(m) && m >= 0)
    .sort((a, b) => a - b)
  const median = waits.length ? waits[Math.floor(waits.length / 2)] : NaN
  const mine = open.filter((p) => !accountId || !p.votes[accountId])
  const trackedId = Object.keys(tracks).map(Number)[0]
  const next = (trackedId != null ? dao.proposals.find((p) => p.id === trackedId) : undefined) ?? [...mine].sort((a, b) => a.id - b.id)[0]
  const steps = activity
    ? {
        chipped: activity.items.some((a) => a.kind === 'chip-in'),
        invited: members.length > 1,
        requested: dao.proposals.length > 0,
      }
    : null
  const showGuide = !!steps && dao.proposals.length < 5 && !(steps.chipped && steps.invited && steps.requested)
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div>
      {chipOpen && <ChipInDialog daoId={dao.id} signedIn={!!accountId} nearUsd={nearUsd} onDone={refresh} name={name} onClose={() => setChipOpen(false)} />}
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span>Home</span>
        {accountId ? (
          <button type="button" className="flex min-h-11 min-w-0 items-center gap-2 hover:text-ink md:min-h-0" title={`${accountId} · Edit profile`} onClick={openProfileSheet}>
            <span className="truncate">{displayName(accountId)}</span>
            <Avatar id={accountId} size={24} />
          </button>
        ) : (
          <span>{today}</span>
        )}
      </div>

      {allMembers(dao.policy).includes(accountId ?? '') && <AddNameNudge className="mt-6 max-w-sm" />}

      <div className="mt-10 text-[13px] text-muted">{name} holds</div>
      <Balance usd={balanceUsd} muted={empty} />
      {empty && <p className="mt-4 max-w-md text-[14px] text-muted">Your treasury is ready. Be the first to chip in, then invite the others.</p>}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted">
        <span className="tnum">{yoctoToNear(total)} NEAR</span>
        {dao.staked > 0n && (
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-good" />
            <span className="text-good">Earning on {yoctoToNear(dao.staked, 0)} NEAR staked</span>
          </span>
        )}
        {isFinite(nearUsd) && <span className="tnum">1 NEAR = {usd(nearUsd)}</span>}
      </div>
      <div className="mt-8 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button onClick={() => setChipOpen(true)}>Chip in</Button>
        <Button variant="secondary" onClick={() => go('pay')}>Request money</Button>
        <Button
          variant="secondary"
          className="max-sm:hidden"
          onClick={() => navigator.clipboard?.writeText(shareUrl(dao.id, 'board')).then(() => setCopied(true)).catch(() => setCopied(false))}
        >
          {copied ? 'Board link copied' : 'Share board'}
        </Button>
      </div>

      {dao.proposals.length > 0 && (
      <div className="mt-12 grid grid-cols-3 border-y border-line">
        <Stat label="Members" value={<CountNumber value={members.length} format={(n) => String(Math.round(n))} />} className="border-r border-line pr-5" />
        <Stat
          label="Paid out this year"
          value={activity ? (isFinite(nearUsd) ? <CountNumber value={yoctoToNumber(paidThisYear) * nearUsd} format={usd} /> : `${yoctoToNear(paidThisYear, 0)} NEAR`) : null}
          className="border-r border-line px-5"
        />
        <Stat label="Median time to pay" value={activity ? (isFinite(median) ? formatWait(median) : '—') : null} className="px-5" />
      </div>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between text-[13px] text-muted">
            <span>Activity</span>
            <button className="-my-3 py-3 pl-4 hover:text-ink" onClick={() => go('activity')}>See all</button>
          </div>
          <HomeActivity items={activity?.items.slice(0, 4)} loading={!activity} nearUsd={nearUsd} />
        </div>
        <div className={`space-y-5 ${showGuide && !next ? 'max-lg:order-first' : ''}`}>
          {next ? (
            <RequestCard p={next} />
          ) : showGuide && steps ? (
            <GetStarted name={name} steps={steps} onChipIn={() => setChipOpen(true)} />
          ) : (
            <CaughtUp />
          )}
          {mine.length > 1 && (
            <button onClick={() => go('approve')} className="-mt-2 py-3 text-[13px] text-muted hover:text-ink">
              {mine.length - 1} more waiting in Approve →
            </button>
          )}
        </div>
      </div>
      <PhoneMore />
    </div>
  )
}

/** On a phone the bottom bar has room for six pages; the rest live here, under Home. */
function PhoneMore() {
  const rows: [Page, string, string][] = [
    ['activity', 'Activity', 'Everything in and out'],
    ['earn', 'Earn', 'Let idle money earn'],
    ['allowances', 'Allowances', 'Small budgets with hard limits'],
  ]
  return (
    <nav className="mt-12 md:hidden" aria-label="More pages">
      <div className="mb-1 text-[13px] text-muted">More</div>
      <div className="border-y border-line">
        {rows.map(([page, label, detail]) => (
          <button
            key={page}
            onClick={() => go(page)}
            className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-line py-3 text-left last:border-0"
          >
            <span className="min-w-0">
              <span className="block text-[14px]">{label}</span>
              <span className="block truncate text-[12px] text-muted">{detail}</span>
            </span>
            <span className="text-muted" aria-hidden>
              ›
            </span>
          </button>
        ))}
      </div>
    </nav>
  )
}

/** The big balance: counts up on first load, rolls on change, with a floating delta. */
function Balance({ usd: value, muted }: { usd: number; muted: boolean }) {
  const shown = useCountUp(value)
  const d = useDelta(value)
  const [dollars, cents] = splitUsd(shown)
  return (
    <div className={`tnum relative mt-3 inline-block text-[64px] font-light leading-[0.88] tracking-[-0.055em] sm:text-[96px] lg:text-[112px] ${muted ? 'text-muted' : ''}`}>
      {dollars}
      <span className="text-muted">{cents}</span>
      {d && (
        <span key={d.key} className="delta left-full top-2 ml-4 text-[22px] tracking-normal" style={d.delta < 0 ? { color: 'var(--mute)' } : undefined}>
          {d.delta > 0 ? '+' : '−'}
          {usd(Math.abs(d.delta))}
        </span>
      )}
    </div>
  )
}

function CountNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const shown = useCountUp(value, 800, 800)
  return <>{format(shown)}</>
}

function Stat({ label, value, className = '' }: { label: string; value: React.ReactNode | null; className?: string }) {
  return (
    <div className={`flex flex-col justify-between gap-1.5 py-5 ${className}`}>
      <div className="text-[12px] leading-snug text-muted">{label}</div>
      {value == null ? (
        <div className="skeleton mt-1 h-6 w-20 max-w-full" />
      ) : (
        <div className="tnum text-[22px] font-light tracking-tight sm:text-[28px]">{value}</div>
      )}
    </div>
  )
}

function formatWait(min: number): string {
  if (min < 60) return `${Math.max(1, Math.round(min))} min`
  if (min < 48 * 60) return `${Math.round(min / 60)} h`
  return `${Math.round(min / 1440)} days`
}

function HomeActivity({ items, loading, nearUsd }: { items?: ActivityItem[]; loading: boolean; nearUsd: number }) {
  useNames()
  const { dao } = useDao()
  if (loading)
    return (
      <div className="flex items-center gap-2 py-6 text-[13px] text-muted">
        <span className="skeleton block h-4 w-full" />
      </div>
    )
  if (!items?.length) return <div className="border-b border-line py-6 text-[13.5px] text-muted">No money in or out yet. The first chip-in shows up here.</div>
  const byId = new Map(dao?.proposals.map((p) => [p.id, p]))
  const money = (y?: string) => (y ? (isFinite(nearUsd) ? usd(yoctoToNumber(y) * nearUsd) : `${yoctoToNear(y)} NEAR`) : '')
  return (
    <div className="text-[13.5px]">
      {items.map((a, i) => {
        const p = a.proposalId != null ? byId.get(a.proposalId) : undefined
        const title = p ? decodeDescription(p.description).title : undefined
        let label: React.ReactNode
        let amount: React.ReactNode = null
        switch (a.kind) {
          case 'chip-in':
            label = <RowText main={`${displayName(a.who)} chipped in`} detail={`${yoctoToNear(a.amount ?? '0')} NEAR`} />
            amount = <span className="text-good">+{money(a.amount)}</span>
            break
          case 'payout':
            label = <RowText main={title ?? 'Payout'} detail={`paid to ${displayName(a.to ?? '')}`} />
            amount = <>−{money(a.amount)}</>
            break
          case 'request':
            label = <RowText main={title ?? 'a change'} detail={`${displayName(a.who)} is asking`} />
            amount = a.amount ? <span className="text-muted">{money(a.amount)}</span> : null
            break
          case 'approve':
          case 'reject':
            label = <RowText main={title ?? `request #${a.proposalId}`} detail={`${a.kind === 'approve' ? 'approved' : 'declined'} by ${displayName(a.who)}`} />
            break
          default:
            label = <>{displayName(a.who)} sent a transaction</>
        }
        return (
          <div key={(a.txHash ?? '') + a.kind + i} className="flex items-center justify-between gap-4 border-b border-line py-3.5 last:border-0">
            <span className="flex min-w-0 items-center gap-2.5">
              <Avatar id={a.kind === 'payout' ? (a.to ?? a.who) : a.who} size={22} />
              {label}
              <span className="hidden shrink-0 text-[12px] text-muted sm:inline">{timeAgo(a.time)}</span>
            </span>
            <span className="tnum flex shrink-0 items-baseline gap-3">
              {amount}
              <span className="hidden sm:inline">
                <TxLink hash={a.txHash} label="tx" />
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** First-run guide for a new group: three steps, each ticks itself off from what is on chain. */
function GetStarted({
  name,
  steps,
  onChipIn,
}: {
  name: string
  steps: { chipped: boolean; invited: boolean; requested: boolean }
  onChipIn: () => void
}) {
  const rows = [
    { done: steps.chipped, title: 'Chip in the first money', text: `It goes straight into ${name}'s treasury.`, action: 'Chip in', onClick: onChipIn },
    { done: steps.invited, title: 'Invite the others', text: 'Add the people who chip in and ask for money.', action: 'Invite', onClick: () => go('members') },
    { done: steps.requested, title: 'Make the first request', text: 'Ask for money for something the group needs.', action: 'Request', onClick: () => go('pay') },
  ]
  const left = rows.filter((r) => !r.done).length
  return (
    <div className="rounded-2xl border border-line p-6">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[15px]">Get {name} going</div>
        <div className="tnum shrink-0 text-[12px] text-muted">{3 - left} of 3 done</div>
      </div>
      <ol className="mt-4">
        {rows.map((r, i) => (
          <li key={r.title} className="flex items-center gap-3 border-t border-line py-3.5">
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full text-[12px] ${r.done ? 'bg-brand text-on-brand' : 'border border-line text-muted'}`}
              aria-hidden
            >
              {r.done ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
              ) : (
                i + 1
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-[13.5px] ${r.done ? 'text-muted line-through decoration-[var(--line)]' : ''}`}>{r.title}</span>
              {!r.done && <span className="block text-[12px] text-muted">{r.text}</span>}
            </span>
            {!r.done && (
              <button onClick={r.onClick} className="min-h-11 shrink-0 rounded-lg border border-line bg-card px-3 text-[13px] font-medium hover:bg-soft sm:min-h-9">
                {r.action}
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

function CaughtUp() {
  return (
    <div className="rounded-2xl border border-line p-8 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full border border-line">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
      </div>
      <div className="mt-4 text-[15px]">You're all caught up</div>
      <p className="mt-1 text-[13px] text-muted">No requests are waiting on you. New ones show up here.</p>
    </div>
  )
}

function ChipInDialog({
  daoId,
  signedIn,
  nearUsd,
  onDone,
  name,
  onClose,
}: {
  daoId: string
  signedIn: boolean
  nearUsd: number
  onDone: () => Promise<void>
  name: string
  onClose: () => void
}) {
  const [amount, setAmount] = useState('1')
  const { send, signIn } = useWallet()
  const tx = useTx()
  const yocto = nearToYocto(amount)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 grid items-end glass-scrim sm:place-items-center sm:p-4" onClick={onClose} role="dialog" aria-modal aria-label="Chip in">
      <div className="w-full glass glass-sheet rounded-t-2xl border border-line bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-[420px] sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span>Chip in</span>
          <button onClick={onClose} className="-my-3 py-3 pl-4 hover:text-ink" aria-label="Close">Close</button>
        </div>
        <p className="mt-1 text-[13.5px] text-muted">Goes straight to {name}'s treasury. Everyone sees it in the activity.</p>
        <label className="mt-6 block border-b border-line pb-2">
          <span className="text-[12px] text-muted">Amount</span>
          <div className="mt-1 flex items-baseline gap-2">
            <input
              ref={ref}
              className="tnum w-full bg-transparent text-[56px] font-light leading-none tracking-[-0.05em] outline-none"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                tx.reset()
              }}
              aria-label="Chip in amount in NEAR"
            />
            <span className="text-[15px] text-muted">NEAR</span>
          </div>
        </label>
        <div className="mt-2 h-4 text-[12px] text-muted">{yocto && isFinite(nearUsd) ? `≈ ${usd(yoctoToNumber(yocto) * nearUsd)}` : ''}</div>
        <div className="mt-5">
          {signedIn ? (
            <Button
              className="w-full !py-3"
              disabled={!yocto || yocto <= 0n || tx.state.status === 'signing'}
              onClick={() => yocto && tx.run(() => send(chipInTx(daoId, yocto)), onDone)}
            >
              Chip in {yocto ? `${amount} NEAR` : ''}
            </Button>
          ) : (
            <Button className="w-full !py-3" onClick={signIn}>Sign in to chip in</Button>
          )}
        </div>
        <div className="mt-3">
          <TxStatus state={tx.state} doneText="Thanks! It reached the treasury." />
        </div>
      </div>
    </div>
  )
}
