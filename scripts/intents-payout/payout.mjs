#!/usr/bin/env node
// One tiny NEAR Intents payout: NEAR (mainnet) -> USDC on Base or Solana, through the 1Click API.
//
// This script holds no keys and never signs or sends anything. It only talks to the public
// 1Click API. The NEAR deposit is made by a person, from their own wallet.
//
//   node payout.mjs quote  --chain base --to <address> --near 0.3 --refund <you.near>
//   node payout.mjs quote  ...same flags... --confirm      (asks 1Click for a real deposit address)
//   node payout.mjs status [--tx <near tx hash>]           (polls until the payout lands)
//
// Docs: https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const API = 'https://1click.chaindefuser.com/v0'
const ORIGIN = 'nep141:wrap.near' // 1Click takes plain NEAR sent to the deposit address
const CHAINS = {
  base: {
    name: 'Base',
    asset: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
    valid: (a) => /^0x[0-9a-fA-F]{40}$/.test(a),
    addressHint: 'an EVM address, 0x followed by 40 hex characters',
  },
  sol: {
    name: 'Solana',
    asset: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near',
    valid: (a) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a),
    addressHint: 'a Solana address (base58, 32-44 characters)',
  },
}
const STATE = process.env.PAYOUT_STATE || join(homedir(), '.terra-intents-payout.json')
const FINAL = new Set(['SUCCESS', 'REFUNDED', 'FAILED'])

function args(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) out._.push(a)
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i]
    else out[a.slice(2)] = true
  }
  return out
}

function die(msg) {
  console.error(`\n  ✖ ${msg}\n`)
  process.exit(1)
}

function nearToYocto(s) {
  if (!/^\d+(\.\d{1,24})?$/.test(s)) die(`--near must be a plain number like 0.3 (got "${s}")`)
  const [w, f = ''] = s.split('.')
  const y = BigInt(w) * 10n ** 24n + BigInt(f.padEnd(24, '0'))
  if (y <= 0n) die('--near must be more than 0')
  return y.toString()
}

async function api(path, init) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { message: text.slice(0, 200) }
  }
  if (!res.ok) die(`1Click ${path} answered ${res.status}: ${json.message || text.slice(0, 200)}`)
  return json
}

const usd = (s) => (s == null ? '?' : `$${Number(s).toFixed(4)}`)
const line = (k, v) => console.log(`  ${k.padEnd(18)} ${v}`)

async function quote(o) {
  const chain = CHAINS[o.chain]
  if (!chain) die('--chain must be "base" or "sol"')
  if (!o.to || !chain.valid(o.to)) die(`--to must be ${chain.addressHint}`)
  if (!o.refund || !/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(o.refund) || !(o.refund.endsWith('.near') || /^[0-9a-f]{64}$/.test(o.refund)))
    die('--refund must be your own mainnet NEAR account (name.near or a 64-hex implicit account). A failed swap refunds there.')
  if (!o.near) die('--near is required, e.g. --near 0.3')
  const amount = nearToYocto(String(o.near))
  const live = o.confirm === true
  const minutes = Number(o.minutes || 20)
  if (!(minutes >= 5 && minutes <= 120)) die('--minutes must be between 5 and 120')

  const body = {
    dry: !live,
    swapType: 'EXACT_INPUT',
    slippageTolerance: Number(o.slippage || 100),
    originAsset: ORIGIN,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset: chain.asset,
    amount,
    refundTo: o.refund,
    refundType: 'ORIGIN_CHAIN',
    recipient: o.to,
    recipientType: 'DESTINATION_CHAIN',
    deadline: new Date(Date.now() + minutes * 60_000).toISOString(),
  }
  const r = await api('/quote', { method: 'POST', body: JSON.stringify(body) })
  const q = r.quote
  const fee = Number(q.amountInUsd) - Number(q.amountOutUsd)
  const pct = (100 * fee) / Number(q.amountInUsd)
  const wfee = q.withdrawFee ? Number(q.withdrawFee) / 1e6 : null

  console.log(`\n  NEAR Intents payout · ${live ? 'LIVE QUOTE (real deposit address)' : 'dry run (no deposit address, nothing can happen)'}`)
  console.log('  ' + '─'.repeat(64))
  line('You send', `${q.amountInFormatted} NEAR  (${usd(q.amountInUsd)})  from your NEAR mainnet wallet`)
  line('Recipient gets', `${q.amountOutFormatted} USDC on ${chain.name}  (${usd(q.amountOutUsd)})`)
  line('At least', `${(Number(q.minAmountOut) / 1e6).toFixed(6)} USDC after ${body.slippageTolerance / 100}% slippage`)
  line('Recipient', `${o.to}  (${chain.name})`)
  line('Refund to', `${o.refund}  (if the swap fails)`)
  line('All-in cost', `${usd(fee)}  (${pct.toFixed(2)}% of what you send)`)
  if (wfee != null) line('  of which', `${wfee} USDC ${chain.name} withdrawal fee, plus the 1Click fee (0.25% without an API key) and spread`)
  line('Time estimate', `~${q.timeEstimate}s after the deposit lands`)
  line('Quote id', r.correlationId)

  if (!live) {
    console.log('\n  Nothing was created. To get a real deposit address, run the same command with --confirm.\n')
    return
  }

  line('DEPOSIT ADDRESS', q.depositAddress)
  if (q.depositMemo) line('MEMO', q.depositMemo)
  line('Send exactly', `${q.amountInFormatted} NEAR (native NEAR, a normal transfer)`)
  line('Send before', `${q.deadline}  (later deposits are refunded)`)
  if (q.timeWhenInactive) line('Inactive after', q.timeWhenInactive)
  writeFileSync(STATE, JSON.stringify({ savedAt: new Date().toISOString(), chain: o.chain, response: r }, null, 2))
  console.log(`\n  Saved the full signed quote to ${STATE} (keep it: it is the proof if anything goes wrong).`)
  console.log('  This script stops here. It cannot send anything.')
  console.log('  Next: send the NEAR from your own wallet, then run:  node payout.mjs status --tx <your tx hash>\n')
}

async function status(o) {
  let depositAddress = o.deposit
  let memo = o.memo
  let saved
  if (!depositAddress) {
    if (!existsSync(STATE)) die(`No saved quote at ${STATE}. Pass --deposit <address> or run "quote --confirm" first.`)
    saved = JSON.parse(readFileSync(STATE, 'utf8'))
    depositAddress = saved.response.quote.depositAddress
    memo = saved.response.quote.depositMemo
  }
  if (o.tx) {
    // Optional: tells 1Click about the deposit so it picks it up faster. Not a signature.
    await api('/deposit/submit', {
      method: 'POST',
      body: JSON.stringify({ depositAddress, txHash: o.tx, ...(memo ? { memo } : {}) }),
    })
    console.log(`  Told 1Click about deposit tx ${o.tx}`)
  }
  const every = Number(o.every || 5) * 1000
  const qs = new URLSearchParams({ depositAddress, ...(memo ? { depositMemo: memo } : {}) })
  let last = ''
  for (;;) {
    const s = await api(`/status?${qs}`)
    if (s.status !== last) {
      console.log(`  ${new Date().toISOString().slice(11, 19)}  ${s.status}`)
      last = s.status
    }
    if (FINAL.has(s.status) || o.once) {
      report(s, depositAddress)
      return
    }
    await new Promise((r) => setTimeout(r, every))
  }
}

function report(s, depositAddress) {
  const d = s.swapDetails || {}
  console.log('\n  ' + '─'.repeat(64))
  line('Status', s.status)
  if (d.amountInFormatted) line('Swapped', `${d.amountInFormatted} NEAR (${usd(d.amountInUsd)})`)
  if (d.amountOutFormatted) line('Delivered', `${d.amountOutFormatted} USDC (${usd(d.amountOutUsd)})`)
  if (d.refundedAmountFormatted && d.refundedAmountFormatted !== '0') line('Refunded', `${d.refundedAmountFormatted} NEAR (${d.refundReason || 'no reason given'})`)
  for (const t of d.originChainTxHashes || []) line('NEAR deposit tx', t.explorerUrl || t.hash)
  for (const t of d.destinationChainTxHashes || []) line('Destination tx', t.explorerUrl || t.hash)
  for (const h of d.nearTxHashes || []) line('NEAR settle tx', `https://nearblocks.io/txns/${h}`)
  line('Intents explorer', `https://explorer.near-intents.org  (search for ${depositAddress})`)
  console.log('')
}

const o = args(process.argv.slice(2))
const cmd = o._[0]
if (cmd === 'quote') await quote(o)
else if (cmd === 'status') await status(o)
else {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 12).join('\n').replace(/^\/\/ ?/gm, ''))
  process.exit(cmd ? 1 : 0)
}
