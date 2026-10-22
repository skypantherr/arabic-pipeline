# START HERE — build session brief (22 Oct 2026)

Folder: `C:\Users\DVDSTORE\OneDrive\Desktop\x402-arabic-pipeline`
Read this file first, then `the-idea.md`, then `HANDOFF.md`.

---

## 0. PASTE THIS PROMPT INTO THE NEW SESSION

```
Working dir: C:\Users\DVDSTORE\OneDrive\Desktop\x402-arabic-pipeline

Read START-HERE.md first — it is the full brief with verified research, the
build spec, and my constraints. Then read the-idea.md and HANDOFF.md.

Job: build, deploy, and register a free, zero-cost x402 pay-per-call API
("Arabic pipeline") that pays USDC on Base to my Trust Wallet, and give me a
30-day measurement plan with kill criteria. Ask me for the checklist in
START-HERE.md §2 before you start — especially my Base USDC receive address.

Rules: no upfront spending by me; no websites/ads/SEO; no local or
Palestine-counterparty ideas; no re-litigating PayPal/Payoneer/Wise/Stripe;
be honest about odds rather than manufacturing certainty; verify anything you
claim; keep notes in HANDOFF.md.
```

---

## 1. The mission

Build one small serverless service — **"Arabic pipeline"** — that sells four
micro-capabilities per call, paid automatically in **USDC on Base** straight into
the user's Trust Wallet, with no account, no KYC, no card, no domain, and no
audience required.

The concept in one line: the internet has an unused "402 Payment Required"
status code; a service can answer a request with *"this costs 2 cents, pay to
wallet X"*, and any program can pay it automatically and retry. **A machine
buys the work at the door and the coin lands in the wallet.** Every normal
marketplace dies for this user at the payment layer (PayPal/Payoneer/Wise/Stripe
exclude Palestinians); x402 removes that layer.

Full reasoning and evidence: `the-idea.md`. Data: §6 below.

---

## 2. What the user must provide (ask for these, in this order)

### Required before anything can be paid out
1. **Trust Wallet "Base USDC" receive address** — a `0x…` EVM address. Public
   info, safe to paste. Ask for a **dedicated** address (not their main savings
   wallet) and remind them it will be published in a public `openapi.json` and
   in listings — that's fine, but it should be a dedicated address.
2. **The email address** to use for Cloudflare / GitHub / PayAPI / MCP registry
   / x402scan registrations.
3. **Confirmation of the endpoint set to launch first.** Recommendation:
   ship `text/normalize` + `text/metrics` first (both pure code, **$0 cost**,
   instant responses) to prove the payment path end-to-end, then add
   `audio/transcribe` + `doc/extract` (model-backed).
4. **Local tooling preference** — pick one:
   - (a) they install **Node 20+ and git** locally and we deploy with
     `wrangler` from a repo, or
   - (b) **no local installs** → I produce a single-file Worker they paste into
     the Cloudflare dashboard (works fine; less convenient iteration).
5. **Can they judge Arabic output quality?** (yes/no) — determines whether
   `audio/transcribe` and `doc/extract` can be QA'd by them or need a
   different acceptance test.

### Accounts to create (all free, no card) — walk them through it
6. **Cloudflare account** (free) — required for Workers.
7. **GitHub account** (free) — recommended: hosts the code publicly and is
   required-ish for publishing an MCP server (server name should be
   `io.github.<username>/arabic-pipeline`).
8. **Optional, only for the two model-backed endpoints:** a free API key from
   Google AI Studio (Gemini) or Groq, or Cloudflare Workers AI. Free tiers
   generally need no card. Not needed for endpoints 3-4.

### Never ask for, never accept
- Seed phrase or private key. If a key is ever needed to *generate* something,
  use the wallet UI or a fresh throwaway key the user creates themselves.
- Passwords or card numbers. Every account in this plan uses a passkey/Google
  login; the agent never needs the credential.

### Nice to have, not blocking
9. Whether they have a bank card available for optional paid tiers later
   (irrelevant until the endpoints 3-4 are earning).
10. Confirmation they'll run the **fast lane** (below) in parallel — it's their
    actual first-dollar plan.

---

## 3. Build spec

**Repo layout (suggested)**
```
arabic-pipeline/
  worker/            # the Cloudflare Worker: all endpoints + x402 wiring
    src/index.ts
    src/routes/{transcribe,extract,normalize,metrics}.ts
    src/lib/{x402.ts,arabic.ts,openapi.ts}
  openapi.json      # served at GET /openapi.json
  README.md         # includes: url https://payapi.market/mcp
  mcp/              # MCP server wrapping the same handlers
  test/             # local tests: 402 shape, price match, Arabic correctness
  DEPLOY.md
```

**The four endpoints (same engine, same spec, one MCP server)**

| Route | Job | Price | Cost to serve |
|---|---|---|---|
| `POST /audio/transcribe` | Arabic (or English) audio → clean text | **$0.02**/call | free model tier |
| `POST /doc/extract` | Arabic PDF/image → structured rows (receipts, invoices, IDs) | **$0.03**/call | free tier / local OCR |
| `POST /text/normalize` | Arabic text cleanup: tashkeel stripping, alef/ya/ta-marbuta unification, Arabic-Indic ↔ Western numerals, RTL-safe whitespace, search-form shaping | **$0.005**/call | **$0** (pure code) |
| `GET /text/metrics` | word/char counts, readability, keyword density, Arabic-vs-English detection | **$0.002**/call | **$0** (pure code) |

**x402 wiring** — use a maintained library, never hand-rolled crypto:
- Node/TS: `x402-express` (or the `@x402/*` family) — the server returns the
  402 challenge with `payTo` = the user's Base address, network
  `eip155:8453` (Base), asset = USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`),
  `extra.name` = **"USD Coin"** (PayAPI fails settlement otherwise), price mode
  `fixed`, currency `USD`.
- Python alternative: the `x402` package.
- The payment must land in the **user's Base address**. Confirm the challenge
  amount equals the price in the spec (PayAPI rejects a mismatch).

**OpenAPI requirements (from x402scan's discovery spec — agents read this)**
- Top-level: `openapi`, `info.title`, `info.x-guidance`, `info.version`, `paths`.
- For paid ops: `responses.402` **and** `x-payment-info`.
- `info.x-payment-info.protocols` = `[{ "x402": {} }]`; one pricing mode
  (`fixed` or `dynamic`) with `currency`.
- `price.amount` is decimal USD; runtime `accepts[].amount` is atomic units
  (USDC `0.01` → `"10000"`).
- `info.contact.email` — the user's email (lets them verify ownership of the
  origin and reach you).
- `info.x-guidance` — one plain sentence telling an agent which endpoint to call
  and with what.
- Use `security` + `components.securitySchemes` to declare auth (none needed).

**MCP server** — same four tools, names matching the routes, descriptions that
say what each does and what it costs. This is how agents actually find tools
(486 of PayAPI's 832 listings expose MCP endpoints).

**Hosting** — Cloudflare Workers, free tier, durable `*.workers.dev` URL.
**Do not use** trycloudflare / ngrok / sslip / zrok — PayAPI explicitly rejects
those hosts as ephemeral.

**README must contain** the line `url https://payapi.market/mcp` so agents
know where to search.

---

## 4. Registration payloads (all free, no KYC, no card)

1. **PayAPI Market** — `https://payapi.market/list`
   - Form: name, email, optional company. "Payout details come next, and they
     are optional." They then run **one $0.10 canary call** themselves; if the
     call returns real product and the money landed on the listed wallet, the
     listing goes live with a **settlement-verified badge** (on-chain receipt).
   - Their stated requirements: durable URL, the paid route, **a Base USDC
     wallet you control**, price matching the live 402, `extra.name` = "USD Coin".
   - Rejections to avoid: ephemeral hosts, prepaid credits instead of per-call
     x402, `payTo` ≠ the wallet on the form, duplicate product/sub-path listing.
2. **Official MCP registry** — publish the MCP server (name
   `io.github.<username>/arabic-pipeline`).
3. **x402scan registry** — `https://www.x402scan.com/resources/register` (free,
   SIWX wallet auth). Benefit: x402scan is the explorer that tracks calls and
   revenue, so the listing becomes *observable*.
4. **Coinbase x402 Bazaar** — discovery layer for agents
   (`docs.cdp.coinbase.com/x402/seller/get-discovered`).
5. Optionally the public search API the agents use: `payapi.market/agent/search?q=`
   and `/agent/list`.

---

## 5. Definition of done (the build session's checklist)

- [ ] Repo with Worker + `openapi.json` + README (+ MCP server) + tests.
- [ ] Deployed at a durable `*.workers.dev` URL.
- [ ] `GET /openapi.json` served and consistent with the runtime 402 challenge.
- [ ] **End-to-end money test:** the user calls their own paid endpoint, the 402
      challenge appears with their Base address, payment settles, the real
      answer comes back, and a receipt is visible on BaseScan.
- [ ] All four endpoints return correct Arabic output (unit tests + the user's
      own QA on samples).
- [ ] Listed on PayAPI Market (settlement-verified), MCP registry, x402scan
      registry, Coinbase Bazaar.
- [ ] A one-page "how to use + how to read your revenue" note for the user.
- [ ] 30-day measurement plan + kill criteria (below).
- [ ] `HANDOFF.md` updated with what was built, what broke, and what to check next.

---

## 6. Verified data (do not re-research)

**x402scan.com (fetched 22 Oct 2026)**
- 30 days: **3.07M transactions, $1.50M volume, 35.74K buyers, 38K sellers**.
- 24 hours: 113.29K txns, $119.87K, 3.31K buyers, 2K sellers.
- Chains (24h): Base 88,349 txns / $98.44K / 1,529 sellers / 3,146 buyers;
  Solana 25,283 / $21.69K / 117 sellers / 169 buyers.
- Facilitators (24h): Coinbase 77,760 txns; PayAI 23,256; FluxA 10,082 txns /
  $90.18K (high value per call); Dexter; Ultravioleta DAO; Primer; Meridian.
- Top 30-day services: BlockRun (Solana) $2.13K / 523K txns / 205 buyers;
  Claw402 $1.20K / 488K / 186; BlockRun $1.78K / 102K / 598; X Pay $7.80K /
  62K / 282; StableEnrich $1.26K / 48.9K / 344; OneShot $396 / 43.7K / 87;
  Cluster Protocol $32.9K / 39K / 721; BotPay $1.78K / 24.4K / 368;
  **dTelecom (WebRTC/STT/TTS) $36.39K / 16.5K / 29 = $2.20 per call** ← best
  per-call revenue in the ecosystem; Agent402 $275 / 13.4K / 273; OneShot
  pricing card: web search $0.001, web read $0.002, research $0.01, person
  profile $0.005, dossier $0.10, social accounts $0.50, voice call $0.35/min.
- **Average seller ≈ $39/month** ($1.5M ÷ 38K) — the base rate to be honest about.
- Modal transaction on the network: **under $0.01**.
- x402scan's own API (`/api/x402/*`) is itself x402-gated (~$0.01–0.02 per read).

**PayAPI Market (fetched 22 Oct 2026)**
- 832 listings, **821 settlement-verified**, 670 providers claimed, 46+
  distinct providers actually observed; 5,734 endpoints; 486 with MCP endpoints.
- Categories: Data, Finance, Intelligence, Tools, Verification. Price min
  $0.001, median $0.01, max $0.50. Discovery: `/agent/list`, `/agent/search?q=`,
  `/agent/get`, `/openapi.json`, `/.well-known/x402`, MCP at `/mcp`.
- Supply concentration: AutoScrape (38 listings), PayAPI first-party (10),
  LoneStarOracle (6), then solo builders. **The "832" is mostly a few bulk
  providers — you are not competing with 800 people.**
- In the 100 unique listings pullable (their API ignores `skip`, so this is a
  100-listing sample, not the full 832): voice/audio appeared **once**;
  Arabic, translation, OCR, RTL/bidi, Hijri appeared **zero** times.
- Listing requirements: durable URL; paid route 402s to **your Base USDC
  wallet**; price matches the live 402; `extra.name` = "USD Coin"; they pay a
  $0.10 canary; no KYC/country restriction mentioned; free listing; keep 100%.

**Other rails (verified earlier this session)**
- Trust Wallet: 100+ chains; USDC/USDT on Ethereum, Base, Solana, TRON, BSC,
  Arbitrum; self-custody.
- HackerOne: crypto payout = BTC or **USDC on Ethereum**, $15 min, daily 11pm
  UTC, 1–2 days. Gates: Veriff ID (**supports Palestine (State of)** + Arabic
  docs, no VPN), payment method, tax form (W-8BEN). ID verification mandatory
  for paid programs since Aug 2026. Low-severity findings avg $173.
- HackenProof: USDC **Base**, **100 USDC min withdrawal**, ≤48 business hours,
  2FA, **no KYC in most cases**; web/app scopes (CEX front-ends) as well as
  Solidity.
- Superteam Earn: filter **Region = Global**; external-sponsor listings pay the
  linked wallet (sponsor may ask KYC); Superteam-sponsored need KYC + payment
  form, paid within 7 days. Live example: "$CHIMP" thread, $500 pool, **$25 each
  for ranks 4–25 of ~250 entries**, judged on craft, deadline 14 Nov 2026.
- DeskCrew x402 paid-answer board: ~$0.08 to enter, 85% share; published odds
  82% of $1 rows awarded, 4.7 entrants/row (~17% per attempt), decision median
  23.8h, payout 0.37h after approval; **board empty at time of check**, lifetime
  $69.74 / 83 payouts / 30 wallets.
- BOP: IBAN local 1700-150-150, int 0097022946420; SWIFT `PALSPS22`.
- BTC spot 22 Oct 2026: $84,534.5.

---

## 7. The 30-day measurement plan and kill criteria

- **Ship 3–4 endpoints on ONE engine.** Don't build a second engine before the
  first has a single paying caller.
- **Weekly check (x402scan dashboard + your own facilitator receipts):** calls,
  unique buyers, revenue per call, and which endpoint gets called.
- **Success threshold (from the data):** 10 buyers × 500 calls × $0.02 ≈
  **$100/month**. Top services have 100–700 buyers; the average seller $39.
  Believe it at ~10 real buyers, not one lucky call.
- **Kill criterion: 0 calls in 30 days → the Arabic buyer pool doesn't exist
  yet.** Then repoint the **same engine** at a proven-thin class:
  regulatory/filings data (one supplier, sells well) or enrichment/people data
  (344 buyers at $1.26K/mo). The engine doesn't change; only the job does.
- **Second kill criterion:** if calls happen but revenue per call < 20% of list
  price, raise price or re-scope; the buyer isn't finding it useful.

---

## 8. The fast lane (keep running in parallel — this is the first-dollar plan)

The x402 build is the *compounding* lane with a $39/seller/month base rate. The
first dollar comes from the lanes with **published per-attempt odds**:
1. **Superteam Earn Global content bounty** — ~10% per entry, $25 per win, no
   capital, paid to wallet. Two entries ≈ 2 hours.
2. **DeskCrew x402 paid-answer board** — $0.08 in, ~$0.85 out, ~17% per attempt
   (needs a ~$0.10 float; board was empty — check it).
3. **Bug bounty** — HackerOne ($15 floor, USDC) / HackenProof (100 USDC Base,
   no KYC in most cases).

---

## 9. Dead ends (do not propose these again)

PayPal / Payoneer / Wise / Stripe / Revolut (exclude Palestinians) · Bybit
fiat/P2P (its restricted-issuing-countries list names "Palestine (State of)"
and "West Bank (Palestinian Territory)") · Binance (app list omits Palestine;
documented freezes/seizures of Palestinian-linked funds; P2P has no local/ILS
rail) · RapidAPI (PayPal-only provider payouts) · Algora (Stripe) · OnlyDust
(winding down) · Topcoder (Trolley bank) · Opire (Stripe vs crypto, conflicting
sources) · Honeygain ($20 PayPal floor) · Packet Storm (domain parked) ·
Sherlock ($250 stake) · Bitmedia/Coinzilla/Cointraffic (KYC or traffic floors) ·
exchange sign-up bonuses (deposit/trade-gated) · bandwidth sharing, faucets,
quizzes, airdrop farming, free-cloud-mining (dead or excluded) · websites +
AdSense + SEO (needs paid domain + traffic) · AADS ad lane (AADS bans free
subdomains and needs a 3-month-old paid domain; effective CPM is cents, so
$85 ≈ 1.7–4.2M impressions; average AADS publisher earns ~$50/month) · anything
local / involving Palestinian counterparties (explicitly ruled out by the user).

---

## 10. Folder contents

| File | What it is |
|---|---|
| `START-HERE.md` | this brief — read first |
| `the-idea.md` | the concept explained plainly + the work breakdown + the data + the idea + kill criteria |
| `methods.md` | method families that don't need an audience (x402 APIs, blind-scored competitions, machine-priced micro-work, bounty pools, bug bounty) |
| `aads-reality-check.md` | reality check on the "free utility tools + AADS" proposal (mostly a dead end) |
| `first-dollar-playbook.md` | platform/rail analysis: which payment rails work for a Palestinian, which don't |
| `crevices.md` | earlier framing + corrections (Binance P2P has no local rail; Daejin needs a $5 position). Its local/corridor sections are **out of scope** |
| `HANDOFF.md` | running notes, decisions and why, per-session state |
