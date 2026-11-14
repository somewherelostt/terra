import { useEffect, useState } from 'react'
import { STAKING_POOL, go, useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { addFunctionCallProposalTx, can, decodeDescription, kindName } from '../lib/dao'
import { TGAS, view, accountUrl } from '../lib/near'
import { nearToYocto, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { Badge, Button, Card, Field, Money, SectionTitle, TxStatus, inputCls, useTx } from '../components/ui'

interface PoolInfo {
  fee: number
  totalStaked: bigint
}

export default function Earn() {
  const { dao, nearUsd, refresh } = useDao()
  const { accountId, send, signIn } = useWallet()
  const [pool, setPool] = useState<PoolInfo | null>(null)
  const [amount, setAmount] = useState('')
  const tx = useTx()

  useEffect(() => {
    Promise.all([
      view<{ numerator: number; denominator: number }>(STAKING_POOL, 'get_reward_fee_fraction'),
      view<string>(STAKING_POOL, 'get_total_staked_balance'),
    ])
      .then(([f, t]) => setPool({ fee: f.numerator / f.denominator, totalStaked: BigInt(t) }))
      .catch(() => setPool(null))
  }, [])

  useEffect(() => {
    if (dao && !amount) {
      const half = dao.spendable / 2n
      setAmount(String(Math.floor(yoctoToNumber(half))))
    }
  }, [dao, amount])

  if (!dao) return null
  const yocto = nearToYocto(amount)
  const canPropose = can(dao.policy, accountId, 'call', 'AddProposal')
  const pending = dao.proposals.filter(
    (p) => p.status === 'InProgress' && kindName(p.kind) === 'FunctionCall' && JSON.stringify(p.kind).includes(STAKING_POOL),
  )
  const valid = yocto != null && yocto >= 10n ** 24n && yocto < dao.spendable

  async function propose() {
    if (!valid || !yocto) return
    await tx.run(
      () =>
        send(
          addFunctionCallProposalTx(dao!, STAKING_POOL, 'deposit_and_stake', {}, yocto, 120n * TGAS, {
            title: `Stake ${yoctoToNear(yocto, 0)} NEAR so idle money earns`,
            notes: `Stakes with the validator ${STAKING_POOL}. Rewards are added every epoch and stay in the treasury; unstaking takes about 2 days.`,
          }),
        ),
      refresh,
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Earn</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Money the group isn't spending yet can earn staking rewards with a NEAR validator. Staking is a request too: members approve it, and the treasury stakes in its own name.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <SectionTitle>Now earning</SectionTitle>
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <div className="text-sm text-muted">Staked</div>
              <Money yocto={dao.staked} nearUsd={nearUsd} size="lg" />
            </div>
            <div>
              <div className="text-sm text-muted">Available to stake</div>
              <Money yocto={dao.spendable} nearUsd={nearUsd} size="lg" />
            </div>
          </div>
          <div className="mt-5 rounded-xl bg-soft p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">Validator</span>
              <a className="text-brand hover:underline" href={accountUrl(STAKING_POOL)} target="_blank" rel="noreferrer">{STAKING_POOL}</a>
              {pool && <Badge tone="good">Active</Badge>}
            </div>
            {pool && (
              <div className="mt-1 text-xs text-muted">
                Fee {(pool.fee * 100).toFixed(0)}% of rewards · {Number(yoctoToNear(pool.totalStaked, 0).replace(/,/g, '')).toLocaleString('en-US')} NEAR staked in total
              </div>
            )}
            <p className="mt-2 text-xs text-muted">Rewards arrive once per epoch (about 12 hours on testnet), so a fresh stake shows close to zero rewards at first.</p>
          </div>
          {pending.length > 0 && (
            <div className="mt-4 text-sm">
              <div className="font-medium">Waiting for approval</div>
              <ul className="mt-1 list-disc pl-5 text-muted">
                {pending.map((p) => (
                  <li key={p.id}>
                    #{p.id} {decodeDescription(p.description).title} ·{' '}
                    <button className="text-brand hover:underline" onClick={() => go('approve')}>approve</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <SectionTitle>Propose staking</SectionTitle>
          <Field label="Amount to stake (NEAR)" hint={yocto && isFinite(nearUsd) ? `≈ ${usd(yoctoToNumber(yocto) * nearUsd)} · minimum 1 NEAR` : 'Minimum 1 NEAR'}>
            <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <div className="mt-4">
            {!accountId ? (
              <Button className="w-full" onClick={signIn}>Sign in to propose</Button>
            ) : !canPropose ? (
              <p className="rounded-xl bg-soft px-3 py-2 text-sm text-muted">Only roles allowed to file function calls (usually the council) can propose staking.</p>
            ) : (
              <Button className="w-full" disabled={!valid || tx.state.status === 'signing'} onClick={propose}>Propose staking</Button>
            )}
          </div>
          <div className="mt-3">
            <TxStatus state={tx.state} doneText="Staking request filed. The council approves it in Approve." />
          </div>
        </Card>
      </div>
    </div>
  )
}
