// The account chip, its menu, the theme icon button and a "My groups" sheet.
// Shared by the landing nav and the app's top bar so both look and behave the same.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useWallet } from '../lib/wallet'
import { useProfile } from '../lib/profile'
import { applyTheme, getTheme, type Theme } from '../lib/theme'
import { lastDao, openDao } from '../lib/store'
import { Avatar } from './ui'
import { GroupList } from './GroupSwitcher'
import { ProfileSheetHost, openProfileSheet } from './ProfileSheet'
import LanguagePicker from './LanguagePicker'
import { useT } from '../i18n'

/** "maaaaaaaaaaaaaaaaaz.testnet" → "maaaaaa…z.testnet": keeps the start and the end, never wider than `max`. */
// eslint-disable-next-line react-refresh/only-export-components
export function middleEllipsis(id: string, max = 18): string {
  if (id.length <= max) return id
  // Keep the network suffix plus the name's last letter ("…z.testnet"), else split evenly.
  const dot = id.indexOf('.')
  const keepEnd = dot > 0 ? Math.min(id.length - dot + 1, max - 5) : Math.ceil((max - 1) / 2)
  const keepStart = max - 1 - keepEnd
  return `${id.slice(0, keepStart)}…${id.slice(id.length - keepEnd)}`
}

// ---------- theme ----------

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(getTheme)
  useEffect(() => {
    const on = () => setTheme(getTheme())
    window.addEventListener('terra:theme', on)
    return () => window.removeEventListener('terra:theme', on)
  }, [])
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
    window.dispatchEvent(new Event('terra:theme'))
  }
  return [theme, toggle]
}

const SUN = 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 100-10 5 5 0 000 10z'
const MOON = 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z'

function Svg({ d, className = 'size-[18px]' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

/** 40px icon button: sun in dark mode (switch to light), moon in light mode. */
export function ThemeButton({ className = '' }: { className?: string }) {
  const t = useT()
  const [theme, toggle] = useTheme()
  const label = theme === 'dark' ? t('account.toLight') : t('account.toDark')
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className={`grid size-10 place-items-center rounded-lg text-muted hover:bg-soft hover:text-ink ${className}`}>
      <Svg d={theme === 'dark' ? SUN : MOON} />
    </button>
  )
}

// ---------- My groups sheet ----------

// eslint-disable-next-line react-refresh/only-export-components
export function openMyGroups() {
  window.dispatchEvent(new Event('terra:my-groups'))
}

/** Open the last group you used, or My groups when there isn't one. */
// eslint-disable-next-line react-refresh/only-export-components
export function openTerra() {
  const last = lastDao()
  if (last) openDao(last)
  else openMyGroups()
}

function MyGroupsSheetHost() {
  const t = useT()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener('terra:my-groups', on)
    return () => window.removeEventListener('terra:my-groups', on)
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 grid items-end glass-scrim sm:place-items-center sm:p-4" onClick={() => setOpen(false)} role="dialog" aria-modal aria-label={t('account.myGroups')}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto glass glass-sheet rounded-t-2xl border border-line bg-card p-2 pb-[max(env(safe-area-inset-bottom),8px)] text-ink sm:max-w-[440px] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <GroupList current={null} onPicked={() => setOpen(false)} />
      </div>
    </div>,
    document.body,
  )
}

/** Mount once per screen (landing or app shell): the sheets the account menu opens. */
export function AccountHosts() {
  const { accountId } = useWallet()
  return (
    <>
      {accountId && <ProfileSheetHost />}
      <MyGroupsSheetHost />
    </>
  )
}

// ---------- account chip and menu ----------

function useAccountLabel(accountId: string) {
  const p = useProfile(accountId)
  return { name: p?.name?.trim() || '', label: p?.name?.trim() || middleEllipsis(accountId) }
}

/** The menu's rows: used by the dropdown and by the landing's phone sheet. */
export function AccountMenuItems({ onDone }: { onDone: () => void }) {
  const t = useT()
  const { accountId, signOut } = useWallet()
  const [theme, toggle] = useTheme()
  if (!accountId) return null
  const row = 'flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-start text-[14px] hover:bg-soft sm:min-h-10'
  return (
    <div role="menu" aria-label={t('account.label')}>
      <AccountHeader accountId={accountId} />
      <div className="my-1 h-px bg-line" />
      <button role="menuitem" className={row} onClick={() => (onDone(), openMyGroups())}>{t('account.myGroups')}</button>
      <button role="menuitem" className={row} onClick={() => (onDone(), openProfileSheet())}>{t('account.editProfile')}</button>
      <button role="menuitem" className={row} onClick={toggle}>
        {t('account.theme')} <span className="text-[13px] text-muted">{theme === 'dark' ? t('account.dark') : t('account.light')}</span>
      </button>
      <LanguagePicker variant="row" />
      <div className="my-1 h-px bg-line" />
      <button role="menuitem" className={`${row} text-muted hover:text-ink`} onClick={() => (onDone(), signOut())}>{t('account.signOut')}</button>
    </div>
  )
}

function AccountHeader({ accountId }: { accountId: string }) {
  const t = useT()
  const { name } = useAccountLabel(accountId)
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Avatar id={accountId} size={36} />
      <div className="min-w-0">
        <div className="truncate text-[14px] font-medium">{name || middleEllipsis(accountId, 24)}</div>
        <div className="break-all font-mono text-[11.5px] leading-snug text-muted">{accountId}</div>
        <div className="mt-1 text-[11.5px] text-muted">{t('account.network', { network: t('common.nearTestnet') })}</div>
      </div>
    </div>
  )
}

/** Avatar · name (or middle-ellipsed id) · chevron. Opens the account menu. */
export function AccountChip() {
  const { accountId } = useWallet()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
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
  const label = useAccountLabel(accountId ?? '').label
  if (!accountId) return null
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={accountId}
        className="flex h-10 items-center gap-2 rounded-full border border-line bg-card py-1 pl-1 pr-2.5 text-[13.5px] font-medium hover:bg-soft"
      >
        <Avatar id={accountId} size={30} shape="circle" />
        <span className="hidden max-w-[10rem] truncate sm:inline">{label}</span>
        <Svg d="M6 9l6 6 6-6" className={`size-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="glass glass-menu absolute end-0 top-[calc(100%+8px)] z-50 w-[min(300px,calc(100vw-24px))] rounded-2xl p-1.5 text-ink">
          <AccountMenuItems onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
