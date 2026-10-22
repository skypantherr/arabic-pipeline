# Method families that don't need an audience (round 3 — 22 Oct 2026)

Supersedes the framing in `first-dollar-playbook.md` and `crevices.md` for
method selection. **Dropped per your instruction:** anything local / involving
Palestinians on the other side of the counter (the money-changer corridor, local
cash desks, Gaza broker economics). Nothing in this document needs a local
counterparty.

Also: I dropped "corridor/crevice" language. It's confusing. Plain names from here.

---

## First, your website idea — you were right, and here's what was missing

Your other AI's advice died for two reasons, and both are fixable:

| The death | The fix |
|---|---|
| "Needs a paid domain + AdSense" | **Don't build a website. Build an API.** No domain needed (free durable host), no ads, no traffic-buying, no AdSense approval. |
| "Needs an audience" | **List it where machines search for capabilities.** The marketplace *is* the audience, and payment is automatic per call. |

**The marketplace: PayAPI Market** (`payapi.market`, launched April 2026). Their
own words: *"List an API once. Keep 100% of what each call earns. Agents pay
per request in USDC on Base... Listing is free."*

**Live scale as of today [VERIFIED from their site]:** **832 APIs, 5,734
endpoints, 670 providers, 821 settlement-verified on Base.** So there's real
demand and real competition — and also proof that people with 0 dollars are
getting paid.

**What listing actually requires [VERIFIED from payapi.market/list]:**
- Form: name, email, optional company. **"Payout details come next, and they are
  optional."** No company, no KYC mentioned, no country restriction mentioned.
- **"What do I need on the form? A durable URL, the paid route, a Base USDC
  wallet you control, and a price that matches the live 402."**
- **"We pay one test call ourselves"** — one canary call, capped at $0.10, from
  their wallet. If the call returns real product and the money landed on your
  wallet, the listing goes live with a **settlement-verified badge** backed by
  an on-chain receipt.
- "Submit takes one minute. We email you. We do not charge you."
- **What gets bounced (operational detail that matters):** *"Ephemeral hosts
  (trycloudflare, ngrok, sslip, random zrok shares)"* — you need a **durable**
  host. Free Cloudflare Workers (`*.workers.dev`) qualifies; free ngrok/trycloudflare
  does not.
- The protocol: your endpoint returns HTTP **402** with the price, token,
  network and your `payTo` wallet; the agent signs a USDC payment and retries.
  `extra.name` must be **"USD Coin"** on Base USDC or settlement fails.
- You keep **100%** — no marketplace fee, no subscription, no invoice, no
  support ticket, no API key, no signup for the buyer.

**Discovery is the piece that solves "no audience"** — there are now several
independent channels where agents search for paid endpoints:
- `payapi.market/mcp` — free MCP server with `search_apis` / `list_apis` /
  `get_api`; also `/agent/search`, `/openapi.json`, `/.well-known/x402`. PayAPI
  is listed on the **official MCP Registry** as `market.payapi/marketplace`.
- **Coinbase's x402 Bazaar** — "an index for self-improving AI agents"
  (docs.cdp.coinbase.com/x402/seller/get-discovered).
- **x402scan** — x402 ecosystem explorer indexing endpoints and payments.
- **the402.dev** and **endpoint.x402jp.com** — other x402 directories.
- Your tool's own README can point agents at `https://payapi.market/mcp`.

**What people actually list there (so you can copy a shape, not invent one):**
UK Land Registry / Companies House / DVLA data, email verification, postcode
lookup, FX + crypto prices, headless-browser screenshots, WHOIS/DNS intel, web
scraping, IP geolocation, QR codes, UK HMO licensing, SEC EDGAR filings, IRS 990
charity search, text metrics, a Bitcoin full node, and an OFAC sanctions
screening API. Prices: **$0.001–$0.06 per request** (some to $1.77).

**And here's the part that matters for you specifically:** PayAPI's own copy says
*"You do not need to be a developer. You need domain expertise. Mortgage
brokers, recruiters, accountants, estate agents, solicitors, logistics managers,
compliance officers, insurance underwriters, pharmacists, and quantity surveyors
can all monetise their specialist knowledge through APIs."* So the non-code
version of this route is: **wrap a dataset or a lookup you already know in a
queryable endpoint.** A monolingual/Arabic-language one is a plausible niche
(Arabic text analysis, Arabic document extraction, halal/ingredient lookups,
Arabic-first product data, Arabic-English terminology lookup).

**The honest catch:** an API listing does **not** get you money by existing.
A listing with zero calls pays zero. Volume is what pays ($0.005/call × 10,000
calls = $50). This is a **product** route with a slow ramp, not a
first-dollar-in-48-hours route. It differs from your website idea in exactly
one way that matters: **the buyer arrives by searching for a capability, not by
following you.**

---

## Family A — Blind-scored competitions (your output is scored, not marketed)

This is the cleanest "no audience" structure that exists, and it has a real
prize pool: **ARC Prize 2026** — $2M total, three tracks (ARC-AGI-3 agents,
ARC-AGI-2 static, Paper Prize). I read the official Kaggle competition rules
for the ARC-AGI-2 track today:

- **Total prizes for that track alone: $700,000** ($275,000 Progress Prizes
  guaranteed — 1st $75,000, 2nd $50,000, 3rd $40,000…8th $15,000;
  $275,000 Innovation Prize guaranteed; $150,000 Bonus Prize).
- **Eligibility: open worldwide.** The excluded list is Crimea/DNR/LNR, Cuba,
  Iran, North Korea, and anyone under US export controls/sanctions.
  **Palestine is not excluded.** Minimum age 18. A Kaggle account is all you need.
- **"NO PURCHASE NECESSARY TO ENTER OR WIN."** → no upfront spend.
- **"The potential winner(s) are determined solely by the leaderboard ranking"**
  (public + private leaderboard) → your score decides, your reputation doesn't
  matter, no marketing, no followers.
- Open-sourcing your solution is required for prize eligibility (CC-BY 4.0 /
  permissive license; ARC-AGI-3 track additionally requires open weights per
  the OSI checklist).
- Timeline: **submissions due 2 Nov 2026**, papers 8 Nov, results 4 Dec.
- One submission per day; teams up to 5; external data/tools allowed if
  "reasonably accessible to all".

**The one thing you must check before investing weeks: the payout method for
non-US winners.** Evidence is mixed and this is the risk:
- Rules require US tax forms (W-9 / W-8BEN for foreign residents) and prize
  payment "within approximately thirty (30) days" of receiving acceptance docs.
- A Kaggle winner has publicly reported being paid **through Payoneer** — and
  Payoneer excludes Palestinians (verified earlier). So this route may be
  blocked for you *unless* the organiser can wire you directly.
- The rules also say: *"If a winner is located in a country where prizes cannot
  be awarded, then they are not eligible to receive a prize"* — organisers use
  that clause for sanctions reasons, but it means you should confirm the rail
  **in writing before you start**.
- **The good news for your specific setup:** the rail you already have is
  exactly the one these prizes need — a Bank of Palestine account that receives
  international SWIFT wires. Blind-judged prize platforms do pay internationally
  by bank transfer; the infrastructure exists (Payment Labs/prizepayments.io:
  *"Global Payouts in 150+ Local Currencies Across 180+ Countries"*, ACH, bank
  transfers, W-8/W-9 collection, 1099/1042-S) and their case studies include
  esports leagues, hackathons, chess, startup pitch competitions and "professional
  skills competitions" (6,500 Brawlhalla winners paid in 52 countries; 1,416
  creators paid in 26 countries). So the *class* of "score-based cash
  competitions paid by wire" is real and open to you.
- Also note the same class includes crypto-native versions: Superteam Earn's
  contest tracks (prize pools in USDC, paid to your wallet) and hackathon prize
  tracks.

**Realistic expectation:** ARC-level work is a moonshot for a first dollar.
But the class has smaller rungs — Kaggle has dozens of live competitions with
$500–$50,000 pools every month, and there are far easier scored contests
(writing, math, puzzle, design, esports, chess) that pay the same way. The
mechanics are identical: no audience, no spend, score-only judging, wire
payout.

---

## Family B — Machine-priced micro-work (no employer, no client, no account)

Recapping briefly because I explained it badly last time.

**DeskCrew's x402 "agent door"** (`deskcrew.io`): a helpdesk company posts a
customer-support ticket. An AI agent pays ~$0.08 in USDC (on-chain, via the
x402 standard) to fetch the ticket and draft a reply. A human at the company
approves the reply. **The agent's wallet keeps 85% of the bounty.** No account,
no signup, no API key, no KYC, no employer, no client, no audience.

Published economics (their own API, fetched today): 449 decided rows, 82% of $1
rows get a winner, **4.7 average entrants**, decision latency median 24h,
payout 0.37h after approval, leaderboard win rates 8–83%. **Right now the
board is empty (0 open bounties) and its lifetime volume is $69.74 across 30
wallets.** So: a real, on-chain, zero-approval market that is almost nobody
knows about — and almost no work in it right now.

**TaskBounty** (`task-bounty.com`) is the same shape for code: $10–$100+
bounties on real GitHub issues, 80% share, sandbox verification, "first passing
submission wins", USDC on Solana. Needs a coding agent, so it's $0 only if you
have a free LLM tier or a local model.

---

## Family C — Bounty pools for artifacts (fastest credible first dollar)

Already documented in `first-dollar-playbook.md`; the short version with today's
numbers. **Superteam Earn**, filter **Region = Global**, **Content** category.
Live example pulled from their API today: *"Write a thread on $CHIMP Fair
Launch"* — external sponsor (so payout goes straight to your wallet, no Superteam
KYC), $500 pool, 1st $100 / 2nd $75 / 3rd $50 / **and every place from 4th to
25th = $25**, 250 submissions, deadline 14 Nov. Judging: *"Depth of research,
clarity, honest reasons, creativity, visuals… Likes and reposts count, but
quality comes first."* → ~10% odds per entry, judged on craft, no audience
needed. Two hours per entry.

---

## Family D — Bug bounty (score-based, no audience, crypto payout)

Still the most reliable "real money, no audience" structure for a technical
person, and the payout rails are confirmed:
- **HackerOne**: USDC on Ethereum (or BTC) straight to your wallet, **$15
  minimum**, paid daily, 1–2 days after award. Gates: Veriff ID (**supports
  Palestinian ID**), a tax form, and a payout method. Programs advertising a
  "$50 minimum" exist. Low-severity findings average $173 on the platform.
- **HackenProof**: USDC on **Base**, **100 USDC minimum withdrawal**, ≤48
  business hours, **no KYC in most cases** (only EU tax residents, company
  request, or restricted programs). Has web/app scopes (CEX front-ends), not
  just Solidity — and the $100 floor means one accepted finding = instant
  payout. No tax-form or ID gate at all.
- Immufi/Code4rena for Solidity; **Sherlock excluded** ($250 stake).

---

## Family E — Things I checked and killed this round (so you don't)

- **RapidAPI** (the classic "publish an API, developers find it, you get paid"
  route): **"Rapid currently only pays out API providers via PayPal. Unfortunately,
  we cannot accommodate other payout methods."** 25% marketplace fee on top.
  Dead for you — which is exactly why the x402-native version (PayAPI Market)
  exists.
- **Every ad-based website / SEO / "AI website builder"**: needs either a paid
  domain + ad-network approval, or months of SEO, or an audience. Agreed with
  your other AI: dead end.
- **Plugin/app-store routes** (Chrome Web Store, VS Code, Figma, WordPress,
  Obsidian, Raycast, Unity, Fab, itch.io, App Store, Google Play): the store has
  standing search demand — that part is real — but the store pays you nothing
  and its own checkout is PayPal/Stripe, which you don't have. The only version
  that works is: use the store for *discovery*, and take crypto (x402) at your
  own endpoint. Same idea as Family A, one layer down.
- **Etsy / Gumroad / Envato / Creative Market / Adobe Stock / Shutterstock /
  Pond5 / KDP**: all settle through PayPal or Payoneer (unavailable), and all
  additionally need either an audience (KDP, print-on-demand) or months of
  catalogue volume to clear the first payout.
- **Bridges/links that would work if PayPal existed**: Payment Labs, Prize
  Payments — noted above as the wire-payout infrastructure behind scored
  competitions.
- **Prediction-market "market creation"**: creating a market is free, but the
  live bounty I checked requires a **$5 position** and 30% of its score is
  reach/engagement → excluded twice over.
- **Bandwidth/data-sharing, faucets, quizzes, airdrop farming, exchange bonuses,
  free-cloud-mining**: all dead or excluded already.

---

## What I still need from you (2 questions, and they change the ranking)

1. **Can you write code / ship a small service?** If yes, Family A (x402 API
   on PayAPI Market) becomes the best *long-run* answer and I'd give you a
   concrete build plan + a hosted free endpoint. If no, it's off the table and
   Families C + D + the score-based competitions are what you have.
2. **Do you have a Bank of Palestine Visa/Mastercard card** (even with a $0
   balance)? If yes, you can unlock free tiers (cloud, AI API quotas) that make
   Family A and the agent-work routes cost literally $0. If no, we plan around
   that.

## My current ranked answer for a first dollar, honestly

1. **Superteam Earn, Global content bounty** — ~10% per entry, $25 flat tier,
   no capital, days not months. Still the best odds of a *first* dollar.
2. **DeskCrew's x402 board** — 8¢ in, ~$0.85 out, but the board is empty today
   and needs a $0.10 float. Watch it, don't depend on it.
3. **HackenProof (web/app scope)** — no KYC, no tax form, $100 floor, one
   accepted finding = instant payout. Weeks of learning, but the cleanest rail.
4. **A scored competition (Kaggle/ARC and the same genre)** — no audience, no
   spend, wire payout, but confirm the payout route to your BOP account *first*.
5. **An x402-paid API (PayAPI Market)** — the only one on this list that is a
   *product* rather than a gig, 100% of revenue, no audience needed, no domain
   needed, no KYC. Slow to first call, but it compounds and nobody can take
   your audience from you because you never needed one.
