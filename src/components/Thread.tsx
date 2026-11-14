import { useEffect, useRef, useState } from 'react'
import { go } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { useNames } from '../lib/profile'
import { DM_MAX, POLL_MS, cleanText, markRead, readThread, sendMessageTx, type DmKey, type DmMessage } from '../lib/dm'
import { Avatar, Button, Spinner } from './ui'

/** Poll while the tab is visible; run once right away and again when the tab comes back. */
// eslint-disable-next-line react-refresh/only-export-components
export function usePoll(fn: () => void, ms: number, deps: unknown[]) {
  useEffect(() => {
    fn()
    const t = setInterval(() => document.visibilityState === 'visible' && fn(), ms)
    const onVis = () => document.visibilityState === 'visible' && fn()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** One conversation: messages oldest first, a composer at the bottom, refreshed every ~10 s. */
export default function Thread({ me, other, myKey, theirPk }: { me: string; other: string; myKey: DmKey; theirPk: string | null | undefined }) {
  const name = useNames()
  const { send } = useWallet()
  const [msgs, setMsgs] = useState<DmMessage[] | null>(null)
  const [pending, setPending] = useState<DmMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

  usePoll(
    () => {
      readThread(me, other, myKey)
        .then((m) => {
          setMsgs(m)
          // Drop optimistic copies once the chain has them.
          setPending((p) => p.filter((x) => !m.some((y) => y.id === x.id)))
          if (m.length) markRead(me, other, m[m.length - 1].at)
        })
        .catch(() => {})
    },
    POLL_MS,
    [me, other, myKey],
  )

  const shown = [...(msgs ?? []), ...pending]
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [shown.length])

  const text = cleanText(draft)
  const chars = [...draft].length
  const canSend = !!theirPk && !!text && chars <= DM_MAX && !sending

  async function submit() {
    if (!canSend || !theirPk) return
    setSending(true)
    setError(null)
    try {
      const r = await sendMessageTx(me, other, text, myKey, theirPk)
      await send(r.tx)
      setPending((p) => [...p, { id: r.id, from: me, to: other, at: Date.now(), text: r.text, mine: true }])
      setDraft('')
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setError(/reject|cancel|closed|denied/i.test(m) ? 'Cancelled in the wallet.' : m)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="flex min-h-[60vh] flex-col rounded-2xl border border-line bg-card md:min-h-[520px]" aria-label={`Conversation with ${name(other)}`}>
      <header className="flex items-center gap-3 border-b border-line px-3 py-2.5 md:px-4">
        <button onClick={() => go('messages')} className="grid min-h-11 min-w-11 place-items-center text-muted hover:text-ink md:hidden" aria-label="Back to conversations">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <Avatar id={other} size={32} />
        <div className="min-w-0">
          <div className="truncate text-[14.5px]">{name(other)}</div>
          <div className="truncate font-mono text-[11px] text-muted">{other}</div>
        </div>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-[11.5px] text-muted" title="End-to-end encrypted. Who you message and when is public on NEAR.">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 11h12v9H6zM8 11V8a4 4 0 018 0v3" />
          </svg>
          Encrypted
        </span>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4 md:max-h-[60vh] md:px-4" aria-live="polite">
        {msgs === null ? (
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <Spinner /> Opening messages…
          </div>
        ) : shown.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted">
            No messages with {name(other)} yet. Say hello: only the two of you can read it.
          </p>
        ) : (
          shown.map((m) => <Bubble key={m.id} m={m} sending={pending.some((p) => p.id === m.id)} />)
        )}
        <div ref={end} />
      </div>

      <div className="border-t border-line p-3 md:p-4">
        {theirPk === null ? (
          <p className="text-[13px] text-muted">{name(other)} hasn't turned on messages yet. Once they open Messages in Terra, you can write to them.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <label htmlFor="dm-draft" className="sr-only">
              Message {name(other)}
            </label>
            <textarea
              id="dm-draft"
              value={draft}
              onChange={(e) => setDraft([...e.target.value].slice(0, DM_MAX).join(''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
              rows={2}
              maxLength={DM_MAX * 2}
              placeholder={`Message ${name(other)}`}
              className="block w-full resize-none rounded-xl border border-line bg-bg px-3 py-2.5 text-[15px] outline-none focus:border-ink md:text-[14px]"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className={`tnum text-[11.5px] ${chars >= DM_MAX ? 'text-bad' : 'text-muted'}`}>
                {chars}/{DM_MAX}
              </span>
              <Button disabled={!canSend}>{sending ? 'Sending…' : 'Send'}</Button>
            </div>
            {sending && <p className="mt-2 text-[12px] text-muted">Confirm in your wallet. Each message is one NEAR Social write.</p>}
            {error && <p className="mt-2 rounded-xl bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</p>}
          </form>
        )}
      </div>
    </section>
  )
}

function Bubble({ m, sending }: { m: DmMessage; sending: boolean }) {
  const time = new Date(m.at).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })
  return (
    <div className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 md:max-w-[70%] ${m.mine ? 'bg-ink text-bg' : 'bg-soft text-ink'}`}>
        {m.text === null ? (
          <p className="text-[13px] italic opacity-70">Encrypted for another device. Open it where you set up messages.</p>
        ) : (
          // Plain text only: React escapes it; no links, no markup.
          <p className="whitespace-pre-wrap break-words text-[14.5px] leading-snug [overflow-wrap:anywhere]">{m.text}</p>
        )}
        <div className={`mt-0.5 text-right text-[10.5px] ${m.mine ? 'opacity-60' : 'text-muted'}`}>{sending ? 'Sent' : time}</div>
      </div>
    </div>
  )
}
