# 30-day scoreboard — Arabic Pipeline API

Written 22 Oct 2026, the day the service went live on Base mainnet.
This is the measurement plan and the kill criteria. It replaces the vague
"check in a month" with numbers.

## The only three numbers that matter

| Metric | Where it comes from | Why |
|---|---|---|
| **Calls settled** (count) | x402scan server page → your resources; plus your own facilitator receipts | proves agents are actually using the thing, not just that a listing exists |
| **Unique buyers** (count) | x402scan / PayAPI; each buyer's `from` address in the settle receipts | breadth matters: 1 buyer × 10,000 calls is one customer, not a market |
| **Revenue per call** (USDC) | total settled USDC ÷ calls | the honest efficiency number; see the kill criteria below |

Secondary, tracked but never a success criterion:
- **Median time from listing → first call.** If this is weeks, discovery is
  broken (fix the listings), not the product.
- **Which route gets called.** If only `/text/metrics` (cheapest) gets called,
  the paid routes are mispriced or misdescribed.
- **404s on the free routes** (`/`, `/health`, `/openapi.json`): a proxy or
  scanner problem, not a product problem. Keep an eye on it anyway.

### Where to read the numbers

- x402scan — your resource page shows calls and revenue per resource:
  `https://www.x402scan.com/server/298e1e2b-3f5c-4890-9791-6d063fd20931`
- PayAPI Market — `https://payapi.market/agent/search?q=arabic` lists your
  listing once it is live and settlement-verified, with the on-chain receipt.
- Your own wallet `0x05523af5bd166816D1418Ebf7D6371e1fFB1D2e6` on Base —
  every settled call lands there as USDC. This is the ground truth; the
  dashboards are a convenience.

## Success bar (the "it worked" line)

**10 unique buyers × 500 calls × $0.02 = ~$100/month.**

Why that bar and not another:
- Context from the same market (x402scan, 22 Oct 2026): the **average seller
  earns ≈ $39/month** ($1.50M ÷ 38K sellers over 30 days). $100/month is
  therefore roughly the **top ~10%** of sellers. It is a deliberately
  ambitious line.
- 500 calls/buyer/month is ~17 calls/day — one agent using the API a few
  times an hour, every working day. That is the realistic shape of one
  automated consumer.
- $0.02/call is the blended average of our four prices ($0.002 metrics,
  $0.005 normalize, $0.02 transcribe, $0.03 extract). If only the cheap text
  routes get called, the blend drops and you need more buyers to hit $100.

**Sub-bars, checked weekly:**

| Week | Minimum to be on track | If under |
|---|---|---|
| 1 | ≥ 1 buyer, ≥ 25 calls | Discovery problem: re-check listings are live and discoverable, and that the paid route URL in the PayAPI listing is the one that 402s. Do **not** change the code. |
| 2 | ≥ 2 buyers, ≥ 100 calls | Either the price is too low to be worth a buyer's setup cost, or the descriptions don't match what agents look for. Re-read the route descriptions; consider one route at a higher price. |
| 3 | ≥ 5 buyers, ≥ 400 calls | Working, but narrow. Double down on the one route that gets called and add the second-best route to the listings' descriptions. |
| 4 | ≥ 10 buyers, ≥ 2,000 calls, ≥ $40 | Hit $100 only if revenue/call holds. If you're at 10 buyers × 500 calls but only $20, it's the pricing kill criterion (below). |

**Full success (day 30): ≥ 10 unique buyers AND ≥ $50 settled AND ≥ 2,000
calls.** Call it good if revenue ≥ $50 with real breadth; call it excellent at
$100.

## Kill criteria (decided in advance, so they can't be argued later)

### Kill 1 — zero calls in 30 days
**If: 0 settled calls by day 30.**
**Then: this class of buyer does not exist for this product yet.** Do NOT
build a second service. *Repoint the same engine* at a proven-thin class:
regulatory/filings data, or enrichment/people data — both are thin in the
marketplace and both are pure data work, which this Worker already does
(fetch → transform → return JSON). The Arabic utilities, the MCP server, the
listings and the price table all carry over; only the subject matter changes.
That is a one-week change, not a rebuild.

**Do not** respond by lowering prices to $0.001. Zero calls is a discovery
problem, not a price problem — the marketplace's modal transaction is under
$0.01 already, so halving a $0.005 price cannot turn zero into traffic.

### Kill 2 — calls but revenue per call < 20% of list price
**If: settled USDC ÷ calls < 20% of the listed price** (e.g. $0.005 charged
but $0.0009 collected).
**Then: reprice or re-scope.** Causes are usually (a) a facilitator that
settles for less than it charges, or (b) buyers picking the cheapest
`accepts[]` entry when several are offered. Fix by offering exactly one
price per route and checking the settle receipts.

### Kill 3 — one buyer, many calls
**If: ≥ 50% of calls come from a single buyer address** at day 30.
**Then: you have one customer, not a market.** Treat it as a success for
revenue but a failure for the thesis. Look for the next-best class, and
consider using this traffic as proof-of-demand when pitching the next thing.
Do **not** build a second engine while this one has a paying caller — but do
start looking for the next class.

### Kill 4 — the service costs more to serve than it earns
**If: Gemini/model cost + Cloudflare cost > settled revenue over 30 days.**
**Then: shrink the paid surface.** Free-tier Gemini and the Workers free
tier make the two model-backed routes roughly break-even at low volume; the
two pure-code text routes cost $0 to serve. If the model routes never get
called, drop them from the listings (keep the code) and sell only the
zero-cost routes.

### Explicitly NOT a kill criterion
- **No calls in week 1.** Marketplace listings index slowly; PayAPI reviews
  within 24h but x402scan/Bazaar indexing can take days. Judge at day 30.
- **Revenue below $100.** $100 was the *excellent* line. $39/month is the
  market average and still a real result — that is roughly a $500/month
  outcome at $8/hour-equivalent of your time.
- **A failed PayAPI canary.** The canary is a $0.10 test, not a customer. Fix
  and resubmit; it does not invalidate the product.

## Review cadence

- **Weekly, 5 minutes:** open the x402scan resource page and PayAPI listing,
  write down the three numbers at the top of this file. Keep a rolling
  table. That is the entire measurement effort.
- **Day 14:** check against the sub-bars. If under the week-2 bar, diagnose
  *discovery* (listings live? paid route URL correct?) before touching the
  product.
- **Day 30:** apply the kill criteria. Write one paragraph: what happened,
  which bar was hit, and the decision (continue / reprice / repoint).

## Why this plan is honest about odds

The base rate for a seller in this market is ≈ **$39/month** (x402scan, 30-day
window, 22 Oct 2026). Best-in-class services in the same window:
dTelecom $36.4K/mo from 29 buyers ($2.20/call — the best per-call revenue in
the ecosystem), BlockRun $2.13K/mo from 205 buyers, StableEnrich $1.26K/mo from
344 buyers. The long tail is brutal: most of the 38K sellers earn almost
nothing.

What is genuinely good about this product's odds:
- **Supply is thin where we sit.** Arabic, RTL, translation, OCR and Hijri
  appeared **zero times** in the 100 unique listings pulled from PayAPI
  (Arabic's only neighbour is one Hijri calendar converter). Voice/audio
  appeared once.
- **Per-call price is competitive.** The marketplace median is $0.01 and the
  modal transaction is under $0.01; our $0.002–$0.03 band sits inside it.
- **No audience needed.** Discovery is machine-facing, so the missing input
  (an audience) is not required for the first dollar.

What is genuinely bad about this product's odds:
- **Zero demand-side proof.** We have a supply-side guess ("agents need Arabic
  text cleanup") and no evidence any agent has ever wanted to pay for it. The
  whole point of the 30-day test is to replace the guess with a number.
- **Listing ≠ traffic.** PayAPI has 832 listings and 821 settlement-verified
  ones; verified means one $0.10 call landed, not that anyone keeps calling.
  Being listed is a prerequisite, not traction.
- **One integration could be missed.** If the buyer population uses one
  aggregator we are not on, the traffic never arrives regardless of quality.

So: the honest statement is that this is a cheap, well-timed bet with a real
chance of a few hundred dollars a month and a much larger chance of zero —
and the kill criteria exist so that "zero" happens at day 30 with a clear next
move (repoint the same engine at a thinner, better-evidenced class) rather
than at month six with sunk cost.
