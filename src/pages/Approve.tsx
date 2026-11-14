import { useState } from 'react'
import { useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { actProposalTx, approvalRules, can, decodeDescription, isExpired, isNearTransfer, kindLabel, kindName, type Proposal, type VoteAction } from '../lib/dao'
import { nanoToDate, shortName, splitUsd, timeAgo, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { openRequests, routeRequest } from '../lib/record'
import { Account, Badge, Button, Card, Empty, SectionTitle, TxLink, TxStatus, useTx } from '../components/ui'

export default function Approve() {
  const { dao } = useDao()
  const [showAll, setShowAll] = useState(false)
  if (!dao) return null
  const open = openRequests(dao)
  const decided = dao.proposals.filter((p) => !open.includes(p)).slice(0, showAll ? 60 : 8)

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[13px] text-muted">Approve</div>
        <h1 className="mt-3 text-[32px] font-light tracking-[-0.03em]">{open.length === 0 ? 'Nothing needs you' : open.length === 1 ? '1 request needs a decision' : `${open.length} requests need a decision`}</h1>
        <p className="mt-1 text-[13.5px] text-muted">When enough members approve, the treasury pays on its own.</p>
      </div>
      <section>
        <SectionTitle>Waiting ({open.length})</SectionTitle>
        {open.length ? (
          <div className="grid max-w-[880px] gap-5 lg:grid-cols-2">
            {open.map((p) => (
              <RequestCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <Empty>No open requests. Anyone in the group can request money.</Empty>
        )}
      </section>
      <section>
        <SectionTitle right={<button className="text-sm font-medium text-accent-text hover:underline" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : 'Show more'}</button>}>
          Decided
        </SectionTitle>
        <Card className="!p-0">
          <ul className="divide-y divide-line">
            {decided.map((p) => (
              <DecidedRow key={p.id} p={p} />
            ))}
          </ul>
        </Card>
      </section>
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
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
      <span className="w-10 text-xs text-muted">#{p.id}</span>
      <span className="min-w-0 flex-1 truncate" title={meta.title}>{meta.title}</span>
      {isNearTransfer(p.kind) ? (
        <span className="tabular-nums text-muted">
          {isFinite(nearUsd) ? usd(yoctoToNumber(p.kind.Transfer.amount) * nearUsd) : `${yoctoToNear(p.kind.Transfer.amount)} NEAR`} → <Account id={p.kind.Transfer.receiver_id} />
        </span>
      ) : (
        <span className="text-xs text-muted">{kindName(p.kind)}</span>
      )}
      <Badge tone={s.tone}>{s.label}</Badge>
      {payout && <TxLink hash={payout} label="Payout" />}
    </li>
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
        {!hero && (
          <div className="mt-4">
            <div className="h-[3px] rounded-full bg-soft">
              <div className="h-[3px] rounded-full bg-brand transition-all" style={{ width: `${Math.min(100, (approvals / Math.max(needed, 1)) * 100)}%` }} />
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
