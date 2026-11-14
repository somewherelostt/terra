// NEAR Intents 1Click API: token list and dry-run quotes.
// Docs: https://docs.near-intents.org/api-reference/oneclick/request-a-swap-quote
// Dry quotes need no API key (an extra 0.2% fee applies to keyless use).

const BASE = 'https://1click.chaindefuser.com/v0'
export const WNEAR = 'nep141:wrap.near'

export interface IntentsToken {
  assetId: string
  decimals: number
  blockchain: string
  symbol: string
  price: number
  priceUpdatedAt: string
  contractAddress?: string
}

let tokensCache: Promise<IntentsToken[]> | null = null

/** If the token list can't load, Pay still offers USDC on Solana so the saved quote can be used. */
export const FALLBACK_TOKENS: IntentsToken[] = [
  {
    assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near',
    decimals: 6,
    blockchain: 'sol',
    symbol: 'USDC',
    price: 1,
    priceUpdatedAt: '2026-11-14T13:00:00.000Z',
  },
]

export function getTokens(): Promise<IntentsToken[]> {
  if (!tokensCache) {
    tokensCache = fetch(`${BASE}/tokens`)
      .then((r) => {
        if (!r.ok) throw new Error(`tokens ${r.status}`)
        return r.json() as Promise<IntentsToken[]>
      })
      .catch((e) => {
        tokensCache = null
        throw e
      })
  }
  return tokensCache
}

export async function getNearUsdPrice(): Promise<number> {
  const tokens = await getTokens()
  return tokens.find((t) => t.assetId === WNEAR)?.price ?? NaN
}

export const CHAIN_NAMES: Record<string, string> = {
  near: 'NEAR',
  eth: 'Ethereum',
  base: 'Base',
  arb: 'Arbitrum',
  sol: 'Solana',
  btc: 'Bitcoin',
  ton: 'TON',
  tron: 'Tron',
  bsc: 'BNB Chain',
  pol: 'Polygon',
  op: 'Optimism',
  avax: 'Avalanche',
  sui: 'Sui',
  doge: 'Dogecoin',
  xrp: 'XRP Ledger',
  zec: 'Zcash',
  gnosis: 'Gnosis',
  bera: 'Berachain',
  stellar: 'Stellar',
  aptos: 'Aptos',
  cardano: 'Cardano',
  ltc: 'Litecoin',
  monad: 'Monad',
  xlayer: 'X Layer',
  starknet: 'Starknet',
  bch: 'Bitcoin Cash',
  adi: 'ADI',
  plasma: 'Plasma',
  scroll: 'Scroll',
  aleo: 'Aleo',
  dash: 'Dash',
}

export function chainName(id: string): string {
  return CHAIN_NAMES[id] ?? id.toUpperCase()
}

/**
 * The only payout options Terra offers: the first three are chips on Pay, the rest sit under
 * "More tokens…". A short, calm list on purpose; anything missing from 1Click is just omitted.
 */
export const POPULAR = [
  { symbol: 'USDC', blockchain: 'sol' },
  { symbol: 'USDC', blockchain: 'base' },
  { symbol: 'USDC', blockchain: 'eth' },
  { symbol: 'USDT', blockchain: 'tron' },
  { symbol: 'USDT', blockchain: 'eth' },
  { symbol: 'ETH', blockchain: 'base' },
  { symbol: 'SOL', blockchain: 'sol' },
  { symbol: 'BTC', blockchain: 'btc' },
  { symbol: 'USDC', blockchain: 'near' },
]

export function isDeprecated(t: IntentsToken): boolean {
  return /deprecated/i.test(t.symbol) || /deprecated/i.test(t.assetId)
}

export interface Quote {
  amountIn: string
  amountInFormatted: string
  amountInUsd: string
  minAmountIn?: string
  amountOut: string
  amountOutFormatted: string
  amountOutUsd: string
  minAmountOut: string
  timeEstimate: number
  withdrawFee?: string
}

export interface QuoteResult {
  quote: Quote
  timestamp: string
  correlationId?: string
  recorded?: boolean
}

export function toUnits(amount: string, decimals: number): string | null {
  const s = amount.trim()
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const [w, f = ''] = s.split('.')
  if (f.length > decimals) return null
  const units = BigInt(w) * 10n ** BigInt(decimals) + BigInt(f.padEnd(decimals, '0') || '0')
  return units > 0n ? units.toString() : null
}

/**
 * "The recipient should get exactly X of token T on chain C; how much NEAR does the group send?"
 * `refundTo` must be a NEAR account (the DAO). `recipient` is the address on the destination chain.
 */
export async function quotePayout(opts: {
  destinationAsset: string
  amountOutUnits: string
  recipient: string
  refundTo: string
}): Promise<QuoteResult> {
  const body = {
    dry: true,
    swapType: 'EXACT_OUTPUT',
    slippageTolerance: 100,
    originAsset: WNEAR,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset: opts.destinationAsset,
    amount: opts.amountOutUnits,
    refundTo: opts.refundTo,
    refundType: 'ORIGIN_CHAIN',
    recipient: opts.recipient,
    recipientType: 'DESTINATION_CHAIN',
    deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }
  const res = await fetch(`${BASE}/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.quote) {
    throw new Error(json.message || json.error || `Quote failed (${res.status})`)
  }
  return { quote: json.quote, timestamp: json.timestamp, correlationId: json.correlationId }
}

/** A real dry quote saved on 14 Nov 2026 13:00 UTC, used only if the live API is down. */
export const RECORDED_QUOTE: QuoteResult = {
  recorded: true,
  timestamp: '2026-11-14T13:00:00.211Z',
  correlationId: 'fb771557-57a1-41b2-854d-201942774997',
  quote: {
    amountIn: '6095251977481143654528151',
    amountInFormatted: '6.095251977481143654528151',
    amountInUsd: '20.297189085012',
    amountOut: '20000000',
    amountOutFormatted: '20.0',
    amountOutUsd: '19.993300000000',
    minAmountOut: '20000000',
    timeEstimate: 19,
    withdrawFee: '10004',
  },
}
