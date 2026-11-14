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
import { formatNumber, tr, useT } from '../i18n'

const ICON = `${import.meta.env.BASE_URL}favicon.svg`

function parseList(s: string): string[] {
  return [...new Set(s.split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))]
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // é -> e
    .replace(/['’]/g, '') // Ravi’s -> ravis
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
// NEAR that stays locked for the DAO contract's storage (shown on screen).
const LOCKED_NEAR = 5.4

/** "$50": a whole-dollar limit in the current locale. */
const dollars = (n: number) => formatNumber(n, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function CreateGroup() {
  const t = useT()
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
    const timer = setTimeout(() => viewAccount(daoId).then((a) => setTaken(!!a)).catch(() => setTaken(null)), 400)
    return () => clearTimeout(timer)
  }, [slug, daoId])

  const councilList = parseList(council)
  const trustedList = parseList(trusted)
  const onBoth = trustedList.filter((a) => councilList.includes(a))
  const trustedFinal = trustedOnly(councilList, trustedList)
  const yocto = nearToYocto(deposit)

  const step1Error =
    displayName.trim().length < 2
      ? t('create.error.name')
      : !slug
        ? t('create.error.slugEmpty')
      : !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3
        ? t('create.error.slugFormat')
        : !isValidAccountId(daoId)
          ? t('create.error.slugLong')
          : taken
            ? t('create.error.slugTaken')
            : null
  const step2Error = !councilList.length
    ? t('create.error.noCouncil')
    : councilList.some((a) => !isValidAccountId(a))
      ? t('create.error.councilInvalid')
      : trustedList.some((a) => !isValidAccountId(a))
        ? t('create.error.trustedInvalid')
        : null
  const step3Error = !yocto
    ? t('create.error.noDeposit')
    : yocto < MIN_DEPOSIT
      ? t('create.error.minDeposit', { min: yoctoToNear(MIN_DEPOSIT, 0), locked: LOCKED_NEAR })
      : myBalance != null && yocto + GAS_RESERVE > myBalance
        ? t('create.error.balance', { amount: yoctoToNear(myBalance) })
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

  const titles = [t('create.title.group'), t('create.title.invite'), t('create.title.review')]

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
        {t('create.step', { step, total: 3, title: titles[step - 1] })}
      </div>

      {step === 1 && (
        <>
          <h1 className="mt-6 text-[36px] leading-none font-light tracking-[-0.035em]">{t('create.setup.title')}</h1>
          <p className="mt-2 text-[14px] text-muted">
            {tr('create.setup.haveDao', {
              link: (c) => (
                <button className="-my-3 inline-block py-3 text-ink underline underline-offset-2" onClick={() => openDao(null)}>
                  {c}
                </button>
              ),
            })}
          </p>
          <div className="mt-10 space-y-8">
            <label className={line}>
              <span className="text-[12px] text-muted">{t('create.name.label')}</span>
              <input autoFocus className={bare + ' text-[22px] font-light'} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t('create.name.placeholder')} maxLength={60} />
            </label>
            <label className={line}>
              <span className="text-[12px] text-muted">{t('create.slug.label')}</span>
              <div className="mt-1 flex items-baseline font-mono text-[14px]">
                <input
                  className="min-w-0 bg-transparent py-3 outline-none placeholder:text-muted/60 sm:py-2"
                  style={{ width: `${Math.max(8, slug.length + 1)}ch` }}
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true)
                    setSlug(e.target.value.toLowerCase())
                  }}
                  /* i18n-ignore: example address, Latin only */
                  placeholder="riverside-club"
                  spellCheck={false}
                />
                <span className="text-muted">.{FACTORY}</span>
              </div>
              <span className="mt-1 block text-[12px] text-muted">{taken === false ? t('create.slug.available') : taken ? t('create.slug.taken') : t('create.slug.hint')}</span>
            </label>
            <label className={line}>
              <span className="text-[12px] text-muted">{t('create.purpose.label')}</span>
              <input className={bare + ' text-[15px]'} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={t('create.purpose.placeholder')} maxLength={200} />
            </label>
            <div>
              <span className="text-[12px] text-muted">{t('create.levels.label')}</span>
              <div className="mt-2 divide-y divide-line rounded-xl border border-line text-[13.5px]">
                <div className="flex items-center justify-between px-4 py-3">
                  <span>{t('create.levels.small')}</span>
                  <span className="text-muted">
                    {tr('create.levels.smallRule', { amount: dollars(TIER_LIMITS_USD.small), b: (c) => <span className="tnum text-ink">{c}</span> })}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span>{t('create.levels.mid')}</span>
                  <span className="text-muted">
                    {tr('create.levels.midRule', { amount: dollars(TIER_LIMITS_USD.mid), b: (c) => <span className="tnum text-ink">{c}</span> })}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span>{t('create.levels.large')}</span>
                  <span className="text-muted">{t('create.levels.largeRule', { amount: dollars(TIER_LIMITS_USD.mid) })}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="mt-6 text-[36px] leading-none font-light tracking-[-0.035em]">{t('create.title.invite')}</h1>
          <p className="mt-2 text-[14px] text-muted">{t('create.invite.intro')}</p>
          <div className="mt-10 space-y-8">
            <label className={line}>
              <span className="text-[12px] text-muted">{t('create.invite.councilLabel')}</span>
              <textarea className={bare + ' resize-none font-mono text-[14px]'} rows={2} value={council} onChange={(e) => setCouncil(e.target.value)} /* i18n-ignore: example account IDs */ placeholder="you.testnet, ana.testnet" spellCheck={false} />
              <span className="mt-1 block text-[12px] text-muted">{t('create.invite.accounts', { count: councilList.length })}</span>
            </label>
            <label className={line}>
              <span className="text-[12px] text-muted">{t('create.invite.trustedLabel')}</span>
              <textarea className={bare + ' resize-none font-mono text-[14px]'} rows={2} value={trusted} onChange={(e) => setTrusted(e.target.value)} /* i18n-ignore: example account ID */ placeholder="ben.testnet" spellCheck={false} />
              <span className="mt-1 block text-[12px] text-muted">
                {onBoth.length
                  ? t('create.invite.onBoth', { count: onBoth.length, accounts: onBoth.join(', ') })
                  : t('create.invite.trustedHint')}
              </span>
            </label>
            {daoId && (
              <div className="rounded-xl bg-soft px-4 py-3 text-[13px]">
                <div className="text-muted">{t('create.invite.shareLink')}</div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-[12.5px]">{shareUrl(daoId, 'signin')}</span>
                  <button
                    className="shrink-0 text-[12.5px] font-medium"
                    onClick={() => navigator.clipboard?.writeText(shareUrl(daoId, 'signin')).then(() => setCopied(true)).catch(() => setCopied(false))}
                  >
                    {copied ? t('common.copied') : t('common.copy')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h1 className="mt-6 text-[36px] leading-none font-light tracking-[-0.035em]">{t('create.title.review')}</h1>
          <p className="mt-2 text-[14px] text-muted">{t('create.review.intro')}</p>
          <div className="mt-8 text-[13.5px]">
            <Row k={t('create.row.group')} v={displayName} />
            <Row k={t('create.row.treasury')} v={daoId} mono />
            <Row k={t('create.row.council')} v={councilList.join(', ')} mono />
            <Row k={t('create.row.trusted')} v={trustedFinal.length ? trustedFinal.join(', ') : t('create.row.nobody')} mono={!!trustedFinal.length} />
            <Row k={t('create.row.bond')} v={t('create.row.bondValue', { amount: 0.01 })} />
            <Row k={t('create.row.open')} v={t('create.row.openDays', { count: 7 })} />
          </div>
          <label className={line + ' mt-8'}>
            <span className="text-[12px] text-muted">{t('create.deposit.label')}</span>
            <div className="mt-1 flex items-baseline gap-2">
              <input className="tnum w-full bg-transparent text-[40px] font-light leading-none tracking-[-0.04em] outline-none" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
              <span className="text-[15px] text-muted">NEAR</span>
            </div>
            <span className="mt-1 block text-[12px] text-muted">
              {t('create.deposit.hint', { locked: LOCKED_NEAR })}
              {myBalance != null && ` ${t('create.deposit.canSpend', { amount: yoctoToNear(myBalance) })}`}
            </span>
          </label>
          <div className="mt-4">
            {notCreated ? (
              <div className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
                {t('create.notCreated', { dao: daoId })}
              </div>
            ) : checkingDao ? (
              <div className="rounded-xl bg-soft px-3 py-2 text-sm text-muted">{t('create.waiting', { dao: daoId })}</div>
            ) : (
              <TxStatus state={tx.state} doneText={t('create.live')} />
            )}
          </div>
        </>
      )}

      <div className="mt-10 flex items-center justify-between gap-3 text-[14px] font-medium">
        <button className="rounded-lg px-4 py-3 text-muted hover:text-ink" onClick={() => (step === 1 ? openDao(null) : setStep(step - 1))}>
          {t('common.back')}
        </button>
        <div className="flex flex-col items-end gap-2">
          {step < 3 ? (
            <Button className="!px-6 !py-3" disabled={!!(step === 1 ? step1Error : step2Error)} onClick={() => setStep(step + 1)}>
              {step === 1 ? t('create.next.invite') : t('create.next.review')}
            </Button>
          ) : tx.state.status === 'done' && !notCreated ? (
            <Button
              className="!px-6 !py-3"
              onClick={async () => {
                if (await isDao(daoId)) openDao(daoId)
              }}
            >
              {t('create.open', { name: displayName })}
            </Button>
          ) : !accountId ? (
            <Button className="!px-6 !py-3" onClick={signIn}>{t('create.signIn')}</Button>
          ) : (
            <Button className="!px-6 !py-3" disabled={!!step3Error || tx.state.status === 'signing' || checkingDao} onClick={create}>
              {t('create.submit')}
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
      <span className={`min-w-0 break-all text-end ${mono ? 'font-mono text-[12.5px]' : ''}`}>{v}</span>
    </div>
  )
}
