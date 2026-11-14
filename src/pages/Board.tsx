import { useDao, openDao } from '../lib/store'
import { decodeDescription, isNearTransfer } from '../lib/dao'
import { nanoToDate, timeAgo, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { openRequests } from '../lib/record'
import { Account, Badge, Card, Empty, Money, SectionTitle, Spinner, TxLink } from '../components/ui'
import { RecordsTable } from './Members'
import { prettyName } from '../App'

/** Read-only public board: no sign-in, no buttons. Safe to share with sponsors. */
export default function Board() {
  const { dao, nearUsd, error, activity } = useDao()
  if (error) return <div className="p-10 text-center text-sm text-bad">{error}</div>
  if (!dao)
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-muted">
        <Spinner /> Reading the treasury from NEAR…
      </div>
    )
  const open = openRequests(dao)
  const payouts = dao.proposals.filter((p) => p.status === 'Approved' && isNearTransfer(p.kind))
  const paidTotal = payouts.reduce((s, p) => s + (isNearTransfer(p.kind) ? BigInt(p.kind.Transfer.amount) : 0n), 0n)

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-9 w-9" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Public board · read-only</div>
            <h1 className="text-2xl font-bold tracking-tight">{prettyName(dao.config.name)}</h1>
          </div>
        </div>
        <button className="text-sm font-medium text-brand hover:underline" onClick={() => openDao(dao.id, 'home')}>
          Member? Open in Terra →
        </button>
      </header>
      {dao.config.purpose && <p className="max-w-2xl text-sm text-muted">{dao.config.purpose}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="text-sm text-muted">Balance</div>
          <div className="mt-1"><Money yocto={dao.spendable + dao.staked} nearUsd={nearUsd} size="lg" /></div>
        </Card>
        <Card>
          <div className="text-sm text-muted">Paid out ({payouts.length} payments)</div>
          <div className="mt-1"><Money yocto={paidTotal} nearUsd={nearUsd} size="lg" /></div>
        </Card>
        <Card>
          <div className="text-sm text-muted">Open requests</div>
          <div className="mt-1 text-2xl font-semibold">{open.length}</div>
        </Card>
      </div>

      <Card>
        <SectionTitle>Open requests</SectionTitle>
        {open.length ? (
          <ul className="divide-y divide-line">
            {open.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="w-10 text-xs text-muted">#{p.id}</span>
                <span className="min-w-0 flex-1">{decodeDescription(p.description).title}</span>
                {isNearTransfer(p.kind) && <span className="tabular-nums">{fmt(p.kind.Transfer.amount, nearUsd)}</span>}
                <span className="text-xs text-muted">by <Account id={p.proposer} className="!text-xs" /></span>
                <Badge tone="warn">Waiting</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No open requests.</Empty>
        )}
      </Card>

      <Card>
        <SectionTitle>Payouts</SectionTitle>
        {payouts.length ? (
          <ul className="divide-y divide-line">
            {payouts.slice(0, 30).map((p) => {
              const meta = decodeDescription(p.description)
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="w-10 text-xs text-muted">#{p.id}</span>
                  <span className="min-w-0 flex-1">
                    {meta.title}
                    {meta.wants && <span className="block text-xs text-muted">Recipient wanted {meta.wants}</span>}
                  </span>
                  {isNearTransfer(p.kind) && (
                    <span className="tabular-nums">
                      {fmt(p.kind.Transfer.amount, nearUsd)} → <Account id={p.kind.Transfer.receiver_id} />
                    </span>
                  )}
                  <span className="text-xs text-muted">{timeAgo(nanoToDate(p.submission_time))}</span>
                  <TxLink hash={activity?.payoutTx.get(p.id)} label="tx" />
                </li>
              )
            })}
          </ul>
        ) : (
          <Empty>No payouts yet.</Empty>
        )}
      </Card>

      <section>
        <SectionTitle>Member records</SectionTitle>
        <RecordsTable readOnly />
      </section>

      <footer className="pb-6 text-center text-xs text-muted">
        Read live from the Sputnik DAO <a className="underline" href={`https://testnet.nearblocks.io/address/${dao.id}`} target="_blank" rel="noreferrer">{dao.id}</a> on NEAR testnet. Shown with Terra.
      </footer>
    </div>
  )
}

function fmt(amount: string, nearUsd: number) {
  return isFinite(nearUsd) ? usd(yoctoToNumber(amount) * nearUsd) : `${yoctoToNear(amount)} NEAR`
}
