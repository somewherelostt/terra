import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DEMO_DAO, shareUrl } from '../lib/store'
import { TIER_LIMITS_USD } from '../lib/record'
import { LandingNav } from './Landing'
import SiteFooter from '../components/SiteFooter'

/**
 * Public docs at #/docs. Section links are `#/docs?s=<id>` so they survive the hash router
 * and can be shared. Ids avoid the landing's own section ids (how, approvals, trust, connect),
 * which the landing navbar watches.
 */

const TX = (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`
const SMALL = `$${TIER_LIMITS_USD.small}`
const MID = `$${TIER_LIMITS_USD.mid}`

type Sec = { id: string; title: string; icon: string; keys: string }
const GROUPS: { label: string; items: Sec[] }[] = [
  {
    label: 'Get started',
    items: [
      { id: 'what', title: 'What Terra is', icon: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z', keys: 'about overview sputnik dao treasury' },
      { id: 'quick-start', title: 'Quick start', icon: 'M13 3L5 14h6l-1 7 8-11h-6z', keys: 'sign in wallet start group chip in request approve' },
    ],
  },
  {
    label: 'How money moves',
    items: [
      { id: 'tiers', title: 'Approvals and tiers', icon: 'M5 13l4 4L19 7', keys: 'fast lane council vote trusted limit tier' },
      { id: 'record', title: 'Your record', icon: 'M4 19h16M7 15V9M12 15V5M17 15v-3', keys: 'reputation history standing clean' },
      { id: 'joining', title: 'Joining a group', icon: 'M16 11a4 4 0 10-8 0M4 20a8 8 0 0116 0', keys: 'invite qr join ask member' },
      { id: 'payouts', title: 'Payouts to other chains', icon: 'M4 12h16M14 6l6 6-6 6', keys: 'near intents cross chain solana usdc quote' },
    ],
  },
  {
    label: 'Features',
    items: [
      { id: 'allowances', title: 'Allowances', icon: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z', keys: 'budget cap freeze ai helper key security' },
      { id: 'earn', title: 'Earn', icon: 'M4 17l6-6 4 4 6-8', keys: 'stake staking validator rewards' },
      { id: 'social', title: 'Profiles, comments, messages', icon: 'M4 5h16v11H8l-4 4z', keys: 'profile avatar comment dm private encrypted privacy near social' },
    ],
  },
  {
    label: 'Reference',
    items: [
      { id: 'real', title: "What's real", icon: 'M9 12l2 2 4-4M12 3a9 9 0 100 18 9 9 0 000-18z', keys: 'proof transactions nearblocks receipts' },
      { id: 'faq', title: 'FAQ', icon: 'M9.5 9a2.5 2.5 0 115 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01', keys: 'questions help' },
    ],
  },
]
const SECTIONS: [string, string][] = GROUPS.flatMap((g) => g.items.map((i): [string, string] => [i.id, i.title]))
const groupOf = (id: string) => GROUPS.find((g) => g.items.some((i) => i.id === id))?.label ?? ''

/** The approved FAQ list goes here. While it's empty, the FAQ section shows a short note. */
const FAQ: { q: string; a: ReactNode }[] = []

const PROOFS: { what: string; links: [string, string][] }[] = [
  { what: 'Create a group', links: [['City Club', 'Hy3hR85myJ9UoJ7rHDm9zxkpxTGe9MFP2bpFELSSvDo6'], ['nearHack Community', '9gqdtL16KSqXAVHu6p61ZkkUHWBWZL86j419bRzLGeD9']] },
  { what: 'Group name with curly quotes, accents and emoji', links: [['Proof', 'G95bZT12fN9sYhPnoc1rKgr8dD2JbYpPM6GHN11i1NoA']] },
  { what: 'Chip in', links: [['Proof', '69RC9NxfXLr62Pdr42bowR9P8VtfimSJd6Z1nNPWoB4y']] },
  { what: 'Request money with a live NEAR Intents quote saved in it', links: [['Proof', '6GNyQ3rzFFFkXWquSxdFNXpWUB8JPGqkZTb4HVVuyCJt']] },
  { what: 'Fast lane: one trusted approval pays out', links: [['Proof', '9wyJ8fiLk2AHfAomycQGdwz6w7Za3ijQgihRZDRmHGGL']] },
  { what: 'Decline a request', links: [['Proof', 'fRZQgDpxxttVbczcmLFA9G6VA4JrYvEyT4RRByitauL']] },
  { what: 'Council vote passes a rule change (2 of 2)', links: [['Proof', 'EeyJXZ6zuQ2bSyqWTuzQqr6Fdbf2gSR9HiQjohFFoTfj']] },
  { what: "One council approval alone doesn't pay", links: [['Proof', '212Z1Aidh4PhRUWtQiyDKX3ZrcATx2htiWFqrK3hmEmt']] },
  { what: 'Ask to join, then the council approves', links: [['ask', '3QFJZ91QJr9Gps92EnXj7L56Cz5C7wtG8cRHswtZ3u6v'], ['approve', 'HEtHLgKGjanpdiyhBWNWuVGQ3AUHut9A5a99BQkJux63']] },
  { what: 'Profile and avatar saved to NEAR Social', links: [['Proof', 'HyAutgFa9n3y6fFjUUMo9u7ijNt699xovMoy6GEN8rHQ']] },
  { what: 'Comment on a request', links: [['Proof', 'FkYtqB1poNSpeMCKexaXSTjfE9sv9giaQtdfjH1KPMHT']] },
  { what: 'Encrypted private message (only ciphertext on chain)', links: [['Proof', '93ptWqwDe2jrSgcDynrjN5sH1TQskEz3FL8XUecCDvTA']] },
  { what: 'Allowance: a payment inside the budget, no vote', links: [['Proof', 'Eeujj7H5v8iHCJzmNb7nyMGpwVFuNJVPs6ocnYGzC4Hf']] },
  { what: 'Allowance: a payment over the per-payment max is refused', links: [['Proof', '4brjmRuvDvfgD9HCNgMLAFZ9H6A25qnpm6E4yTHym8o1']] },
  { what: 'Allowance: a guardian freezes it', links: [['Proof', 'HALjykqpfVmH6a4syhCwHX59uKJSNk4JZULsTbytaykB']] },
  { what: 'AI helper key is refused over its limit', links: [['Proof', '5SsWRfJTcQRojeP5eif784ztDPEvruj42epnjpLLFLV7']] },
]

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
  const boardUrl = shareUrl(DEMO_DAO, 'board')
  const [active, setActive] = useState(SECTIONS[0][0])
  const [search, setSearch] = useState(false)

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
      if (s && SECTIONS.some(([id]) => id === s)) requestAnimationFrame(() => scrollToSection(s, smooth))
      else window.scrollTo(0, 0)
    }
    go(false)
    const on = () => go(true)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  useEffect(() => {
    document.title = 'Docs · Terra'
    return () => {
      document.title = 'Terra'
    }
  }, [])

  // Track the section in view for the sidebar and the phone picker.
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const seen = new Map<string, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting))
        const hit = SECTIONS.map(([id]) => id).find((id) => seen.get(id))
        if (hit) setActive(hit)
        else if (window.scrollY < 240) setActive(SECTIONS[0][0])
      },
      { rootMargin: '-150px 0px -55% 0px' },
    )
    SECTIONS.forEach(([id]) => {
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
      {/* Faint dot grid with a lime glow at the top, fading out: the docs' one decorative touch. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px]"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 60% 70% at 50% 0%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 70%), radial-gradient(circle at 1px 1px, var(--line) 1px, transparent 0)',
          backgroundSize: '100% 100%, 22px 22px',
          maskImage: 'linear-gradient(to bottom, black 30%, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 30%, transparent)',
        }}
      />
      <LandingNav boardUrl={boardUrl} home="./" current="docs" />
      <PhonePicker active={active} onPick={pick} onSearch={() => setSearch(true)} />

      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 sm:px-6 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-14 xl:grid-cols-[224px_minmax(0,1fr)_200px] xl:gap-12">
        <aside className="hidden md:block">
          <nav aria-label="Docs sections" className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto py-10 pr-1">
            <SearchButton onOpen={() => setSearch(true)} />
            {GROUPS.map((g) => (
              <div key={g.label} className="mt-7 first-of-type:mt-6">
                <div className="px-3 pb-2 text-[12px] font-medium text-ink">{g.label}</div>
                <ul className="flex flex-col gap-px border-l border-line">
                  {g.items.map(({ id, title }) => (
                    <li key={id}>
                      <a
                        href={sectionHref(id)}
                        onClick={(e) => {
                          e.preventDefault()
                          pick(id)
                        }}
                        aria-current={active === id ? 'location' : undefined}
                        className={`-ml-px flex min-h-9 items-center border-l px-3 text-[13.5px] transition-colors ${
                          active === id ? 'border-accent font-medium text-ink' : 'border-transparent text-mute hover:border-mute hover:text-ink'
                        }`}
                      >
                        {title}
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
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[12px] text-mute">
              <span className="size-1.5 rounded-full bg-accent" />
              Docs
            </span>
            <h1 className="mt-5 text-[38px] leading-[1.02] font-light tracking-[-0.045em] md:text-[52px]">How Terra works</h1>
            <p className="mt-4 max-w-[560px] text-[16.5px] leading-7 text-mute">
              The members' app for a community treasury: chip in, ask for money, approve it. What each part does, and where the limits are.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Card id="quick-start" text="Sign in, open a group, chip in, request money and approve." onPick={pick} />
              <Card id="tiers" text={`Fast lane up to ${SMALL}, the council up to ${MID}, a full vote above.`} onPick={pick} />
              <Card id="payouts" text="Live NEAR Intents quotes for recipients on other chains." onPick={pick} />
              <Card id="real" text="Every claim here links to a transaction on NearBlocks." onPick={pick} />
            </div>
          </header>

          <Section id="what" title="What Terra is">
            <P>
              Terra is a members' app for a community treasury. It sits on top of a group's <b>existing Sputnik DAO</b>: it never holds the money and never deploys its own multisig.
              Money only moves through the DAO's own proposals and votes.
            </P>
            <List
              items={[
                'Members see one balance in dollars, chip in, request money and approve requests.',
                "Each member's record, computed from the DAO's own history, decides how much approval a request needs.",
                'A live NEAR Intents quote shows what a recipient on another chain would get.',
                'A public board shows every payout, with a receipt on chain. No sign-in needed.',
              ]}
            />
            <P>
              Any Sputnik DAO works: type its account on the landing page. Groups without a DAO can start one in three steps with <b>Start a group</b>.
            </P>
          </Section>

          <Section id="quick-start" title="Quick start">
            <Steps
              items={[
                <>
                  <b>Sign in</b> with a NEAR wallet. Intear works on phones, Meteor on desktop. You can{' '}
                  <A href={shareUrl(DEMO_DAO, 'home')}>look around a demo group</A> without signing in.
                </>,
                <>
                  <b>Open a group or start one.</b> Connect an existing DAO by its account, or use Start a group: name it, list the council and trusted members, review and sign one call.
                  It needs at least 6 NEAR, and about 5.4 NEAR stays locked to store the contract.
                </>,
                <>
                  <b>Chip in.</b> Home → Chip in sends NEAR straight to the DAO account. The balance and Activity update.
                </>,
                <>
                  <b>Request money.</b> Pay → who, how much in dollars, and what for. It's filed as a DAO proposal, and Terra tells you which approval lane it takes.
                </>,
                <>
                  <b>Approve.</b> Approve lists open requests with their tier, who asked, their record and the approvals so far. When enough members approve, the DAO pays out on its own.
                </>,
              ]}
            />
            <P>Any group opens from a link with its DAO account in it. Share it with members:</P>
            <Code>{'https://www.useterra.app/?dao=<your-dao-account>#/home'}</Code>
          </Section>

          <Section id="tiers" title="Approvals and tiers">
            <P>Terra routes each request by its size in dollars and by the requester's record.</P>
            <div className="mt-5 overflow-hidden rounded-2xl border border-line">
              <TierRow name="Fast lane" amount={`Up to ${SMALL}`} text="One nod from a trusted member other than the requester. The requester needs a clean record." />
              <TierRow name="Council nod" amount={`${SMALL} to ${MID}`} text="The council approves at its usual threshold." />
              <TierRow name="Full vote" amount={`Over ${MID}`} text="The council votes at its normal threshold. The request stays on the public board while it's open." last />
            </div>
            <P>
              A small request from someone with no record yet goes to the council instead. Terra also blocks approvals the treasury can't cover, since the vote would fail.
            </P>
            <Note tone="warn" title="The tier limits are checked by Terra, not by the contract.">
              Sputnik decides approvals by role and proposal kind, not by amount. On chain, one trusted vote can approve a transfer of any size, so keep the trusted list small.
              Terra keeps council members out of the trusted role, because otherwise one council vote would also count as a trusted nod. For a hard limit enforced on chain, use{' '}
              <A href={sectionHref('allowances')}>allowances</A>.
            </Note>
          </Section>

          <Section id="record" title="Your record">
            <P>
              Every member's record is computed only from the DAO's own history: its full list of proposals, plus chip-ins found in its transactions on NearBlocks. Nothing is stored by Terra,
              and every row links to its proposal or transaction.
            </P>
            <List
              items={[
                'Requests filed, paid and turned down.',
                'NEAR chipped in, and the total paid out to you.',
                'Votes cast on proposals.',
                'Standing: Council, Trusted or New, from your roles in the DAO.',
              ]}
            />
            <P>
              A <b>clean record</b> means you're on the council or the trusted role, or you've had at least one request paid and none turned down. A clean record is what opens the fast lane.
              Records key on your NEAR account; a profile name is shown too, but the account id always stays visible.
            </P>
          </Section>

          <Section id="joining" title="Joining a group">
            <Steps
              items={[
                <>
                  A member opens <b>Members → Invite</b>, which shows a QR code and a join link.
                </>,
                <>
                  You open it and see the group, its balance and members, then tap <b>Sign in to ask</b>. That files a request to add you to the group.
                </>,
                <>
                  The council approves it in Approve. Your "Waiting for approval" card updates by itself and turns into "You're in".
                </>,
              ]}
            />
            <P>
              Groups made with Start a group take join requests from the start. For other DAOs, a council member first taps <b>Let people ask to join</b> in the Invite sheet; one council vote turns it on.
              You don't need to join to chip in or file a request.
            </P>
          </Section>

          <Section id="payouts" title="Payouts to other chains (NEAR Intents)">
            <P>
              When you request money, the recipient can pick a token on another chain, such as USDC on Solana. Pay asks NEAR Intents for a <b>live quote</b>: what they get exactly, how much NEAR
              the treasury sends, the fee and the time. The quote refreshes on a timer and is saved with the request, so approvers see the same numbers.
            </P>
            <P>
              On mainnet, the treasury pays the Intents deposit address and the recipient gets the token on their own chain. This demo runs on NEAR testnet, which NEAR Intents doesn't support,
              so here the payout is the quoted amount in NEAR, sent to a NEAR account named on the Pay screen.
            </P>
            <P>If the quote service is down, Pay shows a clearly labelled sample quote instead of a live one.</P>
          </Section>

          <Section id="allowances" title="Allowances">
            <P>
              The group can give a member, or an AI helper, a small budget. Payments inside it skip the vote. Allowances live in a small contract the DAO owns, and setting one up or changing it is
              a normal DAO request.
            </P>
            <List
              items={[
                <><b>Enforced on chain:</b> a daily cap, a most-per-payment and an end date.</>,
                <><b>Freeze:</b> any council member can freeze an allowance instantly. Only the DAO can change limits or unfreeze.</>,
                <><b>AI helper key:</b> a NEAR access key that can only call the allowance's pay method, with a small gas allowance. It can't send NEAR, call anything else or go over its budget.</>,
              ]}
            />
            <P>
              Dollar amounts aren't on chain: caps are stored in NEAR, converted at the price when the request is filed. A "day" is a UTC calendar day, and budgets share one pool.
            </P>
          </Section>

          <Section id="earn" title="Earn">
            <P>
              Money the group isn't using can be staked with a validator. Earn files a DAO request to stake it, and members approve it like any other request. The stake and rewards show in Earn.
            </P>
            <P>Rewards arrive once per epoch (about 12 hours), so a fresh stake shows close to zero at first. Unstaking isn't in the app yet.</P>
          </Section>

          <Section id="social" title="Profiles, comments and private messages">
            <P>All three live on NEAR Social and are signed by your own wallet. Terra has no backend.</P>
            <List
              items={[
                <><b>Profiles:</b> a name, avatar, short bio and links, saved to your standard NEAR Social profile, so they show in other NEAR apps too.</>,
                <><b>Comments:</b> a thread on each request, also shown on the Board. Plain text, up to 280 characters. Comments from people outside the group are folded away.</>,
                <><b>Private messages:</b> one-to-one between members, end-to-end encrypted in your browser. Your secret key is made in your browser and never leaves it.</>,
              ]}
            />
            <Note title="Privacy limits of private messages">
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                <li>Contents are encrypted, but who messages whom, and when, is public.</li>
                <li>The ciphertext stays on chain for good, and there's no forward secrecy.</li>
                <li>A new device or browser needs setup again; messages sent to the old key only open on the old device.</li>
                <li>Clearing site data loses the key.</li>
                <li>Each message is one wallet-signed write, up to 500 characters of plain text.</li>
              </ul>
            </Note>
          </Section>

          <Section id="real" title="What's real">
            <P>Each of these ran end to end and is a transaction you can open on NearBlocks.</P>
            <ul className="mt-5 border-t border-line">
              {PROOFS.map((p) => (
                <li key={p.what} className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 border-b border-line py-1.5 text-[14.5px]">
                  <span className="min-w-0">{p.what}</span>
                  <span className="-mr-2 flex shrink-0 flex-wrap text-[13.5px]">
                    {p.links.map(([label, hash]) => (
                      <a
                        key={hash}
                        href={TX(hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-ink underline decoration-line underline-offset-[3px] hover:decoration-ink"
                      >
                        {label}
                        <span className="sr-only"> (opens NearBlocks)</span>
                      </a>
                    ))}
                  </span>
                </li>
              ))}
              <li className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 border-b border-line py-1.5 text-[14.5px]">
                <span className="min-w-0">Cross-chain payout through NEAR Intents</span>
                <span className="text-[13.5px] text-mute">Live mainnet quote; payout pending</span>
              </li>
            </ul>
            <P>
              The full list, with how each piece fits, is in the{' '}
              <A href="https://github.com/somewherelostt/terra#whats-real-vs-testnet" external>
                README
              </A>
              .
            </P>
          </Section>

          <Section id="faq" title="FAQ">
            {FAQ.length ? (
              <div className="mt-4 border-t border-line">
                {FAQ.map((f) => (
                  <details key={f.q} className="group border-b border-line">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[15px] font-medium">
                      {f.q}
                      <span aria-hidden className="text-mute transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <div className="pb-4 text-[15px] leading-7 text-mute">{f.a}</div>
                  </details>
                ))}
              </div>
            ) : (
              <P>Answers to common questions are on the way. Until then, <A href="https://github.com/somewherelostt/terra/issues" external>ask on GitHub</A>.</P>
            )}
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
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const label = SECTIONS.find(([id]) => id === active)?.[1] ?? 'Sections'

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
        className="flex min-h-12 min-w-0 flex-1 items-center gap-2 pl-4 text-left text-[14px] sm:pl-6"
      >
        <span className="text-mute">Docs</span>
        <span aria-hidden className="text-mute">/</span>
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <svg viewBox="0 0 24 24" className="size-4 text-mute" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <button type="button" onClick={onSearch} aria-label="Search docs" className="grid min-h-12 w-14 place-items-center text-mute hover:text-ink sm:mr-2">
        <SecIcon d="M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4" className="size-[18px]" />
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 grid items-end glass-scrim md:hidden" onClick={() => setOpen(false)} role="dialog" aria-modal aria-label="Docs sections">
            <div
              className="max-h-[85vh] w-full overflow-y-auto glass glass-sheet rounded-t-2xl border border-line bg-card p-3 pb-[max(env(safe-area-inset-bottom),12px)] text-ink"
              onClick={(e) => e.stopPropagation()}
            >
              <ul ref={listRef} className="flex flex-col">
                {SECTIONS.map(([id, l]) => (
                  <li key={id}>
                    {GROUPS.some((g) => g.items[0].id === id) && <div className="px-3 pt-3 pb-1 text-[12px] font-medium text-accent-text">{groupOf(id)}</div>}
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
                      {l}
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
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-[136px] border-t border-line pt-10 pb-12 md:scroll-mt-20">
      <div className="mb-2 text-[12.5px] font-medium text-accent-text">{groupOf(id)}</div>
      <h2 id={`${id}-h`} className="group flex items-baseline gap-2 text-[24px] leading-tight font-light tracking-[-0.025em] md:text-[28px]">
        {title}
        <a href={sectionHref(id)} aria-label={`Link to ${title}`} className="-my-2 hidden size-10 shrink-0 place-items-center self-center rounded-lg text-[18px] text-mute opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink md:grid">
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
            {i + 1}
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
          {sec.title}
          <span aria-hidden className="text-mute transition-transform group-hover:translate-x-0.5">→</span>
        </span>
        <span className="mt-0.5 block text-[13.5px] leading-5 text-mute">{text}</span>
      </span>
    </a>
  )
}

/** A one-line code block with a copy button. */
function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line pl-4 text-[12px] text-mute">
        <span>Link to any group</span>
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
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-6 text-ink">
        <code>{children}</code>
      </pre>
    </div>
  )
}

function SearchButton({ onOpen }: { onOpen: () => void }) {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-panel px-3 text-[13.5px] text-mute transition-colors hover:border-mute hover:text-ink"
    >
      <SecIcon d="M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4" className="size-4" />
      <span className="flex-1 text-left">Search docs</span>
      <kbd className="rounded border border-line px-1.5 font-sans text-[11px]">{mac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  )
}

function SearchDialog({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const all = GROUPS.flatMap((g) => g.items.map((it) => ({ ...it, group: g.label })))
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const hits = all.filter((it) => words.every((w) => `${it.title} ${it.keys} ${it.group}`.toLowerCase().includes(w)))
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
    <div className="fixed inset-0 z-50 grid place-items-start justify-items-center glass-scrim px-4 pt-[12vh]" onClick={onClose} role="dialog" aria-modal aria-label="Search docs">
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
            placeholder="Search the docs"
            aria-label="Search the docs"
            className="h-14 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-mute"
          />
          <button type="button" onClick={onClose} className="grid h-11 place-items-center rounded-lg px-2 text-[12px] text-mute hover:text-ink">
            Esc
          </button>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox" aria-label="Results">
          {hits.map((it, n) => (
            <li key={it.id} role="option" aria-selected={n === sel}>
              <button
                type="button"
                onClick={() => go(it.id)}
                onMouseMove={() => setI(n)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left ${n === sel ? 'bg-sand' : ''}`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-mute">
                  <SecIcon d={it.icon} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px]">{it.title}</span>
                  <span className="block text-[12px] text-mute">{it.group}</span>
                </span>
                {n === sel && <span aria-hidden className="text-[12px] text-mute">↵</span>}
              </button>
            </li>
          ))}
          {!hits.length && <li className="px-3 py-6 text-center text-[14px] text-mute">Nothing matches "{q}".</li>}
        </ul>
      </div>
    </div>,
    document.body,
  )
}

/** Wide screens: a quiet rail with the places to try Terra. */
function RightRail() {
  const links: [string, string, string][] = [
    ['Open the demo group', shareUrl(DEMO_DAO, 'home'), 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z'],
    ['Live public board', shareUrl(DEMO_DAO, 'board'), 'M4 4h16v12H4zM8 20h8'],
    ['Android app', 'https://github.com/somewherelostt/terra/releases/tag/v1.0.0', 'M7 3h10v18H7zM11 18h2'],
    ['Report a bug', 'https://github.com/somewherelostt/terra/issues', 'M12 8v4M12 16h.01M12 3a9 9 0 100 18 9 9 0 000-18z'],
  ]
  return (
    <aside className="hidden xl:block" aria-label="Try Terra">
      <div className="sticky top-16 py-10">
        <div className="pb-3 text-[12px] font-medium text-ink">Try it</div>
        <ul className="flex flex-col gap-px">
          {links.map(([label, href, d]) => (
            <li key={label}>
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
        <div className="mt-6 rounded-2xl border border-line bg-panel p-4 text-[12.5px] leading-5 text-mute">
          Terra never holds the money. Every payout is a vote on the group's own DAO.
        </div>
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
