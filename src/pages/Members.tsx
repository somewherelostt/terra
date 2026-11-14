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
import { formatNumber, t, useT } from '../i18n'

type Standing = 'Council' | 'Trusted' | 'New'
type Filter = 'All' | Standing

/** On-screen label for a standing (the values above are internal). */
function standingLabel(s: Standing): string {
  return { Council: t('members.standing.council'), Trusted: t('members.standing.trusted'), New: t('members.standing.new') }[s]
}

/** "$50": a whole-dollar limit in the current locale. */
const dollars = (n: number) => formatNumber(n, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

// eslint-disable-next-line react-refresh/only-export-components
export function standingOf(r: MemberRecord): Standing {
  if (r.roles.some((n) => isRole(n, 'council'))) return 'Council'
  if (isTrusted(r)) return 'Trusted'
  return 'New'
}

export default function Members() {
  const t = useT()
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
  const emptyText = { All: t('members.empty.all'), Council: t('members.empty.council'), Trusted: t('members.empty.trusted'), New: t('members.empty.new') }[filter]
  const shown = rows
    .filter((r) => filter === 'All' || standingOf(r) === filter)
    .sort((a, b) => (a.accountId === accountId ? -1 : b.accountId === accountId ? 1 : b.approved - a.approved || b.votes - a.votes))

  return (
    <div>
      {inviting && <InviteSheet onClose={() => setInviting(false)} onAddByAccount={() => { setInviting(false); setInviteFor(''); setAddingById(true) }} />}
      {addingById && <InviteDialog initial={inviteFor} onClose={() => setAddingById(false)} />}
      <div className="text-[13px] text-muted">{t('members.eyebrow')}</div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <h1 className="text-[32px] font-light tracking-[-0.03em]">
          {t('members.count', { count: rows.length })}
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
            {joinCopied ? t('members.linkCopied') : t('members.askToJoin')}
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              setInviteFor('')
              setInviting(true)
            }}
          >
            {t('members.invite')}
          </Button>
        )}
      </div>
      {joinCopied && (
        <p className="mt-3 max-w-[560px] rounded-xl bg-soft px-4 py-3 text-[13px] text-muted">
          {t('members.joinHelp', { account: accountId ?? '' })}
        </p>
      )}
      <p className="mt-1 text-[13.5px] text-muted">{t('members.intro')}</p>
      {accountId && memberIds.has(accountId) && <AddNameNudge className="mt-5 max-w-sm" />}

      <div className="mt-8 flex flex-wrap gap-1 text-[13px]">
        {(['All', 'Council', 'Trusted', 'New'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-3 sm:py-1.5 ${filter === f ? 'bg-card ring-1 ring-line' : 'text-muted hover:text-ink'}`}
          >
            {f === 'All' ? t('members.filter.all') : standingLabel(f)} {formatNumber(f === 'All' ? rows.length : counts[f])}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2 md:hidden">
        {shown.map((r) => (
          <MemberCard key={r.accountId} r={r} you={r.accountId === accountId} onAvatar={openProfileSheet} canMessage={!!accountId && memberIds.has(accountId)} />
        ))}
        {shown.length === 0 && <div className="py-6 text-muted">{emptyText}</div>}
      </div>

      <div className="mt-4 hidden overflow-x-auto text-[13.5px] md:block">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr] border-b border-line py-2.5 text-[12px] text-muted">
            <span>{t('members.col.member')}</span>
            <span>{t('members.col.standing')}</span>
            <span>{t('members.col.chippedIn')}</span>
            <span>{t('members.col.requestsPaid')}</span>
            <span className="text-end">{t('members.col.fastLane')}</span>
          </div>
          {shown.map((r) => (
            <MemberRow key={r.accountId} r={r} you={r.accountId === accountId} onAvatar={openProfileSheet} canMessage={!!accountId && memberIds.has(accountId)} />
          ))}
          {shown.length === 0 && <div className="py-6 text-muted">{emptyText}</div>}
        </div>
      </div>

      {rows.length <= 1 && (
        <EmptyState
          icon="people"
          className="mt-6"
          title={!rows.length ? t('members.emptyState.none') : rows[0].accountId === accountId ? t('members.emptyState.justYou') : t('members.emptyState.one')}
          text={t('members.emptyState.text')}
        >
          <Button onClick={() => setInviting(true)}>{t('members.inviteMember')}</Button>
        </EmptyState>
      )}

      {others.length > 0 && (
        <div className="mt-10 max-w-[720px]">
          <div className="text-[13px] text-muted">{t('members.others.title')}</div>
          <div className="mt-2 text-[13.5px]">
            {others.map((r) => (
              <div key={r.accountId} className="flex items-center gap-3 border-b border-line py-3 last:border-0">
                <Avatar id={r.accountId} size={28} />
                <span className="min-w-0 flex-1 truncate">
                  <MemberName id={r.accountId} card />
                  <span className="text-muted">
                    {' '}
                    · {t('members.others.paid', { approved: r.approved, requested: r.requested })}
                    {r.chippedIn > 0n && ` · ${t('members.others.chippedIn')}`}
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
                    {t('members.invite')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10 max-w-[560px] rounded-2xl border border-line bg-card p-6">
        <div className="text-[14px] font-medium">{t('members.how.title')}</div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          {t('members.how.body', { small: dollars(TIER_LIMITS_USD.small), mid: dollars(TIER_LIMITS_USD.mid) })}
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          {t('members.how.limits')}
        </p>
        {!dao.policy.roles.some((r) => isRole(r.name, 'trusted')) && (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            {dao.policy.roles.some((r) => isRole(r.name, 'council')) ? t('members.how.noTrustedCouncil') : t('members.how.noTrustedRoles')}
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
  const lane = !fastLane ? t('members.lane.none') : s === 'New' ? t('members.lane.council') : dollars(TIER_LIMITS_USD.small)
  const paid = r.requested ? t('members.paidOf', { approved: r.approved, requested: r.requested }) : '—'
  return { s, label: standingLabel(s), badge, money, lane, paid }
}

/** Phone layout: one card per member. */
function MemberCard({ r, you, onAvatar, canMessage }: { r: MemberRecord; you: boolean; onAvatar?: () => void; canMessage?: boolean }) {
  const t = useT()
  const { nearUsd, dao } = useDao()
  const f = memberFacts(r, nearUsd, !!dao?.policy.roles.some((x) => isRole(x.name, 'trusted')))
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-3">
        <Avatar id={r.accountId} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px]">
            <MemberName id={r.accountId} card />
            {you && <span className="text-muted"> · {t('members.you')}</span>}
          </div>
          <div className="truncate font-mono text-[11.5px] text-muted">{r.accountId}</div>
          {you && (
            <button className="min-h-11 text-[12.5px] text-muted underline-offset-2 hover:underline" onClick={onAvatar}>
              {t('members.editProfile')}
            </button>
          )}
          {!you && canMessage && (
            <button className="min-h-11 text-[12.5px] text-muted underline-offset-2 hover:underline" onClick={() => go('messages', { with: r.accountId })}>
              {t('members.message')}
            </button>
          )}
        </div>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[12px] font-medium ${f.badge}`}>{f.label}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
        <div>
          <div className="text-muted">{t('members.col.chippedIn')}</div>
          <div className="tnum mt-0.5 text-[14px]">{f.money}</div>
        </div>
        <div>
          <div className="text-muted">{t('members.col.requestsPaid')}</div>
          <div className="tnum mt-0.5 text-[14px]">{f.paid}</div>
        </div>
        <div>
          <div className="text-muted">{t('members.col.fastLane')}</div>
          <div className="tnum mt-0.5 text-[14px]">{f.lane}</div>
        </div>
      </div>
    </div>
  )
}

function MemberRow({ r, you, onAvatar, canMessage }: { r: MemberRecord; you: boolean; onAvatar?: () => void; canMessage?: boolean }) {
  const t = useT()
  const { nearUsd, dao } = useDao()
  const fastLane = !!dao?.policy.roles.some((x) => isRole(x.name, 'trusted'))
  const f = memberFacts(r, nearUsd, fastLane)
  return (
    <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr] items-center border-b border-line py-3.5 last:border-0">
      <span className="flex min-w-0 items-center gap-3">
        <Avatar id={r.accountId} size={28} />
        <span className="min-w-0">
          {/* -m-1 p-1: room for the name button's focus ring inside the clipping box, same layout. */}
          <span className="-m-1 block truncate p-1">
            <MemberName id={r.accountId} card />
            {you && <span className="text-muted"> · {t('members.you')}</span>}
          </span>
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-mono text-[11px] text-muted">{r.accountId}</span>
            {you && (
              <button className="shrink-0 text-[12px] text-muted underline-offset-2 hover:text-ink hover:underline" onClick={onAvatar}>
                {t('members.editProfile')}
              </button>
            )}
            {!you && canMessage && (
              <button className="shrink-0 text-[12px] text-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => go('messages', { with: r.accountId })}>
                {t('members.message')}
              </button>
            )}
          </span>
        </span>
      </span>
      <span>
        <span className={`rounded-md px-2 py-0.5 text-[12px] font-medium ${f.badge}`}>{f.label}</span>
      </span>
      <span className="tnum">{f.money}</span>
      <span className="tnum">{f.paid}</span>
      <span className="tnum text-end">{!fastLane || f.s === 'New' ? <span className="text-muted">{f.lane}</span> : f.lane}</span>
    </div>
  )
}

function InviteDialog({ onClose, initial }: { onClose: () => void; initial: string }) {
  const t = useT()
  const roleHelp: Record<string, string> = {
    member: t('members.roleHelp.member'),
    trusted: t('members.roleHelp.trusted'),
    council: t('members.roleHelp.council'),
  }
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
    <div className="fixed inset-0 z-40 grid items-end glass-scrim sm:place-items-center sm:p-4" onClick={onClose} role="dialog" aria-modal aria-label={t('members.inviteMember')}>
      <div className="w-full glass glass-sheet rounded-t-2xl border border-line bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-[440px] sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span>{t('members.inviteMember')}</span>
          <button onClick={onClose} className="-my-3 py-3 ps-4 hover:text-ink">{t('common.close')}</button>
        </div>
        <p className="mt-1 text-[13.5px] text-muted">{t('members.inviteDialog.help')}</p>
        <label className="mt-6 block border-b border-line pb-2 transition-colors focus-within:border-ink">
          <span className="text-[12px] text-muted">{t('members.inviteDialog.account')}</span>
          <input /* i18n-ignore: example account ID */ autoFocus className="w-full bg-transparent py-3 font-mono text-[15px] outline-none sm:py-2" value={member} onChange={(e) => setMember(e.target.value)} placeholder="friend.testnet" spellCheck={false} />
        </label>
        <div className="mt-5">
          <span className="text-[12px] text-muted">{t('members.inviteDialog.role')}</span>
          <div className="mt-2 flex flex-wrap gap-2 text-[13.5px]">
            {roles.map((r) => (
              <button key={r} onClick={() => setRole(r)} className={`min-h-11 rounded-lg border px-4 py-2 sm:min-h-0 ${role === r ? 'border-ink' : 'border-line text-muted'}`}>{r}</button>
            ))}
          </div>
          {roleHelp[role] && <p className="mt-2 text-[12.5px] text-muted">{roleHelp[role]}</p>}
          {dao.policy.roles.find((r) => r.name === role && roleMembers(r).includes(id)) && <p className="mt-2 text-[12.5px] text-warn">{t('members.inviteDialog.hasRole', { account: id })}</p>}
        </div>
        <div className="mt-6">
          {!accountId ? (
            <Button className="w-full !py-3" onClick={signIn}>{t('members.inviteDialog.signIn')}</Button>
          ) : !allowed ? (
            <p className="text-[13px] text-muted">{t('members.inviteDialog.councilOnly')}</p>
          ) : (
            <Button className="w-full !py-3" disabled={!valid || !roles.includes(role) || tx.state.status === 'signing'} onClick={() => tx.run(() => send(addMemberProposalTx(dao, id, role)), refresh)}>
              {t('members.inviteDialog.send')}
            </Button>
          )}
        </div>
        <div className="mt-3">
          <TxStatus state={tx.state} doneText={t('members.inviteDialog.sent')} />
          {tx.state.status === 'done' && (
            <Button variant="secondary" className="mt-2 w-full" onClick={() => go('approve')}>
              {t('members.inviteDialog.approveNow')}
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
