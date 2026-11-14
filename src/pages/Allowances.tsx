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

const fmtDate = (ns: string) => nanoToDate(ns).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** One line on Pay for people who hold an allowance. */
export function AllowanceBanner() {
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
        {info.state.frozen ? 'Your allowance is frozen right now.' : now > 0n ? <>You can pay up to <b>{money(now, nearUsd)}</b> from your allowance, with no vote.</> : 'Your allowance has nothing left today.'}
      </span>
      {now > 0n && (
        <Button variant="secondary" onClick={() => go('allowances')}>Spend from allowance</Button>
      )}
    </div>
  )
}

export default function Allowances() {
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
      <div className="text-[13px] text-muted">Allowances</div>
      <h1 className="mt-3 text-[32px] leading-[1.1] font-light tracking-[-0.03em]">Small budgets, hard limits</h1>
      <p className="mt-1 max-w-2xl text-[13.5px] text-muted">
        The group gives a member or an AI helper a small budget: a daily cap, a most-per-payment and an end date. Payments inside it skip the vote. The limits live in a contract the group owns, so nobody can go over them, and any council member can freeze it instantly.
      </p>

      {info === undefined && !error && (
        <div className="mt-10 flex items-center gap-2 text-sm text-muted"><Spinner /> Reading allowances…</div>
      )}
      {error && <div className="mt-10 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">Couldn't read the allowance contract: {error}</div>}
      {info === null && !error && (
        <EmptyState
          icon="plus"
          className="mt-10 max-w-2xl"
          title="Not set up for this group yet"
          text={
            <>
              Allowances need a small contract that this group owns. It's deployed once per group; see <span className="font-mono text-[12.5px]">contracts/allowance</span> in
              the repo. Until then, every payment goes through a normal request.
            </>
          }
        >
          <Button variant="secondary" onClick={() => go('pay')}>Request money instead</Button>
        </EmptyState>
      )}

      {info && (
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <div className="grid grid-cols-2 border-y border-line">
              <div className="border-r border-line py-5 pr-5">
                <div className="text-[12px] text-muted">In the allowance pool</div>
                <div className="tnum mt-1.5 text-[22px] font-light">{isFinite(nearUsd) ? usd(yoctoToNumber(info.state.balance) * nearUsd) : `${yoctoToNear(info.state.balance)} NEAR`}</div>
                <div className="tnum text-xs text-muted">{yoctoToNear(info.state.balance, 3)} NEAR</div>
              </div>
              <div className="py-5 pl-5">
                <div className="text-[12px] text-muted">Status</div>
                <div className="mt-2">{info.state.frozen ? <Badge tone="bad">Frozen</Badge> : <Badge tone="good">Open</Badge>}</div>
                <div className="mt-2 min-w-0 text-xs text-muted">
                  Contract <a className="block truncate font-mono text-accent-text hover:underline" href={accountUrl(info.contractId)} target="_blank" rel="noreferrer">{info.contractId}</a>
                </div>
              </div>
            </div>

            <div className="mt-8 text-[13.5px] font-medium">Budgets</div>
            {info.allowances.length === 0 ? (
              <EmptyState
                icon="plus"
                className="mt-2"
                title="No allowances yet"
                text={isCouncil ? 'Give a member or a helper a small budget that skips the vote.' : 'Council members can propose one.'}
              >
                {isCouncil && accountId && (
                  <Button variant="secondary" onClick={() => document.getElementById('propose-allowance')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                    Propose an allowance
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
                          {!active && <Badge tone="warn">Ended {fmtDate(a.expires_at)}</Badge>}
                          {active && <span className="text-xs text-muted">until {fmtDate(a.expires_at)}</span>}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-soft">
                        <div className="h-full bg-brand" style={{ width: `${Math.min(100, used)}%` }} />
                      </div>
                      <dl className="mt-3 grid grid-cols-3 gap-3 text-[12px]">
                        <div>
                          <dt className="text-muted">Left today</dt>
                          <dd className="tnum mt-0.5 text-[13.5px] text-ink">{money(a.left_today, nearUsd)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Daily cap</dt>
                          <dd className="tnum mt-0.5 text-[13.5px]">{money(a.daily_cap, nearUsd)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Per payment</dt>
                          <dd className="tnum mt-0.5 text-[13.5px]">{money(a.per_payment_max, nearUsd)}</dd>
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
                <div className="font-medium">Waiting for approval</div>
                <ul className="mt-1 list-disc pl-5 text-muted">
                  {pending.map((p) => (
                    <li key={p.id}>
                      #{p.id} {decodeDescription(p.description).title} ·{' '}
                      <button className="-my-3 py-3 text-accent-text hover:underline" onClick={() => go('approve')}>approve</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-8 text-[12px] text-muted">
              Enforced by the contract: daily cap, most per payment, end date, freeze, and that only the group can change them. Caps are stored in NEAR and converted from dollars at the price when the request is filed. A day is a UTC calendar day.
            </p>
          </div>

          <div className="flex flex-col gap-6 self-start">
            {!accountId ? (
              <Card><Button className="w-full" onClick={signIn}>Sign in to use allowances</Button></Card>
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

function RemoveButton({ run, onDone }: { run: () => Promise<string>; onDone: () => Promise<void> }) {
  const tx = useTx()
  return (
    <div className="mt-2">
      {tx.state.status === 'idle' ? (
        <button className="-my-2 py-3 text-xs text-muted hover:text-bad hover:underline sm:py-2" onClick={() => tx.run(run, onDone)}>Propose ending this allowance</button>
      ) : (
        <TxStatus state={tx.state} doneText="Request filed. Approve it in Approve." />
      )}
    </div>
  )
}

function SpendCard({ info, accountId, nearUsd, send, onDone }: { info: AllowanceInfo; accountId: string; nearUsd: number; send: Send; onDone: () => Promise<void> }) {
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
      <div className="mb-1 text-[13.5px] font-medium">Spend from your allowance</div>
      <p className="mb-4 text-xs text-muted">
        {frozen ? 'Frozen by the council. Payments are refused until the group unfreezes it.' : `Up to ${money(max, nearUsd)} right now. No vote needed.`}
      </p>
      <Field label="Pay to (NEAR account)">
        <input className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} placeholder="name.testnet" autoCapitalize="off" spellCheck={false} />
      </Field>
      <div className="mt-3">
        <Field label="Amount ($)" hint={yocto ? `${yoctoToNear(yocto, 4)} NEAR${!frozen && yocto > max ? ' · over your limit, the contract will refuse it' : ''}` : undefined}>
          <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="2.00" />
        </Field>
      </div>
      <Button className="mt-4 w-full" disabled={!valid || tx.state.status === 'signing'} onClick={() => tx.run(() => send(payFromAllowanceTx(info.contractId, to.trim(), yocto!)), onDone)}>
        Pay now
      </Button>
      <div className="mt-3"><TxStatus state={tx.state} doneText="Paid from your allowance." /></div>
    </Card>
  )
}

function FreezeCard({ info, accountId, isCouncil, send, dao, onDone }: { info: AllowanceInfo; accountId: string; isCouncil: boolean; send: Send; dao: DaoT; onDone: () => Promise<void> }) {
  const tx = useTx()
  const [did, setDid] = useState('')
  const guardian = info.state.guardians.includes(accountId)
  if (!guardian && !isCouncil) return null
  return (
    <Card>
      <div className="mb-1 text-[13.5px] font-medium">{info.state.frozen ? 'Unfreeze' : 'Freeze'}</div>
      {info.state.frozen ? (
        <>
          <p className="mb-4 text-xs text-muted">Unfreezing needs the group's approval, so it's a request.</p>
          <Button className="w-full" variant="secondary" disabled={!isCouncil || tx.state.status === 'signing'} onClick={() => { setDid('Unfreeze request filed. Approve it in Approve.'); tx.run(() => send(unfreezeProposalTx(dao, info.contractId)), onDone) }}>
            Request unfreeze
          </Button>
        </>
      ) : (
        <>
          <p className="mb-4 text-xs text-muted">{guardian ? 'Stops every allowance at once, no vote. Only the group can unfreeze.' : 'You are not a guardian on the contract, so you can’t freeze instantly.'}</p>
          <Button className="w-full" variant="danger" disabled={!guardian || tx.state.status === 'signing'} onClick={() => { setDid('Allowances frozen.'); tx.run(() => send(freezeTx(info.contractId)), onDone) }}>
            Freeze all allowances
          </Button>
        </>
      )}
      <div className="mt-3"><TxStatus state={tx.state} doneText={did} /></div>
    </Card>
  )
}

/** `primary` is false when the viewer also holds an allowance, so Pay now stays the one accent button. */
function CreateCard({ info, nearUsd, send, dao, onDone, primary }: { info: AllowanceInfo; nearUsd: number; send: Send; dao: DaoT; onDone: () => Promise<void>; primary: boolean }) {
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
            label: `$${cap} a day, up to $${per} a payment, until ${expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${fundY ? `, adds $${fund} to the pool` : ''}`,
          }),
        ),
      onDone,
    )
  }
  return (
    <div id="propose-allowance" className="scroll-mt-24">
    <Card>
      <div className="mb-1 text-[13.5px] font-medium">Propose an allowance</div>
      <p className="mb-4 text-xs text-muted">Filed as a request; it starts once the group approves it.</p>
      <Field label="Who (member or AI helper account)">
        <input className={inputCls} value={who} onChange={(e) => setWho(e.target.value)} placeholder="helper.name.testnet" autoCapitalize="off" spellCheck={false} />
      </Field>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Daily cap ($)"><input className={inputCls} inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} /></Field>
        <Field label="Per payment ($)"><input className={inputCls} inputMode="decimal" value={per} onChange={(e) => setPer(e.target.value)} /></Field>
        <Field label="Lasts (days)"><input className={inputCls} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        <Field label="Add to pool ($)"><input className={inputCls} inputMode="decimal" value={fund} onChange={(e) => setFund(e.target.value)} /></Field>
      </div>
      {capY && perY && perY > capY && <p className="mt-2 text-xs text-bad">Per payment can't be above the daily cap.</p>}
      {fundY != null && fundY >= dao.spendable && <p className="mt-2 text-xs text-bad">The treasury can spend {yoctoToNear(dao.spendable, 3)} NEAR; lower “Add to pool” (0 is fine).</p>}
      {capY && <p className="mt-2 text-xs text-muted">Daily cap ≈ {yoctoToNear(capY, 3)} NEAR at today's price.</p>}
      <Button className="mt-4 w-full" variant={primary ? 'primary' : 'secondary'} disabled={!valid || tx.state.status === 'signing'} onClick={propose}>Propose allowance</Button>
      <div className="mt-3"><TxStatus state={tx.state} doneText="Allowance request filed. Approve it in Approve." /></div>
    </Card>
    </div>
  )
}

function HelperKeyCard({ info, accountId, send }: { info: AllowanceInfo; accountId: string; send: Send }) {
  const mine = info.allowances.find((a) => a.account_id === accountId)
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
      setErr('This browser can’t make ed25519 keys. Try a recent Chrome, Safari or Firefox.')
      return
    }
    const hash = await tx.run(() => send(addHelperKeyTx(accountId, info.contractId, key.publicKey)))
    if (hash) setSecret(key.secretKey)
  }
  return (
    <Card>
      <div className="mb-1 text-[13.5px] font-medium">Give an AI helper a key</div>
      <p className="mb-4 text-xs text-muted">
        Adds a key to {accountId} that can only call <span className="font-mono">pay</span> on the allowance contract, with {yoctoToNear(HELPER_GAS_ALLOWANCE)} NEAR for gas. It can’t move money any other way, and it can’t go over this allowance. Delete it from your wallet at any time.
      </p>
      {!secret ? (
        <Button className="w-full" variant="secondary" disabled={tx.state.status === 'signing'} onClick={make}>Make helper key</Button>
      ) : (
        <div className="rounded-xl bg-soft p-3 text-xs">
          <div className="font-medium">Copy this now; it's shown only once.</div>
          <code className="mt-2 block break-all font-mono">{secret}</code>
          <Button className="mt-2" variant="secondary" onClick={() => navigator.clipboard.writeText(secret)}>Copy</Button>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-bad">{err}</p>}
      <div className="mt-3"><TxStatus state={tx.state} doneText="Helper key added." /></div>
    </Card>
  )
}
