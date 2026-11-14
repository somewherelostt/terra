import { useEffect, useState } from 'react'
import { openDao, useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { addMemberProposalTx, allMembers, approvalRules, type Proposal } from '../lib/dao'
import { view } from '../lib/near'
import { splitUsd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { displayName, useNames } from '../lib/profile'
import { defaultJoinRole, invitableRoles, isMember, joinRequestsOpen, pendingJoinFor } from '../lib/join'
import { Avatar, Button, Spinner, TxStatus, useTx } from '../components/ui'
import { prettyName } from '../App'

const ICON = `${import.meta.env.BASE_URL}favicon.svg`
const NEW_ACCOUNT_URL = 'https://wallet.meteorwallet.app'

/** Where an invite QR lands: see the group, sign in, ask to join, wait for the council. */
export default function Join({ daoId, params }: { daoId: string | null; params: URLSearchParams }) {
  useNames()
  const { dao, error, nearUsd, refresh } = useDao()
  const { accountId, ready, signIn, send } = useWallet()
  const tx = useTx()
  const [approvedNow, setApprovedNow] = useState(false)
  const [rejectedNow, setRejectedNow] = useState(false)

  const pending = dao && accountId ? pendingJoinFor(dao, accountId) : undefined

  // While a request waits, check it every few seconds and reload the group once it's decided.
  useEffect(() => {
    if (!dao || !pending) return
    let live = true
    const id = pending.id
    const t = setInterval(async () => {
      try {
        const p = await view<Proposal>(dao.id, 'get_proposal', { id })
        if (!live) return
        if (p.status === 'Approved') setApprovedNow(true)
        if (p.status === 'Rejected' || p.status === 'Removed' || p.status === 'Expired') setRejectedNow(true)
        if (p.status !== 'InProgress') {
          clearInterval(t)
          refresh()
        } else if (Object.keys(p.votes).length !== Object.keys(pending.votes).length) {
          refresh()
        }
      } catch {
        /* RPC hiccup: try again next tick */
      }
    }, 4000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [dao, pending, refresh])

  if (!daoId || error) {
    return (
      <Frame panel={<p className="text-[14.5px] text-muted">Terra groups keep their money in a NEAR treasury that members run together.</p>}>
        <div className="text-[13px] text-muted">Invite</div>
        <h1 className="mt-2 text-[34px] leading-[1.05] font-light tracking-[-0.035em]">This invite doesn't open a group</h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
          {daoId ? (
            <>
              We couldn't find a community treasury at <span className="break-all font-mono text-[13px]">{daoId}</span>. Ask whoever shared it for a fresh QR.
            </>
          ) : (
            'The link is missing its group. Ask whoever shared it for a fresh QR.'
          )}
        </p>
        <Button variant="secondary" className="mt-8 w-full" onClick={() => openDao(null)}>
          Go to Terra
        </Button>
      </Frame>
    )
  }

  if (!dao) {
    return (
      <Frame>
        <div aria-busy="true" aria-label="Reading the group from NEAR">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton mt-4 h-10 w-56" />
          <div className="skeleton mt-8 h-14 w-48" />
          <div className="skeleton mt-4 h-3 w-40" />
          <div className="skeleton mt-10 h-12 w-full" />
        </div>
      </Frame>
    )
  }

  const name = prettyName(dao.config.name)
  const members = allMembers(dao.policy)
  const roles = invitableRoles(dao.policy)
  const asked = params.get('role') ?? ''
  // A link only names a role a council member picked; otherwise newcomers join as plain members.
  const role = roles.includes(asked) ? asked : defaultJoinRole(dao.policy)
  const open = joinRequestsOpen(dao.policy) && roles.includes(role)
  const already = accountId ? isMember(dao.policy, accountId) : false
  const [dollars, cents] = splitUsd(yoctoToNumber(dao.spendable + dao.staked) * nearUsd)
  const bond = yoctoToNear(dao.policy.proposal_bond)
  const kind = { AddMemberToRole: { member_id: accountId ?? '', role } }
  const rule = approvalRules(dao.policy, kind)[0]

  const panel = (
    <>
      <div className="truncate text-[12px] text-muted" title={dao.id}>{dao.id}</div>
      <div className="tnum mt-2 text-[56px] leading-[0.9] font-light tracking-[-0.055em] md:text-[72px]">
        {dollars}
        <span className="text-muted">{cents}</span>
      </div>
      <div className="mt-3 text-[13px] text-muted">
        in the treasury · {members.length} member{members.length === 1 ? '' : 's'}
      </div>
      <ul className="mt-8 flex flex-wrap gap-x-4 gap-y-3" aria-label="Members">
        {members.slice(0, 8).map((m) => (
          <li key={m} className="flex items-center gap-2 text-[13px]">
            <Avatar id={m} size={28} shape="circle" />
            <span className="max-w-[9rem] truncate" title={m}>{displayName(m)}</span>
          </li>
        ))}
        {members.length > 8 && <li className="self-center text-[13px] text-muted">+{members.length - 8} more</li>}
      </ul>
    </>
  )

  return (
    <Frame panel={panel}>
      <div className="text-[13px] text-muted">You're invited to</div>
      <h1 className="mt-2 text-[40px] leading-[1.02] font-light tracking-[-0.035em] break-words">{name}</h1>
      {dao.config.purpose && <p className="mt-2 text-[14px] leading-relaxed text-muted">{dao.config.purpose}</p>}

      <p className="mt-4 text-[14.5px] leading-relaxed text-muted">
        Members chip in, ask the group for money and build a record. The council approves everyone who joins.
      </p>

      <div className="mt-6">
        {!ready ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : approvedNow || (already && tx.state.status === 'done') ? (
          <Done title={`You're in ${name}`} text="The council approved your request." onOpen={() => openDao(dao.id, 'home')} cta={`Open ${name}`} />
        ) : already ? (
          <Done title={`You're already in ${name}`} text={`Signed in as ${displayName(accountId!)}.`} onOpen={() => openDao(dao.id, 'home')} cta={`Open ${name}`} />
        ) : !accountId ? (
          <>
            <button onClick={() => signIn().catch(() => undefined)} className="min-h-12 w-full rounded-lg bg-accent text-[15px] font-medium text-on-accent">
              Sign in to ask
            </button>
            <p className="mt-3 text-center text-[12.5px] text-muted">
              No NEAR account?{' '}
              <a href={NEW_ACCOUNT_URL} target="_blank" rel="noreferrer" className="relative text-ink underline underline-offset-2 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']">
                Create a free testnet one
              </a>
              , then come back to this page.
            </p>
          </>
        ) : pending ? (
          <Waiting p={pending} needed={rule?.needed ?? 1} voters={rule?.members ?? []} />
        ) : rejectedNow ? (
          <div className="rounded-2xl border border-line bg-card p-5 text-[14px]">
            <div className="font-medium">The council didn't approve this one</div>
            <p className="mt-1 text-[13px] text-muted">Have a word with an organiser; you can ask again.</p>
            <Button variant="secondary" className="mt-4 w-full" onClick={() => setRejectedNow(false)}>Ask again</Button>
          </div>
        ) : !open ? (
          <div className="rounded-2xl border border-line bg-card p-5 text-[14px]">
            <div className="font-medium">{name} isn't taking join requests yet</div>
            <p className="mt-1 text-[13px] text-muted">Ask an organiser to switch them on in Members → Invite. It takes one council vote.</p>
          </div>
        ) : (
          <>
            <button
              disabled={tx.state.status === 'signing'}
              onClick={() => tx.run(() => send(addMemberProposalTx(dao, accountId, role)), refresh)}
              className="min-h-12 w-full rounded-lg bg-accent text-[15px] font-medium text-on-accent disabled:opacity-60"
            >
              {tx.state.status === 'signing' ? <span className="spin" /> : `Ask to join as ${displayName(accountId)}`}
            </button>
            <p className="mt-3 text-center text-[12.5px] text-muted">
              Joins as <span className="text-ink">{role}</span>. Holds a {bond} NEAR deposit, returned once the council decides.
            </p>
            <div className="mt-3">
              <TxStatus state={tx.state} doneText="Request sent." />
            </div>
          </>
        )}
      </div>
    </Frame>
  )
}

function Waiting({ p, needed, voters }: { p: Proposal; needed: number; voters: string[] }) {
  useNames()
  const yes = voters.filter((v) => p.votes[v] === 'Approve')
  return (
    <div className="rounded-2xl border border-line bg-card p-5" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <span className="live size-1.5 rounded-full bg-accent" />
        Waiting for approval · {yes.length} of {needed}
      </div>
      <div className="mt-2 text-[16px] font-medium">Your request is with the council</div>
      <p className="mt-1 text-[13px] text-muted">This page updates on its own when they decide. You can close it and come back.</p>
      <div className="mt-4 h-[3px] rounded-full bg-soft">
        <div className="h-[3px] rounded-full bg-ink transition-all" style={{ width: `${Math.min(100, (yes.length / Math.max(needed, 1)) * 100)}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {voters.map((v) => (
          <span key={v} className={`flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-[12px] ${p.votes[v] === 'Approve' ? 'bg-soft text-ink' : 'text-muted ring-1 ring-line'}`}>
            <Avatar id={v} size={20} shape="circle" />
            {displayName(v)}
            {p.votes[v] === 'Approve' ? ' ✓' : ''}
          </span>
        ))}
      </div>
      <div className="mt-4 text-[12px] text-muted">Request #{p.id}</div>
    </div>
  )
}

function Done({ title, text, cta, onOpen }: { title: string; text: string; cta: string; onOpen: () => void }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <div className="flex items-center gap-2.5">
        <span className="pop grid size-6 place-items-center rounded-full bg-accent text-on-accent">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
        </span>
        <span className="text-[16px] font-medium">{title}</span>
      </div>
      <p className="mt-1.5 text-[13px] text-muted">{text}</p>
      <button onClick={onOpen} className="mt-4 min-h-12 w-full rounded-lg bg-accent text-[15px] font-medium text-on-accent">{cta}</button>
    </div>
  )
}

/** Same two panels as SignIn: the ask on the left, the group on the right (stacked on a phone). */
function Frame({ children, panel }: { children: React.ReactNode; panel?: React.ReactNode }) {
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="flex flex-col px-4 pt-4 pb-8 sm:px-6 md:px-14 md:py-10">
        <div className="flex items-center justify-between">
          <button onClick={() => openDao(null)} className="-ml-1 flex min-h-11 items-center gap-2" title="Terra home">
            <img src={ICON} alt="" className="size-7 rounded-[7px]" />
            <span className="text-[16px] font-medium tracking-tight">terra</span>
          </button>
          <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11.5px] font-medium text-warn">Testnet</span>
        </div>
        <main className="page-enter w-full max-w-[400px] pt-8 md:my-auto md:py-12">{children}</main>
        <div className="mt-8 hidden text-[12px] text-muted md:block">Testnet demo · Terra never holds your money</div>
      </div>
      <div className="flex items-center justify-center border-t border-line bg-card px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 md:border-t-0 md:border-l md:p-14">
        <div className="w-full max-w-[420px]">
          {panel ?? (
            <div aria-hidden>
              <div className="skeleton h-3 w-40" />
              <div className="skeleton mt-4 h-14 w-56" />
              <div className="skeleton mt-4 h-3 w-32" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
