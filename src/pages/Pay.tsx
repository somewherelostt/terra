import { useEffect, useMemo, useState } from 'react'
import { go, shareUrl, useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { addTransferProposalTx, can, isRole, roleMembers } from '../lib/dao'
import { isValidAccountId, ONE_NEAR } from '../lib/near'
import { nearToYocto, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { FALLBACK_TOKENS, POPULAR, RECORDED_QUOTE, isDeprecated, chainName, getTokens, quotePayout, toUnits, type IntentsToken, type QuoteResult } from '../lib/intents'
import { isTrusted, tierFor, TIER_COPY } from '../lib/record'
import { Button, Spinner, TxStatus, showToast, useTx } from '../components/ui'
import { prettyName } from '../App'
import { useCountUp } from '../lib/motion'
import { AllowanceBanner } from './Allowances'

type Mode = 'near' | 'intents'

export default function Pay({ params }: { params: URLSearchParams }) {
  const { dao, nearUsd, records, refresh } = useDao()
  const { accountId, signIn, send } = useWallet()
  // The demo flow is "$20 to a designer, in USDC on Solana", so that's the default.
  const [mode, setMode] = useState<Mode>(params.get('to') && !params.get('token') ? 'near' : 'intents')
  const [title, setTitle] = useState(params.get('for') ?? '')
  const [receiver, setReceiver] = useState(params.get('to') ?? '')
  const [amount, setAmount] = useState(params.get('amount') ?? '')
  const [tokenId, setTokenId] = useState<string>(params.get('token') ?? '')
  const [address, setAddress] = useState(params.get('address') ?? '')
  const [standIn, setStandIn] = useState('')
  const [tokens, setTokens] = useState<IntentsToken[]>([])
  const [quote, setQuote] = useState<QuoteResult | null>(null)
  const [quoteErr, setQuoteErr] = useState<string | null>(null)
  const [quoteDown, setQuoteDown] = useState(false)
  const [retry, setRetry] = useState(0)
  const [countdown, setCountdown] = useState(5)
  const [flash, setFlash] = useState(0)
  const [quoting, setQuoting] = useState(false)
  const [copied, setCopied] = useState(false)
  const tx = useTx()

  useEffect(() => {
    getTokens()
      .then((t) => {
        setTokens(t)
        if (!tokenId) {
          const usdcSol = t.find((x) => x.symbol === 'USDC' && x.blockchain === 'sol')
          if (usdcSol) setTokenId(usdcSol.assetId)
        }
      })
      .catch(() => {
        setTokens(FALLBACK_TOKENS)
        if (!tokenId) setTokenId(FALLBACK_TOKENS[0].assetId)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (accountId && !standIn) setStandIn(accountId)
  }, [accountId, standIn])

  const token = tokens.find((t) => t.assetId === tokenId)
  // The amount is typed in dollars; convert it to what actually moves.
  const usdIn = /^\d+(\.\d{0,2})?$/.test(amount.trim()) ? Number(amount) : NaN
  // Stablecoins (priced about $1) are paid dollar for dollar, so "$20" means exactly 20 USDC.
  const stable = !!token && token.price > 0.97 && token.price < 1.03
  const tokenAmount =
    token && isFinite(usdIn) && usdIn > 0 && token.price > 0 ? (stable ? usdIn.toFixed(2) : trimNum(usdIn / token.price, Math.min(token.decimals, 6))) : ''
  const nearAmount = isFinite(usdIn) && usdIn > 0 && isFinite(nearUsd) && nearUsd > 0 ? trimNum(usdIn / nearUsd, 4) : ''
  const popular = useMemo(
    () => POPULAR.map((p) => tokens.find((t) => t.symbol === p.symbol && t.blockchain === p.blockchain && !isDeprecated(t))).filter((t): t is IntentsToken => !!t),
    [tokens],
  )

  // Live quote, debounced.
  useEffect(() => {
    setQuote(null)
    setQuoteErr(null)
    setQuoteDown(false)
    if (mode !== 'intents' || !token || !dao) return
    const units = toUnits(tokenAmount, token.decimals)
    if (!units || address.trim().length < 8 || addressProblem(token.blockchain, address.trim())) return
    const t = setTimeout(async () => {
      setQuoting(true)
      try {
        setQuote(await quotePayout({ destinationAsset: token.assetId, amountOutUnits: units, recipient: address.trim(), refundTo: 'demo.near' }))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // Address problems are the user's to fix; outages fall back to a labelled sample.
        if (/recipient|address|invalid/i.test(msg)) setQuoteErr(`NEAR Intents can't pay that address (${msg}). Check it, or pick another coin.`)
        else setQuoteDown(true)
      } finally {
        setQuoting(false)
      }
    }, 500)
    return () => clearTimeout(t)
  }, [mode, token, tokenAmount, address, dao, retry])

  // Live quotes refresh every 5 s (the ring drains), keeping the old quote on screen meanwhile.
  useEffect(() => {
    if (!quote || quote.recorded || mode !== 'intents' || !token) return
    const units = toUnits(tokenAmount, token.decimals)
    if (!units) return
    setCountdown(5)
    const iv = setInterval(() => setCountdown((c) => (c <= 1 ? 1 : c - 1)), 1000)
    const t = setTimeout(async () => {
      try {
        const q = await quotePayout({ destinationAsset: token.assetId, amountOutUnits: units, recipient: address.trim(), refundTo: 'demo.near' })
        setQuote(q)
        setFlash(Date.now())
      } catch {
        setCountdown(5)
      }
    }, 5000)
    return () => {
      clearInterval(iv)
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote])

  if (!dao) return null

  // Amount the treasury sends, in yoctoNEAR.
  let yocto: bigint | null = null
  if (mode === 'near') yocto = nearAmount ? nearToYocto(nearAmount) : null
  else if (quote) {
    // Round up to 0.01 NEAR so the payout covers the quote.
    const step = ONE_NEAR / 100n
    const v = BigInt(quote.quote.amountIn)
    yocto = ((v + step - 1n) / step) * step
  }

  const payTo = mode === 'near' ? receiver.trim() : standIn.trim()
  const amountUsd = yocto ? yoctoToNumber(yocto) * nearUsd : NaN
  const tier = isFinite(amountUsd) ? tierFor(amountUsd) : null
  const trusted = accountId ? isTrusted(records.get(accountId)) : false
  // Same routing as Approve (routeRequest): the fast lane needs a trusted member other than you.
  const trustedRole = dao.policy.roles.find((r) => isRole(r.name, 'trusted'))
  const nodders = trustedRole ? roleMembers(trustedRole).filter((m) => m !== accountId) : []
  const effectiveTier = tier === 'small' && (!trusted || !nodders.length) ? 'mid' : tier
  const canPropose = can(dao.policy, accountId, 'transfer', 'AddProposal')
  const overBalance = yocto != null && yocto > dao.spendable

  const addrErr = mode === 'intents' && token && address.trim() ? addressProblem(token.blockchain, address.trim()) : null
  const errors: string[] = []
  if (!title.trim()) errors.push('Say what the money is for.')
  if (!payTo || !isValidAccountId(payTo)) errors.push(mode === 'near' ? 'Enter a valid NEAR account to pay.' : 'Enter the NEAR account that receives the testnet payout.')
  if (!yocto || yocto <= 0n) errors.push(mode === 'near' ? 'Enter an amount.' : 'Get a quote first.')
  if (overBalance) errors.push("That's more than the treasury holds.")
  if (addrErr) errors.unshift(addrErr)

  function quoteText(): string | undefined {
    if (mode !== 'intents' || !quote || !token) return undefined
    const q = quote.quote
    const t = new Date(quote.timestamp).toISOString().slice(11, 16)
    return `${Number(q.amountInFormatted).toFixed(2)} NEAR -> ${q.amountOutFormatted} ${token.symbol} on ${chainName(token.blockchain)}, about ${q.timeEstimate}s, ${quote.recorded ? 'sample recorded' : 'quoted'} ${t} UTC${quote.correlationId ? ` (${quote.correlationId.slice(0, 8)})` : ''}`
  }

  const canUseSaved = !!token && token.symbol === 'USDC' && token.blockchain === 'sol' && !!toUnits(tokenAmount, 6)
  function useSavedQuote() {
    // The saved quote was for 20 USDC; scale it to the amount asked for and label it as saved.
    const f = Number(tokenAmount) / 20
    const q = RECORDED_QUOTE.quote
    const inYocto = (BigInt(q.amountIn) * BigInt(Math.round(f * 1e6))) / 1_000_000n
    setQuote({
      ...RECORDED_QUOTE,
      quote: {
        ...q,
        amountIn: inYocto.toString(),
        amountInFormatted: String(Number(q.amountInFormatted) * f),
        amountInUsd: String(Number(q.amountInUsd) * f),
        amountOut: toUnits(tokenAmount, 6) ?? q.amountOut,
        amountOutFormatted: tokenAmount,
        amountOutUsd: String(Number(q.amountOutUsd) * f),
      },
    })
    setQuoteDown(false)
  }

  function approverCount(kind: 'small' | 'council'): number {
    const roles = dao!.policy.roles.filter((r) => isRole(r.name, kind === 'small' ? 'trusted' : 'council'))
    const set = new Set(roles.flatMap((r) => (typeof r.kind === 'object' && 'Group' in r.kind ? r.kind.Group : [])))
    if (accountId) set.delete(accountId)
    return set.size
  }

  async function submit() {
    if (errors.length || !yocto || !dao) return
    const meta = {
      title: title.trim(),
      wants: mode === 'intents' && token ? `${quote ? quote.quote.amountOutFormatted : tokenAmount} ${token.symbol} on ${chainName(token.blockchain)} to ${address.trim()}` : undefined,
      quote: quoteText(),
      tier: effectiveTier ? TIER_COPY[effectiveTier].label : undefined,
    }
    const hash = await tx.run(() => send(addTransferProposalTx(dao, payTo, yocto!, meta)), refresh)
    if (hash) {
      const n = effectiveTier === 'small' ? approverCount('small') : approverCount('council')
      showToast(`Request sent. ${n} member${n === 1 ? '' : 's'} can approve it.`, { label: 'View', onClick: () => go('approve') })
      go('approve')
    }
  }

  function requestLink(): string {
    const q: Record<string, string> = { for: title, amount }
    if (mode === 'near') q.to = receiver
    else {
      q.token = tokenId
      q.address = address
    }
    return shareUrl(dao!.id, 'pay', q)
  }

  const quick = popular.slice(0, 3)
  const name = prettyName(dao.config.name)
  const tierWord = tier ? { small: 'Small request.', mid: 'Mid-size request.', large: 'Large request.' }[tier] : null
  const tierNote =
    effectiveTier === 'small'
      ? 'One trusted member can approve it, because of your record.'
      : tier === 'small' && !trusted
        ? "You don't have a record here yet, so the council approves it. After one paid request and none turned down, your small requests take the fast lane."
        : tier === 'small'
          ? 'No other trusted member can give the fast-lane nod yet, so the council approves it.'
        : effectiveTier === 'mid'
          ? 'The council approves it at its usual threshold.'
          : 'The council votes on it at its usual threshold, and it shows on the public board while open.'
  const line = 'block border-b border-line pb-2 transition-colors focus-within:border-ink'
  const bare = 'w-full bg-transparent py-3 outline-none placeholder:text-muted/60 sm:py-2'

  return (
    <div>
      <div className="text-[13px] text-muted">Pay</div>
      <h1 className="mt-3 text-[32px] font-light tracking-[-0.03em]">Request money</h1>
      <p className="mt-1 text-[13.5px] text-muted">{name} pays them directly, on the chain they use, once members approve.</p>
      <div className="mt-6"><AllowanceBanner /></div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-8">
          <label className={line}>
            <span className="text-[12px] text-muted">Amount</span>
            <div className="tnum mt-1 flex items-baseline text-[56px] font-light leading-none tracking-[-0.05em] sm:text-[72px]">
              <span className="text-muted">$</span>
              <input
                className="w-full bg-transparent outline-none placeholder:text-muted/60"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="0.00"
                aria-label="Amount in US dollars"
              />
            </div>
            <span className="mt-1 block h-4 text-[12px] text-muted">
              {mode === 'near' ? (nearAmount ? `≈ ${nearAmount} NEAR` : '') : token && tokenAmount ? `They get ${stable ? "" : "about "}${tokenAmount} ${token.symbol} on ${chainName(token.blockchain)}` : ''}
            </span>
          </label>
          <label className={line}>
            <span className="text-[12px] text-muted">What it's for</span>
            <input className={bare + ' text-[17px]'} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Poster design for the meetup" maxLength={60} />
            <span className="mt-1 block text-right text-[11.5px] text-muted tnum">{title.length}/60</span>
          </label>
          <div>
            <span className="text-[12px] text-muted">They want</span>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[13.5px] sm:flex sm:flex-wrap">
              {quick.map((t) => {
                const on = mode === 'intents' && tokenId === t.assetId
                return (
                  <button
                    key={t.assetId}
                    onClick={() => {
                      setMode('intents')
                      setTokenId(t.assetId)
                    }}
                    className={`min-h-11 rounded-lg border px-3 py-2.5 sm:px-4 ${on ? 'border-ink' : 'border-line text-muted hover:text-ink'}`}
                  >
                    {t.symbol} <span className="text-muted">on {chainName(t.blockchain)}</span>
                  </button>
                )
              })}
              <button onClick={() => setMode('near')} className={`min-h-11 rounded-lg border px-3 py-2.5 sm:px-4 ${mode === 'near' ? 'border-ink' : 'border-line text-muted hover:text-ink'}`}>
                NEAR <span className="text-muted">account</span>
              </button>
              <select
                aria-label="Other tokens"
                className={`col-span-2 min-h-11 rounded-lg border bg-transparent px-3 py-2.5 ${mode === 'intents' && token && !quick.includes(token) ? 'border-ink' : 'border-line text-muted'}`}
                value={mode === 'intents' && token && !quick.includes(token) ? tokenId : ''}
                onChange={(e) => {
                  if (!e.target.value) return
                  setMode('intents')
                  setTokenId(e.target.value)
                }}
              >
                <option value="">More tokens…</option>
                {popular.slice(3).map((t) => (
                  <option key={t.assetId} value={t.assetId}>{t.symbol} on {chainName(t.blockchain)}</option>
                ))}
              </select>
            </div>
          </div>
          {mode === 'near' ? (
            <label className={line}>
              <span className="text-[12px] text-muted">Their NEAR account</span>
              <input className={bare + ' font-mono text-[14px]'} value={receiver} onChange={(e) => setReceiver(e.target.value.toLowerCase())} placeholder="designer.testnet" spellCheck={false} />
            </label>
          ) : (
            <>
              <label className={line}>
                <span className="text-[12px] text-muted">Their {token ? chainName(token.blockchain) : ''} address</span>
                <input className={bare + ' font-mono text-[14px]'} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={token?.blockchain === 'sol' ? 'Solana address' : 'Address on their chain'} spellCheck={false} />
              </label>
              <label className={line}>
                <span className="text-[12px] text-muted">Testnet stand-in: the NEAR account that receives the payout</span>
                <input className={bare + ' font-mono text-[14px]'} value={standIn} onChange={(e) => setStandIn(e.target.value.toLowerCase())} placeholder="you.testnet" spellCheck={false} />
                <span className="mt-1 block text-[12px] text-muted">
                  NEAR Intents runs on mainnet only. On testnet the treasury pays this account the quoted NEAR; on mainnet it pays the Intents deposit address and they get the token on their chain.
                </span>
              </label>
            </>
          )}
        </div>

        <div className="space-y-4">
          <div className="h-fit rounded-2xl border border-line bg-card p-6">
            {mode === 'intents' ? (
              <>
                <div className="flex items-center justify-between text-[12px] text-muted">
                  <span>{quote?.recorded ? 'Sample quote' : 'Live quote · NEAR Intents'}</span>
                  {quote && quote.recorded && (
                    <span className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-warn" />
                      recorded {new Date(quote.timestamp).toISOString().slice(11, 16)} UTC
                    </span>
                  )}
                  {quote && !quote.recorded && (
                    <span className="flex items-center gap-1.5">
                      <svg key={quote.timestamp} className="ring-count" width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                        <circle cx="8" cy="8" r="7" fill="none" stroke="var(--line)" strokeWidth="2" />
                        <circle className="p" cx="8" cy="8" r="7" fill="none" stroke="var(--accent)" strokeWidth="2" transform="rotate(-90 8 8)" />
                      </svg>
                      Refreshes in <span className="tnum">{countdown}</span>s
                    </span>
                  )}
                </div>
                <div className="mt-5 text-[12px] text-muted">They get exactly</div>
                <div className="tnum mt-1 text-[44px] font-light leading-none tracking-[-0.045em]">
                  {quote ? (
                    <Rolling value={Number(quote.quote.amountOutFormatted)} format={(n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: token && token.decimals > 6 ? 6 : 2 })} />
                  ) : (
                    tokenAmount || '0'
                  )} <span className="text-[18px] tracking-normal text-muted">{token?.symbol ?? ''}</span>
                </div>
                <div className="mt-6 text-[13.5px]">
                  <Line
                    key={flash}
                    flash={flash > 0}
                    k={`${name} sends`}
                    v={quoting && !quote ? '…' : quote ? <Rolling value={Number(quote.quote.amountInFormatted)} format={(n) => `${n.toFixed(2)} NEAR · ${usd(n * (Number(quote.quote.amountInUsd) / Number(quote.quote.amountInFormatted)))}`} /> : '—'}
                  />
                  <Line k="Arrives" v={quote ? `about ${quote.quote.timeEstimate} seconds` : '—'} />
                  <Line k="Fees" v={quote ? usd(Math.max(0, Number(quote.quote.amountInUsd) - Number(quote.quote.amountOutUsd))) : '—'} />
                </div>
                {quoting && <div className="mt-2 flex items-center gap-2 text-[12px] text-muted"><Spinner /> Asking NEAR Intents solvers…</div>}
                {!quote && !quoting && !quoteErr && !quoteDown && !addrErr && <div className="mt-2 text-[12px] text-muted">Add their address and an amount to get a live quote.</div>}
                {addrErr && <p className="mt-2 text-[12px] text-bad">{addrErr}</p>}
                {quoteErr && <p className="mt-2 text-[12px] text-bad">{quoteErr}</p>}
                {quoteDown && (
                  <div className="mt-3 rounded-xl bg-soft px-4 py-3 text-[13px]">
                    <div className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-warn" />
                      <span>Live quote is unavailable right now</span>
                    </div>
                    <p className="mt-1 text-[12px] text-muted">NEAR Intents didn't answer. Try again, or use the quote saved on 14 Nov 13:00 UTC. You can still send the request.</p>
                    <div className="mt-3 flex gap-2">
                      <Button variant="secondary" className="!py-1.5 !text-[12.5px]" onClick={() => setRetry((r) => r + 1)}>Try again</Button>
                      {canUseSaved && <Button variant="secondary" className="!py-1.5 !text-[12.5px]" onClick={useSavedQuote}>Use saved quote</Button>}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="text-[12px] text-muted">They get</div>
                <div className="tnum mt-1 text-[44px] font-light leading-none tracking-[-0.045em]">
                  {yocto ? yoctoToNear(yocto) : '0'} <span className="text-[18px] tracking-normal text-muted">NEAR</span>
                </div>
                <div className="mt-6 text-[13.5px]">
                  <Line k="Worth about" v={yocto && isFinite(amountUsd) ? usd(amountUsd) : '—'} />
                  <Line k="Arrives" v="as soon as it's approved" />
                </div>
              </>
            )}
            <div className="text-[13.5px]">
              <Line k={`${name} can spend`} v={`${yoctoToNear(dao.spendable)} NEAR`} />
              <Line k="Request bond, returned" v={`${yoctoToNear(dao.policy.proposal_bond)} NEAR`} />
            </div>
            {tierWord && (
              <div className="mt-2 rounded-xl bg-soft px-4 py-3 text-[13px]">
                <span className="font-medium text-accent-text">{tierWord}</span> <span className="text-muted">{tierNote}</span>
              </div>
            )}
            <div className="mt-5">
              {!accountId ? (
                <Button className="w-full !py-3" onClick={signIn}>Sign in to send the request</Button>
              ) : !canPropose ? (
                <p className="rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">
                  This DAO only lets its own members file payment requests, and your account isn't one yet. Ask a council member to add you (Members → Ask to join).
                </p>
              ) : (
                <Button className="w-full !py-3" disabled={errors.length > 0 || tx.state.status === 'signing'} onClick={submit}>
                  Send request
                </Button>
              )}
              {accountId && canPropose && errors.length > 0 && <p className="mt-2 text-[12px] text-muted">{errors[0]}</p>}
            </div>
            <div className="mt-3 space-y-3">
              <TxStatus state={tx.state} doneText="Request sent. Members can approve it now." />
              {tx.state.status === 'done' && (
                <Button variant="secondary" className="w-full" onClick={() => go('approve')}>See it in Approve</Button>
              )}
            </div>
          </div>
          <button
            className="min-h-11 text-left text-[13px] text-muted hover:text-ink disabled:opacity-50 sm:min-h-0"
            disabled={!title.trim() || !amount}
            onClick={() => navigator.clipboard?.writeText(requestLink()).then(() => setCopied(true)).catch(() => setCopied(false))}
          >
            {copied ? 'Request link copied' : 'Copy a link that opens this request, filled in →'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Rolling({ value, format }: { value: number; format: (n: number) => string }) {
  const shown = useCountUp(value, 700, 700)
  return <>{format(shown)}</>
}

function Line({ k, v, flash }: { k: string; v: React.ReactNode; flash?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 border-t border-line py-3 ${flash ? 'row-in' : ''}`}>
      <span className="text-muted">{k}</span>
      <span className="tnum text-right">{v}</span>
    </div>
  )
}

const EVM = new Set(['eth', 'base', 'arb', 'op', 'pol', 'bsc', 'avax', 'gnosis', 'bera', 'monad', 'scroll', 'xlayer', 'plasma', 'adi'])

/** A light format check per chain, so obvious typos are caught before asking for a quote. */
function addressProblem(chain: string, a: string): string | null {
  if (chain === 'sol' && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return "That doesn't look like a Solana address."
  if (EVM.has(chain) && !/^0x[0-9a-fA-F]{40}$/.test(a)) return 'That should be a 0x address with 40 hex characters.'
  if (chain === 'near' && !isValidAccountId(a)) return "That doesn't look like a NEAR account."
  if (chain === 'btc' && !/^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(a)) return "That doesn't look like a Bitcoin address."
  return null
}

function trimNum(n: number, digits: number): string {
  return n.toFixed(digits).replace(/\.?0+$/, '')
}
