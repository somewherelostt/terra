// "My groups": a switcher in the sidebar (popover) and the phone top bar (bottom sheet).
// Each row: group name, its balance in $, your role, open requests. One click switches.

import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DEMO_DAO, DaoContext, go, openDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { isDao } from '../lib/dao'
import { getNearUsdPrice } from '../lib/intents'
import { isValidAccountId } from '../lib/near'
import { usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { confirmGroupsSaved, recordVisit, roleLabel, saveGroupsTx, useMyGroups, type GroupRow } from '../lib/groups'
import { showToast } from './ui'

function pretty(name: string): string {
  return name
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

let priceCache = NaN
function useNearUsd(): number {
  const ctx = useContext(DaoContext)
  const [p, setP] = useState(priceCache)
  useEffect(() => {
    if (ctx && isFinite(ctx.nearUsd)) return
    if (isFinite(priceCache)) return
    getNearUsdPrice()
      .then((v) => {
        priceCache = v
        setP(v)
      })
      .catch(() => undefined)
  }, [ctx])
  return ctx && isFinite(ctx.nearUsd) ? ctx.nearUsd : p
}

/** The current group's id, from the DAO context or the URL. */
function useCurrentDao(): string | null {
  const ctx = useContext(DaoContext)
  return ctx?.dao?.id ?? new URL(window.location.href).searchParams.get('dao')
}

export default function GroupSwitcher({ variant }: { variant: 'sidebar' | 'phone' }) {
  const current = useCurrentDao()
  const ctx = useContext(DaoContext)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (current) recordVisit(current)
  }, [current])

  const label = ctx?.dao ? pretty(ctx.dao.config.name) : current ? current.split('.')[0] : 'My groups'

  return (
    <>
      {variant === 'phone' ? (
        <button
          onClick={() => setOpen(true)}
          className="flex min-h-11 min-w-0 items-center gap-1 truncate text-[14px] font-medium"
          aria-haspopup="dialog"
          aria-expanded={open}
          title="My groups"
        >
          <span className="truncate">{label}</span>
          <Chevron />
        </button>
      ) : (
        <button
          onClick={(e) => {
            setAnchor(e.currentTarget)
            setOpen((o) => !o)
          }}
          className="mt-3 flex min-h-8 items-center gap-1 text-[12px] text-muted hover:text-ink"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          My groups <Chevron />
        </button>
      )}
      {open &&
        createPortal(
          variant === 'phone' ? (
            <Sheet onClose={() => setOpen(false)}>
              <GroupList current={current} onPicked={() => setOpen(false)} />
            </Sheet>
          ) : (
            <Popover anchor={anchor} onClose={() => setOpen(false)}>
              <GroupList current={current} onPicked={() => setOpen(false)} />
            </Popover>
          ),
          document.body,
        )}
    </>
  )
}

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 opacity-70">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function useDismiss(onClose: () => void, inside: () => HTMLElement | null, also?: HTMLElement | null) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (inside()?.contains(t) || also?.contains(t)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [onClose, inside, also])
}

function Popover({ anchor, onClose, children }: { anchor: HTMLElement | null; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(onClose, () => ref.current, anchor)
  const r = anchor?.getBoundingClientRect()
  const w = 320
  const left = r ? Math.min(Math.max(12, r.left - 12), window.innerWidth - w - 12) : 12
  const bottom = r ? Math.max(12, window.innerHeight - r.top + 8) : 12
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="My groups"
      className="fixed z-50 max-h-[min(560px,calc(100vh-24px))] overflow-y-auto rounded-2xl border border-line bg-card p-2 text-ink"
      style={{ left, bottom, width: w }}
    >
      {children}
    </div>
  )
}

function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose} role="dialog" aria-modal aria-label="My groups">
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border-t border-line bg-card p-2 pb-[max(env(safe-area-inset-bottom),8px)] text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto my-2 h-1 w-9 rounded-full bg-line" aria-hidden />
        {children}
      </div>
    </div>
  )
}

export function GroupList({ current, onPicked }: { current: string | null; onPicked: () => void }) {
  const { accountId, send } = useWallet()
  const { rows, unsaved, refs } = useMyGroups(accountId, [DEMO_DAO])
  const nearUsd = useNearUsd()
  const [connect, setConnect] = useState(false)
  const [saving, setSaving] = useState<'idle' | 'signing' | 'checking'>('idle')

  async function saveToProfile() {
    if (!accountId) return
    setSaving('signing')
    try {
      const { tx, value } = await saveGroupsTx(accountId, refs)
      await send(tx)
      setSaving('checking')
      const ok = await confirmGroupsSaved(accountId, value)
      showToast(ok ? 'Saved. Your groups follow you to any device.' : "Sent, but we couldn't read it back yet. Try again in a minute.")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      showToast(/reject|cancel|closed|denied/i.test(msg) ? 'Cancelled in the wallet.' : msg)
    } finally {
      setSaving('idle')
    }
  }

  return (
    <div className="text-[13.5px]">
      <div className="flex items-baseline justify-between px-3 pb-1 pt-2">
        <span className="text-[12px] text-muted">{accountId ? 'My groups' : 'Groups you opened'}</span>
        {!accountId && <span className="text-[11.5px] text-muted">Sign in to see yours</span>}
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-[13px] text-muted">No groups yet. Create one, or connect a DAO you already use.</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.ref.id}>
              <Row row={r} active={r.ref.id === current} nearUsd={nearUsd} signedIn={!!accountId} onPick={onPicked} />
            </li>
          ))}
        </ul>
      )}

      {accountId && unsaved.length > 0 && (
        <div className="mx-1 mt-1 rounded-xl bg-soft px-3 py-2.5 text-[12.5px]">
          <div className="text-muted">
            {unsaved.length === 1 ? '1 group isn’t' : `${unsaved.length} groups aren’t`} on your NEAR profile yet, so other devices won’t see {unsaved.length === 1 ? 'it' : 'them'}.
          </div>
          <button
            className="mt-1.5 min-h-9 font-medium text-accent-text hover:underline disabled:opacity-60"
            disabled={saving !== 'idle'}
            onClick={saveToProfile}
          >
            {saving === 'signing' ? 'Waiting for your wallet…' : saving === 'checking' ? 'Checking it landed…' : 'Save to my profile'}
          </button>
        </div>
      )}

      <div className="mt-1 border-t border-line pt-1">
        <button
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-soft"
          onClick={() => {
            onPicked()
            go('create')
          }}
        >
          <span className="grid size-8 place-items-center rounded-lg border border-dashed border-line text-muted" aria-hidden>
            +
          </span>
          Create group
        </button>
        {connect ? (
          <ConnectDao onDone={onPicked} />
        ) : (
          <button className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-soft" onClick={() => setConnect(true)}>
            <span className="grid size-8 place-items-center rounded-lg border border-dashed border-line text-muted" aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1" />
              </svg>
            </span>
            Connect a DAO
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ row, active, nearUsd, signedIn, onPick }: { row: GroupRow; active: boolean; nearUsd: number; signedIn: boolean; onPick: () => void }) {
  const s = row.summary
  const name = s ? pretty(s.name) : row.ref.id.split('.')[0]
  const money = s ? (isFinite(nearUsd) ? usd(yoctoToNumber(s.spendable) * nearUsd) : `${yoctoToNear(s.spendable)} NEAR`) : null
  const role = roleLabel(s, signedIn)
  return (
    <button
      onClick={() => {
        onPick()
        if (!active) openDao(row.ref.id)
      }}
      className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${active ? 'bg-soft' : 'hover:bg-soft'}`}
      aria-current={active ? 'true' : undefined}
      title={row.ref.id}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sand text-[13px] font-medium uppercase ring-1 ring-line" aria-hidden>
        {name.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        <span className="block truncate text-[12px] text-muted">
          {s ? (
            <>
              <span className="tnum">{money}</span>
              {role ? ` · ${role}` : ''}
            </>
          ) : (
            <span className="skeleton inline-block h-2.5 w-24 align-middle" />
          )}
        </span>
      </span>
      {s && s.open > 0 && (
        <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-accent px-1 text-[10.5px] font-medium text-on-accent" title={`${s.open} open request${s.open === 1 ? '' : 's'}`}>
          {s.open}
        </span>
      )}
      {active && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted" aria-label="Current group">
          <path d="M5 12l4 4 10-10" />
        </svg>
      )}
    </button>
  )
}

function ConnectDao({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    let id = v.trim().toLowerCase()
    if (id && !id.includes('.')) id = `${id}.sputnikv2.testnet`
    if (!isValidAccountId(id)) return setErr('That isn’t a NEAR account id.')
    setBusy(true)
    setErr(null)
    const ok = await isDao(id)
    setBusy(false)
    if (!ok) return setErr('No Sputnik DAO at that address on testnet.')
    recordVisit(id)
    onDone()
    openDao(id)
  }
  return (
    <form onSubmit={submit} className="px-3 py-2">
      <label className="block text-[12px] text-muted" htmlFor="terra-connect-dao">
        DAO address
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="terra-connect-dao"
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="name.sputnikv2.testnet"
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 font-mono text-[12.5px] outline-none focus:border-ink"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit" disabled={busy || !v.trim()} className="min-h-10 rounded-lg border border-line px-3 text-[13px] font-medium disabled:opacity-50">
          {busy ? '…' : 'Open'}
        </button>
      </div>
      {err && <p className="mt-1.5 text-[12px] text-bad">{err}</p>}
    </form>
  )
}
