// Terra's FAQ: one source for the landing page and the docs.
// Read top to bottom it's one story: the money sits in your own NEAR treasury, members ask and
// approve by record, the treasury pays anyone on any chain through NEAR Intents, and everything is
// public on NEAR.
//
// Answer markup (kept tiny on purpose, rendered by components/Faq.tsx):
//   [text](#id)       link to another question
//   [text](https://…) external link
//   **text**          bold
//   lines starting "- " become a list

export interface FaqItem {
  id: string
  q: string
  a: string
}

export interface FaqGroup {
  id: string
  title: string
  /** A one-word label for the chapter picker on small screens. */
  short: string
  /** One line on how this part of the story connects to the next. */
  lead: string
  items: FaqItem[]
}

export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: 'treasury',
    short: 'Treasury',
    title: 'Your money stays in your treasury',
    lead: "It starts with where the money lives: your group's own treasury on NEAR.",
    items: [
      {
        id: 'holds-money',
        q: 'Does Terra hold our money?',
        a: "No. The money stays in your group's own treasury, a Sputnik DAO on NEAR. Terra has no wallet and no multisig of its own: it files requests and votes through the DAO, and the DAO pays out only when its own rules are met ([how approval works](#approval)).",
      },
      {
        id: 'existing-dao',
        q: 'Can we use the DAO we already have?',
        a: "Yes. Type any Sputnik DAO account, including one set up through Trezu, and Terra reads its members, roles and history, with no new contract. No DAO yet? **Start a group** creates one with the standard Sputnik factory ([what that costs](#gas)).",
      },
      {
        id: 'shutdown',
        q: 'What if Terra disappears?',
        a: 'Nothing is lost. The treasury, its members, its roles and every decision live on NEAR, and Terra has no server or database of its own. Any app that speaks Sputnik can open the same DAO tomorrow.',
      },
      {
        id: 'dao-ui',
        q: "Why not just use the DAO's own interface?",
        a: 'Treasury dashboards are built for admins: proposals, bonds, raw token amounts. Terra is the members\' side of the same DAO: balances in dollars, "pay this person $20 for posters", your record deciding how much approval it needs, a live quote when they want paying on another chain, and the conversation next to the vote. Both work on the same DAO, side by side.',
      },
    ],
  },
  {
    id: 'approve',
    short: 'Approvals',
    title: 'Ask, and the group decides by record',
    lead: 'Members ask for money, and their record on NEAR decides how much approval it needs.',
    items: [
      {
        id: 'approval',
        q: 'How does approval work?',
        a: "Every request becomes a proposal on your DAO, routed by size and by the requester's [record](#record):\n- **Up to $50**, with a clean record: one trusted member who isn't the requester.\n- **$50 to $500**: the council, at its own threshold.\n- **Over $500**: a full council vote, shown on the public board while it's open.\nWhen enough people approve, the DAO pays out on its own. If the recipient is on another chain, NEAR Intents delivers it there ([see how](#intents-in-terra)).",
      },
      {
        id: 'record',
        q: 'What is "your record"?',
        a: "Your requests paid and turned down, the money you've chipped in and your votes, computed only from the DAO's own history on NEAR. Every line links to its proof, so nobody can edit it, Terra included. A clean record means at least one request paid and none turned down; council and trusted members count as clean.",
      },
      {
        id: 'gaming',
        q: 'Can the reputation be gamed?',
        a: "Not cheaply. A record is built from requests the group itself approved, so you can't earn one alone. The most a clean record unlocks is the fast lane: up to $50, and still one trusted member's nod. A first request from someone with no record always goes to the council, and one turned-down request takes the fast lane away.",
      },
      {
        id: 'run-off',
        q: 'Can one person run off with the money?',
        a: "Every payout needs the group's own roles, and the fast lane needs a trusted member other than the person asking. There's one honest limit today ([see below](#trusted-limit)).",
      },
      {
        id: 'trusted-limit',
        q: 'What stops a trusted member approving a big payout?',
        a: 'Today, Terra does: it sends big requests to the council and only offers the vote to the right people. But Sputnik approves by role, not by amount, so a trusted member could still approve a large transfer from another app. So keep the trusted list small. For a hard cap, use an [allowance](#allowances), which the contract enforces. A guard contract that checks amounts on chain is [next](#next).',
      },
      {
        id: 'allowances',
        q: 'What are allowances?',
        a: "A small standing budget for a member or an AI helper: a daily cap, a most-per-payment and an end date. Payments inside it skip the vote, and any council member can freeze it instantly. Unlike the tiers, these limits are enforced on chain by a small contract the DAO owns, and an AI helper's key can only call its pay method.",
      },
      {
        id: 'join',
        q: 'How do people join?',
        a: 'Share the invite link or QR. A newcomer signs in, taps **Sign in to ask**, and the council approves in Approve. Anyone can chip in or ask for money without joining; their first request goes to the council.',
      },
    ],
  },
  {
    id: 'intents',
    short: 'Any chain',
    title: 'Pay anyone, on any chain',
    lead: 'Once a request is approved, NEAR Intents can deliver it on the chain the recipient uses.',
    items: [
      {
        id: 'intents-in-terra',
        q: 'What does NEAR Intents actually do in Terra?',
        a: "When someone wants to be paid on another chain, say 20 USDC on Solana, Terra asks the NEAR Intents 1Click API for a live quote: they get exactly 20 USDC, and here's how much NEAR the treasury sends, the fees and the arrival time. That quote is saved in the request before anyone approves, so the group votes on exactly what leaves and what arrives.",
      },
      {
        id: 'intents-vs-bridge',
        q: "What's the difference between NEAR Intents and a bridge?",
        a: 'With a bridge, you do the moving: pick a route, lock tokens, wait, and often end up with a wrapped token to swap again. With an intent, you state the outcome ("the designer gets 20 USDC on Solana") and solvers compete to fill it. The treasury stays on NEAR, and there\'s no bridge to operate and no wrapped tokens to manage.',
      },
      {
        id: 'chains',
        q: 'Which chains and tokens can people be paid in?',
        a: 'A short list on purpose: USDC on Solana (the default), Base, Ethereum or NEAR; USDT on Tron or Ethereum; ETH on Base; SOL; and BTC. Or plain NEAR to any NEAR account.',
      },
      {
        id: 'mainnet',
        q: 'Is any of this on mainnet?',
        a: "Terra runs on NEAR testnet, and every step in the demo is a real testnet transaction you can open. The NEAR Intents quotes are live from mainnet, since Intents has no testnet. So in the demo, an approved cross-chain request pays the quoted amount in NEAR to a NEAR account; on mainnet the same request pays the Intents deposit address and the recipient gets the token on their chain. One real mainnet payout is [next](#next).",
      },
    ],
  },
  {
    id: 'public',
    short: 'Public',
    title: 'Everything is public on NEAR',
    lead: 'Every request, vote and payout lands on NEAR, where anyone can check it.',
    items: [
      {
        id: 'board',
        q: 'What can people outside the group see?',
        a: "The public board: the balance, what's been paid out, open requests, and every payout with who approved it and a link to its record on NEAR. No sign-in and no money buttons, so it's easy to share with sponsors.",
      },
      {
        id: 'profiles',
        q: 'Where do profiles and comments live?',
        a: 'On NEAR Social, signed by your own wallet. A name set in Terra shows in other NEAR apps, and one set elsewhere shows in Terra. Your account id always stays visible next to your name.',
      },
      {
        id: 'messages',
        q: 'Are private messages private?',
        a: "The contents are end-to-end encrypted, and your key never leaves your browser. Who messaged whom, and when, is visible on NEAR. There's no forward secrecy, and a new device or a cleared browser needs a new key.",
      },
      {
        id: 'data-forever',
        q: 'Is my data stored forever?',
        a: 'Requests, votes, comments and profiles are written to NEAR, which is what makes them public and uneditable. You can change your profile, but past versions stay in the chain\'s history. Message contents stay encrypted, but the ciphertext stays on chain for good ([more on messages](#messages)).',
      },
      {
        id: 'staking',
        q: 'Can idle money earn something?',
        a: 'Yes: the group can vote to stake it with a NEAR validator, like any other request. Rewards arrive once per epoch.',
      },
    ],
  },
  {
    id: 'getting-started',
    short: 'Start',
    title: 'Getting started',
    lead: 'All you need is a NEAR account.',
    items: [
      {
        id: 'start',
        q: 'What do I need to start?',
        a: 'A NEAR account and a wallet: Meteor on desktop, Intear on a phone. Terra runs in the browser, and there\'s an Android app. Looking around needs no account at all.',
      },
      {
        id: 'fees',
        q: 'Does Terra charge fees?',
        a: "No. You pay NEAR's network fees, which are tiny, and the proposal bond your DAO sets for each request. Cross-chain payouts carry the NEAR Intents fees, which the quote shows before anyone approves ([gas and deposits](#gas)).",
      },
      {
        id: 'gas',
        q: 'What about gas and storage deposits?',
        a: 'Each action is signed by your own wallet and pays its own gas. Starting a group needs at least 6 NEAR, about 5.4 of which stays locked to store the DAO contract. Your first NEAR Social save may add a 0.05 NEAR storage deposit, and only when your storage is short.',
      },
      {
        id: 'why-near',
        q: 'Why NEAR?',
        a: 'Because every part of this story is already native there: Sputnik treasuries communities already use, readable named accounts for records, NEAR Intents to pay out on any chain from one treasury, NEAR Social for profiles and comments without a backend, and access keys that let an AI helper call one method and nothing else.',
      },
      {
        id: 'next',
        q: "What's next?",
        a: 'One real mainnet payout through NEAR Intents, then cross-chain payouts in the app. A guard contract that enforces tier limits on chain. A NEAR Social key so comments and messages don\'t need a signature each time. And a hand-off to a full treasury dashboard for groups that outgrow a members\' app.',
      },
    ],
  },
]

export const FAQ_ITEMS: FaqItem[] = FAQ_GROUPS.flatMap((g) => g.items)

export function faqGroupOf(id: string): FaqGroup | undefined {
  return FAQ_GROUPS.find((g) => g.items.some((i) => i.id === id))
}

/** The question a URL points at: `#faq-<id>` on the landing page, `#/docs?s=faq&q=<id>` in the docs. */
export function faqIdFromHash(hash = window.location.hash): string | null {
  const m = /^#faq-([\w-]+)$/.exec(hash)
  const id = m?.[1] ?? new URLSearchParams(hash.split('?')[1] ?? '').get('q')
  return id && FAQ_ITEMS.some((i) => i.id === id) ? id : null
}
