import { useState } from 'react'
import { DEMO_DAO, go, openDao } from '../lib/store'
import { isDao } from '../lib/dao'
import { FACTORY, isValidAccountId } from '../lib/near'
import { Button, Spinner, inputCls } from '../components/ui'
import { Logo } from '../App'
import { useWallet } from '../lib/wallet'
import { shortName } from '../lib/format'

export default function Landing() {
  const [name, setName] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { accountId, signIn, signOut } = useWallet()

  async function connect(raw: string) {
    let id = raw.trim().toLowerCase()
    if (!id) return
    if (!id.includes('.')) id = `${id}.${FACTORY}`
    if (!isValidAccountId(id)) {
      setError("That doesn't look like a NEAR account name.")
      return
    }
    setChecking(true)
    setError(null)
    const ok = await isDao(id)
    setChecking(false)
    if (!ok) {
      setError(`${id} isn't a Sputnik DAO on testnet. Check the name, or start a new group.`)
      return
    }
    openDao(id)
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 md:px-8">
        <Logo />
        {accountId ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">Signed in as</span>
            <span className="font-medium" title={accountId}>{shortName(accountId)}</span>
            <Button variant="ghost" onClick={signOut}>Sign out</Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={signIn}>Sign in</Button>
        )}
      </header>

      <section className="mx-auto max-w-5xl px-4 pb-12 pt-10 md:px-8 md:pt-16">
        <p className="mb-4 inline-flex rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
          For communities that already have a treasury on NEAR
        </p>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
          Your community's money, in every member's hands.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          Terra is the members' app for a community treasury. Chip in, ask for money and approve it from your
          browser. A member's track record decides how many approvals a request needs, and the treasury can pay
          anyone, on any chain.
        </p>

        <form
          className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            connect(name)
          }}
        >
          <input
            className={inputCls + ' sm:flex-1'}
            placeholder="Your community's DAO, e.g. riverside-coop"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="DAO account name"
            autoFocus
          />
          <Button type="submit" disabled={checking || !name.trim()}>
            {checking ? <Spinner /> : 'Open treasury'}
          </Button>
        </form>
        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <button className="font-medium text-brand hover:underline" onClick={() => openDao(DEMO_DAO)}>
            Try the demo community →
          </button>
          <span>or</span>
          <button className="font-medium text-brand hover:underline" onClick={() => go('create')}>
            start a new group
          </button>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-20 md:grid-cols-3 md:px-8">
        {[
          {
            t: 'Keep your multisig',
            d: "Terra reads and writes to your community's existing Sputnik DAO (the same contract Trezu uses). No new wallet, no migration.",
          },
          {
            t: 'A fast lane for trusted members',
            d: 'Small requests from members with a clean record need one nod. Bigger ones go to the council. Every record links back to the chain.',
          },
          {
            t: 'Pay anyone, on any chain',
            d: 'Asking for USDC on Solana? Terra shows a live NEAR Intents quote, so everyone voting sees what the recipient will get.',
          },
        ].map((f) => (
          <div key={f.t} className="rounded-2xl border border-line bg-card p-5">
            <h3 className="font-semibold">{f.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{f.d}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
