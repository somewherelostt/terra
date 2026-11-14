import { useState } from 'react'
import { useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { actProposalTx, approvalRules, can, decodeDescription, isExpired, isNearTransfer, kindLabel, kindName, type Proposal, type VoteAction } from '../lib/dao'
import { nanoToDate, timeAgo, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { TIER_COPY, openRequests, routeRequest } from '../lib/record'
import { Account, Avatar, Badge, Button, Card, Empty, SectionTitle, TxLink, TxStatus, useTx } from '../components/ui'

export default function Approve() {
  const { dao } = useDao()
  const [showAll, setShowAll] = useState(false)
  if (!dao) return null
  const open = openRequests(dao)
  const decided = dao.proposals.filter((p) => !open.includes(p)).slice(0, showAll ? 60 : 8)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Approve</h1>
        <p className="mt-1 text-sm text-muted">Requests waiting for a decision. When enough members approve, the treasury pays automatically.</p>
      </div>
      <section>
        <SectionTitle>Waiting ({open.length})</SectionTitle>
        {open.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {open.map((p) => (
              <RequestCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <Empty>No open requests. Anyone in the group can ask for money.</Empty>
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

function RequestCard({ p }: { p: Proposal }) {
  const { dao, nearUsd, records, refresh, activity } = useDao()
  const { accountId, send, signIn } = useWallet()
  const tx = useTx()
  const [lastAction, setLastAction] = useState<VoteAction | null>(null)
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

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted">Request #{p.id} · {timeAgo(nanoToDate(p.submission_time))}</div>
          <h3 className="mt-1 text-lg font-medium leading-snug">{meta.title}</h3>
        </div>
        {route && <Badge tone="brand">{TIER_COPY[route.effectiveTier].label}</Badge>}
      </div>

      {transfer ? (
        <div className="mt-3">
          <div className="text-2xl font-medium tabular-nums">
            {isFinite(nearUsd) ? usd(yoctoToNumber(transfer.amount) * nearUsd) : `${yoctoToNear(transfer.amount)} NEAR`}
          </div>
          <div className="text-xs text-muted">
            {yoctoToNear(transfer.amount)} NEAR to <Account id={transfer.receiver_id} className="!text-xs" />
          </div>
        </div>
      ) : (
        <div className="mt-3 text-sm text-muted">Governance change: {kindName(p.kind)}</div>
      )}

      {meta.wants && (
        <div className="mt-3 rounded-xl bg-soft p-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Recipient wants</div>
          <div className="mt-0.5 break-all">{meta.wants}</div>
          {meta.quote && <div className="mt-1 text-xs text-muted">NEAR Intents: {meta.quote}</div>}
        </div>
      )}
      {meta.notes && <p className="mt-3 text-sm text-muted">{meta.notes}</p>}

      <div className="mt-4 flex items-center gap-2 text-sm">
        <Avatar id={p.proposer} size={22} />
        <span>
          Asked by <Account id={p.proposer} />
        </span>
        {createdTx && <TxLink hash={createdTx} label="tx" />}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>{approvals} of {needed} approval{needed === 1 ? '' : 's'}{rejects ? ` · ${rejects} against` : ''}</span>
          {route && <span>{route.reason}</span>}
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-soft">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.min(100, (approvals / Math.max(needed, 1)) * 100)}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {voters.map((v) => (
            <span key={v} title={`${v}${p.votes[v] ? ': ' + p.votes[v] : ''}`} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${p.votes[v] === 'Approve' ? 'border-good/40 bg-good-soft text-good' : p.votes[v] === 'Reject' ? 'border-bad/40 bg-bad-soft text-bad' : 'border-line text-muted'}`}>
              {v.split('.')[0]} {p.votes[v] === 'Approve' ? '✓' : p.votes[v] === 'Reject' ? '✕' : ''}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 flex-1" />
      {!accountId ? (
        <Button variant="secondary" onClick={signIn}>Sign in to approve</Button>
      ) : myVote ? (
        <p className="rounded-xl bg-soft px-3 py-2 text-sm text-muted">You voted: {myVote === 'Approve' ? 'approve' : myVote === 'Reject' ? 'reject' : myVote}.</p>
      ) : !contractAllows ? (
        <p className="rounded-xl bg-soft px-3 py-2 text-sm text-muted">Your account isn't in a role that can vote on this.</p>
      ) : !terraAllows ? (
        <p className="rounded-xl bg-soft px-3 py-2 text-sm text-muted">This request is above the fast lane, so the council decides it.</p>
      ) : (
        <div className="flex gap-2">
          <Button className="flex-1" disabled={tx.state.status === 'signing'} onClick={() => vote('VoteApprove')}>Approve</Button>
          <Button variant="danger" className="flex-1" disabled={tx.state.status === 'signing'} onClick={() => vote('VoteReject')}>Reject</Button>
        </div>
      )}
      <div className="mt-2">
        <TxStatus state={tx.state} doneText={lastAction === 'VoteReject' ? 'Rejection recorded.' : 'Approval recorded. If that was the last one needed, the treasury has paid.'} />
      </div>
    </Card>
  )
}
