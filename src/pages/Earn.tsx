import { useEffect, useState } from 'react'
import { STAKING_POOL, go, useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { addFunctionCallProposalTx, can, decodeDescription, kindName } from '../lib/dao'
import { TGAS, view, accountUrl } from '../lib/near'
import { nearToYocto, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { Badge, Button, Card, Field, Money, TxStatus, inputCls, useTx } from '../components/ui'
import { formatNumber, useT } from '../i18n'

interface PoolInfo {
  fee: number
  totalStaked: bigint
}

export default function Earn() {
  const t = useT()
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
      .then(([f, total]) => setPool({ fee: f.numerator / f.denominator, totalStaked: BigInt(total) }))
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
          // On-chain proposal text: stays English, en-US number formatting.
          addFunctionCallProposalTx(dao!, STAKING_POOL, 'deposit_and_stake', {}, yocto, 120n * TGAS, {
            title: `Stake ${yoctoToNear(yocto, 0, true)} NEAR so idle money earns`,
            notes: `Stakes with the validator ${STAKING_POOL}. Rewards are added every epoch and stay in the treasury; unstaking takes about 2 days.`,
          }),
        ),
      refresh,
    )
  }

  return (
    <div>
      <div>
        <div className="text-[13px] text-muted">{t('earn.eyebrow')}</div>
        <h1 className="mt-3 text-[32px] font-light tracking-[-0.03em]">{t('earn.title')}</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] text-muted">
          {t('earn.intro')}
        </p>
      </div>
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <div className="grid grid-cols-2 border-y border-line">
            <div className="border-e border-line py-5 pe-5">
              <div className="text-[12px] text-muted">{t('earn.staked')}</div>
              <div className="mt-1.5"><Money yocto={dao.staked} nearUsd={nearUsd} size="lg" /></div>
            </div>
            <div className="py-5 ps-5">
              <div className="text-[12px] text-muted">{t('earn.available')}</div>
              <div className="mt-1.5"><Money yocto={dao.spendable} nearUsd={nearUsd} size="lg" /></div>
            </div>
          </div>
          <div className="border-b border-line py-5 text-[13.5px]">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-muted">{t('earn.validator')}</span>
              <a className="min-w-0 truncate font-mono text-[13px] text-accent-text hover:underline" href={accountUrl(STAKING_POOL)} target="_blank" rel="noreferrer">{STAKING_POOL}</a>
              {pool && <Badge tone="good">{t('earn.active')}</Badge>}
            </div>
            {pool && (
              <div className="mt-1 text-xs text-muted">
                {t('earn.poolInfo', { fee: formatNumber(pool.fee, { style: 'percent', maximumFractionDigits: 0 }), total: formatNumber(Math.floor(yoctoToNumber(pool.totalStaked))) })}
              </div>
            )}
            <p className="mt-2 text-[12px] text-muted">{t('earn.epochNote')}</p>
          </div>
          {pending.length > 0 && (
            <div className="mt-4 text-sm">
              <div className="font-medium">{t('earn.pending.title')}</div>
              <ul className="mt-1 list-disc ps-5 text-muted">
                {pending.map((p) => (
                  <li key={p.id}>
                    #{p.id} {decodeDescription(p.description).title} ·{' '}
                    <button className="text-accent-text hover:underline" onClick={() => go('approve')}>{t('earn.pending.approve')}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <Card className="self-start">
          <div className="mb-4 text-[13.5px] font-medium">{t('earn.propose.title')}</div>
          <Field label={t('earn.propose.amount')} hint={yocto && isFinite(nearUsd) ? t('earn.propose.hintUsd', { usd: usd(yoctoToNumber(yocto) * nearUsd) }) : t('earn.propose.hint')}>
            <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <div className="mt-4">
            {!accountId ? (
              <Button className="w-full" onClick={signIn}>{t('earn.propose.signIn')}</Button>
            ) : !canPropose ? (
              <p className="rounded-xl bg-soft px-3 py-2 text-sm text-muted">{t('earn.propose.notAllowed')}</p>
            ) : (
              <Button className="w-full" disabled={!valid || tx.state.status === 'signing'} onClick={propose}>{t('earn.propose.button')}</Button>
            )}
          </div>
          <div className="mt-3">
            <TxStatus state={tx.state} doneText={t('earn.propose.done')} />
          </div>
        </Card>
      </div>
    </div>
  )
}
