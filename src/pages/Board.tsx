import { openDao, useDao } from '../lib/store'
import { allMembers, approvalRules, decodeDescription, isNearTransfer } from '../lib/dao'
import { nanoToDate, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { TIER_LIMITS_USD, openRequests, tierFor } from '../lib/record'
import { Avatar, RowText, TxLink } from '../components/ui'
import { prettyName } from '../App'

const ICON = `${import.meta.env.BASE_URL}favicon.svg`

/** Public, read-only board: no sign-in, no sidebar, no buttons that move money. */
export default function Board() {
  const { dao, nearUsd, error, activity } = useDao()
  if (error)
    return (
      <div className="mx-auto max-w-[560px] px-6 py-24 text-center">
        <div className="flex items-center justify-center gap-2 text-[13.5px]">
          <span className="size-1.5 rounded-full bg-bad" />
          Couldn't find that treasury
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

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-[880px] items-center gap-2 px-6 text-[13px]">
          <img src={ICON} alt="" className="size-6 rounded-[6px]" />
          <span className="font-medium">terra</span>
          <span className="ml-3 hidden text-muted sm:inline">Public board · read only</span>
          {dao && (
            <button onClick={() => openDao(dao.id, 'home')} className="ml-auto min-h-11 rounded-lg border border-line bg-card px-3 py-1.5 font-medium sm:min-h-0">
              Join {name}
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-[880px] px-6 py-12 md:py-16">
        {!dao ? (
          <div aria-busy>
            <div className="skeleton h-3 w-48" />
            <div className="skeleton mt-5 h-12 w-full" />
            <div className="skeleton mt-3 h-12 w-2/3" />
          </div>
        ) : (
          <>
            <div className="text-[13px] text-muted">{dao.id}</div>
            <h1 className="mt-4 text-[34px] leading-[1.02] font-light tracking-[-0.04em] md:text-[48px]">
              {name} holds <span className="tnum">{money(dao.spendable + dao.staked)}</span> and has paid out{' '}
              <span className="tnum">{activity ? money(paidThisYear) : '…'}</span> this year.
            </h1>
            <p className="mt-4 text-[14.5px] text-muted">Every payout below was approved by members. Each one links to its record on NEAR.</p>

            <div className="mt-10 grid grid-cols-2 border-y border-line md:grid-cols-4">
              <Stat k="Members" v={String(allMembers(dao.policy).length)} cls="border-r border-line pr-5" />
              <Stat k="Requests paid" v={String(payouts.length)} cls="border-line px-5 md:border-r" />
              <Stat k="Median time to pay" v={activity ? (isFinite(median) ? wait(median) : '—') : '…'} cls="border-r border-t border-line pr-5 md:border-t-0 md:px-5" />
              <Stat k="Earning" v={dao.staked > 0n ? `${yoctoToNear(dao.staked, 0)} NEAR staked` : 'Not yet'} cls="border-t border-line px-5 md:border-t-0" />
            </div>

            {open.length > 0 && (
              <div className="mt-10 text-[13.5px]">
                <div className="border-b border-line pb-2 text-[12px] text-muted">Waiting for approval</div>
                {open.map((p) => {
                  const meta = decodeDescription(p.description)
                  return (
                    <div key={p.id} className="grid grid-cols-[1fr_auto] items-baseline gap-8 border-b border-line py-4 last:border-0">
                      <RowText main={meta.title} detail={`asked ${nanoToDate(p.submission_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`} />
                      <span className="tnum w-24 text-right text-muted">{isNearTransfer(p.kind) ? money(p.kind.Transfer.amount) : ''}</span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-10 text-[13.5px]">
              <div>
                <div className="hidden grid-cols-[1fr_auto_auto] gap-8 border-b border-line pb-2 text-[12px] text-muted md:grid">
                  <span>Payout</span>
                  <span>Approved by</span>
                  <span className="w-24 text-right">Amount</span>
                </div>
                {payouts.length === 0 && <div className="py-6 text-muted">No payouts yet.</div>}
                {payouts.slice(0, 40).map((p) => {
                  const meta = decodeDescription(p.description)
                  const t = isNearTransfer(p.kind) ? p.kind.Transfer : null
                  const item = payoutItems.find((a) => a.proposalId === p.id)
                  const when = (item?.time ?? nanoToDate(p.submission_time)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                  const yes = Object.values(p.votes).filter((v) => v === 'Approve').length
                  const amountUsd = t ? yoctoToNumber(t.amount) * nearUsd : NaN
                  const tier = isFinite(amountUsd) ? tierFor(amountUsd) : null
                  const council = approvalRules(dao.policy, p.kind).find((r) => r.role === 'council')
                  const approvedBy =
                    tier === 'small' && yes <= 1
                      ? '1 trusted member'
                      : `${yes} approval${yes === 1 ? '' : 's'}${council && tier === 'large' ? `, of ${council.size} on the council` : ''}`
                  const wants = meta.wants?.replace(/\s+to\s+\S+$/, '')
                  return (
                    <div key={p.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-line py-4 last:border-0 md:grid-cols-[1fr_auto_auto] md:gap-8">
                      <span className="flex min-w-0 items-center gap-2.5">
                        {t && <Avatar id={t.receiver_id} size={22} />}
                        <RowText main={meta.title} detail={`${wants ?? 'NEAR'} · ${when}`} extra={<TxLink hash={activity?.payoutTx.get(p.id)} label="Proof" />} />
                      </span>
                      <span className="order-3 col-span-2 pl-8 text-[12px] text-muted md:order-none md:col-span-1 md:pl-0 md:text-[13.5px]">{approvedBy}</span>
                      <span className="tnum w-24 text-right">{t ? money(t.amount) : ''}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <p className="mt-8 text-[12px] text-muted">
              Small payouts (up to ${TIER_LIMITS_USD.small}) can be approved by one trusted member; up to ${TIER_LIMITS_USD.mid} by the council; anything bigger is a full council vote.
            </p>
          </>
        )}

        <div className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-[12.5px] text-muted">
          <span>Powered by terra · built on NEAR</span>
          <button onClick={() => openDao(null)} className="hover:text-ink">Run your community's treasury with Terra →</button>
        </div>
      </div>
    </div>
  )
}

function Stat({ k, v, cls }: { k: string; v: string; cls: string }) {
  return (
    <div className={`py-5 ${cls}`}>
      <div className="text-[12px] text-muted">{k}</div>
      <div className="tnum mt-1.5 text-[20px] font-light md:text-[26px]">{v}</div>
    </div>
  )
}

function wait(min: number): string {
  if (min < 60) return `${Math.max(1, Math.round(min))} min`
  if (min < 48 * 60) return `${Math.round(min / 60)} h`
  return `${Math.round(min / 1440)} days`
}
