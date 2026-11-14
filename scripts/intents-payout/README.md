# One real NEAR Intents payout

Terra runs on NEAR testnet, but NEAR Intents only exists on mainnet. This folder makes one tiny **real** cross-chain payout to prove the "pay anyone, on any chain" step works: NEAR on mainnet in, USDC on Base (or Solana) out, through the [1Click API](https://docs.near-intents.org/integration/distribution-channels/1click-api/about-1click-api).

`payout.mjs` holds no keys and never signs or sends anything. It only calls the public 1Click API to get a quote and a deposit address, and later to read the status. **You** send the NEAR from your own wallet. It needs Node 18+ and nothing else (no `npm install`).

## What it costs (live dry quotes, 14 Nov 2026, NEAR ≈ $3.23)

| Send | Base: USDC received | Solana: USDC received |
|---|---|---|
| 0.1 NEAR ($0.32) | 0.318 (cost about 1.5%) | 0.124 (cost about 62%) |
| 0.3 NEAR ($0.97) | 0.960 (cost about 0.9%) | 0.766 (cost about 21%) |

- **Use Base.** Solana adds a flat withdrawal fee of about 0.20 USDC; Base's is 0.0024 USDC.
- Smallest amount: Base has no minimum (0.005 NEAR still quotes). On Solana, 0.03 NEAR is rejected ("Amount is too low for bridge") and 0.1 NEAR works.
- Fees without an API key: the 1Click fee is +0.25% ([Fees](https://docs.near-intents.org/resources/fees)), the protocol fee is 0.0001%, and the chain's withdrawal fee is already taken out of the quoted output.
- Suggested: **0.3 NEAR → about 0.96 USDC on Base.**

## Before you start

1. **A NEAR mainnet wallet** with at least the payout amount plus about 0.01 NEAR for gas (so 0.31 NEAR for a 0.3 payout). Meteor, MyNearWallet or HOT all work. You need its account name, e.g. `you.near`: failed swaps are refunded there.
2. **A receiving address** that you control on the destination chain. For Base, that's any EVM wallet (MetaMask, Rabby, Coinbase Wallet): your `0x…` address. You don't need ETH on Base to receive USDC.
3. Keep your real addresses out of this repo. Save the quote file outside it:

   ```bash
   export PAYOUT_STATE=/Volumes/Vault/somewherelost/hackathons/terra-launch/intents-payout.json
   ```

## Steps

All commands run from `scripts/intents-payout/`.

### 1. Dry quote (nothing can happen)

```bash
node payout.mjs quote --chain base --to 0xYOUR_BASE_ADDRESS --near 0.3 --refund you.near
```

You see what you send, what arrives, the minimum after 1% slippage, the recipient, the refund account and the all-in cost. A dry quote has no deposit address, so no money can move. Check that the recipient is yours.

### 2. Real quote (gets a deposit address, still sends nothing)

Run the same command with `--confirm` added:

```bash
node payout.mjs quote --chain base --to 0xYOUR_BASE_ADDRESS --near 0.3 --refund you.near --confirm
```

The output now also shows:

- **DEPOSIT ADDRESS**: a 64-character NEAR account (implicit account).
- **Send exactly**, e.g. `0.3 NEAR`.
- **Send before**: the deadline. The script asks for 20 minutes (`--minutes 60` changes it), but 1Click may give a longer window; on 14 Nov it returned 3 days. Trust the printed time. A deposit after it is refunded.

The full quote, with 1Click's signature, is saved to `$PAYOUT_STATE`. Keep that file: it's your proof if anything goes wrong. The script stops here.

### 3. You send the NEAR

In your wallet, make a plain **NEAR transfer** of exactly the quoted amount to the deposit address, before the deadline.

- Send native NEAR. Don't wrap it first: 1Click handles that, as in the [official example](https://github.com/near-examples/near-intents-examples/blob/main/1click-example/3-send-deposit.ts).
- Your wallet may warn that the address is a new implicit account. That's expected.
- Copy the transaction hash from the wallet, or find it on [nearblocks.io](https://nearblocks.io) under your account.

### 4. Watch it land

```bash
node payout.mjs status --tx YOUR_NEAR_TX_HASH
```

`--tx` is optional; it just tells 1Click about your deposit so it picks it up sooner. The script checks every 5 seconds and prints each change:

`PENDING_DEPOSIT` → `KNOWN_DEPOSIT_TX` → `PROCESSING` → `SUCCESS` (usually under a minute, and up to 15).

When it finishes, it prints:

- **Delivered**: the USDC that arrived.
- **NEAR deposit tx**: your transfer, as an explorer link.
- **Destination tx**: the USDC transfer on Base, as a [basescan.org](https://basescan.org) link. **This is the proof link.**
- **NEAR settle tx**: the intent settlement on NEAR, as nearblocks.io links.
- **Intents explorer**: [explorer.near-intents.org](https://explorer.near-intents.org). Search for the deposit address there.

If it ends in `REFUNDED` or `FAILED`, the NEAR goes back to your `--refund` account. The output shows the amount and the reason.

## If something goes wrong

- `Amount is too low for bridge`: raise `--near`, or use Base.
- `INCOMPLETE_DEPOSIT`: you sent less than quoted. Send the rest, or wait for the refund.
- Missed the deadline: wait for the refund, then start again at step 2.
- Any other problem: keep `$PAYOUT_STATE` and see [Going Live → Troubleshooting](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/going-live).
