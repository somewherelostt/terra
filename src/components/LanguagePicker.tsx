// Language picker: a translate icon, the current language's name and a chevron. Opens a list of
// every language in its own name, with its name in the current language beside it and a check on
// the chosen one. Used in the site footer, the docs header and the account menu.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { AVAILABLE as LOCALES, isRtl, languageName, setLocale, useLocale, useT } from '../i18n'

/** "文A": the usual translate glyph. */
export function TranslateIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h9M8.5 3v2M11 5c-1 4.5-3.6 7.8-7 9.5M6 9c1.2 2.2 3 3.9 5.5 5M13 21l4-9 4 9M14.4 18h5.2" />
    </svg>
  )
}

const LIST_W = 300
const GAP = 6
const EDGE = 8

/**
 * `up` opens the list above the button (footer); `align` pins it to the button's start or end edge; `end-md` is start on
 * phones and end from md up (the footer's bottom row wraps on phones, so the picker sits at the start there).
 * The compact button's list is portalled to <body> with fixed positioning, so clipping parents (the footer
 * hides its overflow for the big wordmark) can't cut it off. `variant="row"` renders a full-width account-menu
 * row whose list opens inline below it.
 */
export default function LanguagePicker({ up = false, align = 'start', variant = 'button', className = '' }: { up?: boolean; align?: 'start' | 'end' | 'end-md'; variant?: 'button' | 'row'; className?: string }) {
  const t = useT()
  const code = useLocale()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<CSSProperties | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const current = LOCALES.find((l) => l.code === code) ?? LOCALES[0]

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      btnRef.current?.focus()
    }
    const onDoc = (e: MouseEvent) => {
      const n = e.target as Node
      if (!ref.current?.contains(n) && !listRef.current?.contains(n)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [open])

  // Place the portalled list next to the button, inside the viewport, and keep it there on scroll and resize.
  useLayoutEffect(() => {
    if (!open || variant === 'row') return
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect()
      if (!b) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = Math.min(LIST_W, vw - EDGE * 2)
      const side = align === 'end-md' ? (vw >= 768 ? 'end' : 'start') : align
      const rtl = isRtl()
      const atRight = (side === 'end') !== rtl
      const left = Math.min(Math.max(atRight ? b.right - w : b.left, EDGE), vw - w - EDGE)
      const roomUp = b.top - GAP - EDGE
      const roomDown = vh - b.bottom - GAP - EDGE
      const goUp = up ? roomUp >= 160 || roomUp > roomDown : roomDown < 160 && roomUp > roomDown
      setPos(
        goUp
          ? { position: 'fixed', left, width: w, bottom: vh - b.top + GAP, maxHeight: Math.min(420, roomUp) }
          : { position: 'fixed', left, width: w, top: b.bottom + GAP, maxHeight: Math.min(420, roomDown) },
      )
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, up, align, variant])

  // Start with the chosen language in view.
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, pos])

  const choose = (c: string) => {
    setOpen(false)
    void setLocale(c)
  }

  const chevron = (
    <svg viewBox="0 0 24 24" className={`size-3.5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )

  const options = LOCALES.map((l) => {
    const selected = l.code === code
    const local = languageName(l.code)
    return (
      <li key={l.code}>
        <button
          type="button"
          role="option"
          aria-selected={selected}
          onClick={() => choose(l.code)}
          className={`grid min-h-11 w-full grid-cols-[16px_auto_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-2.5 text-start text-[13.5px] hover:bg-soft sm:min-h-9 ${selected ? 'text-ink' : 'text-ink/80 hover:text-ink'}`}
        >
          <span className="grid place-items-center">
            {selected && (
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            )}
          </span>
          <span lang={l.code} dir={l.dir ?? 'ltr'} className={`justify-self-start whitespace-nowrap ${selected ? 'font-medium' : ''}`}>{l.name}</span>
          {local.toLowerCase() !== l.name.toLowerCase() && <span className="truncate text-end text-[12px] text-muted">{local}</span>}
        </button>
      </li>
    )
  })

  if (LOCALES.length < 2) return null

  if (variant === 'row')
    return (
      <div ref={ref} className={className}>
        <button
          ref={btnRef}
          type="button"
          role="menuitem"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-start text-[14px] hover:bg-soft sm:min-h-10"
        >
          <span className="flex items-center gap-2">
            <TranslateIcon className="size-4 text-muted" />
            {t('lang.label')}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <span lang={current.code}>{current.name}</span>
            {chevron}
          </span>
        </button>
        {open && (
          <ul ref={listRef} role="listbox" aria-label={t('lang.label')} className="mt-1 max-h-[min(320px,45vh)] overflow-y-auto border-t border-line pt-1">
            {options}
          </ul>
        )}
      </div>
    )

  return (
    <div ref={ref} className={className}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('lang.choose', { name: current.name })}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-mute transition-colors hover:text-ink focus-visible:outline-ink"
      >
        <TranslateIcon className="size-4" />
        <span lang={current.code}>{current.name}</span>
        {chevron}
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            aria-label={t('lang.label')}
            dir={isRtl() ? 'rtl' : 'ltr'}
            style={pos}
            className="glass glass-menu z-[60] overflow-y-auto rounded-xl border border-line bg-card p-1 text-ink"
          >
            {options}
          </ul>,
          document.body,
        )}
    </div>
  )
}
