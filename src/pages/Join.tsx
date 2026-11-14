import { useEffect, useState } from 'react'
import { openDao, useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { addMemberProposalTx, allMembers, approvalRules, type Proposal } from '../lib/dao'
import { view } from '../lib/near'
import { splitUsd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { displayName, useNames } from '../lib/profile'
import { rememberGroup } from '../lib/groups'
import { defaultJoinRole, invitableRoles, isMember, joinRequestsOpen, pendingJoinFor } from '../lib/join'
import { Avatar, Button, Spinner, TxStatus, useTx } from '../components/ui'
import { prettyName } from '../App'
import { tr, useT } from '../i18n'

const ICON = `${import.meta.env.BASE_URL}favicon.svg`
const NEW_ACCOUNT_URL = 'https://wallet.meteorwallet.app'

/** Where an invite QR lands: see the group, sign in, ask to join, wait for the council. */
export default function Join({ daoId, params }: { daoId: string | null; params: URLSearchParams }) {
  const t = useT()
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
    const timer = setInterval(async () => {
      try {
        const p = await view<Proposal>(dao.id, 'get_proposal', { id })
        if (!live) return
        if (p.status === 'Approved') setApprovedNow(true)
        if (p.status === 'Rejected' || p.status === 'Removed' || p.status === 'Expired') setRejectedNow(true)
        if (p.status !== 'InProgress') {
          clearInterval(timer)
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
      clearInterval(timer)
    }
  }, [dao, pending, refresh])

  if (!daoId || error) {
    return (
      <Frame panel={<p className="text-[14.5px] text-muted">{t('join.pitch')}</p>}>
        <div className="text-[13px] text-muted">{t('join.invite')}</div>
        <h1 className="mt-2 text-[34px] leading-[1.05] font-light tracking-[-0.035em]">{t('join.badInvite')}</h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
          {daoId ? (
            tr('join.notFound', { id: <span className="break-all font-mono text-[13px]">{daoId}</span> })
          ) : (
            t('join.missingGroup')
          )}
        </p>
        <Button variant="secondary" className="mt-8 w-full" onClick={() => openDao(null)}>
          {t('join.goToTerra')}
        </Button>
      </Frame>
    )
  }

  if (!dao) {
    return (
      <Frame>
        <div aria-busy="true" aria-label={t('join.loading')}>
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
  // Council members make links for a role, but a link isn't signed, so anyone can edit ?role=. That only
  // changes what is asked for: the request card shows the role and the council still votes on it.
  // Unknown roles fall back to a plain member.
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
        {t('join.inTreasury')} · {t('join.members', { count: members.length })}
      </div>
      <ul className="mt-8 flex flex-wrap gap-x-4 gap-y-3" aria-label={t('join.membersLabel')}>
        {members.slice(0, 8).map((m) => (
          <li key={m} className="flex items-center gap-2 text-[13px]">
            <Avatar id={m} size={28} shape="circle" />
            <span className="max-w-[9rem] truncate" title={m}>{displayName(m)}</span>
          </li>
        ))}
        {members.length > 8 && <li className="self-center text-[13px] text-muted">{t('join.more', { n: members.length - 8 })}</li>}
      </ul>
    </>
  )

  return (
    <Frame panel={panel}>
      <div className="text-[13px] text-muted">{t('join.invitedTo')}</div>
      <h1 className="mt-2 text-[40px] leading-[1.02] font-light tracking-[-0.035em] break-words">{name}</h1>
      {dao.config.purpose && <p className="mt-2 text-[14px] leading-relaxed text-muted">{dao.config.purpose}</p>}

      <p className="mt-4 text-[14.5px] leading-relaxed text-muted">
        {t('join.lead')}
      </p>

      <div className="mt-6">
        {!ready ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : approvedNow || (already && tx.state.status === 'done') ? (
          <Done title={t('join.youreIn', { name })} text={t('join.approved')} onOpen={() => openDao(dao.id, 'home')} cta={t('join.open', { name })} />
        ) : already ? (
          <Done title={t('join.alreadyIn', { name })} text={t('join.signedInAs', { name: displayName(accountId!) })} onOpen={() => openDao(dao.id, 'home')} cta={t('join.open', { name })} />
        ) : !accountId ? (
          <>
            <button onClick={() => signIn().catch(() => undefined)} className="min-h-12 w-full rounded-lg bg-accent text-[15px] font-medium text-on-accent">
              {t('join.signInToAsk')}
            </button>
            <p className="mt-3 text-center text-[12.5px] text-muted">
              {tr('join.noAccount', {
                link: (c) => (
                  <a href={NEW_ACCOUNT_URL} target="_blank" rel="noreferrer" className="relative text-ink underline underline-offset-2 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']">
                    {c}
                  </a>
                ),
              })}
            </p>
          </>
        ) : pending ? (
          <Waiting p={pending} needed={rule?.needed ?? 1} voters={rule?.members ?? []} />
        ) : rejectedNow ? (
          <div className="rounded-2xl border border-line bg-card p-5 text-[14px]">
            <div className="font-medium">{t('join.rejected')}</div>
            <p className="mt-1 text-[13px] text-muted">{t('join.rejectedText')}</p>
            <Button variant="secondary" className="mt-4 w-full" onClick={() => setRejectedNow(false)}>{t('join.askAgain')}</Button>
          </div>
        ) : !open ? (
          <div className="rounded-2xl border border-line bg-card p-5 text-[14px]">
            <div className="font-medium">{t('join.closed', { name })}</div>
            <p className="mt-1 text-[13px] text-muted">{t('join.closedText')}</p>
          </div>
        ) : (
          <>
            <button
              disabled={tx.state.status === 'signing'}
              onClick={() =>
                tx.run(
                  () => send(addMemberProposalTx(dao, accountId, role)),
                  async () => {
                    // Shows in My groups as "Asked to join" until the council decides.
                    rememberGroup(accountId, dao.id, 'joining')
                    await refresh()
                  },
                )
              }
              className="min-h-12 w-full rounded-lg bg-accent text-[15px] font-medium text-on-accent disabled:opacity-60"
            >
              {tx.state.status === 'signing' ? <span className="spin" /> : t('join.askAs', { name: displayName(accountId) })}
            </button>
            <p className="mt-3 text-center text-[12.5px] text-muted">
              {tr('join.deposit', { b: (c) => <span className="text-ink">{c}</span>, role, bond })}
            </p>
            <div className="mt-3">
              <TxStatus state={tx.state} doneText={t('join.sent')} />
            </div>
          </>
        )}
      </div>
    </Frame>
  )
}

function Waiting({ p, needed, voters }: { p: Proposal; needed: number; voters: string[] }) {
  const t = useT()
  useNames()
  const yes = voters.filter((v) => p.votes[v] === 'Approve')
  return (
    <div className="rounded-2xl border border-line bg-card p-5" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <span className="live size-1.5 rounded-full bg-accent" />
        {t('join.waiting', { yes: yes.length, needed })}
      </div>
      <div className="mt-2 text-[16px] font-medium">{t('join.withCouncil')}</div>
      <p className="mt-1 text-[13px] text-muted">{t('join.withCouncilText')}</p>
      <div className="mt-4 h-[3px] rounded-full bg-soft">
        <div className="h-[3px] rounded-full bg-ink transition-all" style={{ width: `${Math.min(100, (yes.length / Math.max(needed, 1)) * 100)}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {voters.map((v) => (
          <span key={v} className={`flex items-center gap-1.5 rounded-full py-0.5 ps-0.5 pe-2.5 text-[12px] ${p.votes[v] === 'Approve' ? 'bg-soft text-ink' : 'text-muted ring-1 ring-line'}`}>
            <Avatar id={v} size={20} shape="circle" />
            {displayName(v)}
            {p.votes[v] === 'Approve' ? ' ✓' : ''}
          </span>
        ))}
      </div>
      <div className="mt-4 text-[12px] text-muted">{t('join.requestId', { id: String(p.id) })}</div>
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
  const t = useT()
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="flex flex-col px-4 pt-4 pb-8 sm:px-6 md:px-14 md:py-10">
        <div className="flex items-center justify-between">
          <button onClick={() => openDao(null)} className="-ms-1 flex min-h-11 items-center gap-2" title={t('common.terraHome')}>
            <img src={ICON} alt="" className="size-7 rounded-[7px]" />
            <span className="text-[16px] font-medium tracking-tight">terra</span>
          </button>
        </div>
        <main className="page-enter w-full max-w-[400px] pt-8 md:my-auto md:py-12">{children}</main>
        <div className="mt-8 hidden text-[12px] text-muted md:block">{t('common.neverHolds')}</div>
      </div>
      <div className="flex items-center justify-center border-t border-line bg-card px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 md:border-t-0 md:border-s md:p-14">
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
