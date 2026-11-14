import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { reduceMotion } from '../lib/motion'
import { DEMO_DAO, go, lastDao, openDao, shareUrl } from '../lib/store'
import { isDao } from '../lib/dao'
import { FACTORY, isValidAccountId } from '../lib/near'
import { useWallet } from '../lib/wallet'
import { RECORDED_QUOTE, getTokens, quotePayout, type QuoteResult } from '../lib/intents'
import { TIER_LIMITS_USD } from '../lib/record'
import { Spinner } from '../components/ui'
import SiteFooter from '../components/SiteFooter'
import Faq from '../components/Faq'
import { AccountChip, AccountHosts, AccountMenuItems, ThemeButton, openTerra } from '../components/AccountMenu'
import { formatDate, formatNumber, tr, useT } from '../i18n'
import { splitUsd, usd } from '../lib/format'
import { Avatar } from '../components/ui'

const ICON = `${import.meta.env.BASE_URL}favicon.svg`
const DEMO_SOL_ADDRESS = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'
const H2 = 'text-[34px] leading-none font-light tracking-[-0.035em] md:text-[44px]'
const usd0 = (n: number) => formatNumber(n, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd2 = (n: number) => formatNumber(n, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Landing() {
  const t = useT()
  const boardUrl = shareUrl(DEMO_DAO, 'board')
  useReveal()

  return (
    <div className="min-h-screen">
      <LandingNav boardUrl={boardUrl} />

      {/* Hero, over a deep blue horizon that rises behind the product preview */}
      <div className="hero-horizon relative isolate overflow-hidden">
      <section className="mx-auto max-w-[1200px] px-4 pt-12 text-center sm:px-6 md:pt-24">
        <div className="inline-flex max-w-full items-center gap-2 whitespace-nowrap rounded-full border border-line px-3 py-1 text-[11.5px] text-mute sm:text-[12.5px]">
          <span className="live size-1.5 rounded-full bg-accent" />
          <span className="truncate">{tr('landing.hero.badge', { wide: (c) => <span className="hidden sm:inline">{c}</span> })}</span>
        </div>
        <h1 className="mx-auto mt-7 max-w-[1120px] text-[40px] leading-[1] font-light tracking-[-0.045em] text-balance sm:text-[52px] md:text-[60px] md:leading-[0.98] lg:text-[68px]">
          <Words text={t('landing.hero.line1')} start={60} />
          <br />
          <Words text={t('landing.hero.line2')} start={60 + t('landing.hero.line1').split(' ').length * 50} />
        </h1>
        <p className="rise mx-auto mt-6 max-w-[560px] text-[17px] leading-relaxed text-mute" style={{ ['--d' as string]: '380ms' } as React.CSSProperties}>
          {t('landing.hero.lead')}
        </p>
        <div className="rise mt-9 flex flex-wrap justify-center gap-2 text-[14px] font-medium" style={{ ['--d' as string]: '460ms' } as React.CSSProperties}>
          <button onClick={() => go('create')} className="rounded-lg bg-accent px-5 py-3 text-on-accent">{t('landing.hero.start')}</button>
          <a href={boardUrl} className="rounded-lg border border-line bg-panel px-5 py-3">{t('landing.hero.seeLive')}</a>
        </div>
        <ResumeLink />
        <ProductPreview />
      </section>
      </div>

      {/* The story: what Terra is, in four plain steps with real bits of the app (the "How it works" target). */}
      <StorySection />

      {/* Why not a bank account or one treasurer */}
      <WhySection />

      {/* Proof strip: the technical facts, below the plain story */}
      <section className="border-y border-line">
        <div className="mx-auto grid max-w-[1200px] grid-cols-2 px-6 text-[13px] md:grid-cols-4">
          {[
            [t('landing.proof.holds'), t('landing.proof.holdsValue')],
            [t('landing.proof.quotes'), t('landing.proof.quotesValue')],
            [t('landing.proof.small'), t('landing.proof.smallValue')],
            [t('landing.proof.every'), t('landing.proof.everyValue')],
          ].map(([k, v], i) => (
            <div key={i} className={`border-line py-6 ${i % 2 === 0 ? 'border-e pe-6' : 'ps-6 md:border-e md:px-6'} ${i === 3 ? 'md:border-e-0' : ''} ${i < 2 ? 'border-b md:border-b-0' : ''}`}>
              <div className="text-mute">{k}</div>
              <div className="mt-1 font-medium">{v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="steps" className="mx-auto max-w-[1200px] px-6 py-20 md:py-28">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end md:gap-10">
          <h2 className={H2}>{tr('landing.how.title', { br: <br /> })}</h2>
          <p className="max-w-[360px] text-[14.5px] text-mute">{t('landing.how.lead')}</p>
        </div>
        <div className="reveal mt-12 rounded-2xl border border-line bg-panel p-8" data-how>
          <HowSteps steps={[
              ['01', t('landing.how.connect.tag'), t('landing.how.connect.title'), t('landing.how.connect.text')],
              ['02', t('landing.how.chipIn.tag'), t('landing.how.chipIn.title'), t('landing.how.chipIn.text')],
              ['03', t('landing.how.request.tag'), t('landing.how.request.title'), t('landing.how.request.text')],
              ['04', t('landing.how.approve.tag'), t('landing.how.approve.title'), t('landing.how.approve.text')],
          ]} />
        </div>
      </section>

      {/* Any chain */}
      <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-6 pb-20 md:grid-cols-2 md:gap-16 md:pb-28">
        <div>
          <div className="text-[13px] text-mute">{t('landing.chain.eyebrow')}</div>
          <h2 className={`mt-3 ${H2}`}>{tr('landing.chain.title', { br: <br /> })}</h2>
          <p className="mt-5 max-w-[440px] text-[15px] leading-relaxed text-mute">
            {t('landing.chain.lead')}
          </p>
          <ul className="mt-8 space-y-3 text-[14px]">
            {[t('landing.chain.point1'), t('landing.chain.point2'), t('landing.chain.point3')].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="reveal" style={{ ['--d' as string]: '90ms' } as React.CSSProperties}>
          <LiveQuoteDemo />
        </div>
      </section>

      {/* Approvals */}
      <section id="approvals" className="border-y border-line bg-panel">
        <div className="mx-auto max-w-[1200px] px-6 py-20 md:py-28">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end md:gap-10">
            <h2 className={H2}>{tr('landing.approvals.title', { br: <br /> })}</h2>
            <p className="max-w-[380px] text-[14.5px] text-mute">
              {t('landing.approvals.lead')}
            </p>
          </div>
          <div className="reveal mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
            <Tier name={t('landing.tier.small')} amount={t('landing.tier.upTo', { amount: usd0(TIER_LIMITS_USD.small) })} text={t('landing.tier.smallText')} badge />
            <Tier name={t('landing.tier.mid')} amount={t('landing.tier.upTo', { amount: usd0(TIER_LIMITS_USD.mid) })} text={t('landing.tier.midText')} />
            <Tier name={t('landing.tier.large')} amount={t('landing.tier.over', { amount: usd0(TIER_LIMITS_USD.mid) })} text={t('landing.tier.largeText')} />
          </div>
          <p className="mt-5 max-w-[720px] text-[13px] leading-relaxed text-mute">
            {t('landing.approvals.note')}
          </p>
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="mx-auto max-w-[1200px] px-6 py-20 md:py-28">
        <h2 className={H2}>{t('landing.trust.title')}</h2>
        <div className="reveal mt-12 grid gap-10 md:grid-cols-3">
          <TrustItem
            icon={<><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>}
            title={t('landing.trust.funds.title')}
            text={t('landing.trust.funds.text')}
          />
          <TrustItem icon={<path d="M5 12l4 4 10-10" />} title={t('landing.trust.receipt.title')} text={t('landing.trust.receipt.text')} />
          <TrustItem
            icon={<><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16" /></>}
            title={t('landing.trust.crossChain.title')}
            text={t('landing.trust.crossChain.text')}
          />
        </div>
        <div className="mt-16 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-8 text-[13px] text-mute">
          <span>{t('landing.trust.builtOn')}</span>
          <span className="h-4 w-px bg-line" />
          {/* i18n-ignore */}
          <span className="text-ink">Sputnik DAO</span>
          {/* i18n-ignore */}
          <span className="text-ink">NEAR Intents</span>
          <span className="text-ink">{t('landing.trust.trezu')}</span>
          <span className="text-ink">{t('landing.trust.staking')}</span>
        </div>
      </section>

      <ConnectCta />

      {/* FAQ: one story, from the treasury to NEAR Intents payouts to the public record */}
      <section id="faq" aria-labelledby="faq-h" className="scroll-mt-16 border-t border-line">
        <div className="mx-auto max-w-[1200px] px-6 py-20 md:py-28">
          <Faq
            variant="landing"
            hrefFor={(id) => `#faq-${id}`}
            intro={
              <>
                <h2 id="faq-h" className={H2}>{t('landing.faq.title')}</h2>
                <p className="mt-4 max-w-[440px] text-[16px] leading-7 text-mute">
                  {t('landing.faq.lead')}
                </p>
                <a href="#/docs?s=faq" className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-[14px] text-mute hover:text-ink">
                  {t('landing.faq.more')} <span aria-hidden className="inline-block rtl:-scale-x-100">→</span>
                </a>
              </>
            }
          />
        </div>
      </section>

      <SiteFooter boardUrl={boardUrl} />
    </div>
  )
}

function Tier({ name, amount, text, badge }: { name: string; amount: string; text: string; badge?: boolean }) {
  const t = useT()
  return (
    <div className="bg-bg p-7">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium">{name}</span>
        {badge && <span className="rounded-md bg-accent px-2 py-0.5 text-[11.5px] font-medium text-on-accent">{t('landing.tier.fastLane')}</span>}
      </div>
      <div className="tnum mt-6 text-[40px] leading-none font-light tracking-[-0.04em]">{amount}</div>
      <p className="mt-3 text-[13.5px] text-mute">{text}</p>
    </div>
  )
}

function TrustItem({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div>
      <div className="grid size-10 place-items-center rounded-xl border border-line">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </div>
      <div className="mt-5 text-[15px] font-medium">{title}</div>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-mute">{text}</p>
    </div>
  )
}

/** "Continue to <group>" for someone who has opened a group on this device before. */
function ResumeLink() {
  useT()
  const id = lastDao()
  if (!id) return null
  return (
    <div className="rise mt-4 text-[13.5px]" style={{ ['--d' as string]: '500ms' } as React.CSSProperties}>
      <button onClick={() => openDao(id)} className="min-h-11 text-start text-mute underline-offset-2 hover:text-ink hover:underline">
        {tr('landing.resume', { id: <span className="font-mono text-[12.5px]">{id}</span> })} <span aria-hidden className="inline-block rtl:-scale-x-100">→</span>
      </button>
    </div>
  )
}

/** Static preview of Home with made-up numbers (not interactive). */
function ProductPreview() {
  const t = useT()
  const [tilt, setTilt] = useState(10)
  useEffect(() => {
    const on = () => setTilt(Math.max(0, 10 - (window.scrollY / 400) * 10))
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <div className="relative mx-auto mt-16 max-w-[1080px]" style={{ perspective: '1600px' }}>
      <FloatCard side="left" delay={1300} title={t('landing.preview.paidAgo')} text={t('landing.preview.arrived')} />
      <FloatCard side="right" delay={1450} title={t('landing.preview.approvedBy', { name: 'ravi' })} text={t('landing.preview.fastLaneVotes')} />
      <div className="rise" style={{ ['--d' as string]: '540ms', animationDuration: '1s' } as React.CSSProperties}>
    <div
      className="relative rounded-t-2xl border border-b-0 border-line bg-panel p-2 pb-0 text-start"
      aria-hidden
      style={{ transform: `rotateX(${tilt}deg)`, transformOrigin: '50% 0%', transition: 'transform 120ms linear' }}
    >
      <div className="grid overflow-hidden rounded-t-xl border border-b-0 border-line bg-bg md:grid-cols-[180px_1fr]">
        <aside className="hidden border-e border-line px-3 py-4 text-[12px] text-mute md:block">
          <div className="flex items-center gap-1.5 px-2 text-ink">
            <img src={ICON} alt="" className="size-5 rounded-[5px]" />
            <span className="font-medium">terra</span>
          </div>
          <div className="mt-5 space-y-px">
            <div className="rounded-md bg-panel px-2.5 py-1.5 text-ink ring-1 ring-line">{t('landing.preview.nav.home')}</div>
            <div className="px-2.5 py-1.5">{t('landing.preview.nav.pay')}</div>
            <div className="flex justify-between px-2.5 py-1.5">
              {t('landing.preview.nav.approve')}<span className="grid size-4 place-items-center rounded-full bg-accent text-[9px] text-on-accent">2</span>
            </div>
            <div className="px-2.5 py-1.5">{t('landing.preview.nav.members')}</div>
            <div className="px-2.5 py-1.5">{t('landing.preview.nav.board')}</div>
          </div>
        </aside>
        <div className="px-5 py-6 md:px-8 md:py-7">
          <div className="text-[12px] text-mute">{t('landing.preview.holds', { name: 'City Club' })}</div>
          <div className="tnum mt-1 text-[48px] leading-[0.9] font-light tracking-[-0.055em] md:text-[64px]">
            {splitUsd(1240)[0]}<span className="text-mute">{splitUsd(1240)[1]}</span>
          </div>
          <div className="mt-3 flex gap-4 text-[12px] text-mute">
            {/* i18n-ignore */}
            <span>{formatNumber(412.6)} NEAR</span>
            <span className="text-accent-text">{t('landing.preview.earning')}</span>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-[1fr_300px]">
            <div className="text-[12.5px]">
              <Row l={t('landing.preview.poster')} d={t('landing.usdcOnSolana')} a="−$20.00" />
              <Row l={t('landing.preview.chippedIn', { name: 'ana' })} d="5 NEAR" a="+$15.02" good />
              <Row l={t('landing.preview.venue')} d={t('landing.preview.fullVote')} a="−$300.00" last />
            </div>
            <div className="rounded-xl bg-hero p-4 text-on-hero ring-1 ring-[var(--hero-ring)]">
              <div className="flex justify-between text-[11px] opacity-60">
                <span>{t('landing.preview.asking', { name: 'ravi' })}</span>
                <span>{t('landing.preview.smallDecide')}</span>
              </div>
              <div className="tnum mt-3 text-[36px] leading-none font-light tracking-[-0.045em]">
                $20<span className="opacity-40">.00</span>
              </div>
              <div className="mt-1 text-[12px]">{t('landing.preview.forPoster')}</div>
              <div className="mt-3 grid grid-cols-[1fr_auto] gap-1.5 text-[12px] font-medium">
                <span className="rounded-md bg-accent py-1.5 text-center text-on-accent">{t('landing.preview.approvePay')}</span>
                <span className="rounded-md bg-white/10 px-3 py-1.5">{t('landing.preview.notNow')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--bg)] to-transparent" />
    </div>
      </div>
    </div>
  )
}

function FloatCard({ side, delay, title, text }: { side: 'left' | 'right'; delay: number; title: string; text: string }) {
  return (
    <div
      className={`pointer-events-none absolute z-10 hidden xl:block ${side === 'left' ? '-start-40 top-[300px]' : '-end-20 top-56'}`}
      aria-hidden
    >
      <div className="pop" style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}>
        <div className="float rounded-xl border border-line bg-panel px-4 py-3 text-start text-[12.5px]" style={{ ['--d' as string]: side === 'left' ? '0ms' : '-3s' } as React.CSSProperties}>
          <div className="flex items-center gap-2">
            <span className="grid size-4 place-items-center rounded-full bg-accent text-on-accent">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
            </span>
            <span className="font-medium">{title}</span>
          </div>
          <div className="mt-1 text-mute">{text}</div>
        </div>
      </div>
    </div>
  )
}

/** Section ids on the landing; labels are `landing.nav.<id>`. Only "how" shows on the desktop bar below lg. */
const NAV_IDS = ['how', 'approvals', 'trust', 'faq'] as const

/**
 * Landing nav: transparent at the top, frosted once you scroll; one accent button; account chip when signed in.
 * Also used by the public board, where section links point back to the landing (`home="./"`) and the
 * signed-out primary is "Join <group>".
 */
export function LandingNav({
  boardUrl,
  home = '',
  current,
  joinCta,
}: {
  boardUrl: string
  home?: string
  current?: 'board' | 'docs'
  joinCta?: { label: string; onClick: () => void }
}) {
  const t = useT()
  const { accountId } = useWallet()
  const [scrolled, setScrolled] = useState(false)
  const navLabel: Record<(typeof NAV_IDS)[number], string> = {
    how: t('landing.nav.how'),
    approvals: t('landing.nav.approvals'),
    trust: t('landing.nav.trust'),
    faq: t('landing.nav.faq'),
  }
  const [active, setActive] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  // Highlight the section in view: the one crossing a band just under the nav.
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const els = NAV_IDS.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e)
    const seen = new Map<string, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting))
        setActive(NAV_IDS.find((id) => seen.get(id)) ?? null)
      },
      { rootMargin: '-80px 0px -55% 0px' },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  const primary = !accountId && joinCta ? (
    <button type="button" onClick={joinCta.onClick} className="inline-flex h-11 max-w-[11rem] items-center rounded-lg bg-accent px-4 text-[13.5px] font-medium whitespace-nowrap text-on-accent hover:bg-brand-strong md:h-10 lg:max-w-none">
      <span className="lg:hidden">{t('landing.nav.join')}</span>
      <span className="hidden truncate lg:inline">{joinCta.label}</span>
    </button>
  ) : accountId ? (
    <button type="button" onClick={openTerra} className="inline-flex h-11 md:h-10 items-center rounded-lg bg-accent px-4 text-[13.5px] font-medium whitespace-nowrap text-on-accent hover:bg-brand-strong">
      {t('landing.nav.openTerra')} <span aria-hidden className="ms-1.5 inline-block rtl:-scale-x-100">→</span>
    </button>
  ) : (
    <a href="#connect" className="inline-flex h-11 md:h-10 items-center rounded-lg bg-accent px-4 text-[13.5px] font-medium whitespace-nowrap text-on-accent hover:bg-brand-strong">
      <span className="lg:hidden">{t('landing.nav.connect')}</span>
      <span className="hidden lg:inline">{t('landing.nav.connectTreasury')}</span>
    </a>
  )

  return (
    // Floats: no edge-to-edge strip. At the top it's transparent; once you scroll, the whole nav becomes
    // one rounded frosted card inset from the edges. Total height stays 64px (pt-3 + 52px) for sticky offsets.
    <header className="pointer-events-none sticky top-0 z-30 h-16 px-2 pt-3 sm:px-3">
      <AccountHosts />
      <div
        className={`pointer-events-auto relative mx-auto flex h-[52px] max-w-[1200px] items-center gap-3 rounded-2xl border px-2 transition-[background-color,border-color] duration-200 sm:px-4 ${scrolled ? 'glass' : 'border-transparent bg-transparent'}`}
      >
        <a href={home || '#'} className="-ms-1 flex h-11 items-center gap-2 rounded-lg px-1 md:h-10" aria-label={t('common.terraHome')}>
          <img src={ICON} alt="" className="size-7 rounded-[7px]" />
          <span className="text-[16px] font-medium tracking-tight">terra</span>
        </a>

        {/* Desktop: three links in a small frosted pill, centred between the logo and the actions (Maaz picked option B). */}
        <div className="pointer-events-none hidden flex-1 justify-center md:flex lg:absolute lg:inset-x-0">
          <nav aria-label={t('landing.nav.sections')} className="glass pointer-events-auto flex items-center gap-0.5 rounded-full p-1 text-[13.5px] whitespace-nowrap">
            <a
              href={`${home}#how`}
              aria-current={!current && active === 'how' ? 'true' : undefined}
              className={`flex h-9 items-center rounded-full px-4 transition-colors ${!current && active === 'how' ? 'bg-[var(--glass-active)] text-ink' : 'text-mute hover:text-ink'}`}
            >
              {navLabel.how}
            </a>
            <a
              href={boardUrl}
              aria-current={current === 'board' ? 'page' : undefined}
              className={`flex h-9 items-center rounded-full px-4 transition-colors ${current === 'board' ? 'bg-[var(--glass-active)] text-ink' : 'text-mute hover:text-ink'}`}
            >
              {t('landing.nav.board')}
            </a>
            <a
              href={`${home}#/docs`}
              aria-current={current === 'docs' ? 'page' : undefined}
              className={`flex h-9 items-center rounded-full px-4 transition-colors ${current === 'docs' ? 'bg-[var(--glass-active)] text-ink' : 'text-mute hover:text-ink'}`}
            >
              {t('landing.nav.docs')}
            </a>
          </nav>
        </div>

        <div className="hidden items-center gap-2 md:flex lg:ms-auto">
          {accountId ? (
            <AccountChip />
          ) : (
            <button type="button" onClick={() => go('signin')} className="inline-flex h-10 items-center rounded-lg px-3 text-[13.5px] font-medium whitespace-nowrap hover:bg-sand">
              {t('landing.nav.signIn')}
            </button>
          )}
          {primary}
        </div>

        <div className="ms-auto flex items-center gap-1.5 md:hidden">
          {primary}
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-label={t('landing.nav.openMenu')}
            aria-expanded={menu}
            className="grid size-11 place-items-center rounded-lg text-ink hover:bg-sand"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>

      {menu && createPortal(
        <div className="fixed inset-0 z-50 grid items-end glass-scrim md:hidden" onClick={() => setMenu(false)} role="dialog" aria-modal aria-label={t('landing.nav.menu')}>
          <div
            className="max-h-[90vh] w-full overflow-y-auto glass glass-sheet rounded-t-2xl border border-line bg-card p-3 pb-[max(env(safe-area-inset-bottom),12px)] text-ink"
            onClick={(e) => e.stopPropagation()}
          >
            <nav aria-label={t('landing.nav.sections')} className="flex flex-col">
              {NAV_IDS.map((id) => (
                <a key={id} href={`${home}#${id}`} onClick={() => setMenu(false)} className="flex min-h-12 items-center rounded-lg px-3 text-[15px] hover:bg-soft">
                  {navLabel[id]}
                </a>
              ))}
              <a href={boardUrl} className="flex min-h-12 items-center rounded-lg px-3 text-[15px] hover:bg-soft">{t('landing.nav.board')}</a>
              <a href={`${home}#/docs`} onClick={() => setMenu(false)} aria-current={current === 'docs' ? 'page' : undefined} className="flex min-h-12 items-center rounded-lg px-3 text-[15px] hover:bg-soft">{t('landing.nav.docs')}</a>
            </nav>
            <div className="my-2 h-px bg-line" />
            {accountId ? (
              <AccountMenuItems onDone={() => setMenu(false)} />
            ) : (
              <div className="flex items-center justify-between gap-2 px-1">
                <button type="button" onClick={() => go('signin')} className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-line bg-card text-[14px] font-medium">
                  {t('landing.nav.signIn')}
                </button>
                <ThemeButton className="size-11 border border-line" />
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </header>
  )
}

function Words({ text, start }: { text: string; start: number }) {
  return (
    <>
      {text.split(' ').map((w, i) => (
        <span key={i}>
          <span className="wr">
            <span style={{ ['--d' as string]: `${start + i * 50}ms` } as React.CSSProperties}>{w}</span>
          </span>
          {i < text.split(' ').length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  )
}

/** Adds .in to .reveal elements as they scroll into view (15% visible). */
function useReveal() {
  useEffect(() => {
    const els = [...document.querySelectorAll('.reveal')]
    if (!('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.15 },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])
}

/** How it works: a line draws across the four steps once the panel is in view. */
/** Four cards that tell one concrete story, each with a small piece of the real app. Reveals in order. */
function StorySection() {
  const t = useT()
  const card = 'reveal relative flex flex-col rounded-2xl border border-line bg-panel p-5'
  const ui = 'mt-5 rounded-xl border border-line bg-bg p-4 text-start'
  const steps = [
    {
      title: t('landing.story.s1.title'),
      text: t('landing.story.s1.text'),
      icon: 'M12 3v18M5 8h11a3 3 0 010 6H8a3 3 0 000 6h11',
      ui: (
        <div className={ui}>
          <div className="text-[11.5px] text-mute">{t('landing.story.s1.ui')}</div>
          <div className="tnum mt-1 text-[30px] leading-none font-light tracking-[-0.04em]">{usd(1240)}</div>
          <div className="mt-3 flex -space-x-1.5">
            {['priya', 'ravi', 'ana', 'ben'].map((id) => (
              <span key={id} className="rounded-full ring-2 ring-[var(--bg)]"><Avatar id={id} size={22} shape="circle" /></span>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: t('landing.story.s2.title'),
      text: t('landing.story.s2.text'),
      icon: 'M12 5v14M5 12h14',
      ui: (
        <div className={ui}>
          <div className="flex items-center gap-2 text-[11.5px] text-mute">
            <Avatar id="ravi" size={18} shape="circle" />
            {t('landing.story.s2.who')}
          </div>
          <div className="tnum mt-2 text-[26px] leading-none font-light tracking-[-0.04em]">{usd(20)}</div>
          <div className="mt-1.5 text-[12.5px]">{t('landing.story.s2.ui')}</div>
        </div>
      ),
    },
    {
      title: t('landing.story.s3.title'),
      text: t('landing.story.s3.text'),
      icon: 'M5 13l4 4L19 7',
      ui: (
        <div className={ui}>
          <div className="flex items-center justify-between text-[11.5px] text-mute">
            <span className="flex -space-x-1.5">
              {['priya', 'ana'].map((id) => (
                <span key={id} className="rounded-full ring-2 ring-[var(--bg)]"><Avatar id={id} size={20} shape="circle" /></span>
              ))}
            </span>
            {t('landing.story.s3.count')}
          </div>
          <div className="mt-3 h-[3px] rounded-full bg-sand"><div className="h-[3px] w-full rounded-full bg-accent" /></div>
          <div className="mt-3 grid place-items-center rounded-lg bg-accent py-2 text-[13px] font-medium text-on-accent">{t('landing.story.s3.ui')}</div>
        </div>
      ),
    },
    {
      title: t('landing.story.s4.title'),
      text: t('landing.story.s4.text'),
      icon: 'M4 12h14M13 6l6 6-6 6',
      ui: (
        <div className={ui}>
          <div className="flex items-center gap-2 text-[11.5px] text-mute">
            <span className="grid size-4 place-items-center rounded-full bg-accent text-on-accent">
              <svg viewBox="0 0 24 24" className="size-2.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
            </span>
            {t('landing.story.s4.ui')}
          </div>
          <div className="tnum mt-2 text-[22px] leading-tight font-light tracking-[-0.03em]">{t('landing.story.s4.amount')}</div>
        </div>
      ),
    },
  ]
  return (
    <section id="how" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-20 sm:px-6 md:py-24">
      <div className="max-w-[640px]">
        <div className="text-[13px] text-mute">{t('landing.story.eyebrow')}</div>
        <h2 className={`${H2} mt-3`}>{t('landing.story.title')}</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-mute">{t('landing.story.lead')}</p>
      </div>
      <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((st, i) => (
          <li key={i} className={card} style={{ ['--d' as string]: `${i * 120}ms` } as React.CSSProperties}>
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full border border-line text-ink" aria-hidden>
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={st.icon} /></svg>
              </span>
              <span className="text-[12px] text-mute">{t('landing.story.step', { n: String(i + 1) })}</span>
            </div>
            <h3 className="mt-4 text-[17px] font-medium tracking-[-0.01em]">{st.title}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-mute">{st.text}</p>
            <div className="mt-auto">{st.ui}</div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** "Why not just a bank account or one treasurer?" in three plain benefits. */
function WhySection() {
  const t = useT()
  const items = [
    ['M12 11V7a4 4 0 118 0M5 11h14v10H5z', t('landing.why.b1.title'), t('landing.why.b1.text')],
    ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z', t('landing.why.b2.title'), t('landing.why.b2.text')],
    ['M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18', t('landing.why.b3.title'), t('landing.why.b3.text')],
  ]
  return (
    <section className="mx-auto max-w-[1200px] px-4 pb-20 sm:px-6 md:pb-28">
      <h2 className={`${H2} max-w-[720px]`}>{t('landing.why.title')}</h2>
      <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
        {items.map(([d, title, text], i) => (
          <div key={i} className="reveal bg-panel p-6" style={{ ['--d' as string]: `${i * 100}ms` } as React.CSSProperties}>
            <svg viewBox="0 0 24 24" className="size-5 text-ink" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
            <h3 className="mt-4 text-[16px] font-medium">{title}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-mute">{text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function HowSteps({ steps }: { steps: string[][] }) {
  const [reached, setReached] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let timers: ReturnType<typeof setTimeout>[] = []
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        io.disconnect()
        timers = steps.map((_, i) => setTimeout(() => setReached(i + 1), reduceMotion ? 0 : 200 + i * 650))
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      timers.forEach(clearTimeout)
    }
  }, [steps.length])
  return (
    <div ref={ref}>
      <div className="relative h-px bg-line">
        <div className="absolute inset-y-0 start-0 bg-ink transition-[width] duration-[650ms] ease-out" style={{ width: `${(reached / steps.length) * 100}%` }} />
      </div>
      <div className="mt-0 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([n, tag, title, d], i) => (
          <div key={n} className="transition-opacity duration-500" style={{ opacity: i < reached ? 1 : 0.45 }}>
            <div className="mt-5 flex items-center gap-2 text-[12px]">
              <span className="font-mono text-mute">{n}</span>
              <span className="rounded-md border border-line px-2 py-0.5">{tag}</span>
            </div>
            <div className="mt-4 text-[15px] font-medium">{title}</div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-mute">{d}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Row({ l, d, a, good, last }: { l: string; d: string; a: string; good?: boolean; last?: boolean }) {
  return (
    <div className={`flex justify-between py-2.5 ${last ? '' : 'border-b border-line'}`}>
      <span>
        {l} <span className="text-mute">· {d}</span>
      </span>
      <span className={`tnum ${good ? 'text-moss' : ''}`}>{a}</span>
    </div>
  )
}

/** The same live NEAR Intents quote as Pay, with demo values. Falls back to a labelled saved quote. */
function LiveQuoteDemo() {
  const t = useT()
  const [q, setQ] = useState<QuoteResult | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let alive = true
    getTokens()
      .then((tokens) => {
        const usdc = tokens.find((tok) => tok.symbol === 'USDC' && tok.blockchain === 'sol')
        if (!usdc) throw new Error('no token')
        return quotePayout({ destinationAsset: usdc.assetId, amountOutUnits: '20000000', recipient: DEMO_SOL_ADDRESS })
      })
      .then((r) => alive && setQ(r))
      .catch(() => alive && setQ(RECORDED_QUOTE))
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])
  const age = q ? Math.max(0, Math.round((now - new Date(q.timestamp).getTime()) / 1000)) : 0
  const fees = q ? Math.max(0, Number(q.quote.amountInUsd) - Number(q.quote.amountOutUsd)) : 0
  return (
    <div className="rounded-2xl border border-line bg-panel p-7">
      <div className="flex items-center justify-between text-[12px] text-mute">
        <span>{q?.recorded ? t('landing.quote.saved') : t('landing.quote.live')}</span>
        <span className="flex items-center gap-1.5">
          {q ? (
            <>
              <span className={`size-1.5 rounded-full ${q.recorded ? 'bg-warn' : 'animate-pulse bg-accent'}`} />
              {q.recorded
                ? t('landing.quote.recorded', { date: formatDate(new Date(q.timestamp), { day: 'numeric', month: 'short' }) })
                : age < 60
                  ? t('landing.quote.secondsAgo', { count: age })
                  : t('landing.quote.minutesAgo', { count: Math.round(age / 60) })}
            </>
          ) : (
            <Spinner />
          )}
        </span>
      </div>
      <div className="mt-6 text-[12px] text-mute">{t('landing.quote.designerGets')}</div>
      <div className="tnum mt-1 text-[44px] leading-none font-light tracking-[-0.05em] md:text-[56px]">
        {formatNumber(20, { minimumFractionDigits: 2 })} <span className="text-[20px] tracking-normal text-mute">{t('landing.usdcOnSolana')}</span>
      </div>
      <div className="mt-7 text-[13.5px]">
        <QRow k={t('landing.quote.sends', { name: 'City Club' })} v={q ? `${formatNumber(Number(q.quote.amountInFormatted), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NEAR · ${usd2(Number(q.quote.amountInUsd))}` : '…'} />
        <QRow k={t('landing.quote.arrives')} v={q ? t('landing.quote.aboutSeconds', { count: Number(q.quote.timeEstimate) }) : '…'} />
        <QRow k={t('landing.quote.fees')} v={q ? usd2(fees) : '…'} />
      </div>
    </div>
  )
}

function QRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-t border-line py-3">
      <span className="text-mute">{k}</span>
      <span className="tnum">{v}</span>
    </div>
  )
}

function ConnectCta() {
  const t = useT()
  const [name, setName] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { accountId } = useWallet()

  async function connect() {
    let id = name.trim().toLowerCase()
    if (!id) return
    if (!id.includes('.')) id = `${id}.${FACTORY}`
    if (!isValidAccountId(id)) {
      setError(t('landing.connect.invalid'))
      return
    }
    setChecking(true)
    setError(null)
    const ok = await isDao(id)
    setChecking(false)
    if (!ok) {
      setError(t('landing.connect.notFound', { id }))
      return
    }
    openDao(id, accountId ? 'home' : 'signin')
  }

  return (
    <section id="connect" className="mx-auto max-w-[1200px] px-6 pb-20 md:pb-28">
      <div className="reveal relative overflow-hidden rounded-3xl bg-hero px-8 py-12 text-on-hero ring-1 ring-[var(--hero-ring)] md:px-14 md:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_440px] lg:gap-12">
          <div>
            <img src={ICON} alt="" className="size-12 rounded-xl" />
            <h2 className="mt-6 text-[34px] leading-none font-light tracking-[-0.035em] md:text-[44px]">
              {tr('landing.connect.title', { br: <br /> })}
            </h2>
          </div>
          <form
            className="min-w-0"
            onSubmit={(e) => {
              e.preventDefault()
              connect()
            }}
          >
            <label htmlFor="dao-name" className="text-[12px] opacity-60">{t('landing.connect.label')}</label>
            <div className="mt-2 flex gap-2">
              <input
                id="dao-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
                placeholder={`your-club.${FACTORY}`}
                spellCheck={false}
                className="min-w-0 flex-1 rounded-lg bg-white/[0.08] px-4 py-3 font-mono text-[13.5px] outline-none ring-1 ring-white/10 placeholder:text-white/35 focus:ring-[var(--accent)]"
              />
              <button type="submit" disabled={checking || !name.trim()} className="rounded-lg bg-accent px-5 text-[14px] font-medium text-on-accent disabled:opacity-60">
                {checking ? <Spinner /> : t('landing.connect.submit')}
              </button>
            </div>
            {error ? (
              <p className="mt-3 flex items-center gap-2 text-[12.5px]">
                <span className="size-1.5 rounded-full bg-bad" />
                <span className="opacity-80">{error}</span>
              </p>
            ) : (
              <p className="mt-3 text-[12.5px] opacity-60">
                {tr('landing.connect.noDao', {
                  create: (c) => (
                    <button type="button" className="relative underline underline-offset-2 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']" onClick={() => go('create')}>
                      {c}
                    </button>
                  ),
                  look: (c) => (
                    <button type="button" className="relative underline underline-offset-2 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']" onClick={() => openDao(DEMO_DAO)}>
                      {c}
                    </button>
                  ),
                  name: 'nearHack Community',
                })}
              </p>
            )}
          </form>
        </div>
      </div>
    </section>
  )
}
