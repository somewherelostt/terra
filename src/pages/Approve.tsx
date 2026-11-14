import { useState } from 'react'
import { view } from '../lib/near'
import { wait } from '../lib/motion'
import { prettyName } from '../App'
import type { Track, TrackStep } from '../lib/store'
import { go, useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { actProposalTx, approvalRules, can, decodeDescription, isExpired, isNearTransfer, isRole, kindLabel, kindName, type Proposal, type VoteAction } from '../lib/dao'
import { nanoToDate, splitUsd, timeAgo, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { displayName, useNames } from '../lib/profile'
import { openRequests, routeRequest } from '../lib/record'
import { joinRequestOf } from '../lib/join'
import { Avatar, Button, EmptyState, RowText, TxLink, TxStatus, showToast, useTx } from '../components/ui'
import { CommentCount, CommentsToggle, RequestSheetHost, openRequestSheet } from '../components/Comments'
import { getLocale, t as translate, useT } from '../i18n'

type Vars = Record<string, string | number>
/**
 * Tracker steps keep i18n keys plus their vars (not finished text), and are translated when shown,
 * so a language switch while the tracker is up still shows the right language.
 */
type Step = TrackStep & { vars?: Vars; atVars?: Vars }
type TrackX = Omit<Track, 'steps'> & { steps: Step[]; bubbleVars?: Vars }

export default function Approve() {
  const { dao, accountId, tracks, nearUsd, records } = { ...useDao(), ...useWallet() }
  const [showAll, setShowAll] = useState(false)
  const t = useT()
  if (!dao) return null
  const stillOpen = openRequests(dao)
  // Keep a card on screen while its payout tracker runs, even after the request closes.
  const tracked = dao.proposals.filter((p) => tracks[p.id] && !stillOpen.includes(p))
  const open = [...tracked, ...stillOpen]
  // Only count requests this account can actually decide (same routing as the cards).
  const canDecide = (p: Proposal) => {
    if (!accountId || p.votes[accountId]) return false
    const voters = isNearTransfer(p.kind) ? routeRequest(dao, p, nearUsd, records).voters : approvalRules(dao.policy, p.kind).flatMap((r) => r.members)
    return voters.includes(accountId)
  }
  const needYou = accountId ? stillOpen.filter(canDecide) : []
  const decided = dao.proposals.filter((p) => !open.includes(p)).slice(0, showAll ? 60 : 8)

  return (
    <div>
      <RequestSheetHost />
      <div className="text-[13px] text-muted">{t('approve.eyebrow')}</div>
      <h1 className="mt-3 text-[32px] font-light tracking-[-0.03em]">
        {!accountId || (needYou.length === 0 && stillOpen.length > 0)
          ? stillOpen.length === 0
            ? t('approve.heading.noOpen')
            : t('approve.heading.open', { count: stillOpen.length })
          : needYou.length === 0
            ? t('approve.heading.nothingNeedsYou')
            : t('approve.heading.needYou', { count: needYou.length })}
      </h1>
      <p className="mt-1 text-[13.5px] text-muted">{t('approve.subtitle')}</p>

      <div className="mt-10 max-w-[880px]">
        {open.length ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
            {open.map((p) => (
              <RequestCard key={p.id} p={p} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={dao.proposals.length ? t('approve.empty.caughtUpTitle') : t('approve.empty.noneTitle')}
            text={dao.proposals.length ? t('approve.empty.caughtUpText') : t('approve.empty.noneText')}
          >
            <Button variant="secondary" onClick={() => go('pay')}>{t('approve.requestMoney')}</Button>
          </EmptyState>
        )}
      </div>

      {decided.length > 0 && (
      <div className="mt-12 max-w-[880px]">
        <div className="mb-1 flex items-center justify-between text-[13px] text-muted">
          <span>{t('approve.recentlyDecided')}</span>
          {dao.proposals.length - open.length > 8 && (
            <button className="-my-3 py-3 ps-4 hover:text-ink" onClick={() => setShowAll(!showAll)}>{showAll ? t('approve.showFewer') : t('approve.showMore')}</button>
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

/** i18n keys for request types (translated when used, never at module load). */
const KIND_KEYS: Record<string, string> = {
  AddMemberToRole: 'approve.kind.addMember',
  RemoveMemberFromRole: 'approve.kind.removeMember',
  ChangePolicy: 'approve.kind.changeRules',
  ChangePolicyAddOrUpdateRole: 'approve.kind.changeRole',
  ChangePolicyUpdateParameters: 'approve.kind.changeRules',
  ChangePolicyUpdateDefaultVotePolicy: 'approve.kind.changeVoting',
  ChangePolicyRemoveRole: 'approve.kind.removeRole',
  ChangeConfig: 'approve.kind.changeSettings',
  FunctionCall: 'approve.kind.contractCall',
  Transfer: 'approve.kind.payout',
  Vote: 'approve.kind.poll',
  AddBounty: 'approve.kind.addBounty',
  BountyDone: 'approve.kind.bountyDone',
  UpgradeSelf: 'approve.kind.upgrade',
  UpgradeRemote: 'approve.kind.upgrade',
}

/** A plain name for a request type, e.g. "Add a member" instead of "AddMemberToRole". */
function requestKind(kind: Proposal['kind']): string {
  const k = kindName(kind)
  return KIND_KEYS[k] ? translate(KIND_KEYS[k]) : k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}

function statusTone(p: Proposal, expired: boolean) {
  if (expired) return { label: translate('approve.status.expired'), tone: 'neutral' as const }
  switch (p.status) {
    case 'Approved':
      return { label: isNearTransfer(p.kind) ? translate('approve.status.paid') : translate('approve.status.approved'), tone: 'good' as const }
    case 'Rejected':
      return { label: translate('approve.status.rejected'), tone: 'bad' as const }
    case 'Removed':
      return { label: translate('approve.status.removed'), tone: 'bad' as const }
    case 'Failed':
      return { label: translate('approve.status.failed'), tone: 'bad' as const }
    case 'InProgress':
      return { label: translate('approve.status.waiting'), tone: 'warn' as const }
    case 'Expired':
      return { label: translate('approve.status.expired'), tone: 'neutral' as const }
    case 'Moved':
      return { label: translate('approve.status.moved'), tone: 'neutral' as const }
    default:
      return { label: p.status, tone: 'neutral' as const }
  }
}

const lower = (s: string) => s.toLocaleLowerCase(getLocale())

function DecidedRow({ p }: { p: Proposal }) {
  useNames()
  const t = useT()
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
  // meta.wants is the English text saved on chain ("20.0 USDC on Solana to …"); shown as written.
  if (paid) detail = meta.wants ? t('approve.decided.paidWants', { wants: meta.wants.replace(/\s+to\s+\S+$/, '') }) : t('approve.decided.paidTo', { name: displayName(transfer!.receiver_id) })
  else if (p.status === 'Rejected') detail = t('approve.decided.declined', { yes, no })
  else if (joinRequestOf(p)) detail = t('approve.decided.join', { status: lower(s.label) })
  else detail = transfer ? lower(s.label) : t('approve.decided.other', { status: lower(s.label), kind: lower(requestKind(p.kind)) })
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3.5 last:border-0">
      <span className="min-w-0 flex-1" title={meta.title}>
        <RowText main={meta.title} detail={detail} />
      </span>
      <span className="flex shrink-0 items-baseline gap-4">
        <button
          className="-my-3 py-3 text-[12px] text-muted hover:text-ink"
          title={t('approve.comments')}
          onClick={() => openRequestSheet({ daoId: dao!.id, proposalId: p.id, title: meta.title, detail, amount: amount ?? undefined })}
        >
          <CommentCount daoId={dao!.id} proposalId={p.id} />
        </button>
        {payout && <TxLink hash={payout} label={t('approve.receipt')} />}
        {amount && <span className={`tnum ${paid ? '' : 'text-muted'}`}>{amount}</span>}
      </span>
    </div>
  )
}

export function RequestCard({ p }: { p: Proposal }) {
  useNames()
  const { dao, nearUsd, records, refresh, activity, tracks, setTrack } = useDao()
  const { accountId, send, signIn } = useWallet()
  const tx = useTx()
  const track = tracks[p.id]
  const [lastAction, setLastAction] = useState<VoteAction | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [snoozing, setSnoozing] = useState(false)
  const t = useT()
  if (!dao) return null
  const meta = decodeDescription(p.description)
  const transfer = isNearTransfer(p.kind) ? p.kind.Transfer : null
  const isTransfer = !!transfer
  const join = joinRequestOf(p)
  const route = isTransfer ? routeRequest(dao, p, nearUsd, records) : null
  const rules = approvalRules(dao.policy, p.kind)
  const voters = route ? route.voters : [...new Set(rules.flatMap((r) => r.members))]
  // Some proposal kinds have no role allowed to approve them in this DAO's policy.
  const noApprover = !route && rules.length === 0
  const needed = route ? route.needed : noApprover ? 0 : Math.min(...rules.map((r) => r.needed))
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
    // Labels, times and bubbles are stored as i18n keys + vars and translated by TrackerCard.
    const since = (): Pick<Step, 'at' | 'atVars'> => {
      const s = Math.round((Date.now() - t0) / 1000)
      return s < 60 ? { at: 'approve.track.atSeconds', atVars: { s } } : { at: 'approve.track.atMinutes', atVars: { m: Math.floor(s / 60), s: s % 60 } }
    }
    const put = (x: TrackX) => setTrack(p.id, x)
    const group = prettyName(dao!.config.name)
    const to = transfer ? displayName(transfer.receiver_id) : ''
    const amount = transfer ? yoctoToNear(transfer.amount) : ''
    const steps: Step[] = [{ label: 'approve.track.approvedByYou', done: true, at: 'approve.track.atNow', hash }]
    const base = { eta: transfer ? 'approve.track.etaChecking' : '', finished: false, paid: false }
    put({ ...base, steps: [...steps, transfer ? { label: 'approve.track.sends', vars: { group, amount }, done: false } : { label: 'approve.track.applying', done: false }] })

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
      steps.push({ ...(transfer ? { label: 'approve.track.sent', vars: { group, amount } } : { label: 'approve.track.applied' }), done: true, ...since(), hash })
      put({ ...base, eta: 'approve.track.etaSecond', steps: [...steps] })
      if (transfer) {
        await wait(950)
        steps.push({ label: 'approve.track.arrived', vars: { name: to }, done: true, ...since() })
      }
      const bubble: Pick<TrackX, 'bubble' | 'bubbleVars'> = transfer
        ? { bubble: 'approve.track.bubblePaid', bubbleVars: { name: to, amount } }
        : join
          ? { bubble: 'approve.track.bubbleJoined', bubbleVars: { name: displayName(join.member) } }
          : { bubble: 'approve.track.bubbleLive' }
      put({ steps: [...steps], eta: 'approve.track.etaDone', finished: true, paid: true, ...bubble })
      showToast(transfer ? translate('approve.toast.paid', { amount, name: to }) : translate('approve.toast.applied'))
    } else if (status === 'Failed') {
      steps.push({ label: 'approve.track.failed', done: false, ...since(), hash })
      put({ steps: [...steps], eta: '', finished: true, paid: false, bubble: 'approve.track.bubbleFailed' })
    } else {
      const left = Math.max(1, needed - approvals - 1)
      steps.push({ label: 'approve.track.waiting', vars: { count: left }, done: false })
      put({ steps: [...steps], eta: '', finished: true, paid: false })
      showToast(translate('approve.toast.waiting'))
    }
    await refresh()
  }

  if (dismissed) return null
  if (track) return <TrackerCard p={p} track={track} hero={route?.effectiveTier === 'small'} onDone={() => setTrack(p.id, null)} />
  const hero = route?.effectiveTier === 'small'
  const tierWord = route ? { small: t('approve.tier.small'), mid: t('approve.tier.mid'), large: t('approve.tier.large') }[route.effectiveTier] : requestKind(p.kind)
  const theyGet = meta.wants ? meta.wants.replace(/\s+to\s+\S+$/, '') : null
  const arrives = meta.quote?.match(/about (\d+)s/)?.[1]
  const [dollars, cents] = transfer ? splitUsd(yoctoToNumber(transfer.amount) * nearUsd) : ['', '']
  const sub = hero ? 'opacity-60' : 'text-muted'
  const rule = hero ? 'border-[var(--hero-line)]' : 'border-line'
  // A vote that would execute a transfer the DAO can't afford reverts (LackBalanceForState), so block it.
  const short = transfer ? BigInt(transfer.amount) > dao.spendable : false
  const canVote = !!accountId && !myVote && contractAllows && terraAllows
  // In a policy where someone is on the council and in the trusted role, the trusted role's
  // one-vote threshold applies to their vote, so it pays out above the fast lane too.
  const trustedRule = transfer ? rules.find((r) => isRole(r.role, 'trusted')) : undefined
  const paysAlone = !!(canVote && route && route.effectiveTier !== 'small' && trustedRule && accountId && trustedRule.members.includes(accountId) && approvals + 1 < needed)
  const rec = records.get(p.proposer)

  return (
    <article
      className={`flex min-w-0 flex-col rounded-2xl p-6 transition-[transform,opacity] duration-300 ${snoozing ? 'translate-x-3 opacity-40' : ''} ${hero ? 'bg-hero text-on-hero ring-1 ring-[var(--hero-ring)]' : 'border border-line bg-card'}`}
    >
      <div className={`flex flex-col gap-1 text-[12px] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3 ${sub}`}>
        <span className="flex min-w-0 items-center gap-2">
          <Avatar id={p.proposer} size={20} />
          {/* Its own box: an ellipsis needs a block, not loose text in a flex row. Phones have the full row, so it wraps there. */}
          <span className="min-w-0 sm:truncate">
            {t(join && join.member === p.proposer ? 'approve.card.wantsToJoin' : 'approve.card.asking', { name: displayName(p.proposer), when: timeAgo(nanoToDate(p.submission_time)) })}
            {route && route.tier === 'small' && route.effectiveTier !== 'small' ? ` · ${t('approve.card.newMember')}` : ''}
          </span>
        </span>
        <span className="shrink-0">
          {noApprover ? t('approve.card.noRole') : hero && canVote ? t('approve.card.smallYouDecide') : t('approve.card.progress', { tier: tierWord, approvals, needed })}
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
      ) : join ? (
        <div className="mt-6 flex items-center gap-4">
          <Avatar id={join.member} size={56} />
          <div className="min-w-0">
            <div className="truncate text-[28px] font-light leading-tight tracking-[-0.03em]" title={join.member}>
              {displayName(join.member)}
            </div>
            <div className="mt-0.5 text-[14px]">{t(join.member === p.proposer ? 'approve.card.wantsToJoinAs' : 'approve.card.invitedAs', { role: join.role })}</div>
            <div className={`mt-0.5 truncate font-mono text-[12px] ${sub}`}>{join.member}</div>
          </div>
        </div>
      ) : (
        <div className="mt-6 text-[20px] font-light">{requestKind(p.kind)}</div>
      )}
      {!join && <div className="mt-2 break-words text-[14px]">{meta.title}</div>}
      {meta.notes && <p className={`mt-1 text-[13px] ${sub}`}>{meta.notes}</p>}

      <div className={`mt-6 border-t pt-4 text-[13px] ${rule}`}>
        {theyGet ? (
          <div className="flex items-baseline justify-between gap-3">
            <span className={sub}>{t('common.theyGet')}</span>
            <span className="tnum text-end">{theyGet}</span>
          </div>
        ) : transfer ? (
          <div className="flex items-baseline justify-between gap-3">
            <span className={`shrink-0 ${sub}`}>{t('approve.card.paidTo')}</span>
            <span className="tnum min-w-0 truncate">{t('approve.card.paidToValue', { amount: yoctoToNear(transfer.amount), name: displayName(transfer.receiver_id) })}</span>
          </div>
        ) : null}
        {arrives && (
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className={sub}>{t('common.arrives')}</span>
            <span>{t('common.aboutSeconds', { count: Number(arrives) })}</span>
          </div>
        )}
        {rec && transfer && (
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className={sub}>{t('approve.card.record', { name: displayName(p.proposer) })}</span>
            <span className="tnum">{t('approve.card.recordCounts', { paid: rec.approved, rejected: rec.rejected })}</span>
          </div>
        )}
        {route && route.tier !== route.effectiveTier && <p className={`mt-2 text-[12px] ${sub}`}>{t('approve.card.councilDecides', { reason: route.reason })}</p>}
        {paysAlone && !short && (
          <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
            {t('approve.card.paysAloneWarning')}
          </p>
        )}
        {short && (
          <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
            {t('approve.card.shortWarning', { amount: yoctoToNear(dao.spendable) })}
          </p>
        )}
        {!hero && (
          <div className="mt-4">
            <div className="h-[3px] rounded-full bg-soft">
              <div className="h-[3px] rounded-full bg-ink transition-all" style={{ width: `${Math.min(100, (approvals / Math.max(needed, 1)) * 100)}%` }} />
            </div>
            <div className="mt-2 text-[12px] text-muted">
              {noApprover
                ? t('approve.card.noRolePolicy')
                : voters.filter((v) => p.votes[v] === 'Approve').map(displayName).join(', ') || t('approve.card.noApprovals')}
              {!noApprover && approvals < needed
                ? ` · ${t(route?.effectiveTier === 'small' ? 'approve.card.needsTrusted' : 'approve.card.needsCouncil', { count: needed - approvals })}`
                : ''}
              {rejects ? ` · ${t('approve.card.declinedCount', { count: rejects })}` : ''}
            </div>
          </div>
        )}
      </div>

      <CommentsToggle daoId={dao.id} proposalId={p.id} hero={hero} />

      <div className="mt-6 flex-1" />
      {noApprover ? (
        <p className={`text-[13px] ${sub}`}>{t('approve.card.noRoleSentence')}</p>
      ) : !accountId ? (
        <Button variant="secondary" onClick={signIn}>{t('approve.card.signIn')}</Button>
      ) : myVote ? (
        <p className={`text-[13px] ${sub}`}>{t(myVote === 'Approve' ? 'approve.card.youApproved' : myVote === 'Reject' ? 'approve.card.youDeclined' : 'approve.card.youVoted')}</p>
      ) : !contractAllows ? (
        <p className={`text-[13px] ${sub}`}>{t('approve.card.notInRole')}</p>
      ) : !terraAllows ? (
        <p className={`text-[13px] ${sub}`}>{t('approve.card.aboveFastLane')}</p>
      ) : hero ? (
        <>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button disabled={tx.state.status === 'signing' || short} onClick={() => vote('VoteApprove')}>
              {tx.state.status === 'signing' && lastAction === 'VoteApprove' ? <span className="spin" /> : t('approve.card.approveAndPay')}
            </Button>
            <button
              className="rounded-lg bg-white/10 px-4 text-[13.5px] font-medium"
              onClick={() => {
                setSnoozing(true)
                showToast(translate('approve.toast.snoozed'))
                setTimeout(() => setDismissed(true), 600)
              }}
            >
              {t('approve.card.notNow')}
            </button>
          </div>
          <button className="mt-1 self-start py-3 text-[12px] opacity-60 hover:opacity-100 sm:py-2" disabled={tx.state.status === 'signing'} onClick={() => vote('VoteReject')}>
            {t('approve.card.declineRequest')}
          </button>
        </>
      ) : (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button className="rounded-lg bg-ink py-2.5 text-[13.5px] font-medium text-bg disabled:opacity-50" disabled={tx.state.status === 'signing' || short} onClick={() => vote('VoteApprove')}>{t('approve.card.approve')}</button>
          <Button variant="secondary" disabled={tx.state.status === 'signing'} onClick={() => vote('VoteReject')}>{t('approve.card.decline')}</Button>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        <TxStatus state={tx.state} doneText={lastAction === 'VoteReject' ? t('approve.card.doneDeclined') : join ? t('approve.card.doneJoin') : t('approve.card.doneApproved')} />
      </div>
      {createdTx && tx.state.status === 'idle' && (
        <div className={`mt-1 text-[12px] ${sub}`}>
          <TxLink hash={createdTx} label={t('approve.card.requestOnNearBlocks')} />
        </div>
      )}
    </article>
  )
}

function TrackerCard({ p, track: raw, hero, onDone }: { p: Proposal; track: Track; hero: boolean; onDone: () => void }) {
  useNames()
  const t = useT()
  // Keys + vars (see Step); a plain string that isn't a key comes back from t() unchanged.
  const track = raw as TrackX
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
        <span className={sub}>{track.paid ? (transfer ? t('approve.track.headPaid') : t('approve.track.headDone')) : transfer ? t('approve.track.headPaying', { name: displayName(transfer.receiver_id) }) : t('approve.track.headApplying')}</span>
        {track.eta && (
          <span className="flex items-center gap-1.5">
            {!track.finished && <span className="live size-1.5 rounded-full bg-accent" />}
            <span className={`tnum ${sub}`}>{t(track.eta)}</span>
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
            <span className="min-w-0">{t(s.label, s.vars)}</span>
            <span className="ms-auto flex shrink-0 items-center gap-2 text-[12px]">
              {s.hash && <TxLink hash={s.hash} label={t('approve.track.tx')} />}
              {s.at && <span className={`tnum ${sub}`}>{t(s.at, s.atVars)}</span>}
            </span>
          </li>
        ))}
      </ol>
      {track.paid && <Burst />}
      <div className="mt-5 min-h-[44px]">
        {track.finished && (
          <div className="bubble flex items-end gap-2.5">
            {track.paid && <img src={ICON} alt="" className="mascot-bob size-9 rounded-[9px]" />}
            {track.bubble && <div className={`rounded-xl rounded-es-sm px-3.5 py-2.5 text-[13px] ${hero ? 'bg-white/10' : 'bg-soft'}`}>{t(track.bubble, track.bubbleVars)}</div>}
            <button className={`ms-auto self-center text-[12px] ${sub} hover:opacity-100`} onClick={onDone}>
              {t('common.done')}
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
