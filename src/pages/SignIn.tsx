import { useContext, useEffect } from 'react'
import { DaoContext, openDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { allMembers, isNearTransfer } from '../lib/dao'
import { splitUsd, yoctoToNumber } from '../lib/format'
import { Avatar } from '../components/ui'
import { prettyName } from '../App'
import { useT } from '../i18n'

const ICON = `${import.meta.env.BASE_URL}favicon.svg`

/** Two panels: sign in on the left, the group you're joining (or the pitch) on the right. */
export default function SignIn({ daoId }: { daoId: string | null }) {
  const t = useT()
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
        <button onClick={() => openDao(null)} className="-my-2 flex min-h-11 items-center gap-2 self-start">
          <img src={ICON} alt="" className="size-7 rounded-[7px]" />
          <span className="text-[16px] font-medium tracking-tight">terra</span>
        </button>
        <div className="my-auto max-w-[380px] py-12">
          {daoId ? (
            <>
              <div className="text-[13px] text-muted">{t('signin.joining')}</div>
              <h1 className="mt-2 text-[40px] leading-[1.02] font-light tracking-[-0.035em]">{name ?? <span className="skeleton inline-block h-10 w-48 align-middle" />}</h1>
            </>
          ) : (
            <>
              <div className="text-[13px] text-muted">{t('signin.welcome')}</div>
              <h1 className="mt-2 text-[40px] leading-[1.02] font-light tracking-[-0.035em]">{t('signin.title')}</h1>
            </>
          )}
          <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{t('signin.lead')}</p>
          <button onClick={() => signIn().catch(() => undefined)} className="mt-8 w-full rounded-lg bg-accent py-3 text-[14px] font-medium text-on-accent">
            {t('signin.withNear')}
          </button>
          <p className="mt-1.5 text-center text-[12px] text-muted">{t('signin.uses', { network: t('common.nearTestnet') })}</p>
          <button disabled className="mt-2 w-full cursor-not-allowed rounded-lg border border-line bg-card py-3 text-[14px] font-medium text-muted" title={t('signin.comingNext')}>
            {t('signin.passkey')}
          </button>
          <p className="mt-5 text-[12.5px] text-muted">
            {t('signin.wallets')}
          </p>
        </div>
        <div className="text-[12px] text-muted">{t('common.neverHolds')}</div>
      </div>

      <div className="flex items-center justify-center border-t border-line bg-card p-8 md:border-s md:border-t-0 md:p-14">
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
              {t('signin.heldBy', { count: members.length })} · {t('signin.requestsPaid', { count: paid })}
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
              {t('landing.hero.line1')}
              <br />
              {t('landing.hero.line2')}
            </h2>
            <p className="mt-4 text-[14.5px] text-muted">{t('signin.pitch')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
