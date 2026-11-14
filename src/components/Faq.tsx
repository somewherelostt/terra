import { Fragment, useEffect, type ReactNode } from 'react'
import { FAQ_IDS, faqIdFromHash } from '../lib/faq'
import { useT } from '../i18n'

const reduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** One answer open at a time. The page never scrolls on a click; the old answer folds as the new one opens. */
function closeOthers(keep: HTMLDetailsElement) {
  keep.parentElement?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((d) => {
    if (d !== keep) d.open = false
  })
}

/** A link from outside (page load or hash change) opens the question and brings it near the top. */
function reveal(id: string, smooth: boolean) {
  const el = document.getElementById(`faq-${id}`) as HTMLDetailsElement | null
  if (!el) return
  closeOthers(el)
  el.open = true
  // window.scrollTo rather than scrollIntoView, which some browsers skip for content inside <details>.
  const top = el.getBoundingClientRect().top + window.scrollY - 96
  window.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduce() ? 'smooth' : 'instant' })
  el.querySelector('summary')?.focus({ preventScroll: true })
}

/**
 * Terra's FAQ: a short, flat list of questions as collapsed rows.
 * - `landing`: `intro` on the left (sticky from md up), the questions on the right.
 * - `list` (docs): just the questions.
 */
export default function Faq({ variant, intro }: { variant: 'landing' | 'list'; intro?: ReactNode; hrefFor?: (id: string) => string }) {
  const t = useT()

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

  const list = (
    <div className={`min-w-0 border-t border-line ${variant === 'list' ? 'mt-6' : ''}`}>
      {FAQ_IDS.map((id) => (
        <details key={id} id={`faq-${id}`} className="faq-item group scroll-mt-24 border-b border-line">
          <summary
            onClick={(e) => {
              const d = e.currentTarget.parentElement as HTMLDetailsElement
              if (!d.open) closeOthers(d)
            }}
            className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-3 text-[16px] font-medium"
          >
            <span className="min-w-0">{t(`faq.${id}.q`)}</span>
            <span aria-hidden className="faq-plus grid size-6 shrink-0 place-items-center text-[20px] leading-none font-light text-mute group-hover:text-ink">
              +
            </span>
          </summary>
          <p className="max-w-[62ch] pb-5 text-[15px] leading-7 text-ink/75">{inline(t(`faq.${id}.a`))}</p>
        </details>
      ))}
    </div>
  )

  if (variant === 'list') return list

  return (
    <div className="grid gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16">
      <div className="md:sticky md:top-24 md:self-start">{intro}</div>
      {list}
    </div>
  )
}

/** [text](https://…) becomes a link and **text** bold; everything else is plain text. */
function inline(text: string): ReactNode {
  return text.split(/(\[[^\]]+\]\(https:[^)]+\)|\*\*[^*]+\*\*)/g).map((p, i) => {
    const link = /^\[([^\]]+)\]\((https:[^)]+)\)$/.exec(p)
    if (link) {
      return (
        <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
          {link[1]}
        </a>
      )
    }
    const bold = /^\*\*([^*]+)\*\*$/.exec(p)
    if (bold) return <b key={i} className="font-medium text-ink">{bold[1]}</b>
    return <Fragment key={i}>{p}</Fragment>
  })
}
