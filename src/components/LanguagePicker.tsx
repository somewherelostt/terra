// Language picker: a globe, the current language's name and a chevron. Opens a small list
// of every language in its own name. Used in the site footer, the docs header and the account menu.
import { useEffect, useRef, useState } from 'react'
import { AVAILABLE as LOCALES, setLocale, useLocale, useT } from '../i18n'

const GLOBE = 'M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 010 18M12 3a14 14 0 000 18'

export function Globe({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={GLOBE} />
    </svg>
  )
}

/**
 * `up` opens the list above the button (footer); `align` pins it to the button's start or end edge.
 * `variant="row"` renders a full-width menu row (account menu) instead of a compact button.
 */
export default function LanguagePicker({ up = false, align = 'start', variant = 'button', className = '' }: { up?: boolean; align?: 'start' | 'end'; variant?: 'button' | 'row'; className?: string }) {
  const t = useT()
  const code = useLocale()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = LOCALES.find((l) => l.code === code) ?? LOCALES[0]

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [open])

  const choose = (c: string) => {
    setOpen(false)
    void setLocale(c)
  }

  const chevron = (
    <svg viewBox="0 0 24 24" className={`size-3.5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )

  const list = (
    <ul
      role="listbox"
      aria-label={t('lang.label')}
      className={
        variant === 'row'
          ? 'mt-1 grid grid-cols-2 gap-0.5 border-t border-line pt-1'
          : `glass glass-menu absolute z-50 max-h-[min(420px,70vh)] w-56 overflow-y-auto rounded-xl border border-line bg-card p-1 text-ink ${up ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'} ${align === 'end' ? 'end-0' : 'start-0'}`
      }
    >
      {LOCALES.map((l) => (
        <li key={l.code}>
          <button
            type="button"
            role="option"
            aria-selected={l.code === code}
            lang={l.code}
            dir={l.dir ?? 'ltr'}
            onClick={() => choose(l.code)}
            className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-start text-[13.5px] hover:bg-soft sm:min-h-10 ${l.code === code ? 'font-medium text-ink' : 'text-muted hover:text-ink'}`}
          >
            <span className="truncate">{l.name}</span>
            {l.code === code && (
              <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            )}
          </button>
        </li>
      ))}
    </ul>
  )

  if (LOCALES.length < 2) return null

  if (variant === 'row')
    return (
      <div ref={ref} className={className}>
        <button
          type="button"
          role="menuitem"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-start text-[14px] hover:bg-soft sm:min-h-10"
        >
          <span className="flex items-center gap-2">
            <Globe className="size-4 text-muted" />
            {t('lang.label')}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <span lang={current.code}>{current.name}</span>
            {chevron}
          </span>
        </button>
        {open && list}
      </div>
    )

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('lang.choose', { name: current.name })}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-mute transition-colors hover:text-ink focus-visible:outline-ink"
      >
        <Globe className="size-4" />
        <span lang={current.code}>{current.name}</span>
        {chevron}
      </button>
      {open && list}
    </div>
  )
}
