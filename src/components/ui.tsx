import { useEffect, useState, type ReactNode } from 'react'
import { accountUrl, txUrl, viewAccount } from '../lib/near'
import { useAvatarUrl } from '../lib/avatar'
import { shortName, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { t, tr, useT } from '../i18n'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-card p-5 ${className}`}>{children}</div>
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{children}</h2>
      {right}
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  className = '',
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
  title?: string
}) {
  const styles = {
    primary: 'bg-brand text-on-brand hover:bg-brand-strong',
    secondary: 'border border-line bg-card text-ink hover:bg-soft',
    ghost: 'text-ink hover:bg-soft',
    danger: 'border border-line bg-card text-bad hover:bg-bad-soft',
  }[variant]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[15px] font-medium transition md:min-h-0 md:text-sm disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

export function Account({ id, className = '' }: { id: string; className?: string }) {
  return (
    <a href={accountUrl(id)} target="_blank" rel="noreferrer" title={id} className={`font-medium text-ink hover:underline ${className}`}>
      {shortName(id)}
    </a>
  )
}

export function Avatar({ id, size = 32, shape = 'square' }: { id: string; size?: number; shape?: 'square' | 'circle' }) {
  const url = useAvatarUrl(id)
  const [failed, setFailed] = useState(false)
  // Rounded squares (about 12/64) everywhere; circles only in small overlapping stacks.
  const radius = shape === 'circle' ? 9999 : Math.round(size * 0.19)
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360
  if (failed)
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center font-medium uppercase text-white"
        style={{ width: size, height: size, background: `hsl(${h} 45% 42%)`, fontSize: size * 0.42, borderRadius: radius }}
        title={id}
      >
        {shortName(id).slice(0, 1)}
      </span>
    )
  return (
    <img
      src={url}
      alt=""
      title={id}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="inline-block shrink-0 object-cover"
      style={{ width: size, height: size, borderRadius: radius, background: '#1a1a1d' }}
    />
  )
}

export function Money({ yocto, nearUsd, size = 'md' }: { yocto: string | bigint; nearUsd: number; size?: 'md' | 'lg' | 'xl' }) {
  const n = yoctoToNumber(yocto)
  const main = isFinite(nearUsd) ? usd(n * nearUsd) : `${yoctoToNear(yocto)} NEAR`
  const cls = { md: 'text-base', lg: 'text-2xl', xl: 'text-5xl tracking-tight' }[size]
  return (
    <span className="inline-flex flex-col">
      <span className={`font-medium tabular-nums ${cls}`}>{main}</span>
      {isFinite(nearUsd) && <span className="text-xs text-muted tabular-nums">{yoctoToNear(yocto)} NEAR</span>}
    </span>
  )
}

export function TxLink({ hash, label }: { hash?: string; label?: string }) {
  const t = useT()
  if (!hash) return null
  return (
    <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="relative after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] text-xs font-medium text-accent-text hover:underline">
      {label ?? t('ui.viewOnNearBlocks')} ↗
    </a>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'brand' }) {
  const toneCls = {
    neutral: 'bg-soft text-muted',
    good: 'bg-good-soft text-good',
    bad: 'bg-bad-soft text-bad',
    warn: 'bg-warn-soft text-warn',
    brand: 'bg-brand-soft text-accent-text',
  }[tone]
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneCls}`}>{children}</span>
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'min-h-11 w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20'

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{children}</div>
}

const EMPTY_ICONS = {
  check: 'M5 12l4 4 10-10',
  plus: 'M12 5v14M5 12h14',
  list: 'M4 6h16M4 12h16M4 18h10',
  people: 'M16 11a4 4 0 10-8 0M4 20a8 8 0 0116 0',
}

/** The one empty state: a small icon in a ring, a title, one line of help and at most a couple of actions. */
export function EmptyState({
  icon = 'check',
  title,
  text,
  children,
  className = '',
}: {
  icon?: keyof typeof EMPTY_ICONS
  title: ReactNode
  text?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-line px-6 py-10 text-center ${className}`}>
      <div className="mx-auto grid size-12 place-items-center rounded-full border border-line">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={EMPTY_ICONS[icon]} />
        </svg>
      </div>
      <div className="mt-4 text-[15px]">{title}</div>
      {text && <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">{text}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}

export function Spinner() {
  const t = useT()
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-e-transparent" aria-label={t('ui.loading')} />
}

export interface TxState {
  status: 'idle' | 'signing' | 'done' | 'error'
  hash?: string
  error?: string
}

export function useTx() {
  const [state, setState] = useState<TxState>({ status: 'idle' })
  async function run(fn: () => Promise<string>, after?: () => void | Promise<void>) {
    setState({ status: 'signing' })
    try {
      const hash = await fn()
      setState({ status: 'done', hash })
      await after?.()
      return hash
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setState({ status: 'error', error: /reject|cancel|closed|denied/i.test(msg) ? t('ui.tx.cancelled') : msg })
      return null
    }
  }
  return { state, run, reset: () => setState({ status: 'idle' }) }
}

export function TxStatus({ state, doneText }: { state: TxState; doneText: string }) {
  const t = useT()
  if (state.status === 'idle') return null
  if (state.status === 'signing')
    return (
      <div className="flex items-center gap-2 rounded-xl bg-soft px-3 py-2 text-sm text-muted">
        <Spinner /> {t('ui.tx.waiting')}
      </div>
    )
  if (state.status === 'error') return <div className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</div>
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-good-soft px-3 py-2 text-sm text-good">
      <span>{doneText}</span>
      <TxLink hash={state.hash} />
    </div>
  )
}

// ----- Toast: a dark pill at the bottom centre for 4 seconds -----

interface ToastMsg {
  id: number
  text: string
  action?: { label: string; onClick: () => void }
}

// eslint-disable-next-line react-refresh/only-export-components
export function showToast(text: string, action?: ToastMsg['action']) {
  window.dispatchEvent(new CustomEvent<ToastMsg>('terra:toast', { detail: { id: Date.now(), text, action } }))
}

export function Toaster() {
  const [msg, setMsg] = useState<ToastMsg | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const on = (e: Event) => {
      setMsg((e as CustomEvent<ToastMsg>).detail)
      clearTimeout(timer)
      timer = setTimeout(() => setMsg(null), 4000)
    }
    window.addEventListener('terra:toast', on)
    return () => {
      window.removeEventListener('terra:toast', on)
      clearTimeout(timer)
    }
  }, [])
  if (!msg) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-8" role="status">
      <div key={msg.id} className="toast-in pointer-events-auto flex items-center gap-3 rounded-full bg-hero py-2.5 ps-4 pe-2 text-[13.5px] text-on-hero ring-1 ring-[var(--hero-ring)]">
        <span className="size-1.5 rounded-full bg-accent" />
        <span>{msg.text}</span>
        {msg.action && (
          <button className="rounded-full bg-white/10 px-3 py-1 text-[12.5px] font-medium" onClick={msg.action.onClick}>
            {msg.action.label}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * A row label. From `sm` up it is one line: the reason truncates, the muted detail stays whole.
 * On a phone the detail drops to its own muted line, so the reason gets the full width.
 */
export function RowText({ main, detail, extra }: { main: ReactNode; detail?: ReactNode; extra?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
      <span className="min-w-0 truncate">{main}</span>
      {(detail || extra) && (
        <span className="flex min-w-0 items-baseline gap-1.5 text-[12.5px] sm:contents sm:text-[length:inherit]">
          {detail && (
            <span className="min-w-0 truncate text-muted sm:shrink-0 sm:overflow-visible sm:whitespace-nowrap">
              <span className="hidden sm:inline">· </span>
              {detail}
            </span>
          )}
          {extra && <span className="shrink-0">{extra}</span>}
        </span>
      )}
    </span>
  )
}

/**
 * Terra runs on testnet. A wallet signed in on mainnet hands over an account that doesn't
 * exist here, and every transaction would fail, so say so before anyone tries.
 */
export function WrongNetworkBanner({ accountId, onSignOut }: { accountId: string | null; onSignOut: () => void }) {
  useT() // re-render on language change (tr reads the catalog)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    setMissing(false)
    if (!accountId) return
    let alive = true
    viewAccount(accountId)
      .then((a) => alive && setMissing(a === null))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [accountId])
  if (!accountId || !missing) return null
  return (
    <div className="rounded-xl bg-warn-soft px-4 py-3 text-[13px] text-warn" role="alert">
      {tr('ui.wrongNetwork', {
        account: accountId,
        b: (c) => <span className="font-medium">{c}</span>,
        mono: (c) => <span className="font-mono">{c}</span>,
        signIn: (c) => (
          <button className="underline underline-offset-2" onClick={onSignOut}>
            {c}
          </button>
        ),
      })}
    </div>
  )
}
