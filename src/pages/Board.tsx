import { useState } from 'react'
import { openDao, shareUrl, useDao } from '../lib/store'
import { allMembers, approvalRules, decodeDescription, isNearTransfer, isRole } from '../lib/dao'
import { nanoToDate, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { TIER_LIMITS_USD, openRequests, tierFor } from '../lib/record'
import { Avatar, RowText, TxLink } from '../components/ui'
import { MemberName } from '../components/ProfileSheet'
import { CommentCount, RequestSheetHost, openRequestSheet } from '../components/Comments'
import { prettyName } from '../App'
import { LandingNav } from './Landing'
import SiteFooter from '../components/SiteFooter'
import { Button } from '../components/ui'
import { formatDate, formatNumber, t, tr, useT } from '../i18n'

const dayMonth = (d: Date) => formatDate(d, { day: 'numeric', month: 'short' })


/** Public, read-only board: no sign-in, no sidebar, no buttons that move money. */
/**
 * The group's public record. `app`: a normal page inside the app shell (members, signed in).
 * `public`: the landing's navbar and width, for visitors and shared links.
 */
export default function Board({ variant = 'public' }: { variant?: 'app' | 'public' }) {
  const t = useT()
  const { dao, nearUsd, error, activity } = useDao()
  const [copied, setCopied] = useState(false)
  const isApp = variant === 'app'
  if (error)
    return (
      <div className="mx-auto max-w-[560px] px-6 py-24 text-center">
        <div className="flex items-center justify-center gap-2 text-[13.5px]">
          <span className="size-1.5 rounded-full bg-bad" />
          {t('board.notFound')}
        </div>
        <p className="mt-2 text-[13px] text-muted">{error}</p>
      </div>
    )

  const name = dao ? prettyName(dao.config.name) : ''
  const money = (y: bigint | string) => (isFinite(nearUsd) ? usd(yoctoToNumber(y) * nearUsd) : `${yoctoToNear(y)} NEAR`)
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime()
  const payouts = dao ? dao.proposals.filter((p) => p.status === 'Approved' && isNearTransfer(p.kind)) : []
  const payoutItems = (activity?.items ?? []).filter((a) => a.kind === 'payout')
  const paidThisYear = payoutItems.filter((a) => a.time.getTime() >= yearStart).reduce((s, a) => s + BigInt(a.amount ?? '0'), 0n)
  const waits = payoutItems
    .filter((a) => a.txHash && a.proposalId != null)
    .map((a) => {
      const p = dao?.proposals.find((x) => x.id === a.proposalId)
      return p ? (a.time.getTime() - Number(BigInt(p.submission_time) / 1_000_000n)) / 60000 : NaN
    })
    .filter((m) => isFinite(m) && m >= 0)
    .sort((a, b) => a - b)
  const median = waits.length ? waits[Math.floor(waits.length / 2)] : NaN
  const open = dao ? openRequests(dao) : []

  const publicLink = dao ? shareUrl(dao.id, 'board') : ''
  const title = dao ? (
    <>
      {tr('board.title', {
        name,
        held: <span className="tnum">{money(dao.spendable + dao.staked)}</span>,
        paid: <span className="tnum">{activity ? money(paidThisYear) : '…'}</span>,
      })}
    </>
  ) : null

  const body = (
    <>
      <RequestSheetHost />
        {!dao ? (
          <div aria-busy>
            <div className="skeleton h-3 w-48" />
            <div className="skeleton mt-5 h-12 w-full" />
            <div className="skeleton mt-3 h-12 w-2/3" />
          </div>
        ) : (
          <>
            {isApp ? (
              <>
                <div className="flex items-center justify-between gap-3 text-[13px] text-muted">
                  <span>{t('board.label')}</span>
                  <Button
                    variant="secondary"
                    onClick={() => navigator.clipboard?.writeText(publicLink).then(() => setCopied(true)).catch(() => setCopied(false))}
                  >
                    {copied ? t('board.linkCopied') : t('board.shareLink')}
                  </Button>
                </div>
                <h1 className="mt-3 max-w-3xl text-[32px] leading-[1.1] font-light tracking-[-0.03em]">{title}</h1>
              </>
            ) : (
              <>
                <div className="text-[13px] text-muted">{dao.id}</div>
                <h1 className="mt-4 max-w-4xl text-[34px] leading-[1.02] font-light tracking-[-0.04em] md:text-[48px]">{title}</h1>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] text-muted">
                  <span aria-hidden className="size-1.5 rounded-full bg-good" />
                  {t('board.readOnly')}
                </span>
              </>
            )}
            <p className="mt-4 text-[14.5px] text-muted">{t('board.lead')}</p>

            <div className="mt-10 grid grid-cols-2 border-y border-line md:grid-cols-4">
              <Stat k={t('board.stat.members')} v={formatNumber(allMembers(dao.policy).length)} cls="border-e border-line pe-5" />
              <Stat k={t('board.stat.paid')} v={formatNumber(payouts.length)} cls="border-line px-5 md:border-e" />
              <Stat k={t('board.stat.median')} v={activity ? (isFinite(median) ? wait(median) : '—') : '…'} cls="border-e border-t border-line pe-5 md:border-t-0 md:px-5" />
              <Stat k={t('board.stat.earning')} v={dao.staked > 0n ? t('board.stat.staked', { amount: yoctoToNear(dao.staked, 0) }) : t('board.stat.notYet')} cls="border-t border-line px-5 md:border-t-0" />
            </div>

            {open.length > 0 && (
              <div className="mt-10 text-[13.5px]">
                <div className="border-b border-line pb-2 text-[12px] text-muted">{t('board.waiting')}</div>
                {open.map((p) => {
                  const meta = decodeDescription(p.description)
                  return (
                    <div key={p.id} className="grid grid-cols-[1fr_auto] items-baseline gap-4 border-b border-line py-4 last:border-0 sm:gap-8">
                      <RowText
                        main={meta.title}
                        detail={
                          <>
                            {tr('board.askedOn', { who: <MemberName id={p.proposer} card />, date: dayMonth(nanoToDate(p.submission_time)) })}
                          </>
                        }
                      />
                      <span className="flex items-baseline justify-end gap-4">
                        <button
                          className="-my-3 py-3 text-[12px] text-muted hover:text-ink"
                          title={t('board.comments')}
                          onClick={() =>
                            openRequestSheet({
                              daoId: dao.id,
                              proposalId: p.id,
                              title: meta.title,
                              detail: <>{tr('board.waitingAsked', { who: <MemberName id={p.proposer} /> })}</>,
                              amount: isNearTransfer(p.kind) ? money(p.kind.Transfer.amount) : undefined,
                            })
                          }
                        >
                          <CommentCount daoId={dao.id} proposalId={p.id} />
                        </button>
                        <span className="tnum text-end text-muted sm:w-24">{isNearTransfer(p.kind) ? money(p.kind.Transfer.amount) : ''}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-10 text-[13.5px]">
              <div>
                <div className="hidden grid-cols-[1fr_auto_auto] gap-8 border-b border-line pb-2 text-[12px] text-muted md:grid">
                  <span>{t('board.col.payout')}</span>
                  <span>{t('board.col.approvedBy')}</span>
                  <span className="w-24 text-end">{t('board.col.amount')}</span>
                </div>
                {payouts.length === 0 && (
                  <div className="border-b border-line py-8 text-muted">
                    {t('board.empty')}
                  </div>
                )}
                {payouts.slice(0, 40).map((p) => {
                  const meta = decodeDescription(p.description)
                  const tf = isNearTransfer(p.kind) ? p.kind.Transfer : null
                  const item = payoutItems.find((a) => a.proposalId === p.id)
                  const when = dayMonth(item?.time ?? nanoToDate(p.submission_time))
                  const yes = Object.values(p.votes).filter((v) => v === 'Approve').length
                  const amountUsd = tf ? yoctoToNumber(tf.amount) * nearUsd : NaN
                  const tier = isFinite(amountUsd) ? tierFor(amountUsd) : null
                  const council = approvalRules(dao.policy, p.kind).find((r) => isRole(r.role, 'council'))
                  const approvedBy =
                    tier === 'small' && yes <= 1
                      ? t('board.approvedBy.trusted')
                      : council && tier === 'large'
                        ? t('board.approvedBy.ofCouncil', { count: yes, size: council.size })
                        : t('board.approvedBy.count', { count: yes })
                  const wants = meta.wants?.replace(/\s+to\s+\S+$/, '')
                  return (
                    <div key={p.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-line py-4 last:border-0 md:grid-cols-[1fr_auto_auto] md:gap-8">
                      <span className="flex min-w-0 items-center gap-2.5">
                        {tf && <Avatar id={tf.receiver_id} size={22} />}
                        <RowText
                          main={meta.title}
                          detail={
                            <>
                              {tf && (
                                <>
                                  {tr('board.paidTo', { who: <MemberName id={tf.receiver_id} card /> })} ·{' '}
                                </>
                              )}
                              {`${wants ?? 'NEAR'} · ${when}`}
                            </>
                          }
                          extra={
                            <>
                              <TxLink hash={activity?.payoutTx.get(p.id)} label={t('board.proof')} />
                              <button
                                className="-my-3 ms-1 px-2 py-3 text-[12px] text-muted hover:text-ink"
                                title={t('board.comments')}
                                onClick={() =>
                                  openRequestSheet({ daoId: dao.id, proposalId: p.id, title: meta.title, detail: t('board.paidOn', { date: when }), amount: tf ? money(tf.amount) : undefined })
                                }
                              >
                                <CommentCount daoId={dao.id} proposalId={p.id} />
                              </button>
                            </>
                          }
                        />
                      </span>
                      <span className="order-3 col-span-2 ps-8 text-[12px] text-muted md:order-none md:col-span-1 md:ps-0 md:text-[13.5px]">{approvedBy}</span>
                      <span className="tnum text-end md:w-24">{tf ? money(tf.amount) : ''}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <p className="mt-8 text-[12px] text-muted">
              {t('board.footnote', { limit: formatNumber(TIER_LIMITS_USD.small, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) })}
            </p>
          </>
        )}

    </>
  )

  if (isApp) return body
  return (
    <div className="min-h-screen">
      <LandingNav
        boardUrl={publicLink || '#'}
        home="./"
        current="board"
        joinCta={dao ? { label: t('board.join', { name }), onClick: () => openDao(dao.id, 'join') } : undefined}
      />
      <main className="mx-auto max-w-[1200px] px-4 pt-10 pb-20 sm:px-6 md:pt-16 md:pb-28">{body}</main>
      <SiteFooter home="./" boardUrl={publicLink || '#'} />
    </div>
  )
}

function Stat({ k, v, cls }: { k: string; v: string; cls: string }) {
  return (
    <div className={`py-5 ${cls}`}>
      <div className="text-[12px] text-muted">{k}</div>
      <div className="tnum mt-1.5 text-[22px] font-light tracking-tight sm:text-[28px]">{v}</div>
    </div>
  )
}

function wait(min: number): string {
  if (min < 60) return t('board.wait.min', { count: Math.max(1, Math.round(min)) })
  if (min < 48 * 60) return t('board.wait.hours', { count: Math.round(min / 60) })
  return t('board.wait.days', { count: Math.round(min / 1440) })
}
