import { useEffect, useState } from 'react'
import { useWallet } from '../lib/wallet'
import { createGroupTx, isDao, trustedOnly } from '../lib/dao'
import { FACTORY, ONE_NEAR, isValidAccountId, spendableBalance, viewAccount } from '../lib/near'
import { nearToYocto, yoctoToNear } from '../lib/format'
import { openDao, shareUrl } from '../lib/store'
import { wait } from '../lib/motion'
import { TIER_LIMITS_USD } from '../lib/record'
import { rememberGroup } from '../lib/groups'
import { Button, TxStatus, WrongNetworkBanner, useTx } from '../components/ui'

const ICON = `${import.meta.env.BASE_URL}favicon.svg`

function parseList(s: string): string[] {
  return [...new Set(s.split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))]
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

const line = 'block border-b border-line pb-2 transition-colors focus-within:border-ink'
const bare = 'w-full bg-transparent py-3 outline-none placeholder:text-muted/60 sm:py-2'
// A fresh Sputnik DAO stores about 540 kB, so about 5.4 NEAR of the deposit stays locked for storage.
const MIN_DEPOSIT = 6n * ONE_NEAR
// Gas for the factory call, kept aside so the creator isn't left at zero.
const GAS_RESERVE = ONE_NEAR / 10n

export default function CreateGroup() {
  const { accountId, send, signIn, signOut } = useWallet()
  const [step, setStep] = useState(1)
  const [displayName, setDisplayName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [purpose, setPurpose] = useState('')
  const [council, setCouncil] = useState('')
  const [trusted, setTrusted] = useState('')
  const [deposit, setDeposit] = useState('7')
  const [myBalance, setMyBalance] = useState<bigint | null>(null)
  const [checkingDao, setCheckingDao] = useState(false)
  const [notCreated, setNotCreated] = useState(false)
  const [taken, setTaken] = useState<boolean | null>(null)
  const [copied, setCopied] = useState(false)
  const tx = useTx()

  useEffect(() => {
    if (accountId && !council) setCouncil(accountId)
  }, [accountId, council])
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(displayName))
  }, [displayName, slugTouched])

  useEffect(() => {
    setMyBalance(null)
    if (!accountId || step !== 3) return
    viewAccount(accountId)
      .then((a) => setMyBalance(a ? spendableBalance(a) : 0n))
      .catch(() => setMyBalance(null))
  }, [accountId, step])

  const daoId = slug ? `${slug}.${FACTORY}` : ''
  useEffect(() => {
    setTaken(null)
    if (!slug || !isValidAccountId(daoId)) return
    const t = setTimeout(() => viewAccount(daoId).then((a) => setTaken(!!a)).catch(() => setTaken(null)), 400)
    return () => clearTimeout(t)
  }, [slug, daoId])

  const councilList = parseList(council)
  const trustedList = parseList(trusted)
  const onBoth = trustedList.filter((a) => councilList.includes(a))
  const trustedFinal = trustedOnly(councilList, trustedList)
  const yocto = nearToYocto(deposit)

  const step1Error =
    displayName.trim().length < 2
      ? 'Give the group a name.'
      : !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3
        ? 'The treasury address needs 3+ lowercase letters, numbers or dashes.'
        : !isValidAccountId(daoId)
          ? 'That treasury address is too long.'
          : taken
            ? 'That treasury address is taken. Try another one.'
            : null
  const step2Error = !councilList.length
    ? 'Add at least one council member.'
    : councilList.some((a) => !isValidAccountId(a))
      ? 'One of the council accounts is not valid.'
      : trustedList.some((a) => !isValidAccountId(a))
        ? 'One of the trusted accounts is not valid.'
        : null
  const step3Error = !yocto
    ? 'Enter a starting deposit in NEAR.'
    : yocto < MIN_DEPOSIT
      ? `Start with at least ${yoctoToNear(MIN_DEPOSIT, 0)} NEAR: about 5.4 NEAR stays locked to store the DAO contract.`
      : myBalance != null && yocto + GAS_RESERVE > myBalance
        ? `Your account can spend ${yoctoToNear(myBalance)} NEAR. Lower the deposit or top up from the testnet faucet.`
        : null

  async function create() {
    if (step1Error || step2Error || step3Error || !yocto) return
    setNotCreated(false)
    const hash = await tx.run(() => send(createGroupTx({ displayName, name: slug, purpose, council: councilList, trusted: trustedFinal, deposit: yocto })))
    if (!hash) return
    // The factory call can succeed while creating the DAO fails (it then refunds the deposit),
    // so check the DAO actually exists before sending anyone to it.
    setCheckingDao(true)
    for (let i = 0; i < 14; i++) {
      if (await isDao(daoId)) {
        setCheckingDao(false)
        rememberGroup(accountId, daoId, 'created') // shows in My groups; saved to the profile on the next save
        openDao(daoId)
        return
      }
      await wait(1500)
    }
    setCheckingDao(false)
    setNotCreated(true)
  }

  const titles = ['Your group', 'Invite members', 'Review and create']

  return (
    <div className="mx-auto max-w-[560px] px-6 py-10 md:py-14">
      <button onClick={() => openDao(null)} className="flex items-center gap-2">
        <img src={ICON} alt="" className="size-7 rounded-[7px]" />
        <span className="text-[16px] font-medium tracking-tight">terra</span>
      </button>
      <div className="mt-8 empty:hidden">
        <WrongNetworkBanner accountId={accountId} onSignOut={signOut} />
      </div>
      <div className="mt-12 flex gap-1.5">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`h-[3px] flex-1 rounded-full ${n <= step ? 'bg-ink' : 'bg-line'}`} />
        ))}
      </div>
      <div className="mt-3 text-[12px] text-muted">
        Step {step} of 3 · {titles[step - 1]}
      </div>

      {step === 1 && (
        <>
          <h1 className="mt-6 text-[36px] leading-none font-light tracking-[-0.035em]">Set up your group</h1>
          <p className="mt-2 text-[14px] text-muted">
            Already have a Sputnik DAO?{' '}
            <button className="-my-3 inline-block py-3 text-ink underline underline-offset-2" onClick={() => openDao(null)}>
              Connect it instead.
            </button>
          </p>
          <div className="mt-10 space-y-8">
            <label className={line}>
              <span className="text-[12px] text-muted">Group name</span>
              <input autoFocus className={bare + ' text-[22px] font-light'} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Riverside Club" maxLength={60} />
            </label>
            <label className={line}>
              <span className="text-[12px] text-muted">Treasury address</span>
              <div className="mt-1 flex items-baseline font-mono text-[14px]">
                <input
                  className="min-w-0 bg-transparent py-3 outline-none placeholder:text-muted/60 sm:py-2"
                  style={{ width: `${Math.max(8, slug.length + 1)}ch` }}
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true)
                    setSlug(e.target.value.toLowerCase())
                  }}
                  placeholder="riverside-club"
                  spellCheck={false}
                />
                <span className="text-muted">.{FACTORY}</span>
              </div>
              <span className="mt-1 block text-[12px] text-muted">{taken === false ? 'Available' : taken ? 'Taken: pick another address' : 'A standard Sputnik DAO from the official testnet factory. You own it, not Terra.'}</span>
            </label>
            <label className={line}>
              <span className="text-[12px] text-muted">What is it for? (optional)</span>
              <input className={bare + ' text-[15px]'} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="A city community that runs meetups and pays local contributors" maxLength={200} />
            </label>
            <div>
              <span className="text-[12px] text-muted">Approval levels</span>
              <div className="mt-2 divide-y divide-line rounded-xl border border-line text-[13.5px]">
                <div className="flex items-center justify-between px-4 py-3">
                  <span>Small</span>
                  <span className="text-muted">
                    up to <span className="tnum text-ink">${TIER_LIMITS_USD.small}</span> · 1 trusted member, once the requester has a record
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span>Mid</span>
                  <span className="text-muted">
                    up to <span className="tnum text-ink">${TIER_LIMITS_USD.mid}</span> · council majority
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span>Large</span>
                  <span className="text-muted">over ${TIER_LIMITS_USD.mid} · full council vote</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="mt-6 text-[36px] leading-none font-light tracking-[-0.035em]">Invite members</h1>
          <p className="mt-2 text-[14px] text-muted">Add NEAR testnet accounts now; you can invite more later from Members. Anyone, member or not, can file a request.</p>
          <div className="mt-10 space-y-8">
            <label className={line}>
              <span className="text-[12px] text-muted">Council · approves mid and large requests by majority</span>
              <textarea className={bare + ' resize-none font-mono text-[14px]'} rows={2} value={council} onChange={(e) => setCouncil(e.target.value)} placeholder="you.testnet, ana.testnet" spellCheck={false} />
              <span className="mt-1 block text-[12px] text-muted">{councilList.length} account{councilList.length === 1 ? '' : 's'} · separate with commas or spaces</span>
            </label>
            <label className={line}>
              <span className="text-[12px] text-muted">Trusted members · one of them can approve a small request</span>
              <textarea className={bare + ' resize-none font-mono text-[14px]'} rows={2} value={trusted} onChange={(e) => setTrusted(e.target.value)} placeholder="ben.testnet" spellCheck={false} />
              <span className="mt-1 block text-[12px] text-muted">
                {onBoth.length
                  ? `${onBoth.join(', ')} ${onBoth.length === 1 ? 'is' : 'are'} on the council already, so ${onBoth.length === 1 ? 'stays' : 'stay'} council only. The DAO counts each role on its own, so a council member who is also trusted could pay out any amount alone.`
                  : 'Optional. Without trusted members there is no fast lane yet: the council decides every request. Add them later from Members.'}
              </span>
            </label>
            {daoId && (
              <div className="rounded-xl bg-soft px-4 py-3 text-[13px]">
                <div className="text-muted">Link to share once the group exists</div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-[12.5px]">{shareUrl(daoId, 'signin')}</span>
                  <button
                    className="shrink-0 text-[12.5px] font-medium"
                    onClick={() => navigator.clipboard?.writeText(shareUrl(daoId, 'signin')).then(() => setCopied(true)).catch(() => setCopied(false))}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h1 className="mt-6 text-[36px] leading-none font-light tracking-[-0.035em]">Review and create</h1>
          <p className="mt-2 text-[14px] text-muted">You sign one transaction. The factory creates the DAO and the deposit becomes its first balance.</p>
          <div className="mt-8 text-[13.5px]">
            <Row k="Group" v={displayName} />
            <Row k="Treasury" v={daoId} mono />
            <Row k="Council" v={councilList.join(', ')} mono />
            <Row k="Trusted" v={trustedFinal.length ? trustedFinal.join(', ') : 'Nobody yet: the council decides every request'} mono={!!trustedFinal.length} />
            <Row k="Request bond" v="0.01 NEAR, returned when decided" />
            <Row k="Requests stay open" v="7 days" />
          </div>
          <label className={line + ' mt-8'}>
            <span className="text-[12px] text-muted">Starting deposit</span>
            <div className="mt-1 flex items-baseline gap-2">
              <input className="tnum w-full bg-transparent text-[40px] font-light leading-none tracking-[-0.04em] outline-none" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
              <span className="text-[15px] text-muted">NEAR</span>
            </div>
            <span className="mt-1 block text-[12px] text-muted">
              About 5.4 NEAR stays locked to store the contract; the rest is what the group can spend.
              {myBalance != null && ` You can spend ${yoctoToNear(myBalance)} NEAR.`}
            </span>
          </label>
          <div className="mt-4">
            {notCreated ? (
              <div className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
                The factory call went through but {daoId} wasn't created, so the factory sent your deposit back. Usually the address was just taken or the deposit was too low. Check the address and try again.
              </div>
            ) : checkingDao ? (
              <div className="rounded-xl bg-soft px-3 py-2 text-sm text-muted">Signed. Waiting for {daoId} to appear on NEAR…</div>
            ) : (
              <TxStatus state={tx.state} doneText="Your group's treasury is live." />
            )}
          </div>
        </>
      )}

      <div className="mt-10 flex items-center justify-between gap-3 text-[14px] font-medium">
        <button className="rounded-lg px-4 py-3 text-muted hover:text-ink" onClick={() => (step === 1 ? openDao(null) : setStep(step - 1))}>
          Back
        </button>
        <div className="flex flex-col items-end gap-2">
          {step < 3 ? (
            <Button className="!px-6 !py-3" disabled={!!(step === 1 ? step1Error : step2Error)} onClick={() => setStep(step + 1)}>
              {step === 1 ? 'Next: invite members' : 'Next: review'}
            </Button>
          ) : tx.state.status === 'done' && !notCreated ? (
            <Button
              className="!px-6 !py-3"
              onClick={async () => {
                if (await isDao(daoId)) openDao(daoId)
              }}
            >
              Open {displayName}
            </Button>
          ) : !accountId ? (
            <Button className="!px-6 !py-3" onClick={signIn}>Sign in to create</Button>
          ) : (
            <Button className="!px-6 !py-3" disabled={!!step3Error || tx.state.status === 'signing' || checkingDao} onClick={create}>
              Create group
            </Button>
          )}
          {(step === 1 ? step1Error : step === 2 ? step2Error : step3Error) && (displayName || step > 1) && (
            <span className="text-[12px] font-normal text-muted">{step === 1 ? step1Error : step === 2 ? step2Error : step3Error}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-6 border-t border-line py-3">
      <span className="shrink-0 text-muted">{k}</span>
      <span className={`min-w-0 break-all text-right ${mono ? 'font-mono text-[12.5px]' : ''}`}>{v}</span>
    </div>
  )
}
