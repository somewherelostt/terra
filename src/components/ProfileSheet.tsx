import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useWallet } from '../lib/wallet'
import { AVATAR_STYLE, SOCIAL_CONTRACT, dicebearUrl, invalidateAvatar, type AvatarChoice } from '../lib/avatar'
import {
  BIO_MAX,
  LINK_KEYS,
  LINK_LABELS,
  NAME_MAX,
  diffProfile,
  isEmptyPatch,
  linkText,
  linkUrl,
  normalizeLink,
  patchLanded,
  readProfileFresh,
  rememberSaved,
  saveProfileTx,
  useProfile,
  type LinkKey,
  type Profile,
} from '../lib/profile'
import { accountUrl } from '../lib/near'
import { shortName, yoctoToNear } from '../lib/format'
import { wait } from '../lib/motion'
import { AvatarGrid } from './AvatarPicker'
import { Avatar, Button, TxLink, inputCls, showToast } from './ui'

const PLACEHOLDER: Record<LinkKey, string> = { twitter: '@handle', github: 'handle', website: 'https://example.com', telegram: '@handle' }

// Open the sheet from anywhere (account chip, Members row, nudges) without threading props.
// eslint-disable-next-line react-refresh/only-export-components
export function openProfileSheet() {
  window.dispatchEvent(new Event('terra:edit-profile'))
}

/** Mount once (App). Listens for openProfileSheet(). */
export function ProfileSheetHost() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener('terra:edit-profile', on)
    return () => window.removeEventListener('terra:edit-profile', on)
  }, [])
  // A portal: the sticky header's backdrop blur would otherwise trap position: fixed.
  return open ? createPortal(<ProfileSheet onClose={() => setOpen(false)} />, document.body) : null
}

type Status = 'loading' | 'idle' | 'signing' | 'checking' | 'saved' | 'error'

/** "Edit profile": name, avatar, bio and links, saved to the member's own NEAR Social profile. */
export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const { accountId, send } = useWallet()
  const [status, setStatus] = useState<Status>('loading')
  const [before, setBefore] = useState<{ profile: Profile; avatar: string | null } | null>(null)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [links, setLinks] = useState<Record<LinkKey, string>>({ twitter: '', github: '', website: '', telegram: '' })
  const [avatar, setAvatar] = useState<AvatarChoice | null>(null)
  const [pickAvatar, setPickAvatar] = useState(false)
  const [hash, setHash] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const [deposit, setDeposit] = useState<bigint>(0n)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!accountId) return
    let live = true
    readProfileFresh(accountId)
      .then((r) => {
        if (!live) return
        setBefore(r)
        setName(r.profile.name ?? '')
        setBio(r.profile.description?.slice(0, BIO_MAX) ?? '')
        setLinks(Object.fromEntries(LINK_KEYS.map((k) => [k, r.profile.linktree[k] ? (k === 'website' && !/^[a-z]+:\/\//i.test(r.profile.linktree[k]!) ? `https://${r.profile.linktree[k]}` : r.profile.linktree[k]!) : ''])) as Record<LinkKey, string>)
        try {
          const c = r.avatar ? (JSON.parse(r.avatar) as AvatarChoice) : null
          if (c?.style && c.seed) setAvatar(c)
        } catch {
          /* ignore */
        }
        setStatus('idle')
        setTimeout(() => nameRef.current?.focus(), 30)
      })
      .catch(() => {
        if (!live) return
        setBefore({ profile: { linktree: {} }, avatar: null })
        setStatus('idle')
      })
    return () => {
      live = false
    }
  }, [accountId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!accountId) return null

  const linkErrors = Object.fromEntries(LINK_KEYS.map((k) => [k, (() => {
    const n = normalizeLink(k, links[k])
    return 'error' in n ? n.error : null
  })()])) as Record<LinkKey, string | null>
  const hasErrors = LINK_KEYS.some((k) => linkErrors[k])
  const normalized = Object.fromEntries(LINK_KEYS.map((k) => {
    const n = normalizeLink(k, links[k])
    return [k, 'value' in n ? n.value : links[k]]
  })) as Record<LinkKey, string>
  const patch = before ? diffProfile(before.profile, before.avatar, { name, description: bio, linktree: normalized, avatar }) : null
  const nothingChanged = !patch || isEmptyPatch(patch)
  const busy = status === 'signing' || status === 'checking' || status === 'loading'
  const shownAvatar = avatar ?? { style: AVATAR_STYLE, seed: accountId }

  async function save() {
    if (!accountId || !patch || nothingChanged || hasErrors) return
    setError(null)
    setHash(undefined)
    setStatus('signing')
    try {
      const { tx, deposit } = await saveProfileTx(accountId, patch)
      setDeposit(deposit)
      let h: string | undefined
      try {
        h = await send(tx)
      } catch (e) {
        // SocialDB writes can be reported as failed (CodeDoesNotExist) even when the data lands:
        // only that label is ignored, and the read-back decides. Real errors surface.
        const msg = e instanceof Error ? e.message : String(e)
        if (!/CodeDoesNotExist/i.test(msg)) throw e
        const m = msg.match(/[1-9A-HJ-NP-Za-km-z]{43,44}/)
        if (m) h = m[0]
      }
      setHash(h)
      setStatus('checking')
      for (let i = 0; i < 10; i++) {
        await wait(i ? 1500 : 700)
        const after = await readProfileFresh(accountId).catch(() => null)
        if (after && patchLanded(after, patch)) {
          rememberSaved(accountId, after.profile)
          if (patch.terra) invalidateAvatar(accountId)
          setBefore(after)
          setStatus('saved')
          showToast('Profile saved to NEAR Social')
          return
        }
      }
      setStatus('error')
      setError("The change didn't show up yet. It can take a few seconds; open this again in a moment to check.")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus('error')
      setError(/reject|cancel|closed|denied/i.test(msg) ? 'Cancelled in the wallet.' : msg)
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid items-end glass-scrim sm:place-items-center sm:p-4" onClick={onClose} role="dialog" aria-modal aria-label="Edit profile">
      <form
        className="max-h-[92vh] w-full overflow-y-auto glass glass-sheet rounded-t-2xl border border-line bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-[480px] sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span>Edit profile</span>
          <button type="button" onClick={onClose} className="-my-3 min-h-11 py-3 pl-4 hover:text-ink">Close</button>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <img src={dicebearUrl(shownAvatar.style, shownAvatar.seed)} alt="" className="size-16 rounded-xl bg-[#1a1a1d]" />
          <div className="min-w-0 text-[13px]">
            <div className="truncate text-[15px] font-medium">{name.trim() || shortName(accountId)}</div>
            <div className="truncate font-mono text-[11.5px] text-muted">{accountId}</div>
            <button type="button" className="mt-1 min-h-11 text-[12.5px] text-muted underline-offset-2 hover:text-ink hover:underline sm:min-h-8" onClick={() => setPickAvatar((v) => !v)}>
              {pickAvatar ? 'Done choosing' : 'Change avatar'}
            </button>
          </div>
        </div>
        {pickAvatar && <AvatarGrid accountId={accountId} value={shownAvatar} onChange={setAvatar} />}

        <fieldset disabled={busy} className="mt-5 space-y-4">
          <Labeled label="Display name" count={`${name.length}/${NAME_MAX}`}>
            <input ref={nameRef} className={inputCls} value={name} maxLength={NAME_MAX} placeholder="What members call you" onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
          </Labeled>
          <Labeled label="Bio" count={`${bio.length}/${BIO_MAX}`}>
            <textarea className={`${inputCls} min-h-[76px] resize-none`} value={bio} maxLength={BIO_MAX} rows={3} placeholder="A line about you and what you do here" onChange={(e) => setBio(e.target.value)} />
          </Labeled>
          <div>
            <div className="mb-1.5 text-sm font-medium text-ink">Links</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {LINK_KEYS.map((k) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-[12px] text-muted">{LINK_LABELS[k]}</span>
                  <input
                    className={`${inputCls} ${linkErrors[k] ? '!border-bad' : ''}`}
                    value={links[k]}
                    placeholder={PLACEHOLDER[k]}
                    inputMode="url"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-invalid={!!linkErrors[k]}
                    onChange={(e) => setLinks((l) => ({ ...l, [k]: e.target.value }))}
                  />
                  {linkErrors[k] && <span className="mt-1 block text-[11.5px] text-bad">{linkErrors[k]}</span>}
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" className="flex-1 !py-3" disabled={busy || nothingChanged || hasErrors}>
            {status === 'loading' ? 'Loading…' : status === 'signing' ? <span className="spin" /> : status === 'checking' ? 'Checking it landed…' : status === 'saved' && nothingChanged ? 'Saved ✓' : 'Save'}
          </Button>
          <Button variant="secondary" className="!py-3" onClick={onClose}>
            {status === 'saved' ? 'Done' : 'Cancel'}
          </Button>
        </div>
        <p className="mt-3 text-[12px] text-muted">
          Saved to your NEAR Social profile on <span className="font-mono">{SOCIAL_CONTRACT}</span>, so any NEAR app can show it. Only the fields you change are written.
          {deposit > 0n ? ` This save adds ${yoctoToNear(deposit, 3)} NEAR of storage.` : ' A first save adds a little NEAR for storage.'}
        </p>
        {hash && (
          <div className="mt-2 text-[12px]">
            <TxLink hash={hash} label="Transaction" />
          </div>
        )}
        {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
      </form>
    </div>
  )
}

function Labeled({ label, count, children }: { label: string; count: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-ink">
        {label}
        <span className="text-[11.5px] font-normal tabular-nums text-muted">{count}</span>
      </span>
      {children}
    </label>
  )
}

// ---------- reading side ----------

/** A member's display name; with `card`, a click opens a small profile card (bio, links, account id). */
export function MemberName({ id, card = false, className = '' }: { id: string; card?: boolean; className?: string }) {
  const p = useProfile(id)
  const [open, setOpen] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const pop = useRef<HTMLSpanElement>(null)
  const label = p?.name || shortName(id)

  // Fixed position from the button, so truncated or scrolling rows don't clip the card.
  function toggle(e: ReactMouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (open) return setOpen(null)
    const r = e.currentTarget.getBoundingClientRect()
    const w = Math.min(300, window.innerWidth - 32)
    const left = Math.max(16, Math.min(r.left, window.innerWidth - w - 16))
    const below = r.bottom + 8
    setOpen({ left, top: below + 240 > window.innerHeight ? Math.max(16, r.top - 248) : below })
  }

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(null)
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node) && close()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  if (!card)
    return (
      <span className={className} title={id}>
        {label}
      </span>
    )
  return (
    <span ref={ref} className="relative inline">
      <button type="button" className={`text-left underline-offset-2 hover:underline ${className}`} title={id} aria-expanded={!!open} aria-haspopup="dialog" onClick={toggle}>
        {label}
      </button>
      {open &&
        createPortal(
        <span
          ref={pop}
          className="fixed z-50 block w-[min(300px,calc(100vw-32px))] whitespace-normal rounded-2xl border border-line bg-card p-4 text-left text-[13px] font-normal text-ink"
          style={{ left: open.left, top: open.top }}
          role="dialog"
          aria-label={`${label}'s profile`}
          onClick={(e) => e.stopPropagation()}
        >
          <ProfileCard id={id} />
        </span>,
        document.body,
      )}
    </span>
  )
}

/** Avatar, name, muted account id, bio and links. */
export function ProfileCard({ id }: { id: string }) {
  const p = useProfile(id)
  const { accountId } = useWallet()
  const links = LINK_KEYS.map((k) => ({ k, url: linkUrl(k, p?.linktree[k]), text: p?.linktree[k] ? linkText(k, p.linktree[k]!) : '' })).filter((l) => l.url)
  return (
    <span className="block">
      <span className="flex items-center gap-3">
        <Avatar id={id} size={40} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium">{p?.name || shortName(id)}</span>
          <a href={accountUrl(id)} target="_blank" rel="noreferrer" className="block truncate font-mono text-[11.5px] text-muted hover:underline">
            {id}
          </a>
        </span>
      </span>
      {p?.description ? <span className="mt-3 block break-words text-[13px] text-ink">{p.description.slice(0, BIO_MAX)}</span> : <span className="mt-3 block text-[12.5px] text-muted">No bio yet.</span>}
      {links.length > 0 && (
        <span className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {links.map((l) => (
            <a key={l.k} href={l.url!} target="_blank" rel="noreferrer noopener" className="text-[12.5px] text-muted underline-offset-2 hover:text-ink hover:underline">
              {LINK_LABELS[l.k]} <span className="text-ink">{l.text}</span>
            </a>
          ))}
        </span>
      )}
      {accountId === id && (
        <button type="button" className="mt-2 min-h-11 text-[12.5px] font-medium text-ink underline-offset-2 hover:underline sm:min-h-8" onClick={openProfileSheet}>
          Edit profile
        </button>
      )}
    </span>
  )
}

/** "Add your name": shows for a signed-in member until they set a display name. */
export function AddNameNudge({ className = '' }: { className?: string }) {
  const { accountId } = useWallet()
  const p = useProfile(accountId)
  if (!accountId || !p || p.name) return null
  return (
    <button
      type="button"
      onClick={openProfileSheet}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-[13px] hover:bg-soft ${className}`}
    >
      <Avatar id={accountId} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Add your name</span>
        <span className="block truncate text-[12px] text-muted">Members see {shortName(accountId)} until you do.</span>
      </span>
      <span className="text-[12px] text-muted">Edit ›</span>
    </button>
  )
}
