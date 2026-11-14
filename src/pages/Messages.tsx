import { useCallback, useEffect, useState } from 'react'
import { go, useDao, useRoute } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { allMembers } from '../lib/dao'
import { prefetchProfiles, useNames } from '../lib/profile'
import { timeAgo } from '../lib/format'
import {
  POLL_MS,
  createLocalKey,
  lastRead,
  loadLocalKey,
  publishKeyTx,
  readConversations,
  readPublicKeys,
  toB64,
  type Conversation,
  type DmKey,
} from '../lib/dm'
import { Avatar, Button, EmptyState, Spinner, TxStatus, useTx } from '../components/ui'
import Thread, { usePoll } from '../components/Thread'

interface KeyState {
  local: DmKey | null
  published: string | null | undefined // undefined while loading
}

function useDmKey(accountId: string | null) {
  const [s, setS] = useState<KeyState>({ local: null, published: undefined })
  const reload = useCallback(async () => {
    if (!accountId) return
    const local = loadLocalKey(accountId)
    try {
      const pks = await readPublicKeys([accountId])
      setS({ local, published: pks.get(accountId) ?? null })
    } catch {
      setS((p) => ({ ...p, local }))
    }
  }, [accountId])
  useEffect(() => {
    setS({ local: null, published: undefined })
    reload()
  }, [reload])
  return { ...s, reload }
}

export default function Messages() {
  const { dao } = useDao()
  const { accountId, signIn } = useWallet()
  const { params } = useRoute()
  const other = params.get('with')
  const key = useDmKey(accountId)
  if (!dao) return null
  const members = allMembers(dao.policy)

  if (!accountId)
    return (
      <Page>
        <EmptyState icon="people" title="Sign in to message members" text="Private messages are end-to-end encrypted between two members of this group.">
          <Button onClick={signIn}>Sign in</Button>
        </EmptyState>
      </Page>
    )
  if (!members.includes(accountId))
    return (
      <Page>
        <EmptyState icon="people" title="Messages are for members" text="Once the group adds you as a member, you can message the other members here." />
      </Page>
    )
  if (key.published === undefined)
    return (
      <Page>
        <div className="flex items-center gap-2 text-[13.5px] text-muted">
          <Spinner /> Checking your message key…
        </div>
      </Page>
    )
  const ready = !!key.local && key.published === toB64(key.local.publicKey)
  if (!ready) return <Setup accountId={accountId} state={key} onDone={key.reload} />

  return <Inbox me={accountId} myKey={key.local!} members={members} other={other && members.includes(other) && other !== accountId ? other : null} />
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[13px] text-muted">Messages</div>
      <h1 className="mt-3 text-[32px] font-light tracking-[-0.03em]">Private messages</h1>
      <div className="mt-8 max-w-[640px]">{children}</div>
    </div>
  )
}

/** First run (or a new device): make a key here and publish its public half. */
function Setup({ accountId, state, onDone }: { accountId: string; state: KeyState; onDone: () => void }) {
  const { send } = useWallet()
  const tx = useTx()
  const [deposit, setDeposit] = useState<bigint>(0n)
  // A key on chain that this browser doesn't hold means it was set up on another device.
  const otherDevice = !!state.published && (!state.local || toB64(state.local.publicKey) !== state.published)

  async function start() {
    // Reuse a key this device already made but never published (e.g. the wallet was closed).
    const existing = loadLocalKey(accountId)
    const key = existing && !state.published ? existing : createLocalKey(accountId)
    const { tx: t, deposit: d } = await publishKeyTx(accountId, key)
    setDeposit(d)
    return send(t)
  }

  return (
    <Page>
      <div className="rounded-2xl border border-line bg-card p-6">
        <div className="text-[15px]">{otherDevice ? 'Set up messages on this device' : 'Turn on private messages'}</div>
        <ul className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-muted">
          <li>Terra makes a message key in this browser. The secret half never leaves it; the public half goes on NEAR Social so members can write to you.</li>
          <li>Messages are encrypted before they leave your device. Only you and the other member can read them.</li>
          <li>Who you message and when is public on NEAR, and every message is a small on-chain write you sign.</li>
          {otherDevice && <li className="text-ink">You set up messages on another device. A new key here means messages sent to the old key can only be read on that device.</li>}
        </ul>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={() => tx.run(start, onDone)} disabled={tx.state.status === 'signing'}>
            {otherDevice ? 'Set up this device' : 'Turn on messages'}
          </Button>
          {deposit > 0n && tx.state.status === 'signing' && <span className="text-[12px] text-muted">Includes a small NEAR Social storage deposit.</span>}
        </div>
        <div className="mt-4">
          <TxStatus state={tx.state} doneText="Messages are on." />
        </div>
      </div>
    </Page>
  )
}

function Inbox({ me, myKey, members, other }: { me: string; myKey: DmKey; members: string[]; other: string | null }) {
  const name = useNames()
  const [convs, setConvs] = useState<Conversation[] | null>(null)
  const [pks, setPks] = useState<Map<string, string | null>>(new Map())
  const [err, setErr] = useState(false)
  const [picking, setPicking] = useState(false)
  const others = members.filter((m) => m !== me)
  prefetchProfiles(members)

  usePoll(
    () => {
      readConversations(me, members, myKey)
        .then((c) => {
          setConvs(c)
          setErr(false)
        })
        .catch(() => setErr(true))
    },
    POLL_MS,
    [me, members.join(','), myKey],
  )
  useEffect(() => {
    readPublicKeys(others).then(setPks).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [others.join(',')])

  const list = (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] text-muted">Conversations</div>
        <button className="min-h-11 px-1 text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline md:min-h-0" onClick={() => setPicking((p) => !p)}>
          {picking ? 'Close' : 'New message'}
        </button>
      </div>
      {picking && <MemberPicker others={others} pks={pks} onPick={(m) => (setPicking(false), go('messages', { with: m }))} />}
      {convs === null ? (
        <div className="mt-4 space-y-3" aria-busy>
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-10 w-5/6" />
        </div>
      ) : convs.length === 0 ? (
        !picking &&
        (other ? (
          <p className="mt-3 text-[13px] text-muted">No other conversations yet.</p>
        ) : (
          <EmptyState icon="people" className="mt-3" title="No messages yet" text="Start a private conversation with another member. Only the two of you can read it.">
            <Button onClick={() => setPicking(true)}>Message a member</Button>
          </EmptyState>
        ))
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {convs.map((c) => {
            const unread = !c.last.mine && c.last.at > lastRead(me, c.with) && c.with !== other
            return (
              <li key={c.with}>
                <button
                  onClick={() => go('messages', { with: c.with })}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left ${c.with === other ? 'bg-card ring-1 ring-line' : 'hover:bg-soft'}`}
                >
                  <Avatar id={c.with} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-[14px] ${unread ? 'font-medium' : ''}`} title={c.with}>
                        {name(c.with)}
                      </span>
                      <span className="shrink-0 text-[11.5px] text-muted">{timeAgo(new Date(c.last.at))}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`block truncate text-[12.5px] ${unread ? 'text-ink' : 'text-muted'}`}>
                        {c.last.mine && 'You: '}
                        {c.last.text ?? 'Encrypted for another device'}
                      </span>
                      {unread && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {err && <p className="mt-3 text-[12px] text-muted">Couldn't reach NEAR just now. Trying again shortly.</p>}
      <p className="mt-6 text-[12px] leading-relaxed text-muted">
        End-to-end encrypted. The text is unreadable on chain, but who you message and when is public. Your key lives in this browser only.
      </p>
    </div>
  )

  return (
    <div>
      <div className={other ? 'hidden md:block' : ''}>
        <div className="text-[13px] text-muted">Messages</div>
        <h1 className="mt-3 text-[32px] font-light tracking-[-0.03em]">Private messages</h1>
      </div>
      <div className="mt-0 grid gap-8 md:mt-8 md:grid-cols-[minmax(240px,320px)_1fr]">
        <div className={other ? 'hidden md:block' : ''}>{list}</div>
        {other ? (
          <Thread key={other} me={me} other={other} myKey={myKey} theirPk={pks.has(other) ? (pks.get(other) ?? null) : undefined} />
        ) : (
          <div className="hidden min-h-[320px] place-items-center rounded-2xl border border-dashed border-line text-[13px] text-muted md:grid">Pick a conversation</div>
        )}
      </div>
    </div>
  )
}

function MemberPicker({ others, pks, onPick }: { others: string[]; pks: Map<string, string | null>; onPick: (m: string) => void }) {
  const name = useNames()
  if (!others.length) return <p className="mt-3 text-[13px] text-muted">You're the only member so far.</p>
  return (
    <ul className="mt-2 rounded-2xl border border-line bg-card p-1">
      {others.map((m) => (
        <li key={m}>
          <button onClick={() => onPick(m)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-soft">
            <Avatar id={m} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px]">{name(m)}</span>
              <span className="block truncate font-mono text-[11px] text-muted">{m}</span>
            </span>
            {pks.get(m) === null && <span className="shrink-0 text-[11.5px] text-muted">Messages off</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}
