import { useEffect, useState } from 'react'
import { go, shareUrl, useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { addMemberProposalTx, can, isRole, roleMembers } from '../lib/dao'
import { isValidAccountId } from '../lib/near'
import { usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { TIER_LIMITS_USD, isTrusted, type MemberRecord } from '../lib/record'
import { Avatar, Button, EmptyState, TxStatus, useTx } from '../components/ui'
import { AddNameNudge, MemberName, openProfileSheet } from '../components/ProfileSheet'
import { InviteSheet } from '../components/InviteSheet'

type Standing = 'Council' | 'Trusted' | 'New'
type Filter = 'All' | Standing

// eslint-disable-next-line react-refresh/only-export-components
export function standingOf(r: MemberRecord): Standing {
  if (r.roles.some((n) => isRole(n, 'council'))) return 'Council'
  if (isTrusted(r)) return 'Trusted'
  return 'New'
}

export default function Members() {
  const { dao, records } = useDao()
  const { accountId } = useWallet()
  const [filter, setFilter] = useState<Filter>('All')
  // A request link (#/members?invite=<account>) opens the add-by-account dialog filled in.
  const asked = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('invite')
  const [inviting, setInviting] = useState(false)
  const [addingById, setAddingById] = useState(!!asked)
  const [inviteFor, setInviteFor] = useState(asked ?? '')
  const [joinCopied, setJoinCopied] = useState(false)
  if (!dao) return null
  // Members are accounts in a role; anyone else with history is a contributor, not listed here.
  const memberIds = new Set(dao.policy.roles.flatMap(roleMembers))
  const rows = [...records.values()].filter((r) => memberIds.has(r.accountId))
  // People who chipped in or asked for money but aren't in a role yet.
  const others = [...records.values()].filter((r) => !memberIds.has(r.accountId) && (r.requested > 0 || r.chippedIn > 0n))
  const canInvite = can(dao.policy, accountId, 'add_member_to_role', 'AddProposal')
  const counts = { Council: 0, Trusted: 0, New: 0 }
  rows.forEach((r) => counts[standingOf(r)]++)
  const shown = rows
    .filter((r) => filter === 'All' || standingOf(r) === filter)
    .sort((a, b) => (a.accountId === accountId ? -1 : b.accountId === accountId ? 1 : b.approved - a.approved || b.votes - a.votes))

  return (
    <div>
      {inviting && <InviteSheet onClose={() => setInviting(false)} onAddByAccount={() => { setInviting(false); setInviteFor(''); setAddingById(true) }} />}
      {addingById && <InviteDialog initial={inviteFor} onClose={() => setAddingById(false)} />}
      <div className="text-[13px] text-muted">Members</div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <h1 className="text-[32px] font-light tracking-[-0.03em]">
          {rows.length} member{rows.length === 1 ? '' : 's'}
        </h1>
        {accountId && !memberIds.has(accountId) && !can(dao.policy, accountId, 'add_member_to_role', 'AddProposal') ? (
          <Button
            variant="secondary"
            onClick={() =>
              navigator.clipboard
                ?.writeText(shareUrl(dao.id, 'members', { invite: accountId }))
                .then(() => setJoinCopied(true))
                .catch(() => setJoinCopied(false))
            }
          >
            {joinCopied ? 'Link copied' : 'Ask to join'}
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              setInviteFor('')
              setInviting(true)
            }}
          >
            Invite
          </Button>
        )}
      </div>
      {joinCopied && (
        <p className="mt-3 max-w-[560px] rounded-xl bg-soft px-4 py-3 text-[13px] text-muted">
          Send that link to someone on the council. It opens an invite for {accountId}, filled in; once the council approves it, you're a member. You can already chip in and request money
          without joining.
        </p>
      )}
      <p className="mt-1 text-[13.5px] text-muted">A member's record decides how much approval their requests need.</p>
      {accountId && memberIds.has(accountId) && <AddNameNudge className="mt-5 max-w-sm" />}

      <div className="mt-8 flex flex-wrap gap-1 text-[13px]">
        {(['All', 'Council', 'Trusted', 'New'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-3 sm:py-1.5 ${filter === f ? 'bg-card ring-1 ring-line' : 'text-muted hover:text-ink'}`}
          >
            {f} {f === 'All' ? rows.length : counts[f]}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2 md:hidden">
        {shown.map((r) => (
          <MemberCard key={r.accountId} r={r} you={r.accountId === accountId} onAvatar={openProfileSheet} canMessage={!!accountId && memberIds.has(accountId)} />
        ))}
        {shown.length === 0 && <div className="py-6 text-muted">{filter === 'All' ? 'Nobody here yet.' : `No ${filter.toLowerCase()} members yet.`}</div>}
      </div>

      <div className="mt-4 hidden overflow-x-auto text-[13.5px] md:block">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr] border-b border-line py-2.5 text-[12px] text-muted">
            <span>Member</span>
            <span>Standing</span>
            <span>Chipped in</span>
            <span>Requests paid</span>
            <span className="text-right">Fast lane up to</span>
          </div>
          {shown.map((r) => (
            <MemberRow key={r.accountId} r={r} you={r.accountId === accountId} onAvatar={openProfileSheet} canMessage={!!accountId && memberIds.has(accountId)} />
          ))}
          {shown.length === 0 && <div className="py-6 text-muted">{filter === 'All' ? 'Nobody here yet.' : `No ${filter.toLowerCase()} members yet.`}</div>}
        </div>
      </div>

      {rows.length <= 1 && (
        <EmptyState
          icon="people"
          className="mt-6"
          title={!rows.length ? 'No members yet' : rows[0].accountId === accountId ? "It's just you so far" : 'One member so far'}
          text="Invite the people who chip in and ask for money. The council approves each invite."
        >
          <Button onClick={() => setInviting(true)}>Invite a member</Button>
        </EmptyState>
      )}

      {others.length > 0 && (
        <div className="mt-10 max-w-[720px]">
          <div className="text-[13px] text-muted">Not members yet · anyone can chip in or ask for money</div>
          <div className="mt-2 text-[13.5px]">
            {others.map((r) => (
              <div key={r.accountId} className="flex items-center gap-3 border-b border-line py-3 last:border-0">
                <Avatar id={r.accountId} size={28} />
                <span className="min-w-0 flex-1 truncate">
                  <MemberName id={r.accountId} card />
                  <span className="text-muted">
                    {' '}
                    · {r.approved} of {r.requested} paid{r.chippedIn > 0n ? ' · chipped in' : ''}
                  </span>
                </span>
                {canInvite && (
                  <button
                    className="min-h-11 shrink-0 text-[13px] font-medium hover:underline sm:min-h-0"
                    onClick={() => {
                      setInviteFor(r.accountId)
                      setAddingById(true)
                    }}
                  >
                    Invite
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10 max-w-[560px] rounded-2xl border border-line bg-card p-6">
        <div className="text-[14px] font-medium">How standing works</div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          A first request goes to the council. After one paid request and nothing turned down, someone's requests up to ${TIER_LIMITS_USD.small} take the fast lane: one nod from a member
          of the trusted role who isn't them. Requests up to ${TIER_LIMITS_USD.mid}, and bigger ones, need the council's majority; big ones stay on the public board while open. The council
          and the trusted role are set in the DAO's policy, and every record is computed from the DAO's own history on NEAR.
        </p>
        {!dao.policy.roles.some((r) => isRole(r.name, 'trusted')) && (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            This DAO wasn't set up by Terra and has no trusted role, so there is no fast lane: {dao.policy.roles.some((r) => isRole(r.name, 'council')) ? 'its council decides' : 'the roles that can vote decide'}{' '}
            every request at the DAO's own thresholds.
          </p>
        )}
      </div>
    </div>
  )
}

function memberFacts(r: MemberRecord, nearUsd: number, fastLane = true) {
  const s = standingOf(r)
  const badge = { Trusted: 'bg-accent text-on-accent', Council: 'border border-line', New: 'bg-soft text-muted' }[s]
  const money = r.chippedIn === 0n ? '—' : isFinite(nearUsd) ? usd(yoctoToNumber(r.chippedIn) * nearUsd) : `${yoctoToNear(r.chippedIn)} NEAR`
  const lane = !fastLane ? 'No fast lane' : s === 'New' ? 'Council decides' : '$' + TIER_LIMITS_USD.small
  return { s, badge, money, lane }
}

/** Phone layout: one card per member. */
function MemberCard({ r, you, onAvatar, canMessage }: { r: MemberRecord; you: boolean; onAvatar?: () => void; canMessage?: boolean }) {
  const { nearUsd, dao } = useDao()
  const f = memberFacts(r, nearUsd, !!dao?.policy.roles.some((x) => isRole(x.name, 'trusted')))
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-3">
        <Avatar id={r.accountId} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px]">
            <MemberName id={r.accountId} card />
            {you && <span className="text-muted"> · you</span>}
          </div>
          <div className="truncate font-mono text-[11.5px] text-muted">{r.accountId}</div>
          {you && (
            <button className="min-h-11 text-[12.5px] text-muted underline-offset-2 hover:underline" onClick={onAvatar}>
              Edit profile
            </button>
          )}
          {!you && canMessage && (
            <button className="min-h-11 text-[12.5px] text-muted underline-offset-2 hover:underline" onClick={() => go('messages', { with: r.accountId })}>
              Message
            </button>
          )}
        </div>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[12px] font-medium ${f.badge}`}>{f.s}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
        <div>
          <div className="text-muted">Chipped in</div>
          <div className="tnum mt-0.5 text-[14px]">{f.money}</div>
        </div>
        <div>
          <div className="text-muted">Requests paid</div>
          <div className="tnum mt-0.5 text-[14px]">{r.requested ? `${r.approved} of ${r.requested}` : '—'}</div>
        </div>
        <div>
          <div className="text-muted">Fast lane up to</div>
          <div className="tnum mt-0.5 text-[14px]">{f.lane}</div>
        </div>
      </div>
    </div>
  )
}

function MemberRow({ r, you, onAvatar, canMessage }: { r: MemberRecord; you: boolean; onAvatar?: () => void; canMessage?: boolean }) {
  const { nearUsd, dao } = useDao()
  const fastLane = !!dao?.policy.roles.some((x) => isRole(x.name, 'trusted'))
  const s = standingOf(r)
  const badge = {
    Trusted: 'bg-accent text-on-accent',
    Council: 'border border-line',
    New: 'bg-soft text-muted',
  }[s]
  const money = r.chippedIn === 0n ? '—' : isFinite(nearUsd) ? usd(yoctoToNumber(r.chippedIn) * nearUsd) : `${yoctoToNear(r.chippedIn)} NEAR`
  return (
    <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr] items-center border-b border-line py-3.5 last:border-0">
      <span className="flex min-w-0 items-center gap-3">
        <Avatar id={r.accountId} size={28} />
        <span className="min-w-0">
          <span className="block truncate">
            <MemberName id={r.accountId} card />
            {you && <span className="text-muted"> · you</span>}
          </span>
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-mono text-[11px] text-muted">{r.accountId}</span>
            {you && (
              <button className="shrink-0 text-[12px] text-muted underline-offset-2 hover:text-ink hover:underline" onClick={onAvatar}>
                Edit profile
              </button>
            )}
            {!you && canMessage && (
              <button className="shrink-0 text-[12px] text-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => go('messages', { with: r.accountId })}>
                Message
              </button>
            )}
          </span>
        </span>
      </span>
      <span>
        <span className={`rounded-md px-2 py-0.5 text-[12px] font-medium ${badge}`}>{s}</span>
      </span>
      <span className="tnum">{money}</span>
      <span className="tnum">{r.requested ? `${r.approved} of ${r.requested}` : '—'}</span>
      <span className="tnum text-right">{!fastLane ? <span className="text-muted">No fast lane</span> : s === 'New' ? <span className="text-muted">Council decides</span> : `$${TIER_LIMITS_USD.small}`}</span>
    </div>
  )
}

const ROLE_HELP: Record<string, string> = {
  member: 'Listed as a member. Their record starts here; small requests take the fast lane once one is paid.',
  trusted: 'Can give the one approval a small request needs. Their single approval pays any transfer on chain, so only pick people the group trusts with that.',
  council: 'Decides mid and large requests by majority, and can change the group.',
}

function InviteDialog({ onClose, initial }: { onClose: () => void; initial: string }) {
  const { dao, refresh } = useDao()
  const { accountId, send, signIn } = useWallet()
  const [member, setMember] = useState(initial)
  const [role, setRole] = useState(() => (dao?.policy.roles.some((r) => r.name === 'member') ? 'member' : dao?.policy.roles.find((r) => r.kind !== 'Everyone')?.name ?? ''))
  const tx = useTx()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!dao) return null
  const roles = dao.policy.roles.filter((r) => r.kind !== 'Everyone').map((r) => r.name)
  const allowed = can(dao.policy, accountId, 'add_member_to_role', 'AddProposal')
  const id = member.trim().toLowerCase()
  const valid = isValidAccountId(id)
  return (
    <div className="fixed inset-0 z-40 grid items-end glass-scrim sm:place-items-center sm:p-4" onClick={onClose} role="dialog" aria-modal aria-label="Invite a member">
      <div className="w-full glass glass-sheet rounded-t-2xl border border-line bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-[440px] sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span>Invite a member</span>
          <button onClick={onClose} className="-my-3 py-3 pl-4 hover:text-ink">Close</button>
        </div>
        <p className="mt-1 text-[13.5px] text-muted">This files a request to add them. The council approves it like any other change.</p>
        <label className="mt-6 block border-b border-line pb-2 transition-colors focus-within:border-ink">
          <span className="text-[12px] text-muted">Their NEAR account</span>
          <input autoFocus className="w-full bg-transparent py-3 font-mono text-[15px] outline-none sm:py-2" value={member} onChange={(e) => setMember(e.target.value)} placeholder="friend.testnet" spellCheck={false} />
        </label>
        <div className="mt-5">
          <span className="text-[12px] text-muted">Role</span>
          <div className="mt-2 flex flex-wrap gap-2 text-[13.5px]">
            {roles.map((r) => (
              <button key={r} onClick={() => setRole(r)} className={`min-h-11 rounded-lg border px-4 py-2 sm:min-h-0 ${role === r ? 'border-ink' : 'border-line text-muted'}`}>{r}</button>
            ))}
          </div>
          {ROLE_HELP[role] && <p className="mt-2 text-[12.5px] text-muted">{ROLE_HELP[role]}</p>}
          {dao.policy.roles.find((r) => r.name === role && roleMembers(r).includes(id)) && <p className="mt-2 text-[12.5px] text-warn">{id} already has this role.</p>}
        </div>
        <div className="mt-6">
          {!accountId ? (
            <Button className="w-full !py-3" onClick={signIn}>Sign in to invite</Button>
          ) : !allowed ? (
            <p className="text-[13px] text-muted">Only the council can add members to this DAO. Close this and use Ask to join to send them a link.</p>
          ) : (
            <Button className="w-full !py-3" disabled={!valid || !roles.includes(role) || tx.state.status === 'signing'} onClick={() => tx.run(() => send(addMemberProposalTx(dao, id, role)), refresh)}>
              Send invite request
            </Button>
          )}
        </div>
        <div className="mt-3">
          <TxStatus state={tx.state} doneText="Invite request sent. It needs the council's votes, yours included." />
          {tx.state.status === 'done' && (
            <Button variant="secondary" className="mt-2 w-full" onClick={() => go('approve')}>
              Approve it now
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Member records for the public board. */
export function RecordsTable() {
  const { dao, records } = useDao()
  if (!dao) return null
  const memberIds = new Set(dao.policy.roles.flatMap(roleMembers))
  const rows = [...records.values()].filter((r) => memberIds.has(r.accountId)).sort((a, b) => b.approved - a.approved)
  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.map((r) => (
          <MemberCard key={r.accountId} r={r} you={false} />
        ))}
      </div>
      <div className="hidden overflow-x-auto text-[13.5px] md:block">
        <div className="min-w-[560px]">
          {rows.map((r) => (
            <MemberRow key={r.accountId} r={r} you={false} />
          ))}
        </div>
      </div>
    </>
  )
}
