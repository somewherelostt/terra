import { useRef, useState } from 'react'
import { go, shareUrl, useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { allMembers, chipInTx, decodeDescription, isNearTransfer } from '../lib/dao'
import { nearToYocto, shortName, splitUsd, timeAgo, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { openRequests } from '../lib/record'
import type { ActivityItem } from '../lib/activity'
import { Button, Spinner, TxLink, TxStatus, useTx } from '../components/ui'
import { prettyName } from '../App'
import { RequestCard } from './Approve'

export default function Home() {
  const { dao, nearUsd, activity, refresh } = useDao()
  const { accountId } = useWallet()
  const [copied, setCopied] = useState(false)
  const chipRef = useRef<HTMLInputElement>(null)
  if (!dao) return null
  const open = openRequests(dao)
  const members = allMembers(dao.policy)
  const total = dao.spendable + dao.staked
  const [dollars, cents] = splitUsd(yoctoToNumber(total) * nearUsd)
  const payouts = dao.proposals.filter((p) => p.status === 'Approved' && isNearTransfer(p.kind))
  const paidOut = payouts.reduce((s, p) => s + (isNearTransfer(p.kind) ? BigInt(p.kind.Transfer.amount) : 0n), 0n)
  const name = prettyName(dao.config.name)
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div>
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span>Home</span>
        <span>{today}</span>
      </div>

      <div className="mt-10 text-[13px] text-muted">{name} holds</div>
      <div className="tnum mt-3 text-[64px] font-light leading-[0.9] tracking-[-0.055em] sm:text-[96px] lg:text-[112px]">
        {dollars}
        <span className="text-muted">{cents}</span>
      </div>
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
        <Button onClick={() => chipRef.current?.focus()}>Chip in</Button>
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
        <Stat label="Paid out" value={isFinite(nearUsd) ? usd(yoctoToNumber(paidOut) * nearUsd) : `${yoctoToNear(paidOut, 0)} NEAR`} className="border-r border-line px-5" />
        <Stat label="Open requests" value={String(open.length)} className="px-5" />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between text-[13px] text-muted">
            <span>Activity</span>
            <button className="hover:text-ink" onClick={() => go('activity')}>See all</button>
          </div>
          <HomeActivity items={activity?.items.slice(0, 7)} loading={!activity} nearUsd={nearUsd} />
        </div>
        <div className="space-y-5">
          {open.length > 0 && <RequestCard p={open[0]} />}
          {open.length > 1 && (
            <button onClick={() => go('approve')} className="text-[13px] text-muted hover:text-ink">
              {open.length - 1} more waiting in Approve →
            </button>
          )}
          <ChipIn inputRef={chipRef} daoId={dao.id} signedIn={!!accountId} nearUsd={nearUsd} onDone={refresh} name={name} />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`py-5 ${className}`}>
      <div className="text-[12px] text-muted">{label}</div>
      <div className="tnum mt-1.5 text-[22px] font-light tracking-tight sm:text-[28px]">{value}</div>
    </div>
  )
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

function ChipIn({
  inputRef,
  daoId,
  signedIn,
  nearUsd,
  onDone,
  name,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  daoId: string
  signedIn: boolean
  nearUsd: number
  onDone: () => Promise<void>
  name: string
}) {
  const [amount, setAmount] = useState('1')
  const { send, signIn } = useWallet()
  const tx = useTx()
  const yocto = nearToYocto(amount)
  return (
    <div className="rounded-2xl border border-line bg-card p-6">
      <div className="text-[12px] text-muted">Chip in</div>
      <p className="mt-1 text-[13.5px] text-muted">Goes straight to {name}'s treasury. Everyone sees it in the activity.</p>
      <label className="mt-5 block border-b border-line pb-2">
        <span className="text-[12px] text-muted">Amount</span>
        <div className="mt-1 flex items-baseline gap-2">
          <input
            ref={inputRef}
            className="tnum w-full bg-transparent text-[40px] font-light leading-none tracking-[-0.04em] outline-none"
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
      <div className="mt-4">
        {signedIn ? (
          <Button
            className="w-full"
            disabled={!yocto || yocto <= 0n || tx.state.status === 'signing'}
            onClick={() => yocto && tx.run(() => send(chipInTx(daoId, yocto)), onDone)}
          >
            Chip in {yocto ? `${amount} NEAR` : ''}
          </Button>
        ) : (
          <Button className="w-full" onClick={signIn}>Sign in to chip in</Button>
        )}
      </div>
      <div className="mt-3">
        <TxStatus state={tx.state} doneText="Thanks! It reached the treasury." />
      </div>
    </div>
  )
}
