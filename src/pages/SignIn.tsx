import { useContext, useEffect } from 'react'
import { DaoContext, openDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { allMembers, isNearTransfer } from '../lib/dao'
import { splitUsd, yoctoToNumber } from '../lib/format'
import { Avatar } from '../components/ui'
import { prettyName } from '../App'

const ICON = `${import.meta.env.BASE_URL}favicon.svg`

/** Two panels: sign in on the left, the group you're joining (or the pitch) on the right. */
export default function SignIn({ daoId }: { daoId: string | null }) {
  const { accountId, signIn } = useWallet()
  const ctx = useContext(DaoContext)
  const dao = ctx?.dao ?? null

  // Once signed in, go where the person was headed.
  useEffect(() => {
    if (accountId) openDao(daoId, 'home')
  }, [accountId, daoId])

  const name = dao ? prettyName(dao.config.name) : null
  const members = dao ? allMembers(dao.policy) : []
  const paid = dao ? dao.proposals.filter((p) => p.status === 'Approved' && isNearTransfer(p.kind)).length : 0
  const [dollars, cents] = dao && ctx ? splitUsd(yoctoToNumber(dao.spendable + dao.staked) * ctx.nearUsd) : ['', '']

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="flex flex-col px-6 py-8 md:px-14 md:py-10">
        <button onClick={() => openDao(null)} className="flex items-center gap-2 self-start">
          <img src={ICON} alt="" className="size-7 rounded-[7px]" />
          <span className="text-[16px] font-medium tracking-tight">terra</span>
        </button>
        <div className="my-auto max-w-[380px] py-12">
          {daoId ? (
            <>
              <div className="text-[13px] text-muted">You're joining</div>
              <h1 className="mt-2 text-[40px] leading-[1.02] font-light tracking-[-0.035em]">{name ?? <span className="skeleton inline-block h-10 w-48 align-middle" />}</h1>
            </>
          ) : (
            <>
              <div className="text-[13px] text-muted">Welcome</div>
              <h1 className="mt-2 text-[40px] leading-[1.02] font-light tracking-[-0.035em]">Sign in to Terra</h1>
            </>
          )}
          <p className="mt-3 text-[14.5px] leading-relaxed text-muted">Sign in with your NEAR account to see the treasury, chip in and ask for money.</p>
          <button onClick={() => signIn().catch(() => undefined)} className="mt-8 w-full rounded-lg bg-accent py-3 text-[14px] font-medium text-on-accent">
            Sign in with NEAR
          </button>
          <p className="mt-1.5 text-center text-[12px] text-muted">Uses NEAR testnet</p>
          <button disabled className="mt-2 w-full cursor-not-allowed rounded-lg border border-line bg-card py-3 text-[14px] font-medium text-muted" title="Coming next">
            Continue with a passkey · coming next
          </button>
          <p className="mt-5 text-[12.5px] text-muted">
            Use any NEAR wallet, like Meteor or Intear. Passkey accounts (no seed phrase) are coming next.
          </p>
        </div>
        <div className="text-[12px] text-muted">Terra never holds your money</div>
      </div>

      <div className="flex items-center justify-center border-t border-line bg-card p-8 md:border-l md:border-t-0 md:p-14">
        {daoId ? (
          <div className="w-full max-w-[420px]">
            <div className="text-[12px] text-muted">{daoId}</div>
            <div className="tnum mt-2 text-[56px] leading-[0.9] font-light tracking-[-0.055em] md:text-[72px]">{dao ? (
                <>
                  {dollars}
                  <span className="text-muted">{cents}</span>
                </>
              ) : (
                <span className="skeleton inline-block h-14 w-56" />
              )}</div>
            <div className="mt-3 text-[13px] text-muted">
              held by {members.length} member{members.length === 1 ? '' : 's'} · {paid} request{paid === 1 ? '' : 's'} paid
            </div>
            <div className="mt-8 flex -space-x-2">
              {members.slice(0, 6).map((m) => (
                <span key={m} className="rounded-full ring-2 ring-[var(--panel)]">
                  <Avatar id={m} size={36} shape="circle" />
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-full max-w-[420px]">
            <h2 className="text-[40px] leading-[1] font-light tracking-[-0.04em]">
              Your community's money,
              <br />
              run by its members.
            </h2>
            <p className="mt-4 text-[14.5px] text-muted">Chip in, ask for money, approve it. Your record decides how fast.</p>
          </div>
        )}
      </div>
    </div>
  )
}
