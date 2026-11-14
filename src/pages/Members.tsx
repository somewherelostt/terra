import { useEffect, useState } from 'react'
import { useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { addMemberProposalTx, can, roleMembers } from '../lib/dao'
import { isValidAccountId } from '../lib/near'
import { usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { TIER_LIMITS_USD, isTrusted, type MemberRecord } from '../lib/record'
import { Account, Avatar, Button, TxStatus, useTx } from '../components/ui'

type Standing = 'Council' | 'Trusted' | 'New'
type Filter = 'All' | Standing

// eslint-disable-next-line react-refresh/only-export-components
export function standingOf(r: MemberRecord): Standing {
  if (r.roles.includes('council')) return 'Council'
  if (isTrusted(r)) return 'Trusted'
  return 'New'
}

export default function Members() {
  const { dao, records } = useDao()
  const { accountId } = useWallet()
  const [filter, setFilter] = useState<Filter>('All')
  const [inviting, setInviting] = useState(false)
  if (!dao) return null
  // Members are accounts in a role; anyone else with history is a contributor, not listed here.
  const memberIds = new Set(dao.policy.roles.flatMap(roleMembers))
  const rows = [...records.values()].filter((r) => memberIds.has(r.accountId))
  const counts = { Council: 0, Trusted: 0, New: 0 }
  rows.forEach((r) => counts[standingOf(r)]++)
  const shown = rows
    .filter((r) => filter === 'All' || standingOf(r) === filter)
    .sort((a, b) => (a.accountId === accountId ? -1 : b.accountId === accountId ? 1 : b.approved - a.approved || b.votes - a.votes))

  return (
    <div>
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
      <div className="text-[13px] text-muted">Members</div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <h1 className="text-[32px] font-light tracking-[-0.03em]">
          {rows.length} member{rows.length === 1 ? '' : 's'}
        </h1>
        <Button variant="secondary" onClick={() => setInviting(true)}>Invite</Button>
      </div>
      <p className="mt-1 text-[13.5px] text-muted">A member's record decides how much approval their requests need.</p>

      <div className="mt-8 flex flex-wrap gap-1 text-[13px]">
        {(['All', 'Council', 'Trusted', 'New'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 ${filter === f ? 'bg-card ring-1 ring-line' : 'text-muted hover:text-ink'}`}
          >
            {f} {f === 'All' ? rows.length : counts[f]}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto text-[13.5px]">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr] border-b border-line py-2.5 text-[12px] text-muted">
            <span>Member</span>
            <span>Standing</span>
            <span>Chipped in</span>
            <span>Requests paid</span>
            <span className="text-right">Fast lane up to</span>
          </div>
          {shown.map((r) => (
            <MemberRow key={r.accountId} r={r} you={r.accountId === accountId} />
          ))}
          {shown.length === 0 && <div className="py-6 text-muted">Nobody here yet.</div>}
        </div>
      </div>

      <div className="mt-10 max-w-[560px] rounded-2xl border border-line bg-card p-6">
        <div className="text-[14px] font-medium">How standing works</div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          New members' requests go to the council. After one paid request and nothing turned down, a member becomes trusted: their requests up to ${TIER_LIMITS_USD.small} need just one
          nod from a trusted member. Requests up to ${TIER_LIMITS_USD.mid} go to the council; bigger ones are a full council vote. The council and the trusted role are set in the DAO's
          policy, and every record is computed from the DAO's own history on NEAR.
        </p>
      </div>
    </div>
  )
}

function MemberRow({ r, you }: { r: MemberRecord; you: boolean }) {
  const { nearUsd } = useDao()
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
        <span className="truncate">
          <Account id={r.accountId} className="!font-normal" />
          {you && <span className="text-muted"> · you</span>}
        </span>
      </span>
      <span>
        <span className={`rounded-md px-2 py-0.5 text-[12px] font-medium ${badge}`}>{s}</span>
      </span>
      <span className="tnum">{money}</span>
      <span className="tnum">{r.requested ? `${r.approved} of ${r.requested}` : '—'}</span>
      <span className="tnum text-right">{s === 'New' ? <span className="text-muted">Council decides</span> : `$${TIER_LIMITS_USD.small}`}</span>
    </div>
  )
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const { dao, refresh } = useDao()
  const { accountId, send, signIn } = useWallet()
  const [member, setMember] = useState('')
  const [role, setRole] = useState('trusted')
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
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onClick={onClose} role="dialog" aria-modal aria-label="Invite a member">
      <div className="w-full max-w-[440px] rounded-2xl border border-line bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span>Invite a member</span>
          <button onClick={onClose} className="hover:text-ink">Close</button>
        </div>
        <p className="mt-1 text-[13.5px] text-muted">This files a request to add them. The council approves it like any other change.</p>
        <label className="mt-6 block border-b border-line pb-3">
          <span className="text-[12px] text-muted">Their NEAR account</span>
          <input autoFocus className="mt-1 w-full bg-transparent font-mono text-[15px] outline-none" value={member} onChange={(e) => setMember(e.target.value)} placeholder="friend.testnet" spellCheck={false} />
        </label>
        <div className="mt-5">
          <span className="text-[12px] text-muted">Role</span>
          <div className="mt-2 flex flex-wrap gap-2 text-[13.5px]">
            {roles.map((r) => (
              <button key={r} onClick={() => setRole(r)} className={`rounded-lg border px-4 py-2 ${role === r ? 'border-ink' : 'border-line text-muted'}`}>{r}</button>
            ))}
          </div>
        </div>
        <div className="mt-6">
          {!accountId ? (
            <Button className="w-full !py-3" onClick={signIn}>Sign in to invite</Button>
          ) : !allowed ? (
            <p className="text-[13px] text-muted">Your role can't propose new members in this DAO.</p>
          ) : (
            <Button className="w-full !py-3" disabled={!valid || !roles.includes(role) || tx.state.status === 'signing'} onClick={() => tx.run(() => send(addMemberProposalTx(dao, id, role)), refresh)}>
              Send invite request
            </Button>
          )}
        </div>
        <div className="mt-3">
          <TxStatus state={tx.state} doneText="Invite request sent. The council can approve it in Approve." />
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
    <div className="overflow-x-auto text-[13.5px]">
      <div className="min-w-[560px]">
        {rows.map((r) => (
          <MemberRow key={r.accountId} r={r} you={false} />
        ))}
      </div>
    </div>
  )
}
