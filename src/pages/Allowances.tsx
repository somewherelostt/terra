import { useCallback, useEffect, useState } from 'react'
import { go, useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { can, decodeDescription, kindName } from '../lib/dao'
import { accountUrl, isValidAccountId } from '../lib/near'
import { usd, yoctoToNear, yoctoToNumber, nanoToDate } from '../lib/format'
import {
  addHelperKeyTx,
  freezeTx,
  isActive,
  loadAllowances,
  newHelperKey,
  payFromAllowanceTx,
  proposeAllowanceTx,
  removeAllowanceProposalTx,
  spendableNow,
  unfreezeProposalTx,
  usdToYocto,
  HELPER_GAS_ALLOWANCE,
  type AllowanceInfo,
} from '../lib/allowance'
import { Account, Badge, Button, Card, EmptyState, Field, Spinner, TxStatus, inputCls, useTx } from '../components/ui'
import { formatDate, tr, useT } from '../i18n'

function useAllowances() {
  const { dao } = useDao()
  const [info, setInfo] = useState<AllowanceInfo | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    if (!dao) return
    try {
      setInfo(await loadAllowances(dao.id))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setInfo(null)
    }
  }, [dao])
  useEffect(() => {
    reload()
  }, [reload])
  return { info, error, reload }
}

const money = (yocto: string | bigint, nearUsd: number) =>
  isFinite(nearUsd) ? `${usd(yoctoToNumber(yocto) * nearUsd)} (${yoctoToNear(yocto, 3)} NEAR)` : `${yoctoToNear(yocto, 3)} NEAR`

const fmtDate = (ns: string) => formatDate(nanoToDate(ns), { day: 'numeric', month: 'short' })

/** One line on Pay for people who hold an allowance. */
export function AllowanceBanner() {
  const t = useT()
  const { nearUsd } = useDao()
  const { accountId } = useWallet()
  const { info } = useAllowances()
  if (!info || !accountId) return null
  const mine = info.allowances.find((a) => a.account_id === accountId)
  if (!mine) return null
  const now = spendableNow(info, mine)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-soft px-4 py-3 text-[13.5px]">
      <span>
        {info.state.frozen ? t('allowances.banner.frozen') : now > 0n ? tr('allowances.banner.canPay', { b: (c) => <b>{c}</b>, amount: money(now, nearUsd) }) : t('allowances.banner.empty')}
      </span>
      {now > 0n && (
        <Button variant="secondary" onClick={() => go('allowances')}>{t('allowances.banner.spend')}</Button>
      )}
    </div>
  )
}

export default function Allowances() {
  const t = useT()
  const { dao, nearUsd, refresh } = useDao()
  const { accountId, send, signIn } = useWallet()
  const { info, error, reload } = useAllowances()

  if (!dao) return null
  const isCouncil = can(dao.policy, accountId, 'call', 'AddProposal')
  const pending = info
    ? dao.proposals.filter((p) => p.status === 'InProgress' && kindName(p.kind) === 'FunctionCall' && JSON.stringify(p.kind).includes(info.contractId))
    : []
  const after = async () => {
    await Promise.all([reload(), refresh()])
  }

  return (
    <div>
      <div className="text-[13px] text-muted">{t('allowances.eyebrow')}</div>
      <h1 className="mt-3 text-[32px] leading-[1.1] font-light tracking-[-0.03em]">{t('allowances.title')}</h1>
      <p className="mt-1 max-w-2xl text-[13.5px] text-muted">
        {t('allowances.intro')}
      </p>

      {info === undefined && !error && (
        <div className="mt-10 flex items-center gap-2 text-sm text-muted"><Spinner /> {t('allowances.loading')}</div>
      )}
      {error && <div className="mt-10 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{t('allowances.loadError', { error })}</div>}
      {info === null && !error && (
        <EmptyState
          icon="plus"
          className="mt-10 max-w-2xl"
          title={t('allowances.notSetUp.title')}
          text={tr('allowances.notSetUp.text', { code: (c) => <span className="font-mono text-[12.5px]">{c}</span> })}
        >
          <Button variant="secondary" onClick={() => go('pay')}>{t('allowances.notSetUp.request')}</Button>
        </EmptyState>
      )}

      {info && (
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <div className="grid grid-cols-2 border-y border-line">
              <div className="border-e border-line py-5 pe-5">
                <div className="text-[12px] text-muted">{t('allowances.pool')}</div>
                <div className="tnum mt-1.5 text-[22px] font-light">{isFinite(nearUsd) ? usd(yoctoToNumber(info.state.balance) * nearUsd) : `${yoctoToNear(info.state.balance)} NEAR`}</div>
                <div className="tnum text-xs text-muted">{yoctoToNear(info.state.balance, 3)} NEAR</div>
              </div>
              <div className="py-5 ps-5">
                <div className="text-[12px] text-muted">{t('allowances.status')}</div>
                <div className="mt-2">{info.state.frozen ? <Badge tone="bad">{t('allowances.frozen')}</Badge> : <Badge tone="good">{t('allowances.open')}</Badge>}</div>
                <div className="mt-2 min-w-0 text-xs text-muted">
                  {t('allowances.contract')} <a className="block truncate font-mono text-accent-text hover:underline" href={accountUrl(info.contractId)} target="_blank" rel="noreferrer">{info.contractId}</a>
                </div>
              </div>
            </div>

            <div className="mt-8 text-[13.5px] font-medium">{t('allowances.budgets')}</div>
            {info.allowances.length === 0 ? (
              <EmptyState
                icon="plus"
                className="mt-2"
                title={t('allowances.none.title')}
                text={isCouncil ? t('allowances.none.council') : t('allowances.none.member')}
              >
                {isCouncil && accountId && (
                  <Button variant="secondary" onClick={() => document.getElementById('propose-allowance')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                    {t('allowances.none.propose')}
                  </Button>
                )}
              </EmptyState>
            ) : (
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {info.allowances.map((a) => {
                  const active = isActive(a)
                  const used = Number(BigInt(a.spent_today) * 1000n / (BigInt(a.daily_cap) || 1n)) / 10
                  return (
                    <li key={a.account_id} className="py-4 text-[13.5px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Account id={a.account_id} />
                        <span className="flex items-center gap-2">
                          {!active && <Badge tone="warn">{t('allowances.ended', { date: fmtDate(a.expires_at) })}</Badge>}
                          {active && <span className="text-xs text-muted">{t('allowances.until', { date: fmtDate(a.expires_at) })}</span>}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-soft">
                        <div className="h-full bg-brand" style={{ width: `${Math.min(100, used)}%` }} />
                      </div>
                      <dl className="mt-3 grid grid-cols-3 gap-3 text-[12px]">
                        <div>
                          <dt className="text-muted">{t('allowances.leftToday')}</dt>
                          <dd className="tnum mt-0.5 text-[13.5px] text-ink"><GridMoney yocto={a.left_today} nearUsd={nearUsd} /></dd>
                        </div>
                        <div>
                          <dt className="text-muted">{t('allowances.dailyCap')}</dt>
                          <dd className="tnum mt-0.5 text-[13.5px]"><GridMoney yocto={a.daily_cap} nearUsd={nearUsd} /></dd>
                        </div>
                        <div>
                          <dt className="text-muted">{t('allowances.perPayment')}</dt>
                          <dd className="tnum mt-0.5 text-[13.5px]"><GridMoney yocto={a.per_payment_max} nearUsd={nearUsd} /></dd>
                        </div>
                      </dl>
                      {isCouncil && (
                        <RemoveButton onDone={after} run={() => send(removeAllowanceProposalTx(dao, info.contractId, a.account_id))} />
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            {pending.length > 0 && (
              <div className="mt-6 text-sm">
                <div className="font-medium">{t('allowances.pending.title')}</div>
                <ul className="mt-1 list-disc ps-5 text-muted">
                  {pending.map((p) => (
                    <li key={p.id}>
                      #{p.id} {decodeDescription(p.description).title} ·{' '}
                      <button className="-my-3 py-3 text-accent-text hover:underline" onClick={() => go('approve')}>{t('allowances.pending.approve')}</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-8 text-[12px] text-muted">
              {t('allowances.enforced')}
            </p>
          </div>

          <div className="flex flex-col gap-6 self-start">
            {!accountId ? (
              <Card><Button className="w-full" onClick={signIn}>{t('allowances.signIn')}</Button></Card>
            ) : (
              <>
                <SpendCard info={info} accountId={accountId} nearUsd={nearUsd} send={send} onDone={after} />
                <FreezeCard info={info} accountId={accountId} isCouncil={isCouncil} send={send} dao={dao} onDone={after} />
                {isCouncil && (
                  <CreateCard info={info} nearUsd={nearUsd} send={send} dao={dao} onDone={after} primary={!info.allowances.some((a) => a.account_id === accountId)} />
                )}
                <HelperKeyCard info={info} accountId={accountId} send={send} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

type Send = ReturnType<typeof useWallet>['send']
type DaoT = NonNullable<ReturnType<typeof useDao>['dao']>

/** A budget amount: dollars on top, the NEAR figure on its own muted line, so neither wraps mid-value. */
function GridMoney({ yocto, nearUsd }: { yocto: string | bigint; nearUsd: number }) {
  if (!isFinite(nearUsd)) return <>{yoctoToNear(yocto, 3)} NEAR</>
  return (
    <>
      <span className="block">{usd(yoctoToNumber(yocto) * nearUsd)}</span>
      <span className="block text-[11.5px] text-muted">{yoctoToNear(yocto, 3)} NEAR</span>
    </>
  )
}

function RemoveButton({ run, onDone }: { run: () => Promise<string>; onDone: () => Promise<void> }) {
  const t = useT()
  const tx = useTx()
  return (
    <div className="mt-2">
      {tx.state.status === 'idle' ? (
        <button className="-my-2 min-h-11 text-xs text-muted hover:text-bad hover:underline sm:min-h-0 sm:py-2" onClick={() => tx.run(run, onDone)}>{t('allowances.remove.button')}</button>
      ) : (
        <TxStatus state={tx.state} doneText={t('allowances.remove.done')} />
      )}
    </div>
  )
}

function SpendCard({ info, accountId, nearUsd, send, onDone }: { info: AllowanceInfo; accountId: string; nearUsd: number; send: Send; onDone: () => Promise<void> }) {
  const t = useT()
  const mine = info.allowances.find((a) => a.account_id === accountId)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const tx = useTx()
  if (!mine) return null
  const max = spendableNow(info, mine)
  const yocto = usdToYocto(Number(amount), nearUsd)
  const frozen = info.state.frozen
  const valid = !frozen && isValidAccountId(to.trim()) && yocto != null && yocto > 0n
  return (
    <Card>
      <div className="mb-1 text-[13.5px] font-medium">{t('allowances.spend.title')}</div>
      <p className="mb-4 text-xs text-muted">
        {frozen ? t('allowances.spend.frozen') : t('allowances.spend.upTo', { amount: money(max, nearUsd) })}
      </p>
      <Field label={t('allowances.spend.to')}>
        <input className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} placeholder="name.testnet" autoCapitalize="off" spellCheck={false} />
      </Field>
      <div className="mt-3">
        <Field label={t('allowances.spend.amount')} hint={yocto ? t(!frozen && yocto > max ? 'allowances.spend.hintOver' : 'allowances.spend.hint', { amount: yoctoToNear(yocto, 4) }) : undefined}>
          <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="2.00" />
        </Field>
      </div>
      <Button className="mt-4 w-full" disabled={!valid || tx.state.status === 'signing'} onClick={() => tx.run(() => send(payFromAllowanceTx(info.contractId, to.trim(), yocto!)), onDone)}>
        {t('allowances.spend.button')}
      </Button>
      <div className="mt-3"><TxStatus state={tx.state} doneText={t('allowances.spend.done')} /></div>
    </Card>
  )
}

function FreezeCard({ info, accountId, isCouncil, send, dao, onDone }: { info: AllowanceInfo; accountId: string; isCouncil: boolean; send: Send; dao: DaoT; onDone: () => Promise<void> }) {
  const t = useT()
  const tx = useTx()
  const [did, setDid] = useState('')
  const guardian = info.state.guardians.includes(accountId)
  if (!guardian && !isCouncil) return null
  return (
    <Card>
      <div className="mb-1 text-[13.5px] font-medium">{info.state.frozen ? t('allowances.freeze.unfreezeTitle') : t('allowances.freeze.title')}</div>
      {info.state.frozen ? (
        <>
          <p className="mb-4 text-xs text-muted">{t('allowances.freeze.unfreezeNote')}</p>
          <Button className="w-full" variant="secondary" disabled={!isCouncil || tx.state.status === 'signing'} onClick={() => { setDid(t('allowances.freeze.unfreezeDone')); tx.run(() => send(unfreezeProposalTx(dao, info.contractId)), onDone) }}>
            {t('allowances.freeze.unfreezeButton')}
          </Button>
        </>
      ) : (
        <>
          <p className="mb-4 text-xs text-muted">{guardian ? t('allowances.freeze.note') : t('allowances.freeze.notGuardian')}</p>
          <Button className="w-full" variant="danger" disabled={!guardian || tx.state.status === 'signing'} onClick={() => { setDid(t('allowances.freeze.done')); tx.run(() => send(freezeTx(info.contractId)), onDone) }}>
            {t('allowances.freeze.button')}
          </Button>
        </>
      )}
      <div className="mt-3"><TxStatus state={tx.state} doneText={did} /></div>
    </Card>
  )
}

/** `primary` is false when the viewer also holds an allowance, so Pay now stays the one accent button. */
function CreateCard({ info, nearUsd, send, dao, onDone, primary }: { info: AllowanceInfo; nearUsd: number; send: Send; dao: DaoT; onDone: () => Promise<void>; primary: boolean }) {
  const t = useT()
  const [who, setWho] = useState('')
  const [cap, setCap] = useState('5')
  const [per, setPer] = useState('2')
  const [days, setDays] = useState('7')
  const [fund, setFund] = useState('10')
  const tx = useTx()
  const capY = usdToYocto(Number(cap), nearUsd)
  const perY = usdToYocto(Number(per), nearUsd)
  const fundY = Number(fund) === 0 ? 0n : usdToYocto(Number(fund), nearUsd)
  const d = Number(days)
  const valid =
    isValidAccountId(who.trim()) && capY != null && perY != null && perY <= capY && fundY != null && fundY < dao.spendable && Number.isInteger(d) && d >= 1 && d <= 365
  async function propose() {
    if (!valid) return
    const expiresAt = new Date(Date.now() + d * 86_400_000)
    await tx.run(
      () =>
        send(
          proposeAllowanceTx(dao, info.contractId, {
            accountId: who.trim(),
            dailyCap: capY!,
            perPaymentMax: perY!,
            expiresAt,
            funding: fundY!,
            // On-chain proposal title: stays English with an English date, never translated.
            label: `$${cap} a day, up to $${per} a payment, until ${expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${fundY ? `, adds $${fund} to the pool` : ''}`,
          }),
        ),
      onDone,
    )
  }
  return (
    <div id="propose-allowance" className="scroll-mt-24">
    <Card>
      <div className="mb-1 text-[13.5px] font-medium">{t('allowances.create.title')}</div>
      <p className="mb-4 text-xs text-muted">{t('allowances.create.note')}</p>
      <Field label={t('allowances.create.who')}>
        <input className={inputCls} value={who} onChange={(e) => setWho(e.target.value)} placeholder="helper.name.testnet" autoCapitalize="off" spellCheck={false} />
      </Field>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label={t('allowances.create.cap')}><input className={inputCls} inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} /></Field>
        <Field label={t('allowances.create.per')}><input className={inputCls} inputMode="decimal" value={per} onChange={(e) => setPer(e.target.value)} /></Field>
        <Field label={t('allowances.create.days')}><input className={inputCls} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        <Field label={t('allowances.create.fund')}><input className={inputCls} inputMode="decimal" value={fund} onChange={(e) => setFund(e.target.value)} /></Field>
      </div>
      {capY && perY && perY > capY && <p className="mt-2 text-xs text-bad">{t('allowances.create.perOverCap')}</p>}
      {fundY != null && fundY >= dao.spendable && <p className="mt-2 text-xs text-bad">{t('allowances.create.fundTooHigh', { amount: yoctoToNear(dao.spendable, 3) })}</p>}
      {capY && <p className="mt-2 text-xs text-muted">{t('allowances.create.capNear', { amount: yoctoToNear(capY, 3) })}</p>}
      <Button className="mt-4 w-full" variant={primary ? 'primary' : 'secondary'} disabled={!valid || tx.state.status === 'signing'} onClick={propose}>{t('allowances.create.button')}</Button>
      <div className="mt-3"><TxStatus state={tx.state} doneText={t('allowances.create.done')} /></div>
    </Card>
    </div>
  )
}

function HelperKeyCard({ info, accountId, send }: { info: AllowanceInfo; accountId: string; send: Send }) {
  const mine = info.allowances.find((a) => a.account_id === accountId)
  const t = useT()
  const [secret, setSecret] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const tx = useTx()
  if (!mine) return null
  async function make() {
    setErr(null)
    let key
    try {
      key = await newHelperKey()
    } catch {
      setErr(t('allowances.helper.noEd25519'))
      return
    }
    const hash = await tx.run(() => send(addHelperKeyTx(accountId, info.contractId, key.publicKey)))
    if (hash) setSecret(key.secretKey)
  }
  return (
    <Card>
      <div className="mb-1 text-[13.5px] font-medium">{t('allowances.helper.title')}</div>
      <p className="mb-4 text-xs text-muted">
        {tr('allowances.helper.text', { account: accountId, code: (c) => <span className="font-mono">{c}</span>, gas: yoctoToNear(HELPER_GAS_ALLOWANCE) })}
      </p>
      {!secret ? (
        <Button className="w-full" variant="secondary" disabled={tx.state.status === 'signing'} onClick={make}>{t('allowances.helper.button')}</Button>
      ) : (
        <div className="rounded-xl bg-soft p-3 text-xs">
          <div className="font-medium">{t('allowances.helper.copyNow')}</div>
          <code className="mt-2 block break-all font-mono">{secret}</code>
          <Button className="mt-2" variant="secondary" onClick={() => navigator.clipboard.writeText(secret)}>{t('common.copy')}</Button>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-bad">{err}</p>}
      <div className="mt-3"><TxStatus state={tx.state} doneText={t('allowances.helper.done')} /></div>
    </Card>
  )
}
