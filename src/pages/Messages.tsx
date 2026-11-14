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
import { useT } from '../i18n'

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
  const t = useT()
  const { accountId, signIn } = useWallet()
  const { params } = useRoute()
  const other = params.get('with')
  const key = useDmKey(accountId)
  if (!dao) return null
  const members = allMembers(dao.policy)

  if (!accountId)
    return (
      <Page>
        <EmptyState icon="people" title={t('messages.signedOut.title')} text={t('messages.signedOut.text')}>
          <Button onClick={signIn}>{t('common.signIn')}</Button>
        </EmptyState>
      </Page>
    )
  if (!members.includes(accountId))
    return (
      <Page>
        <EmptyState icon="people" title={t('messages.notMember.title')} text={t('messages.notMember.text')} />
      </Page>
    )
  if (key.published === undefined)
    return (
      <Page>
        <div className="flex items-center gap-2 text-[13.5px] text-muted">
          <Spinner /> {t('messages.checkingKey')}
        </div>
      </Page>
    )
  const ready = !!key.local && key.published === toB64(key.local.publicKey)
  if (!ready) return <Setup accountId={accountId} state={key} onDone={key.reload} />

  return <Inbox me={accountId} myKey={key.local!} members={members} other={other && members.includes(other) && other !== accountId ? other : null} />
}

function Page({ children }: { children: React.ReactNode }) {
  const t = useT()
  return (
    <div>
      <div className="text-[13px] text-muted">{t('nav.messages')}</div>
      <h1 className="mt-3 text-[32px] font-light tracking-[-0.03em]">{t('messages.title')}</h1>
      <div className="mt-8 max-w-[640px]">{children}</div>
    </div>
  )
}

/** First run (or a new device): make a key here and publish its public half. */
function Setup({ accountId, state, onDone }: { accountId: string; state: KeyState; onDone: () => void }) {
  const { send } = useWallet()
  const t = useT()
  const tx = useTx()
  const [deposit, setDeposit] = useState<bigint>(0n)
  // A key on chain that this browser doesn't hold means it was set up on another device.
  const otherDevice = !!state.published && (!state.local || toB64(state.local.publicKey) !== state.published)

  async function start() {
    // Reuse a key this device already made but never published (e.g. the wallet was closed).
    const existing = loadLocalKey(accountId)
    const key = existing && !state.published ? existing : createLocalKey(accountId)
    const { tx: keyTx, deposit: d } = await publishKeyTx(accountId, key)
    setDeposit(d)
    return send(keyTx)
  }

  return (
    <Page>
      <div className="rounded-2xl border border-line bg-card p-6">
        <div className="text-[15px]">{otherDevice ? t('messages.setup.titleOtherDevice') : t('messages.setup.title')}</div>
        <ul className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-muted">
          <li>{t('messages.setup.point1')}</li>
          <li>{t('messages.setup.point2')}</li>
          <li>{t('messages.setup.point3')}</li>
          {otherDevice && <li className="text-ink">{t('messages.setup.otherDevice')}</li>}
        </ul>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={() => tx.run(start, onDone)} disabled={tx.state.status === 'signing'}>
            {otherDevice ? t('messages.setup.actionOtherDevice') : t('messages.setup.action')}
          </Button>
          {deposit > 0n && tx.state.status === 'signing' && <span className="text-[12px] text-muted">{t('messages.setup.deposit')}</span>}
        </div>
        <div className="mt-4">
          <TxStatus state={tx.state} doneText={t('messages.setup.done')} />
        </div>
      </div>
    </Page>
  )
}

function Inbox({ me, myKey, members, other }: { me: string; myKey: DmKey; members: string[]; other: string | null }) {
  const name = useNames()
  const t = useT()
  const [convs, setConvs] = useState<Conversation[] | null>(null)
  const [pks, setPks] = useState<Map<string, string | null>>(new Map())
  const [err, setErr] = useState(false)
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
      <PeopleStrip others={others} pks={pks} active={other} />
      <div className="mt-5 text-[13px] text-muted">{t('messages.conversations')}</div>
      {convs === null ? (
        <div className="mt-4 space-y-3" aria-busy>
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-10 w-5/6" />
        </div>
      ) : convs.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted">{other ? t('messages.noOtherConversations') : t('messages.noMessages')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {convs.map((c) => {
            const unread = !c.last.mine && c.last.at > lastRead(me, c.with) && c.with !== other
            return (
              <li key={c.with}>
                <button
                  onClick={() => go('messages', { with: c.with })}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2.5 text-start ${c.with === other ? 'bg-card ring-1 ring-line' : 'hover:bg-soft'}`}
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
                        {c.last.mine ? t('messages.youPrefix', { text: c.last.text ?? t('messages.otherDeviceText') }) : (c.last.text ?? t('messages.otherDeviceText'))}
                      </span>
                      {unread && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label={t('messages.unread')} />}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {err && <p className="mt-3 text-[12px] text-muted">{t('messages.unreachable')}</p>}
      <p className="mt-6 text-[12px] leading-relaxed text-muted">
        {t('messages.footnote')}
      </p>
    </div>
  )

  return (
    <div>
      <div className={other ? 'hidden md:block' : ''}>
        <div className="text-[13px] text-muted">{t('nav.messages')}</div>
        <h1 className="mt-3 text-[32px] font-light tracking-[-0.03em]">{t('messages.title')}</h1>
      </div>
      <div className="mt-0 grid gap-8 md:mt-8 md:grid-cols-[minmax(240px,320px)_1fr]">
        <div className={other ? 'hidden md:block' : ''}>{list}</div>
        {other ? (
          <Thread key={other} me={me} other={other} myKey={myKey} theirPk={pks.has(other) ? (pks.get(other) ?? null) : undefined} />
        ) : (
          <div className="hidden min-h-[320px] place-items-center rounded-2xl border border-dashed border-line text-[13px] text-muted md:grid">{t('messages.pickConversation')}</div>
        )}
      </div>
    </div>
  )
}

/** Everyone you can message, one tap away (like the people row at the top of a DM inbox). */
function PeopleStrip({ others, pks, active }: { others: string[]; pks: Map<string, string | null>; active: string | null }) {
  const name = useNames()
  const t = useT()
  if (!others.length) return <p className="text-[13px] text-muted">{t('messages.onlyMember')}</p>
  return (
    <div>
      <div className="text-[13px] text-muted">{t('nav.members')}</div>
      <ul className="-mx-1 mt-2 flex gap-1 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible" aria-label={t('messages.messageAMember')}>
        {others.map((m) => {
          const off = pks.get(m) === null
          return (
            <li key={m} className="shrink-0">
              <button
                onClick={() => go('messages', { with: m })}
                className={`flex w-[72px] flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center ${m === active ? 'bg-card ring-1 ring-line' : 'hover:bg-soft'}`}
                title={off ? t('messages.person.offTitle', { id: m }) : t('messages.person.messageTitle', { id: m })}
              >
                <span className={off ? 'opacity-50' : ''}>
                  <Avatar id={m} size={44} />
                </span>
                <span className="block w-full truncate text-[12px]">{name(m)}</span>
                {off && <span className="-mt-1 text-[10.5px] text-muted">{t('messages.person.off')}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
