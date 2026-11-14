import { useEffect, useState } from 'react'
import { useWallet } from '../lib/wallet'
import { createGroupTx, isDao } from '../lib/dao'
import { FACTORY, isValidAccountId, viewAccount } from '../lib/near'
import { nearToYocto } from '../lib/format'
import { openDao } from '../lib/store'
import { Button, Card, Field, SectionTitle, TxStatus, inputCls, useTx } from '../components/ui'

function parseList(s: string): string[] {
  return [...new Set(s.split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))]
}

export default function CreateGroup() {
  const { accountId, send, signIn } = useWallet()
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [council, setCouncil] = useState('')
  const [trusted, setTrusted] = useState('')
  const [deposit, setDeposit] = useState('6')
  const [taken, setTaken] = useState<boolean | null>(null)
  const tx = useTx()

  useEffect(() => {
    if (accountId && !council) setCouncil(accountId)
  }, [accountId, council])

  const daoId = name ? `${name}.${FACTORY}` : ''
  useEffect(() => {
    setTaken(null)
    if (!name || !isValidAccountId(daoId)) return
    const t = setTimeout(() => viewAccount(daoId).then((a) => setTaken(!!a)).catch(() => setTaken(null)), 400)
    return () => clearTimeout(t)
  }, [name, daoId])

  const councilList = parseList(council)
  const trustedList = parseList(trusted)
  const yocto = nearToYocto(deposit)
  const errors: string[] = []
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length < 3 || name.length > 40) errors.push('Pick a short name: lowercase letters, numbers and dashes.')
  if (taken) errors.push('That name is taken.')
  if (!councilList.length || councilList.some((a) => !isValidAccountId(a))) errors.push('Add at least one valid council account.')
  if (trustedList.some((a) => !isValidAccountId(a))) errors.push('One of the trusted accounts is not valid.')
  if (!yocto || yocto < 5n * 10n ** 24n) errors.push('The factory needs at least about 5 NEAR to store the DAO contract.')

  async function create() {
    if (errors.length || !yocto) return
    await tx.run(() => send(createGroupTx({ name, purpose, council: councilList, trusted: trustedList, deposit: yocto })))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Start a new group</h1>
        <p className="mt-1 text-sm text-muted">
          Already have a DAO? <button className="font-medium text-accent-text hover:underline" onClick={() => openDao(null)}>Open it instead</button>. Otherwise Terra creates a standard Sputnik DAO for you through the official testnet factory. You own it; Terra never does.
        </p>
      </div>
      <Card className="space-y-5">
        <Field label="Group name" hint={daoId ? <>Your treasury will be <b>{daoId}</b>{taken === false ? ' · available' : taken ? ' · taken' : ''}</> : 'For example riverside-club'}>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="riverside-club" />
        </Field>
        <Field label="What is it for?">
          <input className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="A city community that runs meetups and pays local contributors" maxLength={200} />
        </Field>
        <Field label="Council (approves mid and large requests by majority)" hint="NEAR accounts, separated by commas or spaces.">
          <textarea className={inputCls} rows={2} value={council} onChange={(e) => setCouncil(e.target.value)} placeholder="alice.testnet, bob.testnet" />
        </Field>
        <Field label="Trusted members (one of them can approve a small request)" hint="Optional. If empty, the council is trusted too.">
          <textarea className={inputCls} rows={2} value={trusted} onChange={(e) => setTrusted(e.target.value)} placeholder="carol.testnet" />
        </Field>
        <Field label="Starting deposit (NEAR)" hint="Pays for the DAO's storage (about 5 NEAR); the rest becomes the treasury balance.">
          <input className={inputCls} inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        </Field>
      </Card>
      <Card>
        <SectionTitle>Policy Terra will set</SectionTitle>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li><b className="text-ink">council</b>: every permission; transfers and changes need more than half the council.</li>
          <li><b className="text-ink">trusted</b>: can ask for money and approve transfers; one approval is enough (Terra only offers it for small requests).</li>
          <li><b className="text-ink">anyone</b>: can file a payment request.</li>
          <li>Request bond 0.01 NEAR, returned when the request is decided. Requests stay open for 7 days.</li>
        </ul>
        <div className="mt-5">
          {!accountId ? (
            <Button onClick={signIn}>Sign in to create</Button>
          ) : (
            <Button disabled={errors.length > 0 || tx.state.status === 'signing'} onClick={create}>Create group</Button>
          )}
          {accountId && errors.length > 0 && <p className="mt-2 text-xs text-muted">{errors[0]}</p>}
        </div>
        <div className="mt-3">
          <TxStatus state={tx.state} doneText="Your group's treasury is live." />
          {tx.state.status === 'done' && (
            <Button className="mt-3" onClick={async () => { if (await isDao(daoId)) openDao(daoId) }}>Open {name}</Button>
          )}
        </div>
      </Card>
    </div>
  )
}
