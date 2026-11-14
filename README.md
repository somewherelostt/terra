# Terra

**The members' app for a community treasury on NEAR.**

- Live demo: {{LIVE_URL}}
- Demo community: **City Club**, the testnet Sputnik DAO `terra-demo.sputnikv2.testnet`, created through Terra's own Create group flow ([creation tx](https://testnet.nearblocks.io/txns/Hy3hR85myJ9UoJ7rHDm9zxkpxTGe9MFP2bpFELSSvDo6))
- Public board: {{LIVE_URL}}/?dao=terra-demo.sputnikv2.testnet#/board
- Network: NEAR **testnet**. NEAR Intents quotes come from the live mainnet 1Click API as dry runs.

## What Terra is

Communities that share money usually pick one of two bad options: one person holds the money and everyone trusts them, or the group uses a multisig built for crypto people (proposals, bonds, gas, raw token amounts). Treasury dashboards on NEAR serve admins and finance teams. The members, who chip in, ask for money and decide, have no app of their own.

Terra is that app. It sits on top of a community's **existing Sputnik DAO**. Members see the balance in dollars, chip in, request money, and approve requests. Each member's record, computed from the DAO's own history, decides which approval tier a request goes to. A live NEAR Intents quote shows what a recipient on another chain would get, and a public board shows every payout. Terra never deploys its own multisig and never holds the money.

## How it meets the Social Money prompt

| The prompt asks for | What Terra does | Where in the code |
|---|---|---|
| Use the community's existing DAO or Trezu treasury for custody and approvals; don't build a new multisig | Type any Sputnik DAO account and Terra reads and writes to it. Money only moves through that DAO's own `add_proposal` and `act_proposal`. "Start a group" only exists for communities with no DAO yet, and it calls the standard testnet factory `sputnikv2.testnet`. | `src/lib/dao.ts`, `src/pages/Landing.tsx`, `src/pages/CreateGroup.tsx` |
| Reputation tied to named accounts, traceable | Each named account's record (requests, approved, rejected, paid out, chipped in, votes) is computed only from the DAO's proposals and its NearBlocks transactions. Every row links to the proposal or transaction on chain. | `src/lib/record.ts`, `src/pages/Members.tsx` |
| Small payouts auto-approve for trusted contributors | **Fast lane** (up to $50, requester has a clean record or a `trusted`/`council` role): one approval from a trusted member **other than the requester** executes the payout. In the Terra policy the `trusted` role has a 1-vote threshold for transfers. A small request from a member with no record yet goes to the council instead. | `routeRequest` in `src/lib/record.ts`, `newGroupPolicy` in `src/lib/dao.ts` |
| Mid-size payouts need one council member | **Council nod** ($50 to $500): routed to the `council` role at the council's own threshold. This is one council member only when the DAO's council threshold is one vote. Terra's default policy for new groups uses a council majority (for a 2-member council that's both members). Sputnik approves as soon as any one role reaches its threshold, so Create group keeps council members out of the `trusted` role; otherwise one council member's vote would count as a trusted nod and pay out any amount. | `src/lib/record.ts` |
| Large payouts become a normal DAO proposal | **Full vote** (over $500): the council votes at its normal threshold, and the open request is shown on the public board. | `src/lib/record.ts`, `src/pages/Board.tsx` |
| A public board | `?dao=<dao>#/board`: no sign-in, no buttons that move money. Shows balance, paid-out total, members, median time to pay, staking, and each payout with who approved it and a proof link. | `src/pages/Board.tsx` |

The dollar limits of each tier are enforced by the app, not by the contract. See [What's real and what's simulated](#whats-real-and-whats-simulated).

## How NEAR is used

- **Sputnik DAO (v2/v3) on testnet.** Reads: `get_config`, `get_policy`, `get_proposals`, `get_last_proposal_id`. Writes:
  - `add_proposal` with a `Transfer` kind for payment requests, a `FunctionCall` kind for staking, and an `AddMemberToRole` kind for invites. Each attaches the exact `proposal_bond` from the DAO's policy.
  - `act_proposal` with `VoteApprove` or `VoteReject`, passing the proposal `kind` back as v3 contracts require. When the threshold is met, the DAO pays out on its own.
  - New groups: the factory `sputnikv2.testnet` method `create`, with a Terra-shaped policy: `council` (everything; transfers need a council majority), `trusted` (one vote approves a transfer; never the same accounts as the council), `member` (people who joined; starts empty) and `all` (anyone can file a payment request or ask to join through an `AddMemberToRole` proposal, which the council decides). Create group checks that the DAO really exists after the factory call, because the factory refunds the deposit instead of failing when creation doesn't work.
- **NEAR Intents 1Click API** (`https://1click.chaindefuser.com/v0`). `GET /tokens` loads the token list and the NEAR/USD price used for every dollar amount. `POST /quote` runs with `dry: true` and `swapType: EXACT_OUTPUT` ("the recipient gets exactly X; how much NEAR does the treasury send?"). No API key is used. The quote is saved in the proposal description so voters see it.
- **Staking.** Earn files a DAO `FunctionCall` proposal calling `deposit_and_stake` on a testnet validator pool (default `aurora.pool.f863973.m0`). Home and the board read the DAO's stake with `get_account_total_balance`.
- **NEAR Social.** Avatars are saved to the member's own SocialDB data on `v1.social08.testnet` (key `<account>/terra/avatar`, via `set`) and read back with `get`. Accounts with no saved avatar get a generated default.
- **Named accounts.** Every screen shows readable `name.testnet` accounts. Records, tiers and approvals all key on the account name.
- **Wallets and reads.** NEAR Connect (`@hot-labs/near-connect`) handles sign-in and signing on testnet. Reads go over JSON-RPC: FastNEAR first, then dRPC (`near-testnet.drpc.org`), then FastNEAR's archival RPC. The app fails over and backs off on rate limits, caps parallel requests and caches activity for a minute, and the activity feed uses the NearBlocks testnet API.

## Try it

You need a browser. Steps 1–6 need no account. Steps 7–9 need **two NEAR testnet accounts** (any NEAR wallet on testnet, funded from the testnet faucet).

1. Open {{LIVE_URL}} and click **try the demo community** (under the DAO box) → Home opens for **City Club** (`terra-demo.sputnikv2.testnet`).
2. On **Home** → the treasury balance is shown in **US dollars**, with the NEAR amount and today's NEAR price underneath, then members, total paid out and recent activity (chip-ins and a paid snacks request). All of it is read live from the testnet DAO.
3. Click **Pay** in the sidebar. Type `20` in Amount and any reason, keep **USDC on Solana**, and paste any Solana address in **Their Solana address** → within a few seconds a card labelled **Live quote · NEAR Intents** shows "They get exactly 20.00 USDC", how much NEAR the treasury sends (about 6 NEAR at today's price), the fee, and the arrival time (about 20 seconds). The tier note under it says which approval lane the request would take.
4. Click **Approve** → the open requests: a $20 poster design paid in USDC on Solana (with the Intents quote saved in the proposal), an $8 venue deposit, and an invite to add a member to the council (one approve, one decline, so still open). Each card shows who asked, its tier and approvals so far (for example "Small · 0 of 1"), the requester's record, what the recipient gets, and a NearBlocks link. Under **Recently decided** you see the paid snacks request and a declined printer-ink request. As a guest you can see everything but not vote ("Sign in to approve").
5. Click **Members** → each member's standing (Council, Trusted or New), how much they chipped in, requests paid, and their fast-lane limit ($50, or "Council decides" for someone with no record yet), all computed from the DAO's own history.
6. Click **Board** (or open {{LIVE_URL}}/?dao=terra-demo.sputnikv2.testnet#/board in a private window) → the public board, with no sign-in and no money buttons: balance, paid-out total, members, the requests waiting for approval, and each payout with who approved it and a proof link to NearBlocks. The $3 snacks payout shows "1 trusted member": that was the fast lane.
7. **Start your own group** (signed flows): on the landing page click **Create one in a minute**. Signed in as A, name the group, list A as council and B as trusted (an account on the council can't also be trusted; the form explains why), set a starting deposit of at least 6 NEAR (about 5.4 NEAR stays locked to store the DAO contract; the form checks your balance), and sign the factory call → you land on Home for your new DAO.
8. Signed in as A: **Home → Chip in** 1 NEAR → the balance goes up and the chip-in appears in Activity. Then **Pay**, choose **NEAR account**, pay B $1 → sign → the request appears in **Approve** as Small.
9. Sign in as B → **Approve** → click **Approve and pay** → the payout tracker follows the transaction, the DAO pays out, and the payout appears in Activity, on the Board and in A's record on **Members**.

**Joining.** Anyone with a NEAR testnet wallet can chip in and file a request without joining. To join, open the group's join link (Members → Invite shows it with a QR) and click **Ask to join**; the council approves it in Approve. A first request with no record goes to the council; after one paid request with none turned down, that person's small requests take the fast lane.

These signed flows were run end to end on testnet against the demo DAO: chip in, a request with a live quote, a fast-lane approval and payout, a decline, an invite, a council vote and an avatar save. Every one of them is on chain in `terra-demo.sputnikv2.testnet`. Create group (step 7) was verified twice through the app's 3-step flow: once to create the demo DAO, and again on a fresh run that created `terra-qa-club.sputnikv2.testnet` ([tx](https://testnet.nearblocks.io/txns/XNBfkstsCqvZzXXkAdSnf7HEqPnMWJawbh2JiEE2H5J)).

## Run locally

Requires Node 20.19+ or 22.12+ (what Vite 8 needs) and pnpm (the repo pins `pnpm@12.14.0` in `packageManager`).

```bash
pnpm install
cp .env.example .env   # optional; the defaults below are used without it
pnpm dev               # http://localhost:5173
```

`.env.example`:

| Variable | Default | What it does |
|---|---|---|
| `VITE_DEMO_DAO` | `terra-demo.sputnikv2.testnet` | DAO opened by "try the demo community" |
| `VITE_STAKING_POOL` | `aurora.pool.f863973.m0` | Testnet validator pool used by Earn |

Other scripts: `pnpm build` (type-check and production build into `dist/`), `pnpm preview`, `pnpm lint`. No backend and no API keys are needed: the app calls NEAR RPC, NearBlocks and the 1Click API straight from the browser. A fresh clone with `pnpm install` then `pnpm dev` and `pnpm build` was checked on 14 Nov 2026.

## What's real and what's simulated

- **Testnet only.** All DAO reads and writes, chip-ins, requests, approvals, payouts, group creation, staking and avatar saves use NEAR testnet, signed by the member's own wallet.
- **Intents quotes are live but dry.** Quotes come from the real mainnet 1Click API with `dry: true`. Nothing is swapped, and **no cross-chain transfer happens**. NEAR Intents has no testnet, so on testnet the treasury pays the quoted NEAR to a NEAR "stand-in" account named on the Pay screen. On mainnet the same proposal would pay the Intents deposit address.
- **Saved-quote fallback.** If the 1Click API fails, Pay shows a clearly labelled **Sample quote** recorded on 14 Nov 2026 at 13:00 UTC (20 USDC on Solana for about 6.10 NEAR) instead of a live one.
- **Tier limits are enforced by the app, not the contract.** Sputnik decides approvals by role and proposal kind, not by amount. Terra routes each request to the right role and only lets the right accounts vote in its UI. But a member of the `trusted` role (threshold 1 for transfers) could approve a large transfer from another client. The demo DAO `terra-demo` was created before Create group kept the two roles apart, and `terra-ben.testnet` is on its council and in its trusted role, so there one vote from that account pays any request; Terra warns on the Approve card when a vote would do this. A small guard contract that checks amounts is the fix (see What's next).
- **Staking rewards accrue per epoch** (about 12 hours on testnet), so a fresh stake shows close to zero rewards at first. Unstaking is not built into the UI.
- **Dollar amounts** use the NEAR/USD price from the 1Click token list. Payouts on testnet are still in NEAR.

## Libraries, templates and services used

No starter template; the project was scaffolded with plain Vite. All code in this repository was written during the hackathon window. AI coding assistants were used while building, as the rules allow (Q-005).

| Library or service | Used for |
|---|---|
| React 19, React DOM | UI |
| TypeScript, Vite, `@vitejs/plugin-react` | Language and build |
| Tailwind CSS 4 (`@tailwindcss/vite`) | Styling |
| `@hot-labs/near-connect` 0.12.0 | Wallet sign-in and transaction signing |
| oxlint | Linting |
| Geist and Geist Mono (Google Fonts) | Typography |
| DiceBear HTTP API (`thumbs` style) | Default avatars |
| NEAR JSON-RPC (FastNEAR, dRPC) | Chain reads |
| NearBlocks testnet API | Activity feed and transaction links |
| NEAR Intents 1Click API | Token list, NEAR price, dry quotes |
| Sputnik DAO contract and testnet factory `sputnikv2.testnet` | Treasury, proposals, votes |
| SocialDB `v1.social08.testnet` | Saved avatars |

## Hackathon

Built at **NEAR HACKATHON** (November 2026). Tracks: **`social`** (Social Money) and **`open`** (Open Innovation).

## What's next

- Real cross-chain payouts on mainnet: pay the NEAR Intents deposit address with `dry: false`.
- A guard contract that holds the `trusted` role and checks amounts, so tier limits are enforced on chain.
- Spending allowances for members and AI helpers through limited access keys.
- A hand-off to a full treasury dashboard such as Trezu for groups that outgrow the members' app.

## License

MIT. See [LICENSE](LICENSE).
