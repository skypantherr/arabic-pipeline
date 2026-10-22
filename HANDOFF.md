# HANDOFF

> **Folder renamed** `New folder` → `The402` → **`x402-arabic-pipeline`**.
> **A fresh session is starting to do the remaining work.** That session should
> read **`START-HERE.md`** (brief) and **`DEPLOY.md`** (runbook) first. This file
> is the running log; `START-HERE.md` is the brief.
>
> **State: the service is BUILT and VERIFIED LOCALLY (18/18 tests, typecheck
> clean, 402 challenge field-by-field verified, Gemini models live-verified, git
> committed). Remaining: deploy → testnet payment proof → mainnet → publish
> listings + MCP server → 30-day measurement → fast lane in parallel.**

## Round 6 — setup session (this one): what was actually built and verified
- **Toolchain verified:** Node v22.23.2, npm 10.9.8, git 2.55.0 (identity
  `SkyPanther / skypantherr@hotmail.com`), GitHub Desktop signed in as
  `skypantherr`, **no `gh` CLI**, **no Python** → TypeScript only.
- **Deps installed + pinned:** `@x402/core` 2.28.0, `@x402/evm` 2.28.0,
  `@x402/hono` 2.28.0, `hono` 4.13.13, `zod` ^3.25, `wrangler` 4.151.3,
  `vitest` 5.0.5, `typescript` ^5.9, `@cloudflare/workers-types` ^5,
  `@types/node` ^22.12. (Peer pins: vitest 5 needs @types/node >=22.12;
  wrangler 4.151.3 needs workers-types ^5. First install failed twice on these
  two peer constraints — that's why the versions are what they are.)
- **Corrections to the round-5 brief (verified against the official SDK/repo):**
  the x402 repo moved to **x402-foundation/x402**; the modern SDK is
  **`@x402/*` v2.28.0** (the `x402`/`x402-express` 1.2.0 packages are legacy
  v1); middleware = `paymentMiddleware(routes, server)` + `x402ResourceServer
  (facilitator).register(network, new ExactEvmScheme())`; **the 402 challenge
  lives in the base64 `PAYMENT-REQUIRED` header, not the body** (body defaults
  to `{}`; we set `unpaidResponseBody` and it must return an **object**, not a
  JSON string); challenge fields = `x402Version 2`, `accepts[0]{scheme,network,
  amount(atomic string),asset,payTo,maxTimeoutSeconds,extra{name,version}}`;
  buyer retries with `PAYMENT-SIGNATURE`, server replies `PAYMENT-RESPONSE`.
  `RouteConfig.accepts` is required; `network` is typed `` `${string}:${string}` ``.
- **Facilitator:** `https://x402.dexter.cash` (free, no account, no fee, Base +
  10 EVM + Solana). Testnet: `https://x402.org/facilitator` (SDK default, dev
  only). USDC/Base `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; the SDK fills
  `extra.name = "USD Coin"` (PayAPI's hard requirement) automatically.
- **Gemini:** key works. `gemini-3.5-transcribe` live-verified;
  `gemini-3.6-flash` live-verified incl. JSON response-schema mode. Key is in
  `.dev.vars` (git-ignored) — **the user must rotate it** (it was pasted in
  chat) and set it via `wrangler secret put`.
- **Built:** `src/{index,app,config}.ts`, `src/lib/{arabic,gemini,openapi}.ts`,
  `test/{arabic,protocol}.test.ts`, `README.md` (with the required
  `url https://payapi.market/mcp` line), `DEPLOY.md` (runbook), `wrangler.toml`,
  `tsconfig.json`, `.dev.vars.example`, `scripts/check-gemini.mjs`.
- **Verified 402 output:** scheme exact · network eip155:8453 · asset USDC/Base ·
  payTo 0x05523af5bd166816D1418Ebf7D6371e1fFB1D2e6 · extra.name "USD Coin" ·
  amounts 2000/5000/20000/30000 atomic · PAYMENT-REQUIRED header present ·
  CORS + OPTIONS 204 · free routes 200.
- **Bugs found and fixed by the tests** (worth remembering): `RegExp.test()`
  with a `/g` flag is stateful and silently skipped replacements — the Arabic
  normaliser was rewritten to be stateless; the 402 body callback must return an
  object; three test expectations were wrong, not the code (light mode keeps
  tashkeel by design; "بالعالم." counts as one word).
- **Git:** repo initialised, one commit, `.dev.vars` confirmed untracked.

## Project
Research task: find realistic ways for a person in the West Bank, Palestine with
$0, a Bank of Palestine USD (SWIFT) account and a Trust Wallet, to earn a first
$1–$100 online. Research phase complete → build phase: an x402 pay-per-call
API ("Arabic pipeline") that pays USDC on Base to the user's wallet.

## Deliverables
- `START-HERE.md` — **the build session's brief. Read this first.**
- `methods.md` — **current main answer** (round 3). Method families that don't
  need an audience: x402/PayAPI Market paid APIs, blind-scored competitions
  (Kaggle/ARC Prize 2026), machine-priced micro-work, bounty pools, bug bounty.
  Also lists what was killed and why.
- `first-dollar-playbook.md` — platform/rail analysis (still valid; corrections
  in `crevices.md`).
- `crevices.md` — round-2 framing + corrections (Binance P2P has no local rail;
  Daejin needs $5). Its "corridor" sections are now **out of scope**.

## User instructions to honour
- **No audience, no referrals, no social-media/audience-building, no surveys, no
  faucet claims, no play-to-earn, no airdrop farming, no bandwidth/compute
  sharing.** The user's stated reason (verified by their own testing across many
  platforms): either the platform doesn't serve people in Palestine, or it
  doesn't support a payment method they can use, or it takes days/weeks of
  on-screen time for cents with an unpredictable cash-out. **Never propose a
  method that needs any of these.**
- **Open question to resolve:** content bounties on Superteam Earn require a
  public X post (and the content is promotional copy for a token launch). The
  user has no social media and no audience, and does not want to "deal with
  other people". Ask whether the objection is (a) token promotion, (b) posting on
  X at all, or both — if (b), drop the content-bounty lane entirely and rely on
  the audience-free lanes (paid-answer board, bug bounty, the x402 API, blind
  scored competitions).
- **Never mention local / West Bank / Palestinian-counterparty mechanisms
  again.** Round 3 dropped the money-changer corridor, local cash desks and Gaza
  broker economics entirely. Don't reintroduce them.
- Don't use jargon like "crevice". Use plain names for method families.
- The user rejects "apply → do a task → get paid" listicles. They want
  *mechanisms* — especially ones where they *build/produce* something.
- Effort is fine. No audience, no upfront spend, no surveys/microtasks/AI
  training/play-to-earn/trading/client work remain hard bans.
- The user already knows the "build a website + AdSense" idea is a dead end
  (paid domain + traffic). Don't propose websites/SEO/ads again.

## Decisions and why (round 3)
1. **Dropped the corridor.** Per instruction, and it was the most complex and
   most legally exposed thing I'd proposed.
2. **Reframed "build something" as "build an API and sell it to machines."**
   The website idea failed on two counts (domain+AdSense, traffic); both are
   fixed by publishing an endpoint to an x402 marketplace: no domain, no ads,
   discovery by machine search, per-call USDC paid to a wallet.
3. **Ranked by (probability of first dollar) × (no-audience requirement) ×
   (uses their actual rails: wallet + SWIFT-receiving BOP account).**
4. **Kept verified-vs-estimated labels.** PayAPI's numbers are theirs; the EV
   arithmetic is labelled as mine.

## Key new findings (round 3) — do not re-research
- **PayAPI Market** (payapi.market, launched Apr 2026): x402 marketplace for
  agents. 832 APIs / 5,734 endpoints / 670 providers / 821 settlement-verified
  on Base. **Listing free, providers keep 100%**, USDC on Base (or Solana/
  Algorand), no account/API key for the buyer, no marketplace fee. Listing
  needs: durable URL (trycloudflare/ngrok/sslip/zrok are explicitly REJECTED),
  a paid route that 402s to **your Base USDC wallet**, price matching the live
  402, `extra.name` = "USD Coin". They run one **$0.10 canary call** themselves
  → live listing + settlement-verified badge (on-chain receipt). Form: name,
  email, optional company; "payout details come next, and they are optional"
  (no KYC/country restriction mentioned). **No developer needed** — their copy:
  domain experts (mortgage brokers, accountants, pharmacists…) can monetise
  knowledge as APIs. Their list examples: $0.001–$0.06/request.
  Discovery: payapi.market/mcp, /agent/search, /openapi.json, /.well-known/x402,
  official MCP Registry (market.payapi/marketplace), Coinbase x402 Bazaar
  (docs.cdp.coinbase.com/x402/seller/get-discovered), x402scan, the402.dev,
  endpoint.x402jp.com. Free durable hosting: Cloudflare Workers (*.workers.dev).
- **RapidAPI is dead for the user**: "Rapid currently only pays out API
  providers via PayPal. Unfortunately, we cannot accommodate other payout
  methods." + 25% marketplace fee.
- **ARC Prize 2026** ($2M total; ARC-AGI-2 track alone $700,000 = $275k
  Progress + $275k Innovation + $150k Bonus). Official Kaggle rules read:
  open worldwide (exclusions = Crimea/DNR/LNR, Cuba, Iran, North Korea, US
  sanctions — **Palestine not excluded**), 18+, "NO PURCHASE NECESSARY",
  winner determined "solely by the leaderboard ranking", open-source required,
  1 submission/day, teams ≤5. Timeline: submissions 2 Nov 2026, papers 8 Nov,
  results 4 Dec. **Payout risk:** foreign winners reported paid via **Payoneer**
  (unavailable to the user) → must confirm a SWIFT/wire route to BOP in writing
  before investing weeks; also prize clause "if a winner is located in a country
  where prizes cannot be awarded, then they are not eligible".
- **Payment Labs / prizepayments.com**: the wire-payout infrastructure behind
  scored competitions — 150+ currencies, 180+ countries, ACH/bank transfer,
  collects W-9/W-8, issues 1099/1042-S; case studies: esports (6,500 winners /
  52 countries), hackathons, chess, pitch competitions, "professional skills
  competitions". Confirms the "score-based competition paid by bank transfer"
  class is real and open to a SWIFT-receiving account.
- **DeskCrew x402** re-verified: board empty (0 open), lifetime $69.74/83
  payouts/30 wallets; 449 decided rows; 82% of $1 rows awarded, 4.7 entrants;
  decision median 23.8h / p90 202h; payout 0.37h; 85% agent share; ~$0.08 entry.

## Round 4 (AADS proposal reality-check) — see `aads-reality-check.md`
- **AADS = aads.com** (2011, oldest crypto ad network, rebrand Aug 2025, Hong
  Kong). Publishers paste one HTML iframe; 20% cut; **no KYC for ordinary use**,
  **no traffic minimum**, no approval queue, cookie-less/JS-less banners only.
  **Daily BTC payouts, 0.001 BTC on-chain minimum (= $84.53 at BTC $84,534.5 on
  22 Oct 2026) or ANY amount over Lightning with zero minimum.** 2,003
  publishers / 5,288 ad units / 452 campaigns / ~$100,257 per month publisher
  earnings (their public stats, 19 Oct 2026).
- **The proposal breaks in 3 places:** (1) AADS April-2026 terms require a
  **paid domain ≥3 months old and ban free subdomains** (Wix/Blogspot named;
  same rule at Slise) → "free *.pages.dev" is ineligible; (2) effective CPMs
  are "low single-digit cents" (own case studies: from $0.02) → $84.53 needs
  ~1.7M–4.2M impressions; network average publisher earns ~$50/month, skewed up
  by big sites; their own ad-unit estimator shows "Expected CPM ~ $NaN" for new
  sites; weakest bot protection in the field; verdict from adbench: "coffee
  money… a fallback layer for unsold inventory, not a primary revenue plan";
  (3) only 452 campaigns network-wide, advertisers are crypto/iGaming → a
  general Arabic utility's traffic gets no bids; and "Arabic = thin
  competition" is backwards for ads (saturated niche; thin competition → low
  search volume → low traffic → low revenue; ads reward volume of attention).
  Also: AADS traps — idle 6 months = account deleted with balance waived;
  address change = 3-business-day hold; fraud-flag recovery = 10% fee.
- **Rework kept in the file:** same build, swap monetization to x402 per-call
  USDC (PayAPI Market: free listing, 100% of revenue, $0.10 canary call,
  settlement-verified badge) and drop the domain requirement (Cloudflare
  Workers `*.workers.dev` is durable and not on PayAPI's blocklist). Keep AADS
  as optional backfill later, only for crypto-adjacent traffic, and never the
  premium placements (they need Sumsub KYC → freeze complaints).
- Bitcoin price check: BTC $84,534.5 (Coinbase spot API, 22 Oct 2026).

## Round 5 — concept explained + data-backed idea: see `the-idea.md`
- **Concept (for the user, who was confused twice):** x402 = the internet's
  unused "402 Payment Required" status. You build one small service that does
  one job; it answers with a price + your wallet; any program can pay it
  automatically and retry; the money lands in your wallet. No account for the
  buyer, no invoice, no middleman, no KYC. **Why it matters for this user:
  every normal marketplace routes money to a rich-country bank/PayPal, which is
  exactly the part that refuses them; x402 removes the payment layer.**
- **What the work is:** accounts (all free, no card): Trust Wallet Base USDC
  address, Cloudflare (Workers → durable *.workers.dev), email, optional
  GitHub, optional free model API key. Build: one Worker with all endpoints,
  x402 middleware (x402-express / x402 pkg), openapi.json with price declared,
  README containing `url https://payapi.market/mcp`, optional MCP server,
  listing forms. **I can write all the code**; user supplies the job decision,
  accounts, wallet address, and quality judgement.
- **Demand data (x402scan.com, 22 Oct 2026):** 30 days = 3.07M txns, $1.50M
  volume, 35.74K buyers, 38K sellers. 24h = 113.29K txns, $119.87K, 3.31K
  buyers, 2K sellers. **Average seller ≈ $39/month (my arithmetic) — brutal
  base rate; this is the key number.** Top services: aggregators (BlockRun
  116 models, $1.8–2.1K/mo), enrichment (StableEnrich 48.9K calls/344 buyers/
  $1.26K), web search/read ($0.001–0.01), on-chain data, regulatory filings,
  weather, **voice (dTelecom: 16.5K calls → $36.4K/mo = $2.20/call, 29 buyers —
  best per-call revenue in the ecosystem)**, agent infrastructure (BotPay 368
  buyers, X Pay $7.8K/mo/282, Claw402 186, Agent402 273). Modal transaction
  < $0.01; PayAPI median listed price $0.01. Base: 88,349 txns/$98.4K on Base
  vs 25,283/$21.7K on Solana (24h).
- **Supply is thinner than headline:** PayAPI shows "832 APIs" but in the 100
  unique listings I could pull (their API ignores `skip`, so 100-listing sample
  not full 832) the top providers are AutoScrape (38), PayAPI first-party (10),
  LoneStarOracle (6), then solo builders. **486/832 listings have MCP
  endpoints → publish as MCP, not just REST.** Voice/audio appeared once;
  Arabic/translation/OCR/RTL/Hijri zero times.
- **The recommended idea (`the-idea.md`):** "Arabic pipeline" — one Worker, one
  MCP server, 4 endpoints: /audio/transcribe ($0.02), /doc/extract ($0.03),
  /text/normalize ($0.005, pure code, zero cost), /text/metrics ($0.002, pure
  code, zero cost). Rationale: voice/language = highest price-per-call class,
  near-zero supply, user is inside the buyer population, no audience needed.
  List on PayAPI Market (they pay a $0.10 canary → settlement-verified badge),
  official MCP registry, x402scan registry (observable call/revenue stats),
  Coinbase Bazaar; host on Cloudflare Workers; USDC on Base to Trust Wallet.
- **Kill criteria (anti-trap):** test the class not the guess; 30 days; success
  = 10 buyers × 500 calls × $0.02 ≈ $100/mo; **0 calls in 30 days → pivot the
  same engine to a proven-thin class (regulatory/filings data, enrichment)**;
  don't build a second engine before the first has one paying caller.
- **Fast lane stays separate:** Superteam Global content bounty (10%/entry,
  $25), DeskCrew x402 paid-answer board (17%/attempt, $0.08→$0.85), bug bounty
  (HackerOne $15 floor USDC; HackenProof 100 USDC Base, no KYC in most cases).

## Still open — ask the user
1. Can they write code / ship a small service? (Decides whether PayAPI/x402
   Family A is the headline answer.)
2. Do they have a BOP Visa/Mastercard card (even $0 balance)? (Unlocks free
   cloud + AI API tiers so the agent/API routes cost $0.)
3. Which of: writing, coding, or domain/Arabic-language knowledge do they
   actually have? (Shapes which bounty or scored competition is realistic.)

## Tool notes
- The `websearch` tool became unreliable (returns "No search results found"
  for most queries). Workaround that works: **DuckDuckGo HTML in the browser**
  (`https://duckduckgo.com/html/?q=...` + extract `.result__a` texts/hrefs),
  plus direct `webfetch`, plus `execute`+`fetch` for JSON APIs, and
  `r.jina.ai/<url>` to read JS-heavy pages (Kaggle, ArcPrize).
- Browser `evaluate` wants `script:` (plain expression string works best).
- Superteam Earn live data: `earn.superteam.fun/api/listings/?take=200`
  (12 featured) + `.../api/listings/details/<slug>` (fields: region, rewards map
  where key "99" = flat amount for all remaining winners, `_count.Submission`).
- DeskCrew live data: `deskcrew.io/api/bounties` (economics), `/api/arena/contests`
  (open rows), `/api/arena/board` (leaderboard), `/api/arena/wallet/{addr}`,
  `/.well-known/x402` (payment terms/chains), `/llms.txt`.

## Verified facts worth not re-researching
- HackerOne: crypto payout = BTC or **USDC on Ethereum**, **$15 min**, daily
  11pm UTC, 1–2 days. Gates: Veriff ID (12-month validity), a payment method,
  and a tax form (W-8BEN). ID verification mandatory for paid programs since
  Aug 2026. Veriff **supports Palestine (State of)** + Arabic documents; no
  VPN during the session. Low-severity findings avg $173; some programs $50 min.
- HackenProof: USDC (**Base**, 95% of cases), **100 USDC min withdrawal**,
  ≤48 business hours, 2FA required, **KYC only for EU tax residents / company
  request / restricted programs**. Web+app programs (CEX front-ends) accessible
  without Solidity.
- Superteam Earn: 0% commission; external-sponsor listings pay the linked
  wallet (sponsor may ask for KYC); Superteam/Solana-sponsored listings need
  KYC + payment form, paid within 7 days.
- BOP: IBAN local 1700-150-150 / int 0097022946420; SWIFT PALSPS22.
- PayPal/Payoneer/Wise/Stripe exclude Palestinians; Bybit's fiat-restriction
  list names "Palestine (State of)" + "West Bank (Palestinian Territory)";
  Binance app-availability list omits Palestine and P2P has no local/ILS rail.
- Dead: Algora (Stripe), OnlyDust (winding down), Topcoder (Trolley bank),
  Honeygain ($20 PayPal floor), Packet Storm (domain parked), Sherlock
  ($250 stake), Opire (Stripe vs crypto conflicting), RapidAPI (PayPal only),
  exchange bonuses (deposit/trade gated), bandwidth-sharing/faucets/quizzes/
  airdrops (dead or excluded), free-cloud→mining (pennies/day).
- Trust Wallet: 100+ chains incl. Ethereum, BSC, Arbitrum, Base, Solana, TRON;
  USDC/USDT/DAI/USDA on Ethereum, BSC, Arbitrum, Base. Self-custody.

## If this session continues
- Get the answers to the 3 open questions before recommending a specific path.
- If they can code: build plan for an x402 endpoint on Cloudflare Workers →
  list on PayAPI Market (free) → also register in the official MCP Registry
  and Coinbase Bazaar. Niche suggestion: Arabic-language data/text utilities.
- If they can't code: lead with the Superteam Global content bounty (fastest
  $25) + DeskCrew x402 board, then HackenProof if they can do basic web testing.
- If they want scored competitions: tell them to email the organiser about a
  wire route to a Palestinian bank account BEFORE spending weeks on a track.
- Don't re-litigate PayPal/Payoneer/Wise/Stripe/Bybit/Binance. Don't mention
  local money changers. Don't propose websites/SEO/AdSense.
