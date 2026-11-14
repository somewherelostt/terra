import { useState, type ReactNode } from 'react'
import { accountUrl, txUrl } from '../lib/near'
import { shortName, usd, yoctoToNear, yoctoToNumber } from '../lib/format'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-card p-5 shadow-sm ${className}`}>{children}</div>
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>
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
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
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

export function Avatar({ id, size = 32 }: { id: string; size?: number }) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase text-white"
      style={{ width: size, height: size, background: `hsl(${h} 45% 42%)`, fontSize: size * 0.42 }}
      title={id}
    >
      {shortName(id).slice(0, 1)}
    </span>
  )
}

export function Money({ yocto, nearUsd, size = 'md' }: { yocto: string | bigint; nearUsd: number; size?: 'md' | 'lg' | 'xl' }) {
  const n = yoctoToNumber(yocto)
  const main = isFinite(nearUsd) ? usd(n * nearUsd) : `${yoctoToNear(yocto)} NEAR`
  const cls = { md: 'text-base', lg: 'text-2xl', xl: 'text-5xl tracking-tight' }[size]
  return (
    <span className="inline-flex flex-col">
      <span className={`font-semibold tabular-nums ${cls}`}>{main}</span>
      {isFinite(nearUsd) && <span className="text-xs text-muted tabular-nums">{yoctoToNear(yocto)} NEAR</span>}
    </span>
  )
}

export function TxLink({ hash, label = 'View on NearBlocks' }: { hash?: string; label?: string }) {
  if (!hash) return null
  return (
    <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand hover:underline">
      {label} ↗
    </a>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'brand' }) {
  const t = {
    neutral: 'bg-soft text-muted',
    good: 'bg-good-soft text-good',
    bad: 'bg-bad-soft text-bad',
    warn: 'bg-warn-soft text-warn',
    brand: 'bg-brand-soft text-brand',
  }[tone]
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${t}`}>{children}</span>
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
  'w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20'

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{children}</div>
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-label="Loading" />
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
      setState({ status: 'error', error: /reject|cancel|closed|denied/i.test(msg) ? 'Cancelled in the wallet.' : msg })
      return null
    }
  }
  return { state, run, reset: () => setState({ status: 'idle' }) }
}

export function TxStatus({ state, doneText }: { state: TxState; doneText: string }) {
  if (state.status === 'idle') return null
  if (state.status === 'signing')
    return (
      <div className="flex items-center gap-2 rounded-xl bg-soft px-3 py-2 text-sm text-muted">
        <Spinner /> Waiting for your wallet…
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
