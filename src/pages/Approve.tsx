import { useState } from 'react'
import { useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { actProposalTx, approvalRules, can, decodeDescription, isExpired, isNearTransfer, kindLabel, kindName, type Proposal, type VoteAction } from '../lib/dao'
import { nanoToDate, shortName, splitUsd, timeAgo, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { openRequests, routeRequest } from '../lib/record'
import { Button, TxLink, TxStatus, useTx } from '../components/ui'

export default function Approve() {
  const { dao, accountId } = { ...useDao(), ...useWallet() }
  const [showAll, setShowAll] = useState(false)
  if (!dao) return null
  const open = openRequests(dao)
  const needYou = open.filter((p) => !accountId || !p.votes[accountId])
  const decided = dao.proposals.filter((p) => !open.includes(p)).slice(0, showAll ? 60 : 8)

  return (
    <div>
      <div className="text-[13px] text-muted">Approve</div>
      <h1 className="mt-3 text-[32px] font-light tracking-[-0.03em]">
        {needYou.length === 0 ? 'Nothing needs you' : needYou.length === 1 ? '1 request needs you' : `${needYou.length} requests need you`}
      </h1>
      <p className="mt-1 text-[13.5px] text-muted">When enough members approve, the treasury pays on its own.</p>

      <div className="mt-10 max-w-[880px]">
        {open.length ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {open.map((p) => (
              <RequestCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-line p-10 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full border border-line">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
            </div>
            <div className="mt-4 text-[15px]">You're all caught up</div>
            <p className="mt-1 text-[13px] text-muted">No open requests. Anyone in the group can request money.</p>
          </div>
        )}
      </div>

      <div className="mt-12 max-w-[880px]">
        <div className="mb-1 flex items-center justify-between text-[13px] text-muted">
          <span>Recently decided</span>
          {dao.proposals.length - open.length > 8 && (
            <button className="hover:text-ink" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : 'Show more'}</button>
          )}
        </div>
        <div className="text-[13.5px]">
          {decided.map((p) => (
            <DecidedRow key={p.id} p={p} />
          ))}
        </div>
      </div>
    </div>
  )
}

function statusTone(p: Proposal, expired: boolean) {
  if (expired) return { label: 'Expired', tone: 'neutral' as const }
  switch (p.status) {
    case 'Approved':
      return { label: isNearTransfer(p.kind) ? 'Paid' : 'Approved', tone: 'good' as const }
    case 'Rejected':
    case 'Removed':
      return { label: p.status, tone: 'bad' as const }
    case 'Failed':
      return { label: 'Failed', tone: 'bad' as const }
    case 'InProgress':
      return { label: 'Waiting', tone: 'warn' as const }
    default:
      return { label: p.status, tone: 'neutral' as const }
  }
}

function DecidedRow({ p }: { p: Proposal }) {
  const { dao, nearUsd, activity } = useDao()
  const meta = decodeDescription(p.description)
  const expired = isExpired(p, dao!.policy)
  const s = statusTone(p, expired)
  const payout = activity?.payoutTx.get(p.id)
  const transfer = isNearTransfer(p.kind) ? p.kind.Transfer : null
  const paid = p.status === 'Approved' && transfer
  const counts = Object.values(p.votes)
  const yes = counts.filter((v) => v === 'Approve').length
  const no = counts.filter((v) => v === 'Reject').length
  const amount = transfer ? (isFinite(nearUsd) ? usd(yoctoToNumber(transfer.amount) * nearUsd) : `${yoctoToNear(transfer.amount)} NEAR`) : null
  let detail: string
  if (paid) detail = meta.wants ? `paid · ${meta.wants.replace(/\s+to\s+\S+$/, '')} requested` : `paid to ${shortName(transfer!.receiver_id)}`
  else if (p.status === 'Rejected') detail = `declined, ${yes} to ${no}`
  else detail = s.label.toLowerCase() + (transfer ? '' : ` · ${kindName(p.kind)}`)
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3.5 last:border-0">
      <span className="min-w-0 truncate" title={meta.title}>
        {meta.title} <span className="text-muted">· {detail}</span>
      </span>
      <span className="flex shrink-0 items-baseline gap-4">
        {payout && <TxLink hash={payout} label="Receipt" />}
        {amount && <span className={`tnum ${paid ? '' : 'text-muted'}`}>{amount}</span>}
      </span>
    </div>
  )
}

export function RequestCard({ p }: { p: Proposal }) {
  const { dao, nearUsd, records, refresh, activity } = useDao()
  const { accountId, send, signIn } = useWallet()
  const tx = useTx()
  const [lastAction, setLastAction] = useState<VoteAction | null>(null)
  const [dismissed, setDismissed] = useState(false)
  if (!dao) return null
  const meta = decodeDescription(p.description)
  const transfer = isNearTransfer(p.kind) ? p.kind.Transfer : null
  const isTransfer = !!transfer
  const route = isTransfer ? routeRequest(dao, p, nearUsd, records) : null
  const rules = approvalRules(dao.policy, p.kind)
  const voters = route ? route.voters : [...new Set(rules.flatMap((r) => r.members))]
  const needed = route ? route.needed : Math.min(...rules.map((r) => r.needed), Infinity)
  const approvals = voters.filter((v) => p.votes[v] === 'Approve').length
  const rejects = voters.filter((v) => p.votes[v] === 'Reject').length
  const myVote = accountId ? p.votes[accountId] : undefined
  const label = kindLabel(p.kind)
  const contractAllows = can(dao.policy, accountId, label, 'VoteApprove')
  const terraAllows = accountId ? voters.includes(accountId) : false
  const createdTx = activity?.proposalTx.get(p.id)

  async function vote(action: VoteAction) {
    setLastAction(action)
    // Re-read the proposal so the kind we pass back matches the chain exactly.
    await tx.run(() => send(actProposalTx(dao!.id, p, action)), refresh)
  }

  if (dismissed) return null
  const hero = route?.effectiveTier === 'small'
  const tierWord = route ? { small: 'Small', mid: 'Mid', large: 'Large' }[route.effectiveTier] : kindName(p.kind)
  const theyGet = meta.wants ? meta.wants.replace(/\s+to\s+\S+$/, '') : null
  const arrives = meta.quote?.match(/about (\d+)s/)?.[1]
  const [dollars, cents] = transfer ? splitUsd(yoctoToNumber(transfer.amount) * nearUsd) : ['', '']
  const sub = hero ? 'opacity-60' : 'text-muted'
  const rule = hero ? 'border-[var(--hero-line)]' : 'border-line'
  const canVote = !!accountId && !myVote && contractAllows && terraAllows
  const rec = records.get(p.proposer)

  return (
    <article className={`flex flex-col rounded-2xl p-6 ${hero ? 'bg-hero text-on-hero ring-1 ring-[var(--hero-ring)]' : 'border border-line bg-card'}`}>
      <div className={`flex items-center justify-between gap-3 text-[12px] ${sub}`}>
        <span className="truncate">
          {shortName(p.proposer)} is asking · {timeAgo(nanoToDate(p.submission_time))}
          {route && route.tier === 'small' && route.effectiveTier !== 'small' ? ' · new member' : ''}
        </span>
        <span className="shrink-0">
          {hero && canVote ? 'Small · you decide' : `${tierWord} · ${approvals} of ${needed}`}
        </span>
      </div>

      {transfer ? (
        <div className="tnum mt-6 text-[48px] font-light leading-none tracking-[-0.045em] sm:text-[56px]">
          {isFinite(nearUsd) ? (
            <>
              {dollars}
              <span className={hero ? 'opacity-40' : 'text-muted'}>{cents}</span>
            </>
          ) : (
            `${yoctoToNear(transfer.amount)} NEAR`
          )}
        </div>
      ) : (
        <div className="mt-6 text-[20px] font-light">{kindName(p.kind)}</div>
      )}
      <div className="mt-2 break-words text-[14px]">{meta.title}</div>
      {meta.notes && <p className={`mt-1 text-[13px] ${sub}`}>{meta.notes}</p>}

      <div className={`mt-6 border-t pt-4 text-[13px] ${rule}`}>
        {theyGet ? (
          <div className="flex items-baseline justify-between gap-3">
            <span className={sub}>They get</span>
            <span className="tnum text-right">{theyGet}</span>
          </div>
        ) : transfer ? (
          <div className="flex items-baseline justify-between gap-3">
            <span className={sub}>Paid to</span>
            <span className="tnum">{yoctoToNear(transfer.amount)} NEAR · {shortName(transfer.receiver_id)}</span>
          </div>
        ) : null}
        {arrives && (
          <div className="mt-2 flex items-baseline justify-between">
            <span className={sub}>Arrives</span>
            <span>about {arrives} seconds</span>
          </div>
        )}
        {rec && (
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className={sub}>{shortName(p.proposer)}'s record</span>
            <span className="tnum">{rec.approved} paid · {rec.rejected} turned down</span>
          </div>
        )}
        {!hero && (
          <div className="mt-4">
            <div className="h-[3px] rounded-full bg-soft">
              <div className="h-[3px] rounded-full bg-ink transition-all" style={{ width: `${Math.min(100, (approvals / Math.max(needed, 1)) * 100)}%` }} />
            </div>
            <div className="mt-2 text-[12px] text-muted">
              {voters.filter((v) => p.votes[v] === 'Approve').map(shortName).join(', ') || 'No approvals yet'}
              {approvals < needed ? ` · needs ${needed - approvals} more ${route?.effectiveTier === 'small' ? 'trusted member' : 'council member'}${needed - approvals === 1 ? '' : 's'}` : ''}
              {rejects ? ` · ${rejects} declined` : ''}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex-1" />
      {!accountId ? (
        <Button variant="secondary" onClick={signIn}>Sign in to approve</Button>
      ) : myVote ? (
        <p className={`text-[13px] ${sub}`}>You {myVote === 'Approve' ? 'approved' : myVote === 'Reject' ? 'declined' : 'voted on'} this.</p>
      ) : !contractAllows ? (
        <p className={`text-[13px] ${sub}`}>Your account isn't in a role that can approve this.</p>
      ) : !terraAllows ? (
        <p className={`text-[13px] ${sub}`}>Above the fast lane, so the council decides this one.</p>
      ) : hero ? (
        <>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button disabled={tx.state.status === 'signing'} onClick={() => vote('VoteApprove')}>Approve and pay</Button>
            <button className="rounded-lg bg-white/10 px-4 text-[13.5px] font-medium" onClick={() => setDismissed(true)}>Not now</button>
          </div>
          <button className="mt-3 self-start text-[12px] opacity-60 hover:opacity-100" disabled={tx.state.status === 'signing'} onClick={() => vote('VoteReject')}>
            Decline this request
          </button>
        </>
      ) : (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button className="rounded-lg bg-ink py-2.5 text-[13.5px] font-medium text-bg disabled:opacity-50" disabled={tx.state.status === 'signing'} onClick={() => vote('VoteApprove')}>Approve</button>
          <Button variant="secondary" disabled={tx.state.status === 'signing'} onClick={() => vote('VoteReject')}>Decline</Button>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        <TxStatus state={tx.state} doneText={lastAction === 'VoteReject' ? 'Declined.' : 'Approved. If that was the last one needed, the treasury has paid.'} />
      </div>
      {createdTx && tx.state.status === 'idle' && (
        <div className={`mt-1 text-[12px] ${sub}`}>
          <TxLink hash={createdTx} label="Request on NearBlocks" />
        </div>
      )}
    </article>
  )
}
