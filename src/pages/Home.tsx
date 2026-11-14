import { useState } from 'react'
import { go, shareUrl, useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { allMembers, chipInTx, isNearTransfer } from '../lib/dao'
import { nearToYocto, usd, yoctoToNumber } from '../lib/format'
import { openRequests } from '../lib/record'
import { Avatar, Button, Card, Field, Money, SectionTitle, TxStatus, inputCls, useTx } from '../components/ui'
import { ActivityList } from './Activity'
import { prettyName } from '../App'

export default function Home() {
  const { dao, nearUsd, activity, refresh } = useDao()
  const { accountId } = useWallet()
  if (!dao) return null
  const open = openRequests(dao)
  const members = allMembers(dao.policy)
  const total = dao.spendable + dao.staked

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{prettyName(dao.config.name)}</h1>
        {dao.config.purpose && <p className="mt-1 max-w-2xl text-sm text-muted">{dao.config.purpose}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="text-sm font-medium text-muted">Treasury balance</div>
              <div className="mt-2">
                <Money yocto={total} nearUsd={nearUsd} size="xl" />
              </div>
              {dao.staked > 0n && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-good-soft px-3 py-1 text-xs font-semibold text-good">
                  Earning · {usd(yoctoToNumber(dao.staked) * nearUsd)} staked
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => go('pay')}>Ask for money</Button>
              <Button variant="secondary" onClick={() => go('approve')}>
                Approve{open.length ? ` (${open.length})` : ''}
              </Button>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-4 text-sm">
            <Stat label="Members" value={String(members.length)} />
            <Stat label="Open requests" value={String(open.length)} />
            <Stat label="Paid out" value={String(dao.proposals.filter((p) => p.status === 'Approved' && isNearTransfer(p.kind)).length)} />
          </div>
        </Card>

        <ChipIn daoId={dao.id} signedIn={!!accountId} nearUsd={nearUsd} onDone={refresh} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle right={<button className="text-sm font-medium text-brand hover:underline" onClick={() => go('activity')}>See all</button>}>
            Recent activity
          </SectionTitle>
          <ActivityList items={activity?.items.slice(0, 6)} loading={!activity} />
        </Card>
        <Card>
          <SectionTitle right={<button className="text-sm font-medium text-brand hover:underline" onClick={() => go('members')}>Records</button>}>
            Members
          </SectionTitle>
          <ul className="space-y-2.5">
            {members.slice(0, 8).map((m) => (
              <li key={m} className="flex items-center gap-3 text-sm">
                <Avatar id={m} size={28} />
                <span className="truncate" title={m}>{m}</span>
              </li>
            ))}
          </ul>
          <ShareBox daoId={dao.id} />
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function ChipIn({ daoId, signedIn, nearUsd, onDone }: { daoId: string; signedIn: boolean; nearUsd: number; onDone: () => Promise<void> }) {
  const [amount, setAmount] = useState('1')
  const { send, signIn } = useWallet()
  const tx = useTx()
  const yocto = nearToYocto(amount)
  return (
    <Card>
      <SectionTitle>Chip in</SectionTitle>
      <p className="mb-4 text-sm text-muted">Send NEAR straight to the treasury. It shows up in the activity for everyone.</p>
      <Field label="Amount (NEAR)" hint={yocto && isFinite(nearUsd) ? `≈ ${usd(yoctoToNumber(yocto) * nearUsd)}` : ' '}>
        <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); tx.reset() }} aria-label="Chip in amount in NEAR" />
      </Field>
      <div className="mt-4">
        {signedIn ? (
          <Button
            className="w-full"
            disabled={!yocto || yocto <= 0n || tx.state.status === 'signing'}
            onClick={() => yocto && tx.run(() => send(chipInTx(daoId, yocto)), onDone)}
          >
            Chip in {yocto ? `${amount} NEAR` : ''}
          </Button>
        ) : (
          <Button className="w-full" onClick={signIn}>Sign in to chip in</Button>
        )}
      </div>
      <div className="mt-3">
        <TxStatus state={tx.state} doneText="Thanks! Your chip-in reached the treasury." />
      </div>
    </Card>
  )
}

function ShareBox({ daoId }: { daoId: string }) {
  const [copied, setCopied] = useState(false)
  const url = shareUrl(daoId, 'board')
  return (
    <div className="mt-5 rounded-xl bg-soft p-3">
      <div className="text-xs font-semibold text-ink">Read-only link for sponsors</div>
      <div className="mt-1 text-xs text-muted">Balance, requests, payouts and records. No sign-in, no buttons.</div>
      <div className="mt-2 flex gap-2">
        <Button
          variant="secondary"
          className="flex-1 !py-1.5 !text-xs"
          onClick={() => {
            navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => setCopied(false))
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-xl px-3 text-xs font-semibold text-brand hover:underline">
          Open ↗
        </a>
      </div>
    </div>
  )
}
