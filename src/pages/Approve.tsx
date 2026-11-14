import { useState } from 'react'
import { view } from '../lib/near'
import { wait } from '../lib/motion'
import { prettyName } from '../App'
import type { Track, TrackStep } from '../lib/store'
import { go, useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { actProposalTx, approvalRules, can, decodeDescription, isExpired, isNearTransfer, kindLabel, kindName, type Proposal, type VoteAction } from '../lib/dao'
import { nanoToDate, shortName, splitUsd, timeAgo, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { openRequests, routeRequest } from '../lib/record'
import { Avatar, Button, EmptyState, RowText, TxLink, TxStatus, showToast, useTx } from '../components/ui'

export default function Approve() {
  const { dao, accountId, tracks } = { ...useDao(), ...useWallet() }
  const [showAll, setShowAll] = useState(false)
  if (!dao) return null
  const stillOpen = openRequests(dao)
  // Keep a card on screen while its payout tracker runs, even after the request closes.
  const tracked = dao.proposals.filter((p) => tracks[p.id] && !stillOpen.includes(p))
  const open = [...tracked, ...stillOpen]
  const needYou = stillOpen.filter((p) => !accountId || !p.votes[accountId])
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
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
            {open.map((p) => (
              <RequestCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={dao.proposals.length ? "You're all caught up" : 'No requests yet'}
            text={
              dao.proposals.length
                ? 'No open requests. Anyone in the group can request money.'
                : 'When someone asks for money, it shows up here for members to approve.'
            }
          >
            <Button variant="secondary" onClick={() => go('pay')}>Request money</Button>
          </EmptyState>
        )}
      </div>

      {decided.length > 0 && (
      <div className="mt-12 max-w-[880px]">
        <div className="mb-1 flex items-center justify-between text-[13px] text-muted">
          <span>Recently decided</span>
          {dao.proposals.length - open.length > 8 && (
            <button className="-my-3 py-3 pl-4 hover:text-ink" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : 'Show more'}</button>
          )}
        </div>
        <div className="text-[13.5px]">
          {decided.map((p) => (
            <DecidedRow key={p.id} p={p} />
          ))}
        </div>
      </div>
      )}
    </div>
  )
}

const KIND_NAMES: Record<string, string> = {
  AddMemberToRole: 'Add a member',
  RemoveMemberFromRole: 'Remove a member',
  ChangePolicy: 'Change the rules',
  ChangePolicyAddOrUpdateRole: 'Change a role',
  ChangePolicyUpdateParameters: 'Change the rules',
  ChangePolicyUpdateDefaultVotePolicy: 'Change voting',
  ChangePolicyRemoveRole: 'Remove a role',
  ChangeConfig: 'Change settings',
  FunctionCall: 'Contract call',
  Transfer: 'Payout',
  Vote: 'Poll',
  AddBounty: 'Add a bounty',
  BountyDone: 'Bounty done',
  UpgradeSelf: 'Upgrade',
  UpgradeRemote: 'Upgrade',
}

/** A plain name for a request type, e.g. "Add a member" instead of "AddMemberToRole". */
function requestKind(kind: Proposal['kind']): string {
  const k = kindName(kind)
  return KIND_NAMES[k] ?? k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
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
  else detail = s.label.toLowerCase() + (transfer ? '' : ` · ${requestKind(p.kind).toLowerCase()}`)
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3.5 last:border-0">
      <span className="min-w-0 flex-1" title={meta.title}>
        <RowText main={meta.title} detail={detail} />
      </span>
      <span className="flex shrink-0 items-baseline gap-4">
        {payout && <TxLink hash={payout} label="Receipt" />}
        {amount && <span className={`tnum ${paid ? '' : 'text-muted'}`}>{amount}</span>}
      </span>
    </div>
  )
}

export function RequestCard({ p }: { p: Proposal }) {
  const { dao, nearUsd, records, refresh, activity, tracks, setTrack } = useDao()
  const { accountId, send, signIn } = useWallet()
  const tx = useTx()
  const track = tracks[p.id]
  const [lastAction, setLastAction] = useState<VoteAction | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [snoozing, setSnoozing] = useState(false)
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
    if (action === 'VoteReject') {
      await tx.run(() => send(actProposalTx(dao!.id, p, action)), refresh)
      return
    }
    await approveAndTrack()
  }

  /** Approve, then show a tracker whose steps follow what actually happened on chain. */
  async function approveAndTrack() {
    const t0 = Date.now()
    const hash = await tx.run(() => send(actProposalTx(dao!.id, p, 'VoteApprove')))
    if (!hash) return
    const since = () => {
      const s = Math.round((Date.now() - t0) / 1000)
      return s < 60 ? `+${s}s` : `+${Math.floor(s / 60)}m ${s % 60}s`
    }
    const group = prettyName(dao!.config.name)
    const to = transfer ? shortName(transfer.receiver_id) : ''
    const steps: TrackStep[] = [{ label: 'Approved by you', done: true, at: 'now', hash }]
    const wantsLine = meta.wants ? meta.wants.replace(/\s+to\s+\S+$/, '') : null
    const base = { eta: transfer ? 'checking…' : '', finished: false, paid: false }
    setTrack(p.id, { ...base, steps: [...steps, { label: transfer ? `${group} sends ${yoctoToNear(transfer.amount)} NEAR` : 'Applying the change', done: false }] })

    let status: string | null = null
    for (let i = 0; i < 6 && (!status || status === 'InProgress'); i++) {
      await wait(i ? 1500 : 600)
      try {
        status = (await view<Proposal>(dao!.id, 'get_proposal', { id: p.id })).status
      } catch {
        status = null
      }
      if (status && status !== 'InProgress') break
    }

    if (status === 'Approved') {
      steps.push({ label: transfer ? `${group} sent ${yoctoToNear(transfer.amount)} NEAR` : 'Change applied', done: true, at: since(), hash })
      setTrack(p.id, { ...base, eta: 'about 1 s', steps: [...steps] })
      if (transfer && wantsLine) {
        await wait(950)
        steps.push({ label: 'NEAR Intents swap · simulated on testnet', done: true, at: since() })
        setTrack(p.id, { ...base, eta: 'about 1 s', steps: [...steps] })
      }
      if (transfer) {
        await wait(950)
        steps.push({ label: `Arrived in ${to}'s account`, done: true, at: since() })
      }
      const bubble = transfer
        ? `Paid. ${to} has their ${yoctoToNear(transfer.amount)} NEAR${wantsLine ? ` (on mainnet: ${wantsLine})` : ''}.`
        : 'Done. The change is live.'
      setTrack(p.id, { steps: [...steps], eta: 'done', finished: true, paid: true, bubble })
      showToast(transfer ? `Paid · ${yoctoToNear(transfer.amount)} NEAR to ${to}.` : 'Approved and applied.')
    } else if (status === 'Failed') {
      steps.push({ label: 'The payout failed on chain', done: false, at: since(), hash })
      setTrack(p.id, { steps: [...steps], eta: '', finished: true, paid: false, bubble: 'The DAO could not pay this out. Check the receipt.' })
    } else {
      const left = Math.max(1, needed - approvals - 1)
      steps.push({ label: `Waiting for ${left} more approval${left === 1 ? '' : 's'}`, done: false })
      setTrack(p.id, { steps: [...steps], eta: '', finished: true, paid: false })
      showToast('Approved. It pays out once enough members approve.')
    }
    await refresh()
  }

  if (dismissed) return null
  if (track) return <TrackerCard p={p} track={track} hero={route?.effectiveTier === 'small'} onDone={() => setTrack(p.id, null)} />
  const hero = route?.effectiveTier === 'small'
  const tierWord = route ? { small: 'Small', mid: 'Mid', large: 'Large' }[route.effectiveTier] : requestKind(p.kind)
  const theyGet = meta.wants ? meta.wants.replace(/\s+to\s+\S+$/, '') : null
  const arrives = meta.quote?.match(/about (\d+)s/)?.[1]
  const [dollars, cents] = transfer ? splitUsd(yoctoToNumber(transfer.amount) * nearUsd) : ['', '']
  const sub = hero ? 'opacity-60' : 'text-muted'
  const rule = hero ? 'border-[var(--hero-line)]' : 'border-line'
  const canVote = !!accountId && !myVote && contractAllows && terraAllows
  const rec = records.get(p.proposer)

  return (
    <article
      className={`flex min-w-0 flex-col rounded-2xl p-6 transition-[transform,opacity] duration-300 ${snoozing ? 'translate-x-3 opacity-40' : ''} ${hero ? 'bg-hero text-on-hero ring-1 ring-[var(--hero-ring)]' : 'border border-line bg-card'}`}
    >
      <div className={`flex items-center justify-between gap-3 text-[12px] ${sub}`}>
        <span className="flex min-w-0 items-center gap-2 truncate">
          <Avatar id={p.proposer} size={20} />
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
        <div className="mt-6 text-[20px] font-light">{requestKind(p.kind)}</div>
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
            <span className={`shrink-0 ${sub}`}>Paid to</span>
            <span className="tnum min-w-0 truncate">{yoctoToNear(transfer.amount)} NEAR · {shortName(transfer.receiver_id)}</span>
          </div>
        ) : null}
        {arrives && (
          <div className="mt-2 flex items-baseline justify-between gap-3">
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
            <Button disabled={tx.state.status === 'signing'} onClick={() => vote('VoteApprove')}>
              {tx.state.status === 'signing' && lastAction === 'VoteApprove' ? <span className="spin" /> : 'Approve and pay'}
            </Button>
            <button
              className="rounded-lg bg-white/10 px-4 text-[13.5px] font-medium"
              onClick={() => {
                setSnoozing(true)
                showToast("Snoozed. We'll bring it back next time you open Terra.")
                setTimeout(() => setDismissed(true), 600)
              }}
            >
              Not now
            </button>
          </div>
          <button className="mt-1 self-start py-3 text-[12px] opacity-60 hover:opacity-100 sm:py-2" disabled={tx.state.status === 'signing'} onClick={() => vote('VoteReject')}>
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

function TrackerCard({ p, track, hero, onDone }: { p: Proposal; track: Track; hero: boolean; onDone: () => void }) {
  const { nearUsd } = useDao()
  const meta = decodeDescription(p.description)
  const transfer = isNearTransfer(p.kind) ? p.kind.Transfer : null
  const [dollars, cents] = transfer ? splitUsd(yoctoToNumber(transfer.amount) * nearUsd) : ['', '']
  const done = track.steps.filter((s) => s.done).length
  const total = Math.max(track.steps.length, track.finished ? track.steps.length : transfer ? (meta.wants ? 4 : 3) : 2)
  const sub = hero ? 'opacity-60' : 'text-muted'
  const ICON = `${import.meta.env.BASE_URL}favicon.svg`
  return (
    <article className={`relative flex flex-col overflow-hidden rounded-2xl p-6 ${hero ? 'bg-hero text-on-hero ring-1 ring-[var(--hero-ring)]' : 'border border-line bg-card'}`}>
      <div className="flex items-center justify-between text-[12px]">
        <span className={sub}>{track.paid ? 'Paid' : transfer ? `Paying ${transfer ? shortName(transfer.receiver_id) : ''}` : 'Applying'}</span>
        {track.eta && (
          <span className="flex items-center gap-1.5">
            {!track.finished && <span className="live size-1.5 rounded-full bg-accent" />}
            <span className={`tnum ${sub}`}>{track.eta}</span>
          </span>
        )}
      </div>
      {transfer && (
        <div className="tnum mt-6 text-[48px] font-light leading-none tracking-[-0.045em] sm:text-[56px]">
          {dollars}
          <span className={hero ? 'opacity-40' : 'text-muted'}>{cents}</span>
        </div>
      )}
      <div className="mt-2 text-[14px]">{meta.title}</div>
      <div className={`mt-6 h-[3px] rounded-full ${hero ? 'bg-white/10' : 'bg-soft'}`}>
        <div className="fill h-[3px] rounded-full bg-accent" style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <ol className="mt-5 space-y-3 text-[13px]">
        {track.steps.map((s, i) => (
          <li key={i} className={`flex items-center gap-3 transition-opacity duration-300 ${s.done ? '' : 'opacity-40'}`}>
            {s.done ? (
              <span className="pop grid size-5 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
                <svg className="check" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
              </span>
            ) : (
              <span className={`grid size-5 shrink-0 place-items-center rounded-full ring-1 ${hero ? 'ring-white/25' : 'ring-line'}`} />
            )}
            <span className="min-w-0">{s.label}</span>
            <span className="ml-auto flex shrink-0 items-center gap-2 text-[12px]">
              {s.hash && <TxLink hash={s.hash} label="tx" />}
              {s.at && <span className={`tnum ${sub}`}>{s.at}</span>}
            </span>
          </li>
        ))}
      </ol>
      {track.paid && <Burst />}
      <div className="mt-5 min-h-[44px]">
        {track.finished && (
          <div className="bubble flex items-end gap-2.5">
            {track.paid && <img src={ICON} alt="" className="mascot-bob size-9 rounded-[9px]" />}
            {track.bubble && <div className={`rounded-xl rounded-bl-sm px-3.5 py-2.5 text-[13px] ${hero ? 'bg-white/10' : 'bg-soft'}`}>{track.bubble}</div>}
            <button className={`ml-auto self-center text-[12px] ${sub} hover:opacity-100`} onClick={onDone}>
              Done
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

function Burst() {
  return (
    <div className="burst" aria-hidden>
      {Array.from({ length: 12 }, (_, k) => (
        <i key={k} style={{ ['--r' as string]: `${k * 30}deg`, background: k % 3 === 0 ? 'var(--on-hero)' : undefined } as React.CSSProperties} />
      ))}
    </div>
  )
}
