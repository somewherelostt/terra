import { useEffect, useMemo, useState } from 'react'
import { go, shareUrl, useDao } from '../lib/store'
import { useWallet } from '../lib/wallet'
import { addTransferProposalTx, can } from '../lib/dao'
import { isValidAccountId, ONE_NEAR } from '../lib/near'
import { nearToYocto, usd, yoctoToNear, yoctoToNumber } from '../lib/format'
import { POPULAR, RECORDED_QUOTE, chainName, getTokens, quotePayout, toUnits, type IntentsToken, type QuoteResult } from '../lib/intents'
import { TIER_COPY, isTrusted, tierFor } from '../lib/record'
import { Badge, Button, Card, Field, SectionTitle, Spinner, TxStatus, inputCls, useTx } from '../components/ui'

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ask for money</h1>
        <p className="mt-1 text-sm text-muted">Your request goes to the treasury as a payment the members approve. Once approved, the treasury pays it out itself.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="space-y-5 lg:col-span-3">
          <Field label="What is it for?">
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Poster design for the winter meetup" maxLength={140} />
          </Field>

          <div>
            <span className="mb-1.5 block text-sm font-medium">Who gets paid?</span>
            <div className="inline-flex rounded-xl border border-line bg-soft p-1 text-sm">
              {(['near', 'intents'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-lg px-3 py-1.5 font-medium ${mode === m ? 'bg-card shadow-sm' : 'text-muted'}`}
                >
                  {m === 'near' ? 'A NEAR account' : 'Someone on another chain'}
                </button>
              ))}
            </div>
          </div>

          {mode === 'near' ? (
            <>
              <Field label="NEAR account">
                <input className={inputCls} value={receiver} onChange={(e) => setReceiver(e.target.value.toLowerCase())} placeholder="designer.testnet" />
              </Field>
              <Field label="Amount (NEAR)" hint={yocto && isFinite(nearUsd) ? `≈ ${usd(amountUsd)}` : ' '}>
                <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5" />
              </Field>
            </>
          ) : (
            <>
              <Field label="They want" hint="Paid out through NEAR Intents. 230+ tokens on 30+ chains.">
                <select className={inputCls} value={tokenId} onChange={(e) => setTokenId(e.target.value)}>
                  {!tokens.length && <option>Loading tokens…</option>}
                  {popular.length > 0 && (
                    <optgroup label="Popular">
                      {popular.map((t) => (
                        <option key={t.assetId} value={t.assetId}>{t.symbol} on {chainName(t.blockchain)}</option>
                      ))}
                    </optgroup>
                  )}
                  {others.length > 0 && (
                    <optgroup label="All tokens">
                      {others.map((t) => (
                        <option key={t.assetId} value={t.assetId}>{t.symbol} on {chainName(t.blockchain)}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </Field>
              <Field label={`Their ${token ? chainName(token.blockchain) : ''} address`}>
                <input className={inputCls + ' font-mono'} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={token?.blockchain === 'sol' ? 'Solana address' : '0x… or chain address'} spellCheck={false} />
              </Field>
              <Field label={`Amount they receive${token ? ` (${token.symbol})` : ''}`}>
                <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="20" />
              </Field>
              <QuoteBox quote={quote} token={token} loading={quoting} error={quoteErr} nearUsd={nearUsd} />
              <Field
                label="Testnet stand-in: NEAR account that receives the payout"
                hint="NEAR Intents runs on mainnet only. On testnet the treasury pays this account the quoted NEAR; on mainnet it would pay the Intents deposit address and the recipient gets the token on their chain."
              >
                <input className={inputCls} value={standIn} onChange={(e) => setStandIn(e.target.value.toLowerCase())} placeholder="you.testnet" />
              </Field>
            </>
          )}
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <SectionTitle>Summary</SectionTitle>
            <dl className="space-y-2 text-sm">
              <Row k="Treasury sends" v={yocto ? `${yoctoToNear(yocto)} NEAR` : '—'} />
              <Row k="Worth about" v={yocto && isFinite(amountUsd) ? usd(amountUsd) : '—'} />
              <Row k="Treasury can spend" v={`${yoctoToNear(dao.spendable)} NEAR`} />
              <Row k="Request bond (returned)" v={`${yoctoToNear(dao.policy.proposal_bond)} NEAR`} />
            </dl>
            {effectiveTier && (
              <div className="mt-4 rounded-xl bg-brand-soft p-3">
                <div className="flex items-center gap-2">
                  <Badge tone="brand">{TIER_COPY[effectiveTier].label}</Badge>
                  <span className="text-xs text-muted">{tier === 'small' ? `under $25` : tier === 'mid' ? '$25–$250' : 'over $250'}</span>
                </div>
                <p className="mt-2 text-sm">{TIER_COPY[effectiveTier].rule}.</p>
                {tier === 'small' && !trusted && (
                  <p className="mt-1 text-xs text-muted">You don't have a track record in this group yet, so this goes to the council. After one approved request you'll get the fast lane.</p>
                )}
              </div>
            )}
            <div className="mt-5 space-y-3">
              {!accountId ? (
                <Button className="w-full" onClick={signIn}>Sign in to ask</Button>
              ) : !canPropose ? (
                <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">This DAO's policy doesn't let your account file payment requests.</p>
              ) : (
                <Button className="w-full" disabled={errors.length > 0 || tx.state.status === 'signing'} onClick={submit}>
                  Send request
                </Button>
              )}
              {accountId && errors.length > 0 && <p className="text-xs text-muted">{errors[0]}</p>}
              <TxStatus state={tx.state} doneText="Request sent. Members can approve it now." />
              {tx.state.status === 'done' && (
                <Button variant="secondary" className="w-full" onClick={() => go('approve')}>See it in Approve</Button>
              )}
            </div>
          </Card>
          <Card>
            <SectionTitle>Request link</SectionTitle>
            <p className="text-sm text-muted">Share a link that opens this form already filled in, for a contributor or a member to send.</p>
            <Button
              variant="secondary"
              className="mt-3 w-full"
              disabled={!title.trim() || !amount}
              onClick={() => navigator.clipboard?.writeText(requestLink()).then(() => setCopied(true)).catch(() => setCopied(false))}
            >
              {copied ? 'Link copied' : 'Copy request link'}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="font-medium tabular-nums">{v}</dd>
    </div>
  )
}

function QuoteBox({ quote, token, loading, error, nearUsd }: { quote: QuoteResult | null; token?: IntentsToken; loading: boolean; error: string | null; nearUsd: number }) {
  return (
    <div className="rounded-xl border border-line bg-soft p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">NEAR Intents quote</span>
        {quote && !quote.recorded && <Badge tone="good">Live</Badge>}
        {quote?.recorded && <Badge tone="warn">Sample</Badge>}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> Asking NEAR Intents solvers…</div>
      ) : quote && token ? (
        <div className="space-y-1">
          <div className="text-sm">
            The treasury sends about <b>{Number(quote.quote.amountInFormatted).toFixed(2)} NEAR</b>
            {isFinite(nearUsd) && <span className="text-muted"> ({usd(Number(quote.quote.amountInUsd))})</span>}
          </div>
          <div className="text-sm">
            They receive <b>{quote.quote.amountOutFormatted} {token.symbol}</b> on {chainName(token.blockchain)}
          </div>
          <div className="text-xs text-muted">
            About {quote.quote.timeEstimate} seconds · {quote.recorded ? 'recorded' : 'quoted'} {new Date(quote.timestamp).toISOString().slice(11, 16)} UTC · saved into the request so voters see it
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted">Pick a token, paste their address and an amount to get a live quote.</div>
      )}
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
    </div>
  )
}
