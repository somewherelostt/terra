import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { can, decodeDescription, kindName, roleMembers } from '../lib/dao'
import { allowJoinRequestsTx, defaultJoinRole, hasMemberRole, invitableRoles, joinLink, joinRequestsOpen } from '../lib/join'
import { Button, TxStatus, useTx } from './ui'
import { useT } from '../i18n'

/** Invite by QR: show it at a meetup, people scan it and ask to join, the council approves. */
export function InviteSheet({ onClose, onAddByAccount }: { onClose: () => void; onAddByAccount?: () => void }) {
  const t = useT()
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
    (p) => p.status === 'InProgress' && kindName(p.kind) === 'ChangePolicy' && // On-chain proposal title (English, written by allowJoinRequestsTx): not translated.
    // i18n-ignore
    decodeDescription(p.description).title === 'Let people ask to join',
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
    <div className="fixed inset-0 z-40 grid items-end glass-scrim sm:place-items-center sm:p-4" onClick={onClose} role="dialog" aria-modal aria-label={t('invite.title')}>
      <div
        className="max-h-[94vh] w-full overflow-y-auto glass glass-sheet rounded-t-2xl border border-line bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-[440px] sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span>{t('invite.title')}</span>
          <button onClick={onClose} className="-my-3 py-3 ps-4 hover:text-ink">{t('common.close')}</button>
        </div>
        <p className="mt-1 text-[13.5px] text-muted">{t('invite.intro')}</p>

        {!open && (
          <div className="mt-5 rounded-xl bg-soft p-4 text-[13px]">
            <div className="font-medium">{t('invite.closed.title')}</div>
            <p className="mt-1 text-muted">
              {switchPending
                ? t('invite.closed.pending')
                : t('invite.closed.body')}
            </p>
            {!switchPending && isCouncil && canPropose && (
              <Button variant="secondary" className="mt-3 w-full" disabled={tx.state.status === 'signing'} onClick={() => tx.run(() => send(allowJoinRequestsTx(dao)), refresh)}>
                {t('invite.closed.allow')}
              </Button>
            )}
            <div className="mt-2">
              <TxStatus state={tx.state} doneText={t('invite.closed.sent')} />
            </div>
          </div>
        )}

        {isCouncil && roles.length > 1 && (
          <div className="mt-5">
            <span className="text-[12px] text-muted">{t('invite.joinAs')}</span>
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
          {qr ? <img src={qr} alt={t('invite.qrAlt', { link })} className="size-full" data-testid="invite-qr" /> : <div className="skeleton size-full" />}
        </div>

        <div className="mt-5 flex items-center gap-2 rounded-lg border border-line bg-bg py-1 ps-3 pe-1">
          <span className="min-w-0 flex-1 select-all truncate font-mono text-[12.5px] text-muted" title={link}>
            {link}
          </span>
          <button onClick={copy} className="min-h-10 shrink-0 rounded-md px-3 text-[13px] font-medium hover:bg-soft">
            {copied ? t('common.copied') : t('common.copy')}
          </button>
        </div>
        {canShare && (
          <Button
            variant="secondary"
            className="mt-2 w-full sm:hidden"
            onClick={() => navigator.share({ title: t('invite.shareTitle', { name: dao.config.name }), url: link }).catch(() => undefined)}
          >
            {t('invite.share')}
          </Button>
        )}

        {onAddByAccount && (
          <button onClick={onAddByAccount} className="mt-2 min-h-11 text-[12.5px] text-muted underline-offset-2 hover:text-ink hover:underline">
            {t('invite.addDirectly')}
          </button>
        )}
      </div>
    </div>
  )
}
