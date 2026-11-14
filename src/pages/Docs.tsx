import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DEMO_DAO, shareUrl } from '../lib/store'
import { TIER_LIMITS_USD } from '../lib/record'
import { LandingNav } from './Landing'
import SiteFooter from '../components/SiteFooter'
import LanguagePicker from '../components/LanguagePicker'
import Faq from '../components/Faq'
import { faqIdFromHash } from '../lib/faq'
import { formatNumber, t, tr, useLocale, useT } from '../i18n'
import enCatalog from '../i18n/locales/en.json'

/**
 * Public docs at #/docs. Section links are `#/docs?s=<id>` so they survive the hash router
 * and can be shared. Ids avoid the landing's own section ids (how, approvals, trust, connect),
 * which the landing navbar watches.
 *
 * All text lives in the catalog under `docs.*`. Section titles, search terms and group labels are
 * looked up by id: `docs.sec.<id>.title`, `docs.sec.<id>.keys`, `docs.group.<group>`.
 */

const TX = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`
/** "$50", "50 $US"… whole dollars, in the reader's locale. */
const dollars = (n: number) => formatNumber(n, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const EN = enCatalog as Record<string, string>

type Sec = { id: string; icon: string }
const GROUPS: { id: string; items: Sec[] }[] = [
  {
    id: 'start',
    items: [
      { id: 'what', icon: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z' },
      { id: 'quick-start', icon: 'M13 3L5 14h6l-1 7 8-11h-6z' },
    ],
  },
  {
    id: 'money',
    items: [
      { id: 'tiers', icon: 'M5 13l4 4L19 7' },
      { id: 'record', icon: 'M4 19h16M7 15V9M12 15V5M17 15v-3' },
      { id: 'joining', icon: 'M16 11a4 4 0 10-8 0M4 20a8 8 0 0116 0' },
      { id: 'payouts', icon: 'M4 12h16M14 6l6 6-6 6' },
    ],
  },
  {
    id: 'features',
    items: [
      { id: 'allowances', icon: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z' },
      { id: 'earn', icon: 'M4 17l6-6 4 4 6-8' },
      { id: 'social', icon: 'M4 5h16v11H8l-4 4z' },
    ],
  },
  {
    id: 'reference',
    items: [
      { id: 'real', icon: 'M9 12l2 2 4-4M12 3a9 9 0 100 18 9 9 0 000-18z' },
      { id: 'faq', icon: 'M9.5 9a2.5 2.5 0 115 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01' },
    ],
  },
]
const IDS: string[] = GROUPS.flatMap((g) => g.items.map((i) => i.id))
const groupIdOf = (id: string) => GROUPS.find((g) => g.items.some((i) => i.id === id))?.id ?? ''
// Called at render time, never at module load.
const secTitle = (id: string) => t(`docs.sec.${id}.title`)
const secTerms = (id: string) => t(`docs.sec.${id}.keys`)
const groupLabel = (g: string) => t(`docs.group.${g}`)

/** `what` is a key under docs.proof.*; a link label is a key under docs.proof.link.*, or a DAO name (kept as is). */
const PROOFS: { what: string; links: { label: string; hash: string; dao?: true }[] }[] = [
  { what: 'createGroup', links: [{ label: 'City Club', dao: true, hash: 'Hy3hR85myJ9UoJ7rHDm9zxkpxTGe9MFP2bpFELSSvDo6' }, { label: 'nearHack Community', dao: true, hash: '9gqdtL16KSqXAVHu6p61ZkkUHWBWZL86j419bRzLGeD9' }] },
  { what: 'unicodeName', links: [{ label: 'proof', hash: 'G95bZT12fN9sYhPnoc1rKgr8dD2JbYpPM6GHN11i1NoA' }] },
  { what: 'chipIn', links: [{ label: 'proof', hash: '69RC9NxfXLr62Pdr42bowR9P8VtfimSJd6Z1nNPWoB4y' }] },
  { what: 'requestQuote', links: [{ label: 'proof', hash: '6GNyQ3rzFFFkXWquSxdFNXpWUB8JPGqkZTb4HVVuyCJt' }] },
  { what: 'fastLane', links: [{ label: 'proof', hash: '9wyJ8fiLk2AHfAomycQGdwz6w7Za3ijQgihRZDRmHGGL' }] },
  { what: 'decline', links: [{ label: 'proof', hash: 'fRZQgDpxxttVbczcmLFA9G6VA4JrYvEyT4RRByitauL' }] },
  { what: 'councilRule', links: [{ label: 'proof', hash: 'EeyJXZ6zuQ2bSyqWTuzQqr6Fdbf2gSR9HiQjohFFoTfj' }] },
  { what: 'councilAlone', links: [{ label: 'proof', hash: '212Z1Aidh4PhRUWtQiyDKX3ZrcATx2htiWFqrK3hmEmt' }] },
  { what: 'join', links: [{ label: 'ask', hash: '3QFJZ91QJr9Gps92EnXj7L56Cz5C7wtG8cRHswtZ3u6v' }, { label: 'approve', hash: 'HEtHLgKGjanpdiyhBWNWuVGQ3AUHut9A5a99BQkJux63' }] },
  { what: 'profile', links: [{ label: 'proof', hash: 'HyAutgFa9n3y6fFjUUMo9u7ijNt699xovMoy6GEN8rHQ' }] },
  { what: 'comment', links: [{ label: 'proof', hash: 'FkYtqB1poNSpeMCKexaXSTjfE9sv9giaQtdfjH1KPMHT' }] },
  { what: 'privateMessage', links: [{ label: 'proof', hash: '93ptWqwDe2jrSgcDynrjN5sH1TQskEz3FL8XUecCDvTA' }] },
  { what: 'allowanceInside', links: [{ label: 'proof', hash: 'Eeujj7H5v8iHCJzmNb7nyMGpwVFuNJVPs6ocnYGzC4Hf' }] },
  { what: 'allowanceOverMax', links: [{ label: 'proof', hash: '4brjmRuvDvfgD9HCNgMLAFZ9H6A25qnpm6E4yTHym8o1' }] },
  { what: 'allowanceFreeze', links: [{ label: 'proof', hash: 'HALjykqpfVmH6a4syhCwHX59uKJSNk4JZULsTbytaykB' }] },
  { what: 'aiKeyRefused', links: [{ label: 'proof', hash: '5SsWRfJTcQRojeP5eif784ztDPEvruj42epnjpLLFLV7' }] },
]

/** Rich-text tags used by docs strings: <b>bold</b>. Links are added per call. */
const b = (c: ReactNode) => <b>{c}</b>

function sectionHref(id: string) {
  return `#/docs?s=${id}`
}

function scrollToSection(id: string, smooth = true) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: smooth && !reduce ? 'smooth' : 'auto', block: 'start' })
}


export default function Docs() {
  const t = useT()
  const lang = useLocale()
  const boardUrl = shareUrl(DEMO_DAO, 'board')
  const [active, setActive] = useState(IDS[0])
  const [search, setSearch] = useState(false)
  const SMALL = dollars(TIER_LIMITS_USD.small)
  const MID = dollars(TIER_LIMITS_USD.mid)

  // ⌘K / Ctrl+K or "/" opens search, like most docs sites.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault()
        setSearch(true)
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  // Open at the top, or at the section in the link; follow later #/docs?s=<id> changes too.
  useEffect(() => {
    const go = (smooth: boolean) => {
      const s = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('s')
      const q = s === 'faq' ? faqIdFromHash() : null
      if (s && IDS.includes(s)) requestAnimationFrame(() => scrollToSection(q ? `faq-${q}` : s, smooth))
      else window.scrollTo(0, 0)
    }
    go(false)
    const on = () => go(true)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  useEffect(() => {
    document.title = t('docs.docTitle')
    return () => {
      document.title = 'Terra'
    }
  }, [t, lang])

  // Track the section in view for the sidebar and the phone picker.
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const seen = new Map<string, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting))
        const hit = IDS.find((id) => seen.get(id))
        if (hit) setActive(hit)
        else if (window.scrollY < 240) setActive(IDS[0])
      },
      { rootMargin: '-150px 0px -55% 0px' },
    )
    IDS.forEach((id) => {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [])

  const pick = (id: string) => {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${sectionHref(id)}`)
    setActive(id)
    scrollToSection(id)
  }

  return (
    <div className="relative isolate min-h-screen overflow-x-clip">
      {/* The landing's deep blue, as a soft glow behind the top of the docs, over a faint dot grid. */}
      <div aria-hidden className="docs-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px]" />
      <LandingNav boardUrl={boardUrl} home="./" current="docs" />
      <PhonePicker active={active} onPick={pick} onSearch={() => setSearch(true)} />

      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 sm:px-6 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-14 xl:grid-cols-[224px_minmax(0,1fr)_200px] xl:gap-12">
        <aside className="hidden md:block">
          <nav aria-label={t('docs.sectionsLabel')} className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto py-10 pe-1">
            <SearchButton onOpen={() => setSearch(true)} />
            {GROUPS.map((g) => (
              <div key={g.id} className="mt-7 first-of-type:mt-6">
                <div className="px-3 pb-2 text-[12px] font-medium text-ink">{groupLabel(g.id)}</div>
                <ul className="flex flex-col gap-px border-s border-line">
                  {g.items.map(({ id }) => (
                    <li key={id}>
                      <a
                        href={sectionHref(id)}
                        onClick={(e) => {
                          e.preventDefault()
                          pick(id)
                        }}
                        aria-current={active === id ? 'location' : undefined}
                        className={`-ms-px flex min-h-9 items-center border-s px-3 text-[13.5px] transition-colors ${
                          active === id ? 'border-accent font-medium text-ink' : 'border-transparent text-mute hover:border-mute hover:text-ink'
                        }`}
                      >
                        {secTitle(id)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 max-w-[680px] pb-24">
          <header className="pt-10 pb-12 md:pt-14">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[12px] text-mute">
                <span className="size-1.5 rounded-full bg-accent" />
                {t('docs.badge')}
              </span>
              <LanguagePicker align="end" className="-me-2" />
            </div>
            <h1 className="mt-5 text-[38px] leading-[1.02] font-light tracking-[-0.045em] md:text-[52px]">{t('docs.title')}</h1>
            <p className="mt-4 max-w-[560px] text-[16.5px] leading-7 text-mute">{t('docs.lead')}</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Card id="quick-start" text={t('docs.card.quickStart')} onPick={pick} />
              <Card id="tiers" text={t('docs.card.tiers', { small: SMALL, mid: MID })} onPick={pick} />
              <Card id="payouts" text={t('docs.card.payouts')} onPick={pick} />
              <Card id="real" text={t('docs.card.real')} onPick={pick} />
            </div>
          </header>

          <Section id="what" title={t('docs.sec.what.title')}>
            <P>{tr('docs.what.p1', { b })}</P>
            <List items={[t('docs.what.li1'), t('docs.what.li2'), t('docs.what.li3'), t('docs.what.li4')]} />
            <P>{tr('docs.what.p2', { b })}</P>
          </Section>

          <Section id="quick-start" title={t('docs.sec.quick-start.title')}>
            <Steps
              items={[
                tr('docs.quickStart.step1', { b, link: (c) => <A href={shareUrl(DEMO_DAO, 'home')}>{c}</A> }),
                tr('docs.quickStart.step2', { b }),
                tr('docs.quickStart.step3', { b }),
                tr('docs.quickStart.step4', { b }),
                tr('docs.quickStart.step5', { b }),
              ]}
            />
            <P>{t('docs.quickStart.share')}</P>
            {/* i18n-ignore */}
            <Code>{'https://www.useterra.app/?dao=<your-dao-account>#/home'}</Code>
          </Section>

          <Section id="tiers" title={t('docs.sec.tiers.title')}>
            <P>{t('docs.tiers.p1')}</P>
            <div className="mt-5 overflow-hidden rounded-2xl border border-line">
              <TierRow name={t('docs.tiers.fast.name')} amount={t('docs.tiers.fast.amount', { small: SMALL })} text={t('docs.tiers.fast.text')} />
              <TierRow name={t('docs.tiers.council.name')} amount={t('docs.tiers.council.amount', { small: SMALL, mid: MID })} text={t('docs.tiers.council.text')} />
              <TierRow name={t('docs.tiers.full.name')} amount={t('docs.tiers.full.amount', { mid: MID })} text={t('docs.tiers.full.text')} last />
            </div>
            <P>{t('docs.tiers.p2')}</P>
            <Note tone="warn" title={t('docs.tiers.note.title')}>
              {tr('docs.tiers.note.body', { link: (c) => <A href={sectionHref('allowances')}>{c}</A> })}
            </Note>
          </Section>

          <Section id="record" title={t('docs.sec.record.title')}>
            <P>{t('docs.record.p1')}</P>
            <List items={[t('docs.record.li1'), t('docs.record.li2'), t('docs.record.li3'), t('docs.record.li4')]} />
            <P>{tr('docs.record.p2', { b })}</P>
          </Section>

          <Section id="joining" title={t('docs.sec.joining.title')}>
            <Steps items={[tr('docs.joining.step1', { b }), tr('docs.joining.step2', { b }), t('docs.joining.step3')]} />
            <P>{tr('docs.joining.p1', { b })}</P>
          </Section>

          <Section id="payouts" title={t('docs.sec.payouts.heading')}>
            <P>{tr('docs.payouts.p1', { b })}</P>
            <P>{t('docs.payouts.p2')}</P>
            <P>{t('docs.payouts.p3')}</P>
          </Section>

          <Section id="allowances" title={t('docs.sec.allowances.title')}>
            <P>{t('docs.allowances.p1')}</P>
            <List items={[tr('docs.allowances.li1', { b }), tr('docs.allowances.li2', { b }), tr('docs.allowances.li3', { b })]} />
            <P>{t('docs.allowances.p2')}</P>
          </Section>

          <Section id="earn" title={t('docs.sec.earn.title')}>
            <P>{t('docs.earn.p1')}</P>
            <P>{t('docs.earn.p2')}</P>
          </Section>

          <Section id="social" title={t('docs.sec.social.heading')}>
            <P>{t('docs.social.p1')}</P>
            <List items={[tr('docs.social.li1', { b }), tr('docs.social.li2', { b }), tr('docs.social.li3', { b })]} />
            <Note title={t('docs.social.note.title')}>
              <ul className="mt-2 list-disc space-y-1.5 ps-5">
                <li>{t('docs.social.note.li1')}</li>
                <li>{t('docs.social.note.li2')}</li>
                <li>{t('docs.social.note.li3')}</li>
                <li>{t('docs.social.note.li4')}</li>
                <li>{t('docs.social.note.li5')}</li>
              </ul>
            </Note>
          </Section>

          <Section id="real" title={t('docs.sec.real.title')}>
            <P>{t('docs.real.p1')}</P>
            <ul className="mt-5 border-t border-line">
              {PROOFS.map((p) => (
                <li key={p.what} className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 border-b border-line py-1.5 text-[14.5px]">
                  <span className="min-w-0">{t(`docs.proof.${p.what}`)}</span>
                  <span className="-me-2 flex shrink-0 flex-wrap text-[13.5px]">
                    {p.links.map(({ label, hash, dao }) => (
                      <a
                        key={hash}
                        href={TX(hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-ink underline decoration-line underline-offset-[3px] hover:decoration-ink"
                      >
                        {dao ? label : t(`docs.proof.link.${label}`)}
                        <span className="sr-only"> {t('docs.opensNearBlocks')}</span>
                      </a>
                    ))}
                  </span>
                </li>
              ))}
              <li className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 border-b border-line py-1.5 text-[14.5px]">
                <span className="min-w-0">{t('docs.proof.crossChain')}</span>
                <span className="text-[13.5px] text-mute">{t('docs.proof.crossChainStatus')}</span>
              </li>
            </ul>
            <P>
              {tr('docs.real.readme', {
                link: (c) => (
                  <A href="https://github.com/somewherelostt/terra#whats-real-vs-testnet" external>
                    {c}
                  </A>
                ),
              })}
            </P>
          </Section>

          <Section id="faq" title={t('docs.sec.faq.title')}>
            <P>{t('docs.faq.lead')}</P>
            <Faq variant="list" hrefFor={(id) => `#/docs?s=faq&q=${id}`} />
          </Section>
        </main>

        <RightRail />
      </div>
      {search && <SearchDialog onClose={() => setSearch(false)} onPick={pick} />}

      <SiteFooter home="./" boardUrl={boardUrl} />
    </div>
  )
}

/** Phone: a sticky bar under the navbar that names the current section and opens a sheet of all sections. */
function PhonePicker({ active, onPick, onSearch }: { active: string; onPick: (id: string) => void; onSearch: () => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const label = IDS.includes(active) ? secTitle(active) : t('docs.sections')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    listRef.current?.querySelector<HTMLElement>('[aria-current]')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="glass-bar sticky top-16 z-20 flex border-b border-line md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-2 ps-4 text-start text-[14px] sm:ps-6"
      >
        <span className="text-mute">{t('docs.badge')}</span>
        <span aria-hidden className="text-mute">/</span>
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <svg viewBox="0 0 24 24" className="size-4 text-mute" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <button type="button" onClick={onSearch} aria-label={t('docs.search.button')} className="grid min-h-12 w-14 place-items-center text-mute hover:text-ink sm:me-2">
        <SecIcon d="M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4" className="size-[18px]" />
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 grid items-end glass-scrim md:hidden" onClick={() => setOpen(false)} role="dialog" aria-modal aria-label={t('docs.sectionsLabel')}>
            <div
              className="max-h-[85vh] w-full overflow-y-auto glass glass-sheet rounded-t-2xl border border-line bg-card p-3 pb-[max(env(safe-area-inset-bottom),12px)] text-ink"
              onClick={(e) => e.stopPropagation()}
            >
              <ul ref={listRef} className="flex flex-col">
                {IDS.map((id) => (
                  <li key={id}>
                    {GROUPS.some((g) => g.items[0].id === id) && <div className="px-3 pt-3 pb-1 text-[12px] font-medium text-accent-text">{groupLabel(groupIdOf(id))}</div>}
                    <a
                      href={sectionHref(id)}
                      aria-current={active === id ? 'location' : undefined}
                      onClick={(e) => {
                        e.preventDefault()
                        setOpen(false)
                        onPick(id)
                      }}
                      className={`flex min-h-12 items-center rounded-lg px-3 text-[15px] hover:bg-soft ${active === id ? 'bg-soft font-medium' : ''}`}
                    >
                      {secTitle(id)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const t = useT()
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-[136px] border-t border-line pt-10 pb-12 md:scroll-mt-20">
      <div className="mb-2 text-[12.5px] font-medium text-accent-text">{groupLabel(groupIdOf(id))}</div>
      <h2 id={`${id}-h`} className="group flex items-baseline gap-2 text-[24px] leading-tight font-light tracking-[-0.025em] md:text-[28px]">
        {title}
        <a href={sectionHref(id)} aria-label={t('docs.linkTo', { title })} className="-my-2 hidden size-10 shrink-0 place-items-center self-center rounded-lg text-[18px] text-mute opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink md:grid">
          #
        </a>
      </h2>
      {children}
    </section>
  )
}

function P({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-[15.5px] leading-7 text-ink/85 [&_b]:font-medium [&_b]:text-ink">{children}</p>
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-4 space-y-2.5 text-[15.5px] leading-7 text-ink/85 [&_b]:font-medium [&_b]:text-ink">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="mt-[11px] size-1.5 shrink-0 rounded-full bg-mute" />
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </ul>
  )
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="mt-5 space-y-4 text-[15.5px] leading-7 text-ink/85 [&_b]:font-medium [&_b]:text-ink">
      {items.map((it, i) => (
        <li key={i} className="flex gap-4">
          <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-line text-[12px] text-mute tabular-nums">
            {formatNumber(i + 1)}
          </span>
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </ol>
  )
}

function TierRow({ name, amount, text, last }: { name: string; amount: string; text: string; last?: boolean }) {
  return (
    <div className={`grid gap-1 bg-panel px-5 py-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-6 ${last ? '' : 'border-b border-line'}`}>
      <div>
        <div className="text-[15px] font-medium">{name}</div>
        <div className="text-[13px] text-mute tabular-nums">{amount}</div>
      </div>
      <p className="text-[14.5px] leading-6 text-ink/85">{text}</p>
    </div>
  )
}

function Note({ title, children, tone = 'info' }: { title: string; children: ReactNode; tone?: 'info' | 'warn' }) {
  const warn = tone === 'warn'
  return (
    <div className={`mt-6 flex gap-3.5 rounded-2xl border p-5 text-[14.5px] leading-6 ${warn ? 'border-warn/30 bg-warn-soft' : 'border-line bg-sand'}`}>
      <svg viewBox="0 0 24 24" className={`mt-0.5 size-[18px] shrink-0 ${warn ? 'text-warn' : 'text-accent-text'}`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {warn ? <path d="M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /> : <path d="M12 16v-4M12 8h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />}
      </svg>
      <div className="min-w-0 text-ink/85">
        <div className="font-medium text-ink">{title}</div>
        <div className="mt-1.5">{children}</div>
      </div>
    </div>
  )
}

function SecIcon({ d, className = 'size-[18px]' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

function secById(id: string): Sec {
  return GROUPS.flatMap((g) => g.items).find((i) => i.id === id)!
}

/** A linked card, as in the card groups of most product docs. */
function Card({ id, text, onPick }: { id: string; text: string; onPick: (id: string) => void }) {
  useT()
  const sec = secById(id)
  return (
    <a
      href={sectionHref(id)}
      onClick={(e) => {
        e.preventDefault()
        onPick(id)
      }}
      className="group flex gap-3.5 rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-mute"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-sand text-ink transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-on-accent">
        <SecIcon d={sec.icon} />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[14.5px] font-medium">
          {secTitle(id)}
          <span aria-hidden className="text-mute transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5">→</span>
        </span>
        <span className="mt-0.5 block text-[13.5px] leading-5 text-mute">{text}</span>
      </span>
    </a>
  )
}

/** A one-line code block with a copy button. */
function Code({ children }: { children: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line ps-4 text-[12px] text-mute">
        <span>{t('docs.code.label')}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(children).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }, () => undefined)
          }}
          className="flex min-h-11 items-center px-4 hover:text-ink"
        >
          {copied ? t('common.copied') : t('common.copy')}
        </button>
      </div>
      <pre dir="ltr" className="overflow-x-auto px-4 py-3.5 text-left font-mono text-[13px] leading-6 text-ink">
        <code>{children}</code>
      </pre>
    </div>
  )
}

function SearchButton({ onOpen }: { onOpen: () => void }) {
  const t = useT()
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-panel px-3 text-[13.5px] text-mute transition-colors hover:border-mute hover:text-ink"
    >
      <SecIcon d="M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4" className="size-4" />
      <span className="flex-1 text-start">{t('docs.search.button')}</span>
      <kbd className="rounded border border-line px-1.5 font-sans text-[11px]">{mac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  )
}

function SearchDialog({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const t = useT()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  // Each section is found by its title, search terms and group, in the current language and in English.
  const all = GROUPS.flatMap((g) =>
    g.items.map((it) => {
      const title = secTitle(it.id)
      const group = groupLabel(g.id)
      const english = [`docs.sec.${it.id}.title`, `docs.sec.${it.id}.keys`, `docs.group.${g.id}`].map((k) => EN[k] ?? '')
      return { ...it, title, group, text: [title, secTerms(it.id), group, ...english].join(' ').toLowerCase() }
    }),
  )
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const hits = all.filter((it) => words.every((w) => it.text.includes(w)))
  const sel = Math.min(i, Math.max(hits.length - 1, 0))
  const go = (id: string) => {
    onClose()
    onPick(id)
  }
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    return () => prev?.focus?.()
  }, [])
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-start justify-items-center glass-scrim px-4 pt-[12vh]" onClick={onClose} role="dialog" aria-modal aria-label={t('docs.search.button')}>
      <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-panel text-ink" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <SecIcon d="M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4" className="size-[18px] text-mute" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setI(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setI((sel + 1) % Math.max(hits.length, 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setI((sel - 1 + hits.length) % Math.max(hits.length, 1))
              } else if (e.key === 'Enter' && hits[sel]) go(hits[sel].id)
            }}
            placeholder={t('docs.search.placeholder')}
            aria-label={t('docs.search.placeholder')}
            className="h-14 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-mute"
          />
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="grid h-11 place-items-center rounded-lg px-2 text-[12px] text-mute hover:text-ink">
            Esc
          </button>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox" aria-label={t('docs.search.results')}>
          {hits.map((it, n) => (
            <li key={it.id} role="option" aria-selected={n === sel}>
              <button
                type="button"
                onClick={() => go(it.id)}
                onMouseMove={() => setI(n)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-start ${n === sel ? 'bg-sand' : ''}`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-mute">
                  <SecIcon d={it.icon} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px]">{it.title}</span>
                  <span className="block text-[12px] text-mute">{it.group}</span>
                </span>
                {n === sel && <span aria-hidden className="text-[12px] text-mute rtl:-scale-x-100">↵</span>}
              </button>
            </li>
          ))}
          {!hits.length && <li className="px-3 py-6 text-center text-[14px] text-mute">{t('docs.search.empty', { q })}</li>}
        </ul>
      </div>
    </div>,
    document.body,
  )
}

/** Wide screens: a quiet rail with the places to try Terra. */
function RightRail() {
  const t = useT()
  const links: [string, string, string][] = [
    [t('docs.rail.demo'), shareUrl(DEMO_DAO, 'home'), 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z'],
    [t('docs.rail.board'), shareUrl(DEMO_DAO, 'board'), 'M4 4h16v12H4zM8 20h8'],
    [t('docs.rail.android'), 'https://github.com/somewherelostt/terra/releases/tag/v1.0.0', 'M7 3h10v18H7zM11 18h2'],
    [t('docs.rail.bug'), 'https://github.com/somewherelostt/terra/issues', 'M12 8v4M12 16h.01M12 3a9 9 0 100 18 9 9 0 000-18z'],
  ]
  return (
    <aside className="hidden xl:block" aria-label={t('docs.rail.label')}>
      <div className="sticky top-16 py-10">
        <div className="pb-3 text-[12px] font-medium text-ink">{t('docs.rail.title')}</div>
        <ul className="flex flex-col gap-px">
          {links.map(([label, href, d]) => (
            <li key={href}>
              <a
                href={href}
                {...(href.startsWith('http') && !href.includes(window.location.host) ? { target: '_blank', rel: 'noreferrer' } : {})}
                className="flex min-h-9 items-center gap-2.5 text-[13.5px] text-mute transition-colors hover:text-ink"
              >
                <SecIcon d={d} className="size-4" />
                {label}
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-6 rounded-2xl border border-line bg-panel p-4 text-[12.5px] leading-5 text-mute">{t('docs.rail.note')}</div>
      </div>
    </aside>
  )
}

function A({ href, children, external }: { href: string; children: ReactNode; external?: boolean }) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="rounded-sm text-ink underline decoration-line decoration-1 underline-offset-[3px] hover:decoration-ink"
    >
      {children}
    </a>
  )
}
