# Terra

**The members' app for a community treasury.** Your community already has a treasury on NEAR. Terra lets every member chip in, request money and approve it. A member's track record decides how many approvals a request needs, and the treasury can pay anyone, on any chain.

Built for the NEAR Hackathon (Nov 2026), track **Social Money**, also **Open Innovation**.

- Live demo: _added at deploy_
- Demo video: _added with the X post_

## Why

Groups that share money pick between two bad options: one person holds it and everyone trusts them, or a multisig built for crypto people (proposals, bonds, gas, raw token amounts). Trezu and NEAR Business already give admins and finance teams a good treasury dashboard. What's missing is the **member side**: the people who chip in, request money and decide.

Terra sits on top of a community's **existing Sputnik DAO** (the contract Trezu uses too). It never deploys a new multisig and never holds the money.

## What it does

| Screen | What a member can do |
|---|---|
| **Home** | See the treasury in dollars (NEAR underneath), members, open requests and recent activity. Chip in NEAR. |
| **Request money** | "Pay [account] [amount] for [reason]". For a recipient on another chain, pick the token and chain (230+ tokens on 30+ chains) and get a live **NEAR Intents** quote: "the treasury sends about 6.10 NEAR, they get 20.00 USDC on Solana". The quote is saved in the request so voters see it. |
| **Approve** | Request cards with the tier, the quote, who asked, and approvals so far. Approve or reject; when the threshold is met the DAO pays out on its own. |
| **Members** | Each member's record, computed from the DAO's own history: requests, approved, rejected, amounts, chip-ins, votes. A clean record earns the fast lane. |
| **Activity** | Every chip-in, request, approval and payout, each linking to its transaction on NearBlocks. |
| **Earn** | Propose staking idle money with a testnet validator; members approve it like any request. |
| **Board** | A read-only link for sponsors: balance, open requests, payouts and records. No sign-in, no buttons. |
| **Start a group** | For communities without a DAO: creates a standard Sputnik DAO with a Terra-shaped policy through the official testnet factory. |
| **Request links** | Share a link that opens "Request money" already filled in. |

## How it maps to the Social Money prompt

| The prompt asks for | Terra |
|---|---|
| Use the community's existing DAO or Trezu treasury for custody and approvals; no new multisig | Type any Sputnik DAO name and Terra reads and writes to it. Money only moves through `add_proposal` / `act_proposal` on that DAO. |
| Reputation tied to named accounts, traceable | Member records are computed only from the DAO's proposals and transactions; every row links to the chain. |
| Tiers: small auto-approves for trusted contributors, mid needs one council member, large is a normal proposal | **Fast lane** (up to $25, requester with a clean record): one trusted member's approval executes it. **Council nod** ($25–$250, or no record yet): the council's threshold. **Full vote** (over $250): the council votes, shown to every member on the board. |
| A public board | `?dao=<dao>#/board`: read-only balance, open requests, payouts and records. |
| Shared budgets and collective ownership | Chip-ins go straight to the DAO account; idle money can be staked in the DAO's own name. |

## How NEAR is used

- **Sputnik DAO v2/v3** (testnet factory `sputnikv2.testnet`): reads `get_config`, `get_policy`, `get_proposals`, `get_last_proposal_id`; writes `add_proposal` (Transfer and FunctionCall kinds, with the exact bond the policy asks for) and `act_proposal` (passing the proposal `kind` back, as v3 requires). New groups go through the factory's `create`.
- **NEAR Intents 1Click API**: `GET /v0/tokens` for the token list and the NEAR/USD price; `POST /v0/quote` with `dry: true` and `EXACT_OUTPUT` for "the recipient gets exactly X". No API key (keyless use carries a 0.2% fee, which is fine for dry quotes).
- **NEAR Connect** (`@hot-labs/near-connect`): wallet sign-in and signing with Meteor, Intear, Nightly, Ledger, NEAR CLI and others on testnet.
- **Staking pools**: `deposit_and_stake` through a DAO FunctionCall proposal; balance read with `get_account_total_balance`.
- **JSON-RPC** (FastNEAR, near.org) for reads and transaction lookups, and the **NearBlocks** testnet API for the activity feed.

## Try it

You need a browser. Signing needs a NEAR **testnet** account (Meteor Wallet → Testnet → create account, then use the faucet).

1. Open the live demo and click **Try the demo community** → you see the treasury balance in USD, members and recent payouts, read live from a testnet DAO.
2. Go to **Activity** → every payout, request and approval, each with a NearBlocks link.
3. Go to **Request money** → pick **Someone on another chain**, keep "USDC on Solana", paste any Solana address, type `20` → a live NEAR Intents quote appears (about 6 NEAR, about 20 seconds).
4. Open **Board** → the same data with no sign-in and no buttons. Share this link with a sponsor.
5. With a testnet account: **Start a new group** (or open a DAO you're a member of) → **Chip in** 1 NEAR on Home → the balance and activity update.
6. **Request money** → pay a NEAR account 0.5 NEAR → sign → the request appears in **Approve**.
7. Sign in with a second member account → **Approve** → once the threshold is met the DAO pays out; the payout shows in Activity with its transaction.

## What's real and what's simulated

- **Real, on testnet:** DAO reads, chip-ins, payment requests, approvals and payouts, group creation, staking proposals. All signed by the member's own wallet.
- **Real, on mainnet, read-only:** NEAR Intents quotes and token prices (dry quotes; nothing is swapped).
- **Simulated:** the cross-chain leg. NEAR Intents has no testnet, so on testnet the treasury pays the quoted NEAR to a stand-in NEAR account the requester names. On mainnet the same request would pay the Intents deposit address and the recipient would get the token on their chain. If the live quote API is down, Terra shows a clearly labelled sample quote recorded on 14 Nov 2026.
- **Enforced by the app, not the contract:** the dollar limits for each tier. Sputnik decides approvals by role and proposal kind, not by amount, so Terra routes each request to the right role (a `trusted` role with a one-vote threshold for transfers, or the council). A member of the trusted role could still approve a large transfer from another client. A small guard contract that holds the trusted role and checks amounts is the next step.
- Staking rewards arrive once per epoch (about 12 hours on testnet), so a fresh stake shows close to zero rewards at first.

## Run it locally

```bash
pnpm install
pnpm dev
```

Optional settings are in `.env.example` (the demo DAO and the staking pool).

## Built with

React 19, TypeScript, Vite, Tailwind CSS 4, `@hot-labs/near-connect`. NEAR JSON-RPC, NEAR Intents 1Click API, NearBlocks API. AI coding assistants were used while building, as the rules allow.

All code in this repository was written during the hackathon window.

## What's next

- Real cross-chain payouts and pay-ins through NEAR Intents on mainnet.
- A guard contract so tier limits are enforced on chain.
- Allowances for members and AI helpers with spending limits.
- A hand-off to Trezu for groups that outgrow the app.

## License

MIT, see [LICENSE](LICENSE).
