import { useEffect, useRef, useState } from 'react'
import { reduceMotion } from '../lib/motion'
import { DEMO_DAO, go, openDao, shareUrl } from '../lib/store'
import { isDao } from '../lib/dao'
import { FACTORY, isValidAccountId } from '../lib/near'
import { useWallet } from '../lib/wallet'
import { shortName } from '../lib/format'
import { applyTheme, getTheme, type Theme } from '../lib/theme'
import { RECORDED_QUOTE, getTokens, quotePayout, type QuoteResult } from '../lib/intents'
import { TIER_LIMITS_USD } from '../lib/record'
import { Spinner } from '../components/ui'

const ICON = `${import.meta.env.BASE_URL}favicon.svg`
const DEMO_SOL_ADDRESS = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'
const H2 = 'text-[34px] leading-none font-light tracking-[-0.035em] md:text-[44px]'

export default function Landing() {
  const { accountId, signOut } = useWallet()
  const [theme, setTheme] = useState<Theme>(getTheme)
  const boardUrl = shareUrl(DEMO_DAO, 'board')
  useReveal()

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-6">
          <a href="#" className="flex items-center gap-2">
            <img src={ICON} alt="" className="size-7 rounded-[7px]" />
            <span className="text-[16px] font-medium tracking-tight">terra</span>
          </a>
          <nav className="hidden gap-6 text-[13.5px] text-mute md:flex">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#approvals" className="hover:text-ink">Approvals</a>
            <a href="#trust" className="hover:text-ink">Trust</a>
            <a href={boardUrl} className="hover:text-ink">Live board</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 text-[13.5px] font-medium">
            <button
              className="hidden rounded-lg px-3 py-2 text-mute hover:text-ink sm:block"
              onClick={() => {
                const next = theme === 'dark' ? 'light' : 'dark'
                applyTheme(next)
                setTheme(next)
              }}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            {accountId ? (
              <button className="rounded-lg px-3 py-2 text-mute hover:text-ink" onClick={signOut} title={accountId}>
                {shortName(accountId)} · Sign out
              </button>
            ) : (
              <button className="rounded-lg px-3 py-2 hover:bg-sand" onClick={() => go('signin')}>Sign in</button>
            )}
            <a href="#connect" className="rounded-lg bg-accent px-4 py-2 text-on-accent">Connect a treasury</a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1200px] px-6 pt-16 text-center md:pt-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[12.5px] text-mute">
          <span className="live size-1.5 rounded-full bg-accent" />
          Works with any Sputnik DAO or Trezu treasury on NEAR
        </div>
        <h1 className="mx-auto mt-7 max-w-[900px] text-[44px] leading-[0.98] font-light tracking-[-0.045em] md:text-[72px]">
          <Words text="Your community's money," start={120} />
          <br />
          <Words text="run by its members." start={120 + 3 * 70} />
        </h1>
        <p className="rise mx-auto mt-6 max-w-[560px] text-[17px] leading-relaxed text-mute" style={{ ['--d' as string]: '650ms' } as React.CSSProperties}>
          Chip in, ask for money, approve it. Your record decides how fast. The treasury pays anyone, in the coin they want, on the chain they use.
        </p>
        <div className="rise mt-9 flex flex-wrap justify-center gap-2 text-[14px] font-medium" style={{ ['--d' as string]: '760ms' } as React.CSSProperties}>
          <a href="#connect" className="rounded-lg bg-accent px-5 py-3 text-on-accent">Connect your treasury</a>
          <a href={boardUrl} className="rounded-lg border border-line bg-panel px-5 py-3">See a live board</a>
        </div>
        <ProductPreview />
      </section>

      {/* Proof strip */}
      <section className="border-y border-line">
        <div className="mx-auto grid max-w-[1200px] grid-cols-2 px-6 text-[13px] md:grid-cols-4">
          {[
            ['Holds the money', 'Your own DAO, not us'],
            ['Pays out to', 'Any chain, via NEAR Intents'],
            ['Small requests', 'Approved in minutes'],
            ['Every payout', 'Public, with a receipt'],
          ].map(([k, v], i) => (
            <div key={k} className={`border-line py-6 ${i % 2 === 0 ? 'border-r pr-6' : 'pl-6 md:border-r md:px-6'} ${i === 3 ? 'md:border-r-0' : ''} ${i < 2 ? 'border-b md:border-b-0' : ''}`}>
              <div className="text-mute">{k}</div>
              <div className="mt-1 font-medium">{v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[1200px] px-6 py-20 md:py-28">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end md:gap-10">
          <h2 className={H2}>
            From treasury to payout
            <br />
            in four steps.
          </h2>
          <p className="max-w-[360px] text-[14.5px] text-mute">No new wallet for the group and no new contract. Terra sits on top of the treasury you already have.</p>
        </div>
        <div className="reveal mt-12 rounded-2xl border border-line bg-panel p-8" data-how>
          <HowSteps steps={[
              ['01', 'Connect', 'Connect your treasury', "Type your DAO's name. Members sign in with their NEAR account."],
              ['02', 'Chip in', 'Members chip in', 'Everyone sees one balance in dollars, and where every cent went.'],
              ['03', 'Request', 'Ask for money', "Say what it's for and who gets paid. A live quote shows what they receive."],
              ['04', 'Approve', 'Approve and pay', 'Enough approvals and the treasury pays out itself. No one holds the keys alone.'],
          ]} />
        </div>
      </section>

      {/* Any chain */}
      <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-6 pb-20 md:grid-cols-2 md:gap-16 md:pb-28">
        <div>
          <div className="text-[13px] text-mute">Pay anyone, anywhere</div>
          <h2 className={`mt-3 ${H2}`}>
            They get paid in what
            <br />
            they actually use.
          </h2>
          <p className="mt-5 max-w-[440px] text-[15px] leading-relaxed text-mute">
            A designer wants USDC on Solana. A venue wants NEAR. Terra shows a live quote before anyone approves, so the group knows exactly what leaves and what arrives.
          </p>
          <ul className="mt-8 space-y-3 text-[14px]">
            {['Amounts in dollars first, tokens second', 'USDC on Solana, Base, Ethereum, or NEAR', 'The quote is saved with the request'].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                {t}
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
            <h2 className={H2}>
              Trust is earned,
              <br />
              so approvals scale with it.
            </h2>
            <p className="max-w-[380px] text-[14.5px] text-mute">
              Each member has a record, built from the treasury's own history: requests paid and requests turned down. A clean record opens the fast lane for small amounts.
            </p>
          </div>
          <div className="reveal mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
            <Tier name="Small" amount={`Up to $${TIER_LIMITS_USD.small}`} text="One trusted member approves. Paid in minutes." badge />
            <Tier name="Mid" amount={`Up to $${TIER_LIMITS_USD.mid}`} text="The council signs off." />
            <Tier name="Large" amount={`Over $${TIER_LIMITS_USD.mid}`} text="The council votes, and every member sees it on the board." />
          </div>
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="mx-auto max-w-[1200px] px-6 py-20 md:py-28">
        <h2 className={H2}>Nobody holds your money but you.</h2>
        <div className="reveal mt-12 grid gap-10 md:grid-cols-3">
          <TrustItem
            icon={<><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>}
            title="Your DAO keeps the funds"
            text="Money stays in your Sputnik DAO. Terra only creates requests; the treasury's own rules pay them out."
          />
          <TrustItem icon={<path d="M5 12l4 4 10-10" />} title="Every payout has a receipt" text="Each payment links to its record on NEAR. Share a read-only board with sponsors or anyone." />
          <TrustItem
            icon={<><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16" /></>}
            title="Cross-chain, without bridges"
            text="Payouts to other chains go through NEAR Intents. Recipients don't need a NEAR account."
          />
        </div>
        <div className="mt-16 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-8 text-[13px] text-mute">
          <span>Built on NEAR</span>
          <span className="h-4 w-px bg-line" />
          <span className="text-ink">Sputnik DAO</span>
          <span className="text-ink">NEAR Intents</span>
          <span className="text-ink">Trezu compatible</span>
          <span className="text-ink">Native staking</span>
        </div>
      </section>

      <ConnectCta />

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-[12.5px] text-mute">
          <span className="flex items-center gap-2 text-ink">
            <img src={ICON} alt="" className="size-5 rounded-[5px]" />
            terra
          </span>
          <span>The members' app for community treasuries.</span>
          <span className="ml-auto">Testnet demo</span>
          <a href="https://github.com/somewherelostt/terra" className="hover:text-ink">GitHub</a>
        </div>
      </footer>
    </div>
  )
}

function Tier({ name, amount, text, badge }: { name: string; amount: string; text: string; badge?: boolean }) {
  return (
    <div className="bg-bg p-7">
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium">{name}</span>
        {badge && <span className="rounded-md bg-accent px-2 py-0.5 text-[11.5px] font-medium text-on-accent">Fast lane</span>}
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

/** Static preview of Home with demo data (not interactive). */
function ProductPreview() {
  const [tilt, setTilt] = useState(10)
  useEffect(() => {
    const on = () => setTilt(Math.max(0, 10 - (window.scrollY / 400) * 10))
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <div className="relative mx-auto mt-16 max-w-[1080px]" style={{ perspective: '1600px' }}>
      <FloatCard side="left" delay={1700} title="Paid · 2 min ago" text="20.00 USDC arrived on Solana" />
      <FloatCard side="right" delay={1850} title="ravi approved" text="Fast lane · 1 of 1" />
      <div className="rise" style={{ ['--d' as string]: '850ms', animationDuration: '1s' } as React.CSSProperties}>
    <div
      className="relative rounded-t-2xl border border-b-0 border-line bg-panel p-2 pb-0 text-left"
      aria-hidden
      style={{ transform: `rotateX(${tilt}deg)`, transformOrigin: '50% 0%', transition: 'transform 120ms linear' }}
    >
      <div className="grid overflow-hidden rounded-t-xl border border-b-0 border-line bg-bg md:grid-cols-[180px_1fr]">
        <aside className="hidden border-r border-line px-3 py-4 text-[12px] text-mute md:block">
          <div className="flex items-center gap-1.5 px-2 text-ink">
            <img src={ICON} alt="" className="size-5 rounded-[5px]" />
            <span className="font-medium">terra</span>
          </div>
          <div className="mt-5 space-y-px">
            <div className="rounded-md bg-panel px-2.5 py-1.5 text-ink ring-1 ring-line">Home</div>
            <div className="px-2.5 py-1.5">Pay</div>
            <div className="flex justify-between px-2.5 py-1.5">
              Approve<span className="grid size-4 place-items-center rounded-full bg-accent text-[9px] text-on-accent">2</span>
            </div>
            <div className="px-2.5 py-1.5">Members</div>
            <div className="px-2.5 py-1.5">Board</div>
          </div>
        </aside>
        <div className="px-5 py-6 md:px-8 md:py-7">
          <div className="text-[12px] text-mute">City Club holds</div>
          <div className="tnum mt-1 text-[48px] leading-[0.9] font-light tracking-[-0.055em] md:text-[64px]">
            $1,240<span className="text-mute">.00</span>
          </div>
          <div className="mt-3 flex gap-4 text-[12px] text-mute">
            <span>412.6 NEAR</span>
            <span className="text-accent-text">Earning on 200 NEAR staked</span>
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-[1fr_300px]">
            <div className="text-[12.5px]">
              <Row l="Poster design" d="USDC on Solana" a="−$20.00" />
              <Row l="ana chipped in" d="5 NEAR" a="+$15.02" good />
              <Row l="Venue deposit" d="full vote" a="−$300.00" last />
            </div>
            <div className="rounded-xl bg-hero p-4 text-on-hero ring-1 ring-[var(--hero-ring)]">
              <div className="flex justify-between text-[11px] opacity-60">
                <span>ravi is asking</span>
                <span>Small · you decide</span>
              </div>
              <div className="tnum mt-3 text-[36px] leading-none font-light tracking-[-0.045em]">
                $20<span className="opacity-40">.00</span>
              </div>
              <div className="mt-1 text-[12px]">for the meetup poster</div>
              <div className="mt-3 grid grid-cols-[1fr_auto] gap-1.5 text-[12px] font-medium">
                <span className="rounded-md bg-accent py-1.5 text-center text-on-accent">Approve and pay</span>
                <span className="rounded-md bg-white/10 px-3 py-1.5">Not now</span>
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
      className={`pointer-events-none absolute z-10 hidden xl:block ${side === 'left' ? '-left-40 top-[300px]' : '-right-20 top-56'}`}
      aria-hidden
    >
      <div className="pop" style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}>
        <div className="float rounded-xl border border-line bg-panel px-4 py-3 text-left text-[12.5px]" style={{ ['--d' as string]: side === 'left' ? '0ms' : '-3s' } as React.CSSProperties}>
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

function Words({ text, start }: { text: string; start: number }) {
  return (
    <>
      {text.split(' ').map((w, i) => (
        <span key={i}>
          <span className="wr">
            <span style={{ ['--d' as string]: `${start + i * 70}ms` } as React.CSSProperties}>{w}</span>
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
        <div className="absolute inset-y-0 left-0 bg-ink transition-[width] duration-[650ms] ease-out" style={{ width: `${(reached / steps.length) * 100}%` }} />
      </div>
      <div className="mt-0 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([n, tag, t, d], i) => (
          <div key={n} className="transition-opacity duration-500" style={{ opacity: i < reached ? 1 : 0.45 }}>
            <div className="mt-5 flex items-center gap-2 text-[12px]">
              <span className="font-mono text-mute">{n}</span>
              <span className="rounded-md border border-line px-2 py-0.5">{tag}</span>
            </div>
            <div className="mt-4 text-[15px] font-medium">{t}</div>
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
  const [q, setQ] = useState<QuoteResult | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let alive = true
    getTokens()
      .then((tokens) => {
        const usdc = tokens.find((t) => t.symbol === 'USDC' && t.blockchain === 'sol')
        if (!usdc) throw new Error('no token')
        return quotePayout({ destinationAsset: usdc.assetId, amountOutUnits: '20000000', recipient: DEMO_SOL_ADDRESS, refundTo: 'demo.near' })
      })
      .then((r) => alive && setQ(r))
      .catch(() => alive && setQ(RECORDED_QUOTE))
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  const age = q ? Math.max(0, Math.round((now - new Date(q.timestamp).getTime()) / 1000)) : 0
  const fees = q ? Math.max(0, Number(q.quote.amountInUsd) - Number(q.quote.amountOutUsd)) : 0
  return (
    <div className="rounded-2xl border border-line bg-panel p-7">
      <div className="flex items-center justify-between text-[12px] text-mute">
        <span>{q?.recorded ? 'Saved quote' : 'Live quote · NEAR Intents'}</span>
        <span className="flex items-center gap-1.5">
          {q ? (
            <>
              <span className={`size-1.5 rounded-full ${q.recorded ? 'bg-warn' : 'animate-pulse bg-accent'}`} />
              {q.recorded ? 'recorded 14 Nov' : age < 60 ? `${age}s ago` : `${Math.round(age / 60)} min ago`}
            </>
          ) : (
            <Spinner />
          )}
        </span>
      </div>
      <div className="mt-6 text-[12px] text-mute">Designer gets exactly</div>
      <div className="tnum mt-1 text-[44px] leading-none font-light tracking-[-0.05em] md:text-[56px]">
        20.00 <span className="text-[20px] tracking-normal text-mute">USDC on Solana</span>
      </div>
      <div className="mt-7 text-[13.5px]">
        <QRow k="City Club sends" v={q ? `${Number(q.quote.amountInFormatted).toFixed(2)} NEAR · $${Number(q.quote.amountInUsd).toFixed(2)}` : '…'} />
        <QRow k="Arrives" v={q ? `about ${q.quote.timeEstimate} seconds` : '…'} />
        <QRow k="Fees" v={q ? `$${fees.toFixed(2)}` : '…'} />
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
  const [name, setName] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { accountId } = useWallet()

  async function connect() {
    let id = name.trim().toLowerCase()
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
      setError(`Couldn't find that treasury. ${id} isn't a Sputnik DAO on testnet.`)
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
              Bring your treasury.
              <br />
              Your members will do the rest.
            </h2>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              connect()
            }}
          >
            <label htmlFor="dao-name" className="text-[12px] opacity-60">Your DAO's name</label>
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
                {checking ? <Spinner /> : 'Connect'}
              </button>
            </div>
            {error ? (
              <p className="mt-3 flex items-center gap-2 text-[12.5px]">
                <span className="size-1.5 rounded-full bg-bad" />
                <span className="opacity-80">{error}</span>
              </p>
            ) : (
              <p className="mt-3 text-[12.5px] opacity-60">
                No DAO yet?{' '}
                <button type="button" className="underline underline-offset-2" onClick={() => go('create')}>
                  Create one in a minute.
                </button>{' '}
                Or{' '}
                <button type="button" className="underline underline-offset-2" onClick={() => openDao(DEMO_DAO)}>
                  try the demo community
                </button>
                .
              </p>
            )}
          </form>
        </div>
      </div>
    </section>
  )
}
