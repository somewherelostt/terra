import { useEffect, useRef, useState } from 'react'
import { go, shareUrl, useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { allMembers, chipInTx, decodeDescription } from '../lib/dao'
import { nearToYocto, shortName, splitUsd, timeAgo, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { openRequests } from '../lib/record'
import type { ActivityItem } from '../lib/activity'
import { Avatar, Button, Spinner, TxLink, TxStatus, useTx } from '../components/ui'
import { prettyName } from '../App'
import { RequestCard } from './Approve'

export default function Home() {
  const { dao, nearUsd, activity, refresh } = useDao()
  const { accountId } = useWallet()
  const [copied, setCopied] = useState(false)
  const [chipOpen, setChipOpen] = useState(false)
  if (!dao) return null
  const open = openRequests(dao)
  const members = allMembers(dao.policy)
  const total = dao.spendable + dao.staked
  const [dollars, cents] = splitUsd(yoctoToNumber(total) * nearUsd)
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
  const next = [...mine].sort((a, b) => a.id - b.id)[0]
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div>
      {chipOpen && <ChipInDialog daoId={dao.id} signedIn={!!accountId} nearUsd={nearUsd} onDone={refresh} name={name} onClose={() => setChipOpen(false)} />}
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span>Home</span>
        {accountId ? (
          <span className="flex items-center gap-2" title={accountId}>
            {accountId}
            <Avatar id={accountId} size={24} />
          </span>
        ) : (
          <span>{today}</span>
        )}
      </div>

      <div className="mt-10 text-[13px] text-muted">{name} holds</div>
      <div className={`tnum mt-3 text-[64px] font-light leading-[0.88] tracking-[-0.055em] sm:text-[96px] lg:text-[112px] ${empty ? 'text-muted' : ''}`}>
        {dollars}
        <span className="text-muted">{cents}</span>
      </div>
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
      <div className="mt-8 flex flex-wrap gap-2">
        <Button onClick={() => setChipOpen(true)}>Chip in</Button>
        <Button variant="secondary" onClick={() => go('pay')}>Request money</Button>
        <Button
          variant="secondary"
          onClick={() => navigator.clipboard?.writeText(shareUrl(dao.id, 'board')).then(() => setCopied(true)).catch(() => setCopied(false))}
        >
          {copied ? 'Board link copied' : 'Share board'}
        </Button>
      </div>

      <div className="mt-12 grid grid-cols-3 border-y border-line">
        <Stat label="Members" value={String(members.length)} className="border-r border-line pr-5" />
        <Stat
          label="Paid out this year"
          value={activity ? (isFinite(nearUsd) ? usd(yoctoToNumber(paidThisYear) * nearUsd) : `${yoctoToNear(paidThisYear, 0)} NEAR`) : null}
          className="border-r border-line px-5"
        />
        <Stat label="Median time to pay" value={activity ? (isFinite(median) ? formatWait(median) : '—') : null} className="px-5" />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between text-[13px] text-muted">
            <span>Activity</span>
            <button className="hover:text-ink" onClick={() => go('activity')}>See all</button>
          </div>
          <HomeActivity items={activity?.items.slice(0, 4)} loading={!activity} nearUsd={nearUsd} />
        </div>
        <div className="space-y-5">
          {next ? <RequestCard p={next} /> : <CaughtUp />}
          {mine.length > 1 && (
            <button onClick={() => go('approve')} className="text-[13px] text-muted hover:text-ink">
              {mine.length - 1} more waiting in Approve →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, className = '' }: { label: string; value: string | null; className?: string }) {
  return (
    <div className={`py-5 ${className}`}>
      <div className="text-[12px] text-muted">{label}</div>
      {value == null ? (
        <div className="skeleton mt-2.5 h-6 w-20" />
      ) : (
        <div className="tnum mt-1.5 text-[22px] font-light tracking-tight sm:text-[28px]">{value}</div>
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
  const { dao } = useDao()
  if (loading)
    return (
      <div className="flex items-center gap-2 py-6 text-[13px] text-muted">
        <Spinner /> Loading history…
      </div>
    )
  if (!items?.length) return <div className="border-b border-line py-6 text-[13.5px] text-muted">Nothing yet. Chip in or request money to get things going.</div>
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
            label = <>{shortName(a.who)} chipped in <span className="text-muted">· {yoctoToNear(a.amount ?? '0')} NEAR</span></>
            amount = <span className="text-good">+{money(a.amount)}</span>
            break
          case 'payout':
            label = <>{title ?? 'Payout'} <span className="text-muted">· paid to {shortName(a.to ?? '')}</span></>
            amount = <>−{money(a.amount)}</>
            break
          case 'request':
            label = <>{shortName(a.who)} is asking <span className="text-muted">· {title ?? 'a change'}</span></>
            amount = a.amount ? <span className="text-muted">{money(a.amount)}</span> : null
            break
          case 'approve':
          case 'reject':
            label = <>{shortName(a.who)} {a.kind === 'approve' ? 'approved' : 'declined'} <span className="text-muted">· {title ?? `request #${a.proposalId}`}</span></>
            break
          default:
            label = <>{shortName(a.who)} sent a transaction</>
        }
        return (
          <div key={(a.txHash ?? '') + a.kind + i} className="flex items-baseline justify-between gap-4 border-b border-line py-3.5 last:border-0">
            <span className="min-w-0 truncate">
              {label}
              <span className="ml-2 text-[12px] text-muted">{timeAgo(a.time)}</span>
            </span>
            <span className="tnum flex shrink-0 items-baseline gap-3">
              {amount}
              <TxLink hash={a.txHash} label="tx" />
            </span>
          </div>
        )
      })}
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
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onClick={onClose} role="dialog" aria-modal aria-label="Chip in">
      <div className="w-full max-w-[420px] rounded-2xl border border-line bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span>Chip in</span>
          <button onClick={onClose} className="hover:text-ink" aria-label="Close">Close</button>
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
