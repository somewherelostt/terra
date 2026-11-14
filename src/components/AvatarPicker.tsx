import { useEffect, useMemo, useState } from 'react'
import { useWallet } from '../lib/wallet'
import { AVATAR_STYLE, AVATAR_STYLES, SOCIAL_CONTRACT, dicebearUrl, invalidateAvatar, readSavedChoice, saveAvatarTx, type AvatarChoice } from '../lib/avatar'
import { wait } from '../lib/motion'
import { Button, TxLink } from './ui'

/** "Change avatar": shuffle DiceBear seeds and styles, then save to the member's NEAR Social data. */
export function AvatarPicker({ onClose }: { onClose: () => void }) {
  const { accountId, send } = useWallet()
  const [style, setStyle] = useState(AVATAR_STYLE)
  const [picked, setPicked] = useState<AvatarChoice | null>(null)
  const [status, setStatus] = useState<'idle' | 'signing' | 'checking' | 'saved' | 'error'>('idle')
  const [hash, setHash] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!accountId) return
    readSavedChoice(accountId)
      .then((c) => {
        // Older saves may use another style; they still display, but new saves are thumbs (T3).
        if (c && c.style === AVATAR_STYLE) setPicked(c)
      })
      .catch(() => undefined)
  }, [accountId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!accountId) return null
  const current = picked ?? { style, seed: accountId }

  async function save() {
    if (!accountId) return
    setError(null)
    setStatus('signing')
    try {
      const tx = await saveAvatarTx(accountId, current)
      let h: string | undefined
      try {
        h = await send(tx)
      } catch (e) {
        // NEAR Social writes can show as "failed" (CodeDoesNotExist) even though the data lands,
        // so only trust a read-back.
        const msg = e instanceof Error ? e.message : String(e)
        if (!/CodeDoesNotExist/i.test(msg)) throw e
      }
      setHash(h)
      setStatus('checking')
      for (let i = 0; i < 8; i++) {
        await wait(i ? 1500 : 800)
        const saved = await readSavedChoice(accountId).catch(() => null)
        if (saved && saved.style === current.style && saved.seed === current.seed) {
          invalidateAvatar(accountId)
          setStatus('saved')
          return
        }
      }
      setStatus('error')
      setError("The write didn't show up yet. It can take a few seconds; check again in a moment.")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStatus('error')
      setError(/reject|cancel|closed|denied/i.test(msg) ? 'Cancelled in the wallet.' : msg)
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid items-end bg-black/60 sm:place-items-center sm:p-4" onClick={onClose} role="dialog" aria-modal aria-label="Change avatar">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-[460px] sm:rounded-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span>Change avatar</span>
          <button onClick={onClose} className="-my-3 py-3 pl-4 hover:text-ink">Close</button>
        </div>

        <div className="mt-5 flex items-center gap-4">
          <img src={dicebearUrl(current.style, current.seed)} alt="" className="size-16 rounded-xl" />
          <div className="min-w-0 text-[13px]">
            <div className="truncate font-medium">{accountId}</div>
            <div className="text-muted">Saved to your NEAR Social profile, so other apps can show it too.</div>
          </div>
        </div>

        {AVATAR_STYLES.length > 1 && <div className="mt-6 text-[12px] text-muted">Style</div>}
        <div className={`mt-2 flex-wrap gap-1.5 text-[12.5px] ${AVATAR_STYLES.length > 1 ? 'flex' : 'hidden'}`}>
          {AVATAR_STYLES.map((st) => (
            <button
              key={st}
              onClick={() => {
                setStyle(st)
                setPicked({ style: st, seed: current.seed })
              }}
              className={`rounded-md border px-2.5 py-1 ${current.style === st ? 'border-ink' : 'border-line text-muted hover:text-ink'}`}
            >
              {st.replace('-neutral', '')}
            </button>
          ))}
        </div>

        <AvatarGrid accountId={accountId} style={style} value={current} onChange={setPicked} />

        <div className="mt-6 flex items-center gap-3">
          <Button className="flex-1 !py-3" disabled={status === 'signing' || status === 'checking'} onClick={save}>
            {status === 'signing' ? <span className="spin" /> : status === 'checking' ? 'Checking it landed…' : status === 'saved' ? 'Saved ✓' : 'Save'}
          </Button>
          <Button variant="secondary" className="!py-3" onClick={onClose}>
            {status === 'saved' ? 'Done' : 'Cancel'}
          </Button>
        </div>
        <p className="mt-3 text-[12px] text-muted">
          Writes to <span className="font-mono">{SOCIAL_CONTRACT}</span>. The first save adds 0.05 NEAR of storage to your NEAR Social account. Explorers sometimes label these writes
          "failed" even though the data is saved; Terra reads it back to check.
        </p>
        {hash && (
          <div className="mt-2 text-[12px]">
            <TxLink hash={hash} label="Transaction" />
          </div>
        )}
        {error && <p className="mt-2 text-[12px] text-bad">{error}</p>}
      </div>
    </div>
  )
}

/** The "Pick one" grid with Shuffle. Shared by Change avatar and Edit profile. */
export function AvatarGrid({ accountId, style = AVATAR_STYLE, value, onChange }: { accountId: string; style?: string; value: AvatarChoice; onChange: (c: AvatarChoice) => void }) {
  const [round, setRound] = useState(0)
  const seeds = useMemo(
    () => Array.from({ length: 8 }, (_, i) => (round === 0 && i === 0 ? accountId : `${accountId}#${round * 8 + i}`)),
    [accountId, round],
  )
  return (
    <>
      <div className="mt-5 flex items-center justify-between text-[12px] text-muted">
        <span>Pick one</span>
        <button type="button" className="-my-3 py-3 pl-4 hover:text-ink" onClick={() => setRound((r) => r + 1)}>Shuffle ↻</button>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {seeds.map((seed) => {
          const on = value.seed === seed && value.style === style
          return (
            <button
              type="button"
              key={seed}
              onClick={() => onChange({ style, seed })}
              className={`grid aspect-square place-items-center rounded-xl border ${on ? 'border-ink bg-soft' : 'border-line hover:bg-soft'}`}
              aria-label={`Avatar option ${seed}`}
              aria-pressed={on}
            >
              <img src={dicebearUrl(style, seed)} alt="" className="size-12 rounded-[10px]" loading="lazy" />
            </button>
          )
        })}
      </div>
    </>
  )
}
