import { useEffect, useMemo, useState } from 'react'
import { go, shareUrl, useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { addTransferProposalTx, can } from '../lib/dao'
import { isValidAccountId, ONE_NEAR } from '../lib/near'
import { nearToYocto, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { POPULAR, RECORDED_QUOTE, chainName, getTokens, quotePayout, toUnits, type IntentsToken, type QuoteResult } from '../lib/intents'
import { isTrusted, tierFor, TIER_COPY } from '../lib/record'
import { Button, Spinner, TxStatus, useTx } from '../components/ui'
import { prettyName } from '../App'

type Mode = 'near' | 'intents'

export default function Pay({ params }: { params: URLSearchParams }) {
  const { dao, nearUsd, records, refresh } = useDao()
  const { accountId, signIn, send } = useWallet()
  const [mode, setMode] = useState<Mode>(params.get('token') ? 'intents' : 'near')
  const [title, setTitle] = useState(params.get('for') ?? '')
  const [receiver, setReceiver] = useState(params.get('to') ?? '')
  const [amount, setAmount] = useState(params.get('amount') ?? '')
  const [tokenId, setTokenId] = useState<string>(params.get('token') ?? '')
  const [address, setAddress] = useState(params.get('address') ?? '')
  const [standIn, setStandIn] = useState('')
  const [tokens, setTokens] = useState<IntentsToken[]>([])
  const [quote, setQuote] = useState<QuoteResult | null>(null)
  const [quoteErr, setQuoteErr] = useState<string | null>(null)
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
      .catch(() => setTokens([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (accountId && !standIn) setStandIn(accountId)
  }, [accountId, standIn])

  const token = tokens.find((t) => t.assetId === tokenId)
  const popular = useMemo(
    () => POPULAR.map((p) => tokens.find((t) => t.symbol === p.symbol && t.blockchain === p.blockchain)).filter((t): t is IntentsToken => !!t),
    [tokens],
  )
  const others = useMemo(
    () => tokens.filter((t) => !popular.includes(t)).sort((a, b) => a.symbol.localeCompare(b.symbol) || a.blockchain.localeCompare(b.blockchain)),
    [tokens, popular],
  )

  // Live quote, debounced.
  useEffect(() => {
    setQuote(null)
    setQuoteErr(null)
    if (mode !== 'intents' || !token || !dao) return
    const units = toUnits(amount, token.decimals)
    if (!units || address.trim().length < 8) return
    const t = setTimeout(async () => {
      setQuoting(true)
      try {
        setQuote(await quotePayout({ destinationAsset: token.assetId, amountOutUnits: units, recipient: address.trim(), refundTo: 'demo.near' }))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // Address problems are the user's to fix; outages fall back to a labelled sample.
        if (/recipient|address|invalid/i.test(msg)) setQuoteErr(msg)
        else if (token.symbol === 'USDC' && token.blockchain === 'sol') {
          setQuote(RECORDED_QUOTE)
          setQuoteErr(`Live quote unavailable (${msg}). Showing a saved sample.`)
        } else setQuoteErr(msg)
      } finally {
        setQuoting(false)
      }
    }, 500)
    return () => clearTimeout(t)
  }, [mode, token, amount, address, dao])

  if (!dao) return null

  // Amount the treasury sends, in yoctoNEAR.
  let yocto: bigint | null = null
  if (mode === 'near') yocto = nearToYocto(amount)
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
  const effectiveTier = tier === 'small' && !trusted ? 'mid' : tier
  const canPropose = can(dao.policy, accountId, 'transfer', 'AddProposal')
  const overBalance = yocto != null && yocto > dao.spendable

  const errors: string[] = []
  if (!title.trim()) errors.push('Say what the money is for.')
  if (!payTo || !isValidAccountId(payTo)) errors.push(mode === 'near' ? 'Enter a valid NEAR account to pay.' : 'Enter the NEAR account that receives the testnet payout.')
  if (!yocto || yocto <= 0n) errors.push(mode === 'near' ? 'Enter an amount.' : 'Get a quote first.')
  if (overBalance) errors.push("That's more than the treasury holds.")

  function quoteText(): string | undefined {
    if (mode !== 'intents' || !quote || !token) return undefined
    const q = quote.quote
    const t = new Date(quote.timestamp).toISOString().slice(11, 16)
    return `${Number(q.amountInFormatted).toFixed(2)} NEAR -> ${q.amountOutFormatted} ${token.symbol} on ${chainName(token.blockchain)}, about ${q.timeEstimate}s, ${quote.recorded ? 'sample recorded' : 'quoted'} ${t} UTC${quote.correlationId ? ` (${quote.correlationId.slice(0, 8)})` : ''}`
  }

  async function submit() {
    if (errors.length || !yocto || !dao) return
    const meta = {
      title: title.trim(),
      wants: mode === 'intents' && token ? `${amount} ${token.symbol} on ${chainName(token.blockchain)} to ${address.trim()}` : undefined,
      quote: quoteText(),
      tier: effectiveTier ? TIER_COPY[effectiveTier].label : undefined,
    }
    await tx.run(() => send(addTransferProposalTx(dao, payTo, yocto!, meta)), refresh)
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
      : tier === 'small'
        ? "You don't have a record here yet, so the council approves it. After one approved request you get the fast lane."
        : effectiveTier === 'mid'
          ? 'The council approves it at its usual threshold.'
          : 'The council votes on it, and every member sees it on the board.'
  const line = 'block border-b border-line pb-3'
  const bare = 'mt-1 w-full bg-transparent outline-none placeholder:text-muted/60'

  return (
    <div>
      <div className="text-[13px] text-muted">Pay</div>
      <h1 className="mt-3 text-[32px] font-light tracking-[-0.03em]">Request money</h1>
      <p className="mt-1 text-[13.5px] text-muted">{name} pays them directly, on the chain they use, once members approve.</p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-8">
          <label className={line}>
            <span className="text-[12px] text-muted">{mode === 'near' ? 'Amount in NEAR' : `Amount they get${token ? ` in ${token.symbol}` : ''}`}</span>
            <input
              className={bare + ' tnum text-[56px] font-light leading-none tracking-[-0.05em] sm:text-[72px]'}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              aria-label="Amount"
            />
            {mode === 'near' && yocto && isFinite(nearUsd) && <span className="text-[12px] text-muted">≈ {usd(amountUsd)}</span>}
          </label>
          <label className={line}>
            <span className="text-[12px] text-muted">What it's for</span>
            <input className={bare + ' text-[17px]'} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Poster design for the meetup" maxLength={140} />
          </label>
          <div>
            <span className="text-[12px] text-muted">They want</span>
            <div className="mt-2 flex flex-wrap gap-2 text-[13.5px]">
              {quick.map((t) => {
                const on = mode === 'intents' && tokenId === t.assetId
                return (
                  <button
                    key={t.assetId}
                    onClick={() => {
                      setMode('intents')
                      setTokenId(t.assetId)
                    }}
                    className={`rounded-lg border px-4 py-2.5 ${on ? 'border-ink' : 'border-line text-muted hover:text-ink'}`}
                  >
                    {t.symbol} <span className="text-muted">on {chainName(t.blockchain)}</span>
                  </button>
                )
              })}
              <button onClick={() => setMode('near')} className={`rounded-lg border px-4 py-2.5 ${mode === 'near' ? 'border-ink' : 'border-line text-muted hover:text-ink'}`}>
                NEAR <span className="text-muted">account</span>
              </button>
              <select
                aria-label="Other tokens"
                className={`rounded-lg border bg-transparent px-3 py-2.5 ${mode === 'intents' && token && !quick.includes(token) ? 'border-ink' : 'border-line text-muted'}`}
                value={mode === 'intents' && token && !quick.includes(token) ? tokenId : ''}
                onChange={(e) => {
                  if (!e.target.value) return
                  setMode('intents')
                  setTokenId(e.target.value)
                }}
              >
                <option value="">More tokens…</option>
                {[...popular.slice(3), ...others].map((t) => (
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
                  {quote && (
                    <span className="flex items-center gap-1.5">
                      <span className={`size-1.5 rounded-full ${quote.recorded ? 'bg-warn' : 'animate-pulse bg-good'}`} />
                      {new Date(quote.timestamp).toISOString().slice(11, 16)} UTC
                    </span>
                  )}
                </div>
                <div className="mt-5 text-[12px] text-muted">They get exactly</div>
                <div className="tnum mt-1 text-[44px] font-light leading-none tracking-[-0.045em]">
                  {quote ? Number(quote.quote.amountOutFormatted).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: token && token.decimals > 6 ? 6 : 2 }) : amount || '0'} <span className="text-[18px] tracking-normal text-muted">{token?.symbol ?? ''}</span>
                </div>
                <div className="mt-6 text-[13.5px]">
                  <Line k={`${name} sends`} v={quoting ? '…' : quote ? `${Number(quote.quote.amountInFormatted).toFixed(2)} NEAR · ${usd(Number(quote.quote.amountInUsd))}` : '—'} />
                  <Line k="Arrives" v={quote ? `about ${quote.quote.timeEstimate} seconds` : '—'} />
                  <Line k="Fees" v={quote ? usd(Math.max(0, Number(quote.quote.amountInUsd) - Number(quote.quote.amountOutUsd))) : '—'} />
                </div>
                {quoting && <div className="mt-2 flex items-center gap-2 text-[12px] text-muted"><Spinner /> Asking NEAR Intents solvers…</div>}
                {!quote && !quoting && !quoteErr && <div className="mt-2 text-[12px] text-muted">Add their address and an amount to get a live quote.</div>}
                {quoteErr && <p className="mt-2 text-[12px] text-bad">{quoteErr}</p>}
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
                <p className="rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">This DAO's policy doesn't let your account file payment requests.</p>
              ) : (
                <Button className="w-full !py-3" disabled={errors.length > 0 || tx.state.status === 'signing'} onClick={submit}>
                  Send request
                </Button>
              )}
              {accountId && errors.length > 0 && <p className="mt-2 text-[12px] text-muted">{errors[0]}</p>}
            </div>
            <div className="mt-3 space-y-3">
              <TxStatus state={tx.state} doneText="Request sent. Members can approve it now." />
              {tx.state.status === 'done' && (
                <Button variant="secondary" className="w-full" onClick={() => go('approve')}>See it in Approve</Button>
              )}
            </div>
          </div>
          <button
            className="text-[13px] text-muted hover:text-ink disabled:opacity-50"
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

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-line py-3">
      <span className="text-muted">{k}</span>
      <span className="tnum text-right">{v}</span>
    </div>
  )
}
