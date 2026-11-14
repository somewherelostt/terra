// A thread under each request: on the Approve card, the Board, and a request's detail sheet.
// Comments are plain text (React escapes them; no HTML, no markdown), 280 characters max.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useWallet } from '../lib/wallet'
import { useNames } from '../lib/profile'
import { timeAgo } from '../lib/format'
import { COMMENT_MAX, addPending, confirmComment, dropPending, postCommentTx, useGroupComments, validateComment, type Comment } from '../lib/comments'
import { Avatar, TxLink, showToast } from './ui'
import { useT } from '../i18n'

function BubbleIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />
    </svg>
  )
}

/** Small count badge (icon + number). Shows "0" muted so the thread is discoverable. */
export function CommentCount({ daoId, proposalId, className = '' }: { daoId: string; proposalId: number; className?: string }) {
  const t = useT()
  const { count } = useGroupComments(daoId)
  const n = count(proposalId)
  return (
    <span className={`inline-flex items-center gap-1 tnum ${className}`} aria-label={t('comments.count', { count: n })}>
      <BubbleIcon />
      {n}
    </span>
  )
}

/** "Comments · 2" that opens the thread inline. Used on the Approve card. */
export function CommentsToggle({ daoId, proposalId, hero = false }: { daoId: string; proposalId: number; hero?: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const { count } = useGroupComments(daoId)
  const n = count(proposalId)
  const sub = hero ? 'opacity-60 hover:opacity-100' : 'text-muted hover:text-ink'
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`-ms-1 flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-[12.5px] sm:min-h-8 ${sub}`}
      >
        <BubbleIcon />
        {n === 0 ? t('comments.comment') : t('comments.count', { count: n })}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && <CommentThread daoId={daoId} proposalId={proposalId} hero={hero} autoFocus />}
    </div>
  )
}

export function CommentThread({ daoId, proposalId, hero = false, autoFocus = false }: { daoId: string; proposalId: number; hero?: boolean; autoFocus?: boolean }) {
  const t = useT()
  const { forRequest, hiddenFor, loading, error, refresh } = useGroupComments(daoId)
  const list = forRequest(proposalId)
  const hidden = hiddenFor(proposalId)
  const [showHidden, setShowHidden] = useState(false)
  const sub = hero ? 'opacity-60' : 'text-muted'
  const rule = hero ? 'border-[var(--hero-line)]' : 'border-line'
  return (
    <div className={`border-t pt-3 text-[13px] ${rule}`}>
      {loading && list.length === 0 ? (
        <div aria-busy className="space-y-2 py-1">
          <div className="skeleton h-3 w-2/3" />
          <div className="skeleton h-3 w-1/2" />
        </div>
      ) : error && list.length === 0 ? (
        <p className={sub}>
          {t('comments.readError')}{' '}
          <button className="underline underline-offset-2" onClick={() => refresh()}>
            {t('common.tryAgain')}
          </button>
        </p>
      ) : list.length === 0 ? (
        <p className={sub}>{t('comments.empty')}</p>
      ) : (
        <ol className="space-y-3">
          {list.map((c) => (
            <CommentRow key={`${c.author}/${c.key}`} c={c} hero={hero} />
          ))}
        </ol>
      )}
      {hidden.length > 0 && (
        <div className="mt-3">
          <button className={`text-[12px] underline-offset-2 hover:underline ${sub}`} onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? t('comments.hideHidden', { count: hidden.length }) : t('comments.showHidden', { count: hidden.length })}
          </button>
          {showHidden && (
            <ol className="mt-2 space-y-3 opacity-70">
              {hidden.map((c) => (
                <CommentRow key={`${c.author}/${c.key}`} c={c} hero={hero} />
              ))}
            </ol>
          )}
        </div>
      )}
      <Composer daoId={daoId} proposalId={proposalId} hero={hero} autoFocus={autoFocus} />
    </div>
  )
}

function CommentRow({ c, hero }: { c: Comment; hero: boolean }) {
  const t = useT()
  const name = useNames()
  const sub = hero ? 'opacity-60' : 'text-muted'
  return (
    <li className={`flex gap-2.5 ${c.pending ? 'opacity-60' : ''}`}>
      <span className="pt-0.5">
        <Avatar id={c.author} size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-[12px]">
          <span className="truncate font-medium" title={c.author}>
            {name(c.author)}
          </span>
          <span className={`shrink-0 ${sub}`}>{c.pending ? t('comments.sending') : timeAgo(c.at)}</span>
        </div>
        {/* Plain text only: React escapes it, and nothing here is parsed as HTML or markdown. */}
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-snug">{c.text}</p>
      </div>
    </li>
  )
}

function Composer({ daoId, proposalId, hero, autoFocus }: { daoId: string; proposalId: number; hero: boolean; autoFocus: boolean }) {
  const t = useT()
  const { accountId, send, signIn } = useWallet()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'idle' | 'signing' | 'checking'>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [hash, setHash] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const sub = hero ? 'opacity-60' : 'text-muted'
  useEffect(() => {
    if (autoFocus && accountId && window.matchMedia('(min-width: 768px)').matches) ref.current?.focus()
  }, [autoFocus, accountId])

  if (!accountId)
    return (
      <button className={`mt-3 min-h-11 text-[12.5px] font-medium underline-offset-2 hover:underline sm:min-h-8 ${hero ? '' : 'text-ink'}`} onClick={signIn}>
        {t('comments.signIn')}
      </button>
    )

  const left = COMMENT_MAX - text.length

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!accountId || busy !== 'idle') return
    const v = validateComment(text)
    if ('error' in v) return setErr(v.error)
    setErr(null)
    setHash(null)
    setBusy('signing')
    let key = ''
    try {
      const built = await postCommentTx(accountId, daoId, proposalId, v.text)
      key = built.key
      const h = await send(built.tx)
      setHash(h)
      addPending({ author: accountId, daoId, proposalId, key, at: new Date(Number(key)), text: v.text })
      setText('')
      setBusy('checking')
      const ok = await confirmComment(accountId, daoId, proposalId, key)
      if (!ok) showToast(t('comments.toast.notYet'))
    } catch (e2) {
      if (key) dropPending(daoId, accountId, key)
      const msg = e2 instanceof Error ? e2.message : String(e2)
      setErr(/reject|cancel|closed|denied/i.test(msg) ? t('common.cancelledInWallet') : msg)
    } finally {
      setBusy('idle')
    }
  }

  return (
    <form onSubmit={submit} className="mt-3">
      <label className="sr-only" htmlFor={`c-${daoId}-${proposalId}`}>
        {t('comments.add')}
      </label>
      <textarea
        id={`c-${daoId}-${proposalId}`}
        ref={ref}
        rows={2}
        value={text}
        maxLength={COMMENT_MAX}
        onChange={(e) => setText(e.target.value.slice(0, COMMENT_MAX))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e)
        }}
        placeholder={t('comments.placeholder')}
        className={`block w-full resize-none rounded-lg border px-3 py-2 text-[13px] outline-none ${
          hero ? 'border-[var(--hero-line)] bg-white/5 placeholder:text-white/40 focus:border-white/40' : 'border-line bg-bg placeholder:text-muted focus:border-ink'
        }`}
      />
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className={`tnum text-[11.5px] ${left < 20 ? 'text-warn' : sub}`} aria-live="polite">
          {busy === 'signing' ? t('common.waitingWallet') : busy === 'checking' ? t('comments.posted') : t('comments.left', { count: left })}
        </span>
        <span className="flex items-center gap-3">
          {hash && busy === 'idle' && <TxLink hash={hash} label={t('comments.tx')} />}
          <button
            type="submit"
            disabled={busy !== 'idle' || !text.trim()}
            className={`min-h-11 rounded-lg px-3 text-[12.5px] font-medium disabled:opacity-40 sm:min-h-8 ${hero ? 'bg-white/10' : 'border border-line bg-card'}`}
          >
            {t('comments.comment')}
          </button>
        </span>
      </div>
      {err && <p className="mt-1 text-[12px] text-bad">{err}</p>}
    </form>
  )
}

// ---------- request detail sheet (Board rows, Approve history) ----------

export interface RequestSummary {
  daoId: string
  proposalId: number
  title: string
  detail?: ReactNode
  amount?: string
}

const OPEN_EVENT = 'terra:request-sheet'

/** Open a request's detail view with its comment thread. */
export function openRequestSheet(r: RequestSummary) {
  window.dispatchEvent(new CustomEvent<RequestSummary>(OPEN_EVENT, { detail: r }))
}

/** Mount once on any page that calls openRequestSheet. */
export function RequestSheetHost() {
  const t = useT()
  const [r, setR] = useState<RequestSummary | null>(null)
  useEffect(() => {
    const on = (e: Event) => setR((e as CustomEvent<RequestSummary>).detail)
    window.addEventListener(OPEN_EVENT, on)
    return () => window.removeEventListener(OPEN_EVENT, on)
  }, [])
  useEffect(() => {
    if (!r) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setR(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [r])
  if (!r) return null
  return createPortal(
    <div className="fixed inset-0 z-40 grid items-end glass-scrim sm:place-items-center sm:p-4" onClick={() => setR(null)} role="dialog" aria-modal aria-label={r.title}>
      <div
        className="max-h-[88vh] w-full overflow-y-auto glass glass-sheet rounded-t-2xl border border-line bg-card p-5 pb-[max(env(safe-area-inset-bottom),20px)] text-ink sm:max-w-[480px] sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[12px] text-muted">{t('comments.request', { id: String(r.proposalId) })}</div>
            <h2 className="mt-1 break-words text-[18px] font-light tracking-[-0.02em]">{r.title}</h2>
            {r.detail && <div className="mt-1 text-[12.5px] text-muted">{r.detail}</div>}
          </div>
          {r.amount && <div className="tnum shrink-0 text-[20px] font-light">{r.amount}</div>}
        </div>
        <div className="mt-5">
          <CommentThread daoId={r.daoId} proposalId={r.proposalId} />
        </div>
        <button className="mt-4 min-h-11 w-full rounded-lg border border-line text-[13px] font-medium sm:min-h-9" onClick={() => setR(null)}>
          {t('common.close')}
        </button>
      </div>
    </div>,
    document.body,
  )
}
