import { type ReactNode } from 'react'
import { ProfileSheetHost, openProfileSheet } from './components/ProfileSheet'
import GroupSwitcher from './components/GroupSwitcher'
import { DaoProvider, go, openDao, shareUrl, useDao, useRoute, type Page } from './lib/store'
import { useWallet } from './lib/wallet'
import { Avatar, Button, Spinner, WrongNetworkBanner } from './components/ui'
import { prefetchProfiles, useNames } from './lib/profile'
import { isTrusted, openRequests } from './lib/record'
import { allMembers, can, isRole } from './lib/dao'
import Landing from './pages/Landing'
import Home from './pages/Home'
import Pay from './pages/Pay'
import Approve from './pages/Approve'
import Members from './pages/Members'
import Activity from './pages/Activity'
import Board from './pages/Board'
import Earn from './pages/Earn'
import Allowances from './pages/Allowances'
import CreateGroup from './pages/CreateGroup'
import SignIn from './pages/SignIn'
import Join from './pages/Join'
import Messages from './pages/Messages'

export default function App() {
  const route = useRoute()


  if (route.page === 'create') return <CreateGroup />
  if (route.page === 'signin') {
    return route.daoId ? (
      <DaoProvider daoId={route.daoId}>
        <SignIn daoId={route.daoId} />
      </DaoProvider>
    ) : (
      <SignIn daoId={null} />
    )
  }
  if (route.page === 'join') {
    return (
      <DaoProvider daoId={route.daoId}>
        <Join daoId={route.daoId} params={route.params} />
      </DaoProvider>
    )
  }
  if (!route.daoId) return <Landing />

  return (
    <DaoProvider daoId={route.daoId}>
      {route.page === 'board' ? (
        <Board />
      ) : (
        <Shell page={route.page} daoId={route.daoId}>
          <DaoGate>
            {route.page === 'home' && <Home />}
            {route.page === 'pay' && <Pay params={route.params} />}
            {route.page === 'approve' && <Approve />}
            {route.page === 'members' && <Members />}
            {route.page === 'activity' && <Activity />}
            {route.page === 'earn' && <Earn />}
            {route.page === 'allowances' && <Allowances />}
            {route.page === 'messages' && <Messages />}
          </DaoGate>
        </Shell>
      )}
    </DaoProvider>
  )
}

function DaoGate({ children }: { children: ReactNode }) {
  const { dao, error } = useDao()
  if (error && !dao)
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-[24px] font-light tracking-[-0.02em]">
          {/fetch|network|timeout|429|502|503/i.test(error) ? "We couldn't reach NEAR" : "We couldn't open that treasury"}
        </h1>
        <p className="mt-2 text-[13.5px] text-muted">
          {/fetch|network|timeout|429|502|503/i.test(error)
            ? "The testnet RPC didn't answer. This is usually brief, so try again in a moment."
            : error}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={() => window.location.reload()}>Try again</Button>
          <Button variant="secondary" onClick={() => openDao(null)}>
            Pick another community
          </Button>
        </div>
      </div>
    )
  if (!dao)
    return (
      <div aria-busy="true" aria-label="Reading the treasury from NEAR">
        <div className="skeleton h-3 w-16" />
        <div className="skeleton mt-12 h-3 w-32" />
        <div className="skeleton mt-4 h-20 w-80 max-w-full" />
        <div className="skeleton mt-6 h-3 w-48" />
        <div className="mt-8 flex gap-2">
          <div className="skeleton h-10 w-24" />
          <div className="skeleton h-10 w-32" />
        </div>
        <div className="mt-12 grid grid-cols-3 gap-5 border-y border-line py-5">
          <div className="skeleton h-8" />
          <div className="skeleton h-8" />
          <div className="skeleton h-8" />
        </div>
        <div className="mt-8 space-y-4">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-4 w-4/6" />
        </div>
      </div>
    )
  return <>{children}</>
}

const NAV: { page: Page; label: string; icon: string }[] = [
  { page: 'home', label: 'Home', icon: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z' },
  { page: 'pay', label: 'Pay', icon: 'M12 5v14M5 12h14' },
  { page: 'approve', label: 'Approve', icon: 'M5 13l4 4L19 7' },
  { page: 'members', label: 'Members', icon: 'M16 11a4 4 0 10-8 0M4 20a8 8 0 0116 0' },
  { page: 'messages', label: 'Messages', icon: 'M4 5h16v11H8l-4 4z' },
  { page: 'activity', label: 'Activity', icon: 'M4 6h16M4 12h16M4 18h10' },
  { page: 'earn', label: 'Earn', icon: 'M4 17l6-6 4 4 6-8' },
  { page: 'allowances', label: 'Allowances', icon: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z' },
  { page: 'board', label: 'Board', icon: 'M4 4h16v12H4zM8 20h8' },
]

function Shell({ page, daoId, children }: { page: Page; daoId: string | null; children: ReactNode }) {
  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-52 shrink-0 lg:w-60 flex-col border-r border-line px-4 py-6 md:flex">
        <Logo />
        <nav className="mt-8 flex flex-col gap-px">
          {daoId &&
            NAV.map((n) => <NavItem key={n.page} item={n} active={page === n.page} />)}
        </nav>
        {daoId ? (
          <GroupCard />
        ) : (
          <div className="mt-auto pt-6 text-xs leading-relaxed text-muted">Terra never holds the money.</div>
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar daoId={daoId} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:px-10 md:pb-12 md:pt-8 xl:px-14">
          <NetworkCheck />
          <div key={page} className="page-enter">
            {children}
          </div>
        </main>
      </div>
      {daoId && <MobileNav page={page} />}
    </div>
  )
}

function NetworkCheck() {
  const { accountId, signOut } = useWallet()
  return (
    <div className="mb-6 empty:hidden">
      <WrongNetworkBanner accountId={accountId} onSignOut={signOut} />
    </div>
  )
}

function NavItem({ item, active }: { item: (typeof NAV)[number]; active: boolean }) {
  const { dao } = useDaoSafe()
  const count = item.page === 'approve' && dao ? openRequests(dao).length : 0
  const external = item.page === 'board' && dao
  return (
    <a
      href={external ? shareUrl(dao.id, 'board') : `#/${item.page}`}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      onClick={(e) => {
        if (external) return
        e.preventDefault()
        go(item.page)
      }}
      className={`flex items-center rounded-lg px-3 py-2 text-[13.5px] transition ${active ? 'bg-card text-ink ring-1 ring-line' : 'text-muted hover:text-ink'}`}
    >
      <span className="flex-1">{item.label}</span>
      {external && <span className="text-muted">↗</span>}
      {count > 0 && <span className="grid size-[18px] place-items-center rounded-full bg-brand text-[10.5px] font-medium text-on-brand">{count}</span>}
    </a>
  )
}

function MobileNav({ page }: { page: Page }) {
  const { dao } = useDaoSafe()
  const items = NAV.filter((n) => ['home', 'pay', 'approve', 'members', 'messages', 'board'].includes(n.page))
  const count = dao ? openRequests(dao).length : 0
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {items.map((n) => {
        const href = n.page === 'board' && dao ? shareUrl(dao.id, 'board') : `#/${n.page}`
        return (
          <a
            key={n.page}
            href={href}
            className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium ${page === n.page ? 'text-ink' : 'text-muted'}`}
          >
            <Icon d={n.icon} />
            {n.label}
            {n.page === 'approve' && count > 0 && (
              <span className="absolute left-1/2 top-1.5 ml-2 grid size-[16px] place-items-center rounded-full bg-accent text-[9.5px] font-medium text-on-accent">{count}</span>
            )}
          </a>
        )
      })}
    </nav>
  )
}

function useDaoSafe() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useDao()
  } catch {
    return { dao: null }
  }
}

function MobileGroupName() {
  return <GroupSwitcher variant="phone" />
}

function GroupCard() {
  const ctx = useDaoSafe()
  const dao = ctx.dao
  const records = 'records' in ctx ? ctx.records : new Map()
  const { accountId } = useWallet()
  const name = useNames()
  if (!dao) return <div className="mt-auto" />
  const members = allMembers(dao.policy)
  prefetchProfiles(members) // one batched NEAR Social read for the whole group
  const mine = accountId ? records.get(accountId) : undefined
  const status = !accountId
    ? 'Viewing as a guest'
    : mine?.roles.some((n: string) => isRole(n, 'council'))
      ? "You're on the council"
      : isTrusted(mine)
        ? "You're a trusted member"
        : members.includes(accountId)
          ? "You're a member"
          : can(dao.policy, accountId, 'transfer', 'AddProposal')
            ? 'Not a member yet · you can still request money'
            : 'Not a member yet · ask to join'
  return (
    <div className="mt-auto rounded-2xl bg-soft p-4">
      <div className="flex -space-x-1.5">
        {members.slice(0, 3).map((m) => (
          <span key={m} className="rounded-full ring-2 ring-[var(--sand)]" title={`${name(m)} · ${m}`}>
            <Avatar id={m} size={24} shape="circle" />
          </span>
        ))}
        {members.length > 3 && (
          <span className="grid size-6 place-items-center rounded-full bg-card text-[9.5px] text-muted ring-2 ring-[var(--sand)]">+{members.length - 3}</span>
        )}
      </div>
      <div className="mt-3 truncate text-[13.5px] font-medium" title={dao.id}>{prettyName(dao.config.name)}</div>
      {accountId && (
        <button onClick={openProfileSheet} className="block max-w-full truncate text-left text-[12px] text-muted hover:text-ink" title={`${accountId} · Edit profile`}>
          {name(accountId)}
        </button>
      )}
      <div className="text-[12px] text-muted">{status}</div>
      <GroupSwitcher variant="sidebar" />
    </div>
  )
}

export function prettyName(name: string): string {
  // Names people typed ("nearHack Community") are kept as written; only slugs get title case.
  if (/\s/.test(name) || /[A-Z]/.test(name)) return name.trim()
  return name
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function TopBar({ daoId }: { daoId: string | null }) {
  const { accountId, signIn, signOut, ready } = useWallet()
  const name = useNames()
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur md:px-8">
      <div className="-ml-2.5 flex min-w-0 items-center md:hidden">
        <Logo compact />
        <MobileGroupName />
      </div>
      <div className="hidden text-xs text-muted md:block">
        <span className="rounded-full bg-warn-soft px-2 py-0.5 font-medium text-warn">Testnet</span>
        {daoId && <span className="ml-2">Connected to {daoId}</span>}
      </div>
      <div className="flex items-center gap-2">
        {!ready ? (
          <Spinner />
        ) : accountId ? (
          <>
            <ProfileSheetHost />
            <button
              onClick={openProfileSheet}
              title={`${accountId} · Edit profile`}
              className="flex items-center gap-2 rounded-full border border-line bg-card py-1 pl-1 pr-3 text-sm hover:bg-soft"
            >
              <Avatar id={accountId} size={26} />
              <span className="hidden max-w-40 truncate font-medium sm:inline">{name(accountId)}</span>
            </button>
            <Button variant="ghost" onClick={signOut}>
              Sign out
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={signIn}>Sign in</Button>
        )}
      </div>
    </header>
  )
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <a
      href="./"
      onClick={(e) => {
        e.preventDefault()
        openDao(null)
      }}
      className={`flex items-center gap-2.5 ${compact ? 'min-h-11 min-w-11 justify-center' : ''}`}
      title="Terra home"
    >
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-6 w-6" />
      {!compact && <span className="text-[15px] font-medium tracking-tight">terra</span>}
    </a>
  )
}

export function Icon({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
