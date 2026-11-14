# Allowance contract

Goal: the group gives a member, or an AI helper, a small budget with hard limits. Payments inside that budget skip the vote. Anyone on the council can freeze it instantly.

## Why not a plain access key on the DAO

The first idea was a function-call access key on the DAO account. That doesn't work:

- A function-call access key can't attach a deposit, so it can't move NEAR. It can only call methods.
- Sputnik checks the *caller* against the policy (roles and proposal kinds). A key on the DAO account would make calls *as the DAO* (`predecessor = dao`), which Sputnik doesn't treat as a member. It would also have no amount limit.
- Sputnik has no "spend up to X per day" rule. Every transfer is a proposal.

So the limits have to live in a small contract of their own.

## Chosen design: (a) allowance contract + (b) helper key

```
            DAO proposal (FunctionCall, with deposit)
 Sputnik DAO ───────────────────────────────────────▶ allowance contract
  (owner)        set_allowance / unfreeze / remove        │  holds the budget
                                                          │  enforces the limits
 council member ── freeze() (instant, no vote) ──────────▶│
                                                          │
 member or AI helper ── pay(receiver, amount) ───────────▶│──▶ NEAR transfer to receiver
   (AI uses a function-call key limited to `pay`)
```

**Contract** (this folder, Rust, near-sdk). One instance per group, deployed to a testnet sub-account.

State:
- `owner`: the DAO account. Only the DAO can set or remove allowances, unfreeze, and take money back.
- `guardians`: council accounts that may call `freeze()`. They can freeze, nothing else.
- `frozen`: one switch for the whole contract.
- `allowances`: per spender: `daily_cap`, `per_payment_max`, `expires_at` (ns), `spent` today and the `day` it counts for.

Methods:
- `set_allowance(account_id, daily_cap, per_payment_max, expires_at)`: owner only, payable. The attached NEAR funds the contract, so one DAO proposal both approves and funds the allowance.
- `remove_allowance(account_id)`: owner only.
- `pay(receiver_id, amount)`: no deposit (so a function-call key can call it). It refuses when frozen, expired, over the per-payment max, over today's cap, or when the contract doesn't hold enough. Then it sends a NEAR transfer.
- `freeze()`: owner or any guardian, instant.
- `unfreeze()`: owner only (DAO vote).
- `set_guardians(list)`: owner only.
- `withdraw(amount)`: owner only, sends NEAR back to the DAO.
- Views: `get_allowance`, `get_allowances`, `get_state`.

"Day" is `block_timestamp / 86_400 s`, a fixed UTC day, not a rolling 24 hours. When the day changes, `spent` resets.

**Helper key (b).** An AI helper gets its own account, for example `helper.<member>.testnet`, which the group gives an allowance. The person who owns that account adds a function-call access key that is:
- limited to receiver = the allowance contract, method = `pay`;
- given a gas allowance (0.25 NEAR), so a leaked key can burn at most that much gas.

The AI holds only that key. It can't transfer, can't call anything else, and can't spend more than the allowance. The full-access key stays with the person.

**App.** The Allowances page reads the contract and lists budgets with what's left today. It files a DAO FunctionCall proposal to create one (who, daily cap in $, per-payment max in $, expiry, funding). It has Freeze (instant for guardians) and Unfreeze (a proposal). Pay shows "Spend from allowance" when the signed-in account has an active allowance.

## Enforced on chain vs. not

| On chain (the contract) | Not on chain |
|---|---|
| Per-payment max, daily cap, expiry, freeze | $ amounts: caps are stored in NEAR, converted from $ at the price when the proposal is filed |
| Only the DAO can create, change, unfreeze or withdraw | Which contract belongs to which group: the app keeps a small map (`ALLOWANCE_CONTRACTS`) |
| Only guardians or the DAO can freeze | |
| Creating an allowance needs a DAO vote (Sputnik policy) | |
| The AI key can call only `pay` and burn at most its gas allowance (NEAR protocol) | |

Known limits:
- If a transfer fails (for example, the receiver account doesn't exist), the NEAR goes back to the contract, but that day's `spent` still counts it. That's the safe direction.
- Budgets come from one shared pool in the contract. The limits are per spender; the funding isn't ring-fenced per spender.
- Guardians are set when the contract is deployed. The DAO can change them with `set_guardians`.

## Deployed on testnet

| Group (DAO) | Allowance contract | Guardians |
|---|---|---|
| `terra-demo.sputnikv2.testnet` (demo) | `allowance.terra-ben.testnet` | terra-ana, terra-ben |
| `terra-qa-club.sputnikv2.testnet` (QA) | `allowance.terra-cy.testnet` | terra-cy |

The app finds the contract through `ALLOWANCE_CONTRACTS` in `src/lib/allowance.ts`, or `VITE_ALLOWANCE_CONTRACTS="dao=contract,..."`. It only trusts a contract whose `get_state().owner` is the group.

The pool can be funded by the `set_allowance` proposal's deposit, by a Transfer proposal to the contract, or by anyone sending NEAR to it directly.

## Build and test

```bash
cd contracts/allowance
cargo test                                  # 13 unit tests: limits, day reset, expiry, freeze, who may do what
cargo near build non-reproducible-wasm --no-abi
```

To deploy for another group, create a sub-account, deploy the wasm, and call `new({"owner": "<dao>", "guardians": ["<council>", ...]})`. Then add the pair to `ALLOWANCE_CONTRACTS`.
