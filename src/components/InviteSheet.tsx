import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { can, decodeDescription, kindName, roleMembers } from '../lib/dao'
import { allowJoinRequestsTx, defaultJoinRole, hasMemberRole, invitableRoles, joinLink, joinRequestsOpen } from '../lib/join'
import { Button, TxStatus, useTx } from './ui'

/** Invite by QR: show it at a meetup, people scan it and ask to join, the council approves. */
export function InviteSheet({ onClose, onAddByAccount }: { onClose: () => void; onAddByAccount?: () => void }) {
  const { dao, refresh } = useDao()
  const { accountId, send } = useWallet()
  const [role, setRole] = useState(() => (dao ? defaultJoinRole(dao.policy) : 'member'))
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const tx = useTx()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const link = dao ? joinLink(dao.id, role) : ''
  useEffect(() => {
    if (!link) return
    let live = true
    // Dark modules on white with a quiet zone scan best, whatever the app theme.
    QRCode.toDataURL(link, { margin: 2, width: 560, errorCorrectionLevel: 'M', color: { dark: '#0b0b0c', light: '#ffffff' } })
      .then((url) => live && setQr(url))
      .catch(() => live && setQr(null))
    return () => {
      live = false
    }
  }, [link])

  if (!dao) return null
  const council = dao.policy.roles.find((r) => r.name === 'council')
  const isCouncil = !!accountId && (council ? roleMembers(council).includes(accountId) : can(dao.policy, accountId, 'add_member_to_role', 'VoteApprove'))
  const roles = invitableRoles(dao.policy)
  // Ready when anyone may ask and there's a plain member role to join into (older groups have neither).
  const open = joinRequestsOpen(dao.policy) && hasMemberRole(dao.policy)
  const canPropose = can(dao.policy, accountId, 'policy', 'AddProposal')
  const switchPending = dao.proposals.find(
    (p) => p.status === 'InProgress' && kindName(p.kind) === 'ChangePolicy' && decodeDescription(p.description).title === 'Let people ask to join',
  )

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked: the link is selectable */
    }
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  return (
    <div className="fixed inset-0 z-40 grid items-end bg-black/60 sm:place-items-center sm:p-4" onClick={onClose} role="dialog" aria-modal aria-label="Invite people">
      <div
        className="max-h-[94vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-[440px] sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span>Invite people</span>
          <button onClick={onClose} className="-my-3 py-3 pl-4 hover:text-ink">Close</button>
        </div>
        <p className="mt-1 text-[13.5px] text-muted">Show this at your meetup. People scan it and ask to join; the council approves each one.</p>

        {!open && (
          <div className="mt-5 rounded-xl bg-soft p-4 text-[13px]">
            <div className="font-medium">This group doesn't take join requests yet</div>
            <p className="mt-1 text-muted">
              {switchPending
                ? 'A change to allow them is waiting for the council in Approve.'
                : 'One council vote switches them on and adds a plain "member" role for newcomers.'}
            </p>
            {!switchPending && isCouncil && canPropose && (
              <Button variant="secondary" className="mt-3 w-full" disabled={tx.state.status === 'signing'} onClick={() => tx.run(() => send(allowJoinRequestsTx(dao)), refresh)}>
                Let people ask to join
              </Button>
            )}
            <div className="mt-2">
              <TxStatus state={tx.state} doneText="Sent to the council. Approve it in Approve." />
            </div>
          </div>
        )}

        {isCouncil && roles.length > 1 && (
          <div className="mt-5">
            <span className="text-[12px] text-muted">They join as</span>
            <div className="mt-2 flex flex-wrap gap-2 text-[13.5px]">
              {roles.map((r) => (
                <button key={r} onClick={() => setRole(r)} className={`min-h-11 rounded-lg border px-4 sm:min-h-0 sm:py-2 ${role === r ? 'border-ink' : 'border-line text-muted hover:text-ink'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={`mx-auto mt-5 aspect-square w-full max-w-[280px] overflow-hidden rounded-2xl border border-line bg-white ${open ? '' : 'opacity-60'}`}>
          {qr ? <img src={qr} alt={`QR code for ${link}`} className="size-full" data-testid="invite-qr" /> : <div className="skeleton size-full" />}
        </div>

        <div className="mt-5 flex items-center gap-2 rounded-lg border border-line bg-bg py-1 pl-3 pr-1">
          <span className="min-w-0 flex-1 select-all truncate font-mono text-[12.5px] text-muted" title={link}>
            {link}
          </span>
          <button onClick={copy} className="min-h-10 shrink-0 rounded-md px-3 text-[13px] font-medium hover:bg-soft">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        {canShare && (
          <Button
            variant="secondary"
            className="mt-2 w-full sm:hidden"
            onClick={() => navigator.share({ title: `Join ${dao.config.name} on Terra`, url: link }).catch(() => undefined)}
          >
            Share link
          </Button>
        )}

        {onAddByAccount && (
          <button onClick={onAddByAccount} className="mt-2 min-h-11 text-[12.5px] text-muted underline-offset-2 hover:text-ink hover:underline">
            Know their NEAR account? Add them directly
          </button>
        )}
      </div>
    </div>
  )
}
