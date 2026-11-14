import { Fragment, useEffect, type MouseEvent, type ReactNode } from 'react'
import { FAQ_GROUPS, faqIdFromHash, type FaqGroup, type FaqItem } from '../lib/faq'

const reduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const QUESTIONS = 'details.faq-item:not(.faq-chapter)'
const CHAPTERS = 'details.faq-chapter'

/**
 * Only one chapter and one question open at a time. The page itself never scrolls: the old one folds
 * shut while the new one opens, at the same pace, so the list just glides.
 */
function closeOthers(keep: HTMLDetailsElement, selector: string) {
  document.querySelectorAll<HTMLDetailsElement>(selector).forEach((d) => {
    if (d === keep || !d.open || d.contains(keep)) return
    d.open = false
    // A chapter that folds away takes its open question with it, after it has finished folding.
    if (d.classList.contains('faq-chapter')) setTimeout(() => d.querySelectorAll('details[open]').forEach((q) => ((q as HTMLDetailsElement).open = false)), 300)
  })
}

/** Summary click: about to open, so close the others first. */
function onSummaryClick(e: MouseEvent<HTMLElement>, selector: string) {
  const d = e.currentTarget.parentElement as HTMLDetailsElement
  if (!d.open) closeOthers(d, selector)
}

/**
 * Open a question. A link from outside (page load, hash change) brings it near the top; a link inside
 * the FAQ leaves the page where it is when the question is already on screen.
 */
function reveal(id: string, smooth: boolean, from: 'outside' | 'inside' = 'outside') {
  const el = document.getElementById(`faq-${id}`) as HTMLDetailsElement | null
  if (!el) return
  const ch = el.closest<HTMLDetailsElement>(CHAPTERS)
  if (ch && !ch.open) {
    closeOthers(ch, CHAPTERS)
    ch.open = true
  }
  closeOthers(el, QUESTIONS)
  el.open = true
  // Measure once the chapter and answer have finished opening.
  setTimeout(() => {
    const r = el.getBoundingClientRect()
    const onScreen = r.top >= 72 && r.top + 160 <= window.innerHeight
    if (from === 'outside' || !onScreen) {
      // window.scrollTo rather than scrollIntoView, which some browsers skip for content inside <details>.
      const top = from === 'outside' ? r.top + window.scrollY - 96 : r.top + window.scrollY - window.innerHeight / 2 + 80
      window.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduce() ? 'smooth' : 'instant' })
    }
    el.querySelector('summary')?.focus({ preventScroll: true })
  }, reduce() ? 0 : 300)
}

/**
 * Terra's FAQ: the five parts of the story, each folded to one row, with its questions as collapsed
 * rows inside. One chapter and one question are open at a time, and the page never scrolls by itself
 * when you open one.
 * - `landing`: `intro` on the left (sticky from md up), the chapters on the right.
 * - `list` (docs): just the chapters.
 * Deep links open the question: `hrefFor(id)` builds them (`#faq-<id>` on the landing page).
 */
export default function Faq({ variant, hrefFor, intro }: { variant: 'landing' | 'list'; hrefFor: (id: string) => string; intro?: ReactNode }) {
  // A link to a question opens it, on load and whenever the hash changes.
  useEffect(() => {
    const id = faqIdFromHash()
    // After the page around it (e.g. the docs) has laid out and done its own scrolling.
    if (id) setTimeout(() => reveal(id, false), 50)
    const on = () => {
      const next = faqIdFromHash()
      if (next) reveal(next, true)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const follow = (id: string) => {
    history.replaceState(history.state, '', hrefFor(id))
    reveal(id, true, 'inside')
  }

  const chapters = (
    <div className={`border-t border-line ${variant === 'list' ? 'mt-6' : 'min-w-0'}`}>
      {FAQ_GROUPS.map((g, i) => (
        <details key={g.id} id={`faq-ch-${g.id}`} className="faq-item faq-chapter group/ch scroll-mt-24 border-b border-line">
          <summary onClick={(e) => onSummaryClick(e, CHAPTERS)} className="flex min-h-[76px] cursor-pointer list-none items-center gap-4 rounded-lg py-4">
            <span className="tnum w-6 shrink-0 self-start pt-0.5 text-[13px] text-mute">{String(i + 1).padStart(2, '0')}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16.5px] leading-6 font-medium tracking-[-0.01em]">{g.title}</span>
              <span className="mt-1 block text-[14px] leading-6 text-mute">{g.lead}</span>
            </span>
            {/* i18n-ignore: FAQ wording is still being approved; faq.ts gets translated after that */}
            <span className="tnum hidden shrink-0 text-[13px] text-mute sm:inline">{g.items.length} questions</span>
            <svg aria-hidden viewBox="0 0 24 24" className="faq-chev size-5 shrink-0 text-mute group-hover/ch:text-ink" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </summary>
          <div className="pb-4 sm:pl-10">
            <Items group={g} hrefFor={hrefFor} follow={follow} />
          </div>
        </details>
      ))}
    </div>
  )

  if (variant === 'list') return chapters

  return (
    <div className="grid gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16">
      <div className="md:sticky md:top-24 md:self-start">{intro}</div>
      {chapters}
    </div>
  )
}

function Items({ group, hrefFor, follow }: { group: FaqGroup; hrefFor: (id: string) => string; follow: (id: string) => void }) {
  return (
    <div className="border-t border-line">
      {group.items.map((item) => (
        <Item key={item.id} item={item} hrefFor={hrefFor} follow={follow} />
      ))}
    </div>
  )
}

function Item({ item, hrefFor, follow }: { item: FaqItem; hrefFor: (id: string) => string; follow: (id: string) => void }) {
  return (
    <details id={`faq-${item.id}`} className="faq-item group scroll-mt-24 border-b border-line">
      <summary onClick={(e) => onSummaryClick(e, QUESTIONS)} className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-3 text-[15.5px] font-medium hover:text-ink">
        <span className="min-w-0">{item.q}</span>
        <span aria-hidden className="faq-plus grid size-6 shrink-0 place-items-center text-[20px] leading-none font-light text-mute group-hover:text-ink">
          +
        </span>
      </summary>
      <div className="max-w-[68ch] pb-5 text-[15px] leading-7 text-ink/80">{renderAnswer(item.a, hrefFor, follow)}</div>
    </details>
  )
}

/** Renders the tiny answer markup described in lib/faq.ts. */
function renderAnswer(text: string, hrefFor: (id: string) => string, follow: (id: string) => void): ReactNode {
  const blocks: { list: boolean; lines: string[] }[] = []
  for (const line of text.split('\n')) {
    const list = line.startsWith('- ')
    const last = blocks[blocks.length - 1]
    if (last && last.list === list && list) last.lines.push(line.slice(2))
    else blocks.push({ list, lines: [list ? line.slice(2) : line] })
  }
  return blocks.map((b, i) =>
    b.list ? (
      <ul key={i} className="my-2 space-y-1.5 pl-5 [list-style:disc] marker:text-mute">
        {b.lines.map((l, j) => (
          <li key={j}>{inline(l, hrefFor, follow)}</li>
        ))}
      </ul>
    ) : (
      <p key={i} className={i ? 'mt-2' : ''}>
        {inline(b.lines[0], hrefFor, follow)}
      </p>
    ),
  )
}

function inline(text: string, hrefFor: (id: string) => string, follow: (id: string) => void): ReactNode {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p)
    if (link) {
      const [, label, target] = link
      if (target.startsWith('#')) {
        const id = target.slice(1)
        return (
          <a
            key={i}
            href={hrefFor(id)}
            onClick={(e) => {
              e.preventDefault()
              follow(id)
            }}
            className="text-ink underline decoration-line decoration-1 underline-offset-4 hover:decoration-ink"
          >
            {label}
          </a>
        )
      }
      return (
        <a key={i} href={target} target="_blank" rel="noreferrer" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
          {label}
        </a>
      )
    }
    const bold = /^\*\*([^*]+)\*\*$/.exec(p)
    if (bold) return <b key={i} className="font-medium text-ink">{bold[1]}</b>
    return <Fragment key={i}>{p}</Fragment>
  })
}
