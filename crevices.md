# The crevices: where money flows without an employer, a client, or an application

Research note #2 — 22 Oct 2026. Supersedes the framing of `first-dollar-playbook.md`
(kept, with corrections at the bottom).

Your correction was right: "apply → do a task → get paid" is the shape everyone
sells, and it's the shape I answered in. So I went looking for a different
category of thing:

> A **crevice** is a structural gap where value flows to whoever is standing in
> the gap — with no employer's approval, no client relationship, no audience, and
> ideally no capital. You don't apply to the crevice. You stand in it, and money
> moves.

Everything below is a gap I could actually verify, with today's numbers. Where a
number is my estimate, it says so. Where I couldn't verify, it says that too.

---

## Crevice 1 — The paid-answer market (x402 "agent door"). The purest one, and it's nearly empty.

**The gap.** Software companies need support replies. Humans are slow and
expensive. AI agents can now pay *per action* on-chain with no account, no API
key, no signup, no KYC — because there is no employer and no client: the buyer
is a machine, the payer is a crypto transfer, and the answerer is anonymous.

**The market, live right now: DeskCrew's x402 agent door.**
`deskcrew.io` is a helpdesk SaaS. Its agent door lets "any AI agent pay per
action in USDC via the x402 standard: create tickets, triage, and draft support
replies. No account, no API key." (their own page metadata). llms.txt:
*"anonymous AI agents can pay per action in USDC across 6 chains and work
tickets, with human approval built in."* Their Whop integration even routes
questions a knowledge base can't cover to *"a paid expert on the DeskCrew
board, answered within 24 hours."*

**How you get paid, exactly [VERIFIED — live API, fetched today]:**
- Public, key-free endpoints:
  - `GET https://deskcrew.io/api/arena/contests` → the open board (free, no key)
  - `GET https://deskcrew.io/api/arena/board` → public leaderboard: every
    wallet's `approved`, `draftsTotal`, `approvalRatePct`
  - `GET https://deskcrew.io/api/arena/wallet/{your_address}`
  - `GET https://deskcrew.io/api/arena/worklist/{your_address}` → rows you can win
- Payment is **x402**: USDC on **Base** (default) plus Polygon, Sei, Avalanche,
  **Solana (the server co-signs gas → you need zero SOL)**, Algorand; x402 v1+v2.
  Minimum price on some routes is $0.08.
- **You keep 85%** of the bounty (`agentShare: 0.85`); 15% goes to the platform.
- A **human approves** one draft per row, so a draft is a real work product
  judged by a person — not a lottery on speed.
- Payout lands **in USDC, on that row's payoutNetwork, to the wallet that paid
  for the draft.** Their own warning: *"check you can receive USDC on that chain
  before you spend, because a bounty cannot pay out on any other one."*

**What it costs to play [VERIFIED — plugin docs]:** ~$0.02 to buy the ticket
context + ~$0.06 to submit a draft = **~$0.08 per attempt**, paid as an on-chain
micropayment. That is the *only* capital requirement. No account, no signup, no
API key, no employer, no client, no audience, no skill beyond writing a support
answer (a free LLM tier can draft it).

**The odds — they publish their own [VERIFIED, 449 decided rows]:**
| Metric | Value |
|---|---|
| Rows decided | 449 |
| Contested rows | 98 |
| Contested rows that got a winner | ~80 (82%) |
| **Avg entrants per $1 row** | **4.7** |
| Approved as-is / with edits | 20% / 3% |
| Decision latency | median **23.8 h**, p90 **202 h** |
| Time from approval to on-chain payout | **0.37 h avg** (83 payouts, $69.74, 30 wallets) |
| Payout curve | $0.50 → 80% awarded; $1 → 82% awarded, 4.7 entrants; $5 → 100% awarded, 2 entrants |

**Leaderboard win rates for real wallets (yours would be the 31st):** 24/34
drafts won (71%), 9/25 (36%), 9/106 (8%), 5/6 (83%), 3/15 (20%).

**My EV arithmetic (my estimate, from their numbers):**
- Typical $1 row, 4.7 entrants → per-attempt win ≈ 0.82 / 4.7 ≈ **17%**
  → EV ≈ 0.17 × $0.85 × $1 − $0.08 ≈ **+$0.07 per 8¢ spent (~1.9×)**
- $5 row, 2 entrants → EV ≈ 0.5 × $0.85 × $5 − $0.08 ≈ **+$2.05 (~26×)**
- If you behave like the top of the leaderboard (only enter rows with 1–2
  entrants), your win rate approaches 35–70% and the $1 rows pay ~$0.22 net each.
  Their tooling exists for exactly this: *"Open USDC bounties, least-contested
  first, with each board's own accept-rate history."*
- **Rule: only enter a row when (reward × win-prob × 0.85) ≫ $0.08. Skip $1
  rows with 5+ entrants. Hunt $2–$5 rows with 1–2 entrants.**

**Why this is the crevice and not a platform:** the market was built for *AI
agents*; the human side is empty because humans can't receive USDC. **You can.**
The barrier isn't skill, it's rails — and you have the rails (a wallet that
receives USDC on 6 chains + a BOP account for the fiat side). That is the whole
edge, and it is the same edge that pays PalPalestine's corridor problem
(Crevice 3).

**Honest limits, no spin:**
- **The board is empty at this moment:** `openBounties: 0`, `openBountyUsd: 0`,
  `count: 0`. This market's *entire lifetime* payout is **$69.74 across 83
  payouts to 30 wallets** — average $0.84 per payout. It started
  2026-08-23. It is real money with real on-chain tx hashes, and it is
  *tiny*. You would be among the first ~30 people paid. Treat this as the
  cheapest possible first dollar and a market to be early in, not as income.
- Decisions are slow: median 24 h, **p90 202 h (8+ days)**. A draft can sit for
  a week.
- "Most attempts do not pay" — their words, in the plugin's "Honest economics".
- You need a ~$0.10 float to enter, and a little native gas (~$0.05–0.20 of
  ETH on Base, or ~0.001 SOL) to move your first payout. Cheapest free gas
  sources: a mainnet faucet, or a DeskCrew row that settles on ETH/SOL.
- This is *drafting support replies*. It's work, but it's not employment, not a
  client, and not a platform account.

**First move (free, 2 minutes):**
```
curl https://deskcrew.io/api/arena/contests     # open rows + the odds table
curl https://deskcrew.io/api/arena/board         # who is winning and how often
```
Both are free, public, and keyless. They tell you whether there is work to take
*and* what the market's economics are today. Alerting is free too: Supabase
Realtime channel `bounties:funded`, or a webhook, or email.

---

## Crevice 2 — The same shape, for code (TaskBounty) — and the "publish an endpoint" version

**The gap.** Same as above, different artifact: someone has a broken repo and
will pay crypto for the fix. TaskBounty is an explicit agent-facing market:
*"For AI Agents: Earn USDC, ETH, BTC Fixing Real Bugs."*

**Terms [VERIFIED — task-bounty.com/for-agents, today]:**
- Bounties are **$10 to a few hundred dollars**, posted as real scoped GitHub
  issues. **You keep 80%** ($50 bounty → $40 net). Verification is real: your
  PR must make a new regression test fail pre-fix and pass post-fix, run in an
  isolated E2B microVM.
- Payout routes: **USDC on Solana — "public address registration supported"**;
  USDC on Base — "not confirmed as a supported settlement route"; USD bank
  transfer — self-service not available, must confirm with support; ETH/BTC
  unlock only after $50 lifetime paid. **"An approved first solver award is
  queued for payout processing without the $50 minimum."**
- Competition: *"First passing submission wins... yes, you might do work for
  nothing on a contested bounty."* They publish "N solvers attempting" counts so
  you can self-select.
- Cost: needs a coding agent (Codex/Claude Code/Cursor/MCP). **If you have a
  free LLM tier or a local model, this costs $0 in API money.** If you need a
  paid API, this is the "no upfront spending" line you're drawing.

**The most out-of-box version of this idea:** x402 means *anyone* can publish an
endpoint that charges per call in USDC with no account, no KYC, no platform, no
client relationship. So the arbitrage isn't only "answer tickets" — it's
"**be the thing machines pay for**." A useful micro-utility (Arabic↔English
translation, JSON/CSV cleanup, date & shekel/dollar conversion, a Palestinian
grocery-price feed, PDF/OCR extraction) served over x402 gets paid per call,
automatically, forever, with no employer and no invoice. The catch I cannot
verify: **discovery**. Agents need to know your URL; x402 has a
`/.well-known/x402` descriptor and a facilitator, and there are directories, but
I could not confirm a directory that reliably surfaces a brand-new endpoint. So
this is the highest-ceiling crevice and the one with the least verified path to
a first payment.

---

## Crevice 3 — The corridor: fiat ⇄ crypto in the one place the global rails skip

**The gap.** Palestinians are excluded from PayPal, Payoneer, Wise and Stripe
(verified in my first report). So a Palestinian holding crypto, or a diaspora
family sending money, or a remote employer paying in USDT, hits a wall: crypto
is the only rail that works, and converting it into spendable local money is
done by **middlemen who charge for it**.

**The spread is the income, and it is documented:**
- Gaza, Dec 2025 (+972): cash brokers/middlemen charge **30–40%** to release
  ATM money or convert; *"I had to exchange 100 USDT and lose over 30 percent
  of its value."* Money-transfer and exchange offices (one had done it 8 years)
  pivoted to crypto because *"cryptocurrency… gained a foothold as one of the
  few methods of financial exchange **unregulated by Israeli authorities**."*
- West Bank, today: institutional quote **2.93 ILS per USDT** (ATM24) against a
  mid-market of **~3.05** — ~4% at the wholesale level, wider at retail.

**You hold all three rails simultaneously, which almost nobody does:** a Bank of
Palestine account (fiat), a wallet (crypto), and cash in a cash economy. That's
the gap you're standing in.

**Four ways to monetise it, in increasing capital order:**
1. **Fee-based routing (no principal at risk — $0 capital).** You convert
   *someone else's* USDT to ILS cash or into their BOP account, same day, and
   take a 1–3% fee; the principal never rests with you. Needs a little ILS cash
   on hand and a reputation, and it is exactly the service the +972 brokers
   charge 30–40% for. **This is the only version that can start with $0.**
2. **Symlix trader (escrow-protected, verified).** Symlix is a P2P crypto
   marketplace with a live Ramallah cash desk: *"Tether TRC20 is held in the
   escrow wallet until the trade is completed, increasing safety and trust for
   both buyers and sellers,"* and you can *"Submit your own"* offer — i.e. be
   the trader. You earn the spread, escrow handles the trust. It also pays
   *"lifetime commissions from every trade"* for referrals.
3. **ATM24 affiliate/partner (verified, free, zero capital).** Their own page:
   *"Become a partner and earn commission. Join for free… Tell your audience
   about ATM24.pro… earn commission for each user you refer."* Application is an
   email form (name, phone, email, **country of residence, citizenship**) →
   you get an active referral link + marketing materials. Commission rate is
   not published → ask for it in the first message. Zero capital, zero skill,
   and it's a *reseller* relationship rather than you being the exchanger.
4. **Small OTC desk.** The Gaza playbook at small scale: hold float
   ($20–100), quote above the local changers, settle same day. Real income,
   real capital, and the most regulatory exposure of the four.

**The legal/AML reality, stated plainly.** Currency exchange and money transfer
are licensed activities in the West Bank (Bank of Israel's currency-exchange
regime; the PMA supervises banks). I am not going to advise you to run an
unlicensed remittance desk. What I *will* say:
- Do it in the form of **peer-to-peer help for people you know**, or as a
  **partner/reseller** of a licensed operator (ATM24 affiliate; Symlix trader
  with escrow) — not as "my company moves money."
- **Never let someone else's money sit in an exchange account you control.**
  Documented reason: a Gaza money-transfer operator had **$100,000 frozen on
  Binance for four months** after an Israeli-authority-linked AML/terrorism
  complaint (via +972). PalPalestinian banks have likewise been asking about
  the source and purpose of incoming transfers since Aug 2026 (Al Jazeera).
- Keep records, keep it small, keep it to people you know, and never take a
  fee that looks like a commission on someone else's salary.
- Also note: your *own* BOP USD account is a legitimate SWIFT receiver
  (SWIFT `PALSPS22`), so a diaspora sender or a foreign client can pay you
  directly with no intermediary at all — that part needs no licence and no
  crypto.

**Strategic note:** this crevice is how the first $25 becomes $50. A $25 float
turned 3–4 times at 4–30% per cycle is a real, repeatable income line that no
platform can take from you.

---

## Crevice 4 — Prediction markets: creation is free, but the money needs a position

Verified on a live Superteam listing (Daejin, Global, $620 pool,
$200/$150/$110/$90/$70): *"Creating a market is free… Your position stays
yours: if your call is right, you earn from the market on top of any bounty
prize."* So market *creation* is a zero-capital activity with a revenue share.

But the same listing's eligibility kills it for you, and I want to be precise
because I got this wrong in the first report: you must *"take a position (min.
$5) in one of the featured markets"*, and **30 of the 100 judging points are
"Reach & Engagement"** (views, likes, reposts) — i.e. it wants an audience.
So: **prediction markets are a market-making opportunity, not a zero-capital
one.** The sibling listing (Panta × NectarFi) explicitly requires *"trade at
least $1"* — excluded twice over. Good news: because "creating a market is
free", you can build the skill and the market history with zero capital, and
only put money in when you actually have a position worth taking.

---

## Crevice 5 — The card as a scarce asset (only if you have a BOP Visa/Mastercard)

Palestinian banking runs local Visa/Mastercard (verified). A working card in a
region where millions of people cannot reach US storefronts is a scarce good:
it unlocks free tiers (cloud, AI APIs) that make Crevice 1 and Crevice 2
cost **$0** in API money, and it can buy US-only digital goods. The resale of US
gift cards/digital goods into the region is a real trade, but it needs capital
and sits in a grey zone — I'm noting it, not recommending it.

---

## Crevice 6 — Crevices I checked and killed (so you don't waste days)

- **Bandwidth / data-sharing:** Honeygain = $20 minimum, **PayPal**-only (dead
  rail for you), flat $0.10/GB, 15 GB/month free cap ≈ $1.50/mo. Packet Storm:
  **packetstorm.net is a parked domain for sale.** Grass/Mysterium-style:
  pennies/day + tokens. Dead.
- **"Free cloud → mine/serve":** pennies/day, needs a card, provider ToS
  issues. Dead.
- **Faucets, quizzes, learn-and-earn, airdrop farming:** pennies, mostly $0,
  sybil-filtered, and (for quizzes) inside your excluded bucket.
- **Exchange sign-up bonuses:** every cash one is deposit- or trade-gated.
- **"Referral programs" generally:** need an audience — except the ATM24
  affiliate above, which needs one person, not a following.
- **"Free stuff → resell" (free domain, free NFT, free Steam key):** needs
  capital and a market.
- **Bounty boards that pay via Stripe/PayPal** (Algora, OnlyDust, Topcoder,
  Opire): pay into rails you don't have.
- **Binance P2P as a local off-ramp: don't rely on it** (see corrections).

---

## Corrections to `first-dollar-playbook.md` (things I got wrong or couldn't confirm)

1. **Binance P2P does not have a Bank of Palestine / Arab Bank / ILS rail.**
   `p2p.binance.com/en/trade/bankofpalestine` → 404; `/en/trade/ils` → 404; the
   `/en/trade/arabbank` slug returns the generic P2P page with an empty ads
   table. I cited that slug earlier as weak evidence — it is not evidence.
   **Use Symlix (escrow, cash, Ramallah) and ATM24 instead.**
2. **The Daejin "Launch & Trade" bounty requires a $5 position and 30% of its
   score is reach/engagement** — so it is excluded on two of your rules, not
   one. (I excluded it before; now I have the exact reasons.)
3. **Newly verified, not in the first report:** the x402/DeskCrew paid-answer
   market (with published odds), the TaskBounty agent-code market, the ATM24
   affiliate program, Symlix's escrow + trader + referral model, and the Gaza
   broker spread (30–40%) with the Binance $100,000 / 4-month freeze case.
4. **Unchanged and still true:** PayPal / Payoneer / Wise / Stripe exclude
   Palestinians; Bybit's fiat-restriction list names "Palestine (State of)" and
   "West Bank (Palestinian Territory)"; Veriff supports Palestinian ID;
   HackenProof pays USDC on Base with a 100-USDC floor and no KYC in most
   cases; HackerOne pays USDC on Ethereum with a $15 floor; and the zero-capital
   content bounty (Superteam Earn, Global region, a $500 pool paying a flat $25
   to ranks 4–25 of ~250 entries, judged on craft not follower count) remains
   the only capital-free way to get money into the wallet.

---

## The 72-hour play, in crevice terms

**Hour 0 (free).** In Trust Wallet, save receive addresses for **USDC on
Base**, **USDC on Solana**, and **USDT on TRC-20**, labelled. Write down your
BOP IBAN and SWIFT `PALSPS22`. Costs nothing, and every crevice above pays
into one of these.

**Hour 0.5 (free).** `curl https://deskcrew.io/api/arena/contests` and
`/api/arena/board`. You now know the live economics of a market where nobody
employs you and machines pay you per action, and whether there is work today.
Set up a free alert (Realtime channel / webhook / email) so you get pinged the
second a bounty is funded.

**Hour 1 (free).** Email ATM24's affiliate program (their form asks for
country of residence + citizenship). Free referral link, commission per user.
Start collecting their marketing material; you are now a *reseller* of the
corridor, not an unlicensed exchanger.

**Day 1–3 (free, no capital).** Get the first dollar in the wallet. The only
capital-free route I can verify is a **Global-region Superteam content bounty
with a flat tier for non-winners** (the $CHIMP one pays $25 to ranks 4–25 of
~250 entries, judged on writing quality — craft, not reach). Two entries at
2 hours each is a coin-flip on ~$25. If you can write, do that. If you can
code, do HackenProof (no KYC) in parallel.

**Day 3+ (needs ~$0.10).** Take the DeskCrew loop: ~8¢ per attempt, pick rows
with 1–2 entrants, target a draft-win rate above 35% (the leaderboard shows
that's achievable). Also open a Symlix account and post your first offer, so
that when USDC lands you can turn it into shekel cash at the mid-market rate
instead of the 2.93 institutional one, and start being the corridor for other
Palestinians.

**Week 2+.** Turn the float into the corridor business: fee-based routing for
people you know (no principal at risk), the ATM24 affiliate referrals, and
Symlix trades. Cash out via ATM24 (USDT TRC-20/ERC-20, USDC ERC-20 → ILS cash
at the two Ramallah changers, or a bank transfer; ~4% spread) or Symlix cash
directly.

**What could still go wrong, so you don't get blindsided:** the DeskCrew board
is empty right now and its lifetime volume is $69.74, so it may be quiet for
weeks; content bounties are contests with ~10% odds, not income; your first
crypto needs a few cents of gas to move; and the corridor carries real AML and
licensing exposure if you scale it carelessly. Treat all of it as a learning
curve with a real payout at the end of it, not as a business plan.

---

## Sources (primary)
deskcrew.io/llms.txt, deskcrew.io/agents, deskcrew.io/.well-known/x402,
deskcrew.io/api/bounties, /api/arena/contests, /api/arena/board,
/bounties.json; github.com/webmilmind1/hermes-bounty-board (x402 plugin docs:
$0.02 context, $0.06 submit, 85% share, "most attempts do not pay");
task-bounty.com/for-agents; symlix.com (escrow, "Submit your own", lifetime
referral commissions); atm24.pro/en/partners (affiliate terms) and
/en/palestine/ramallah (routes, rates, payout points); +972, "From cash brokers
to crypto", 19 Dec 2025 (30–40% broker spread; Binance $100k frozen 4 months;
crypto "unregulated by Israeli authorities"); earn.superteam.fun API listings
(22 Oct 2026); superteam.fun/skill.md; docs.superteam.fun; bybit.com help
centre; veriff.com/supported-countries; docs.hackerone.com; docs.hackenproof.com.
