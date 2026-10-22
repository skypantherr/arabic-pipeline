# START HERE — build session brief (updated 22 Oct 2026, after setup)

Folder: `C:\Users\DVDSTORE\OneDrive\Desktop\x402-arabic-pipeline`
Read this file, then `DEPLOY.md` (the runbook), then `the-idea.md` (why this
product) and `HANDOFF.md` (running log).

**Status: the service is BUILT and VERIFIED LOCALLY. The remaining work is
deploy → prove a real payment → publish the listing → measure for 30 days.**

---

## 0. PASTE THIS PROMPT INTO THE NEW SESSION

```
Working dir: C:\Users\DVDSTORE\OneDrive\Desktop\x402-arabic-pipeline

Read START-HERE.md, then DEPLOY.md — they are the brief and the runbook.

The x402 service is already written and tested (18/18 passing, typecheck clean).
Your job is the remaining half:
 1. deploy it (wrangler login + secret + deploy) — my Cloudflare login is
    skypantherr@hotmail.com and needs one browser approval;
 2. prove a real end-to-end payment on testnet, then mainnet;
 3. publish the listing (PayAPI Market, MCP registry, x402scan, Coinbase Bazaar)
    and add the MCP server;
 4. give me the 30-day scoreboard + kill criteria;
 5. keep the fast lane (bounty) running in parallel.

Ask me before anything that spends money or needs my click. Never ask me for my
seed phrase or private key. Rotate the Gemini key first — the current one was
pasted in chat.

Rules: no websites/ads/SEO; no local or Palestine-counterparty ideas; no
re-litigating PayPal/Payoneer/Wise/Stripe; be honest about odds; verify claims;
keep notes in HANDOFF.md.
```

---

## 1. What was already done (don't redo it)

**Environment (checked):** Node v22.23.2, npm 10.9.8, git 2.55.0 with identity
`SkyPanther / skypantherr@hotmail.com`, GitHub Desktop installed and signed in
(user `skypantherr`), **no `gh` CLI**, **no Python** (hence TypeScript only).

**Dependencies, pinned and installed:** `@x402/core` 2.28.0, `@x402/evm` 2.28.0,
`@x402/hono` 2.28.0, `hono` 4.13.13, `zod` ^3.25, `wrangler` 4.151.3,
`vitest` 5.0.5, `typescript` ^5.9, `@cloudflare/workers-types` ^5, `@types/node`
^22.12. (Peer-dep pin notes: vitest 5 needs `@types/node` >=22.12; wrangler
4.151.3 needs `workers-types` ^5.)

**API facts that were wrong in the earlier brief — corrected here (verified
against the official SDK/repo, 22 Oct 2026):**
- The x402 repo moved to **x402-foundation/x402** (coinbase/x402 is a dev fork).
  The modern SDK is **`@x402/*` v2.28.0**; the old `x402` / `x402-express` 1.2.0
  packages are legacy v1.
- The payment middleware is `paymentMiddleware(routes, server)` from
  `@x402/hono`, with `new x402ResourceServer(facilitatorClient).register(network,
  new ExactEvmScheme())` from `@x402/evm/exact/server`.
- **The 402 challenge lives in the `PAYMENT-REQUIRED` response header (base64
  JSON), not in the body.** The body is `{}` by default; we set a helpful
  `unpaidResponseBody`. Always decode the header when asserting.
- The challenge fields are: `x402Version: 2`, `accepts[0] = { scheme:"exact",
  network, amount (atomic units, string), asset, payTo, maxTimeoutSeconds,
  extra:{name,version} }`. The buyer retries with the `PAYMENT-SIGNATURE` header;
  the server returns `PAYMENT-RESPONSE`.
- `RouteConfig` requires `accepts: PaymentOption | PaymentOption[]`; `network` is
  typed as `` `${string}:${string}` `` so it needs a cast.

**Live data captured (not re-research):**
- Facilitator: **`https://x402.dexter.cash`** — free, no account, no fee, Base +
  10 EVM chains + Solana (Base mainnet route). Testnet alternative:
  `https://x402.org/facilitator` (the SDK default; dev/testnet only).
- USDC on Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; the SDK fills
  `extra.name = "USD Coin"` automatically (PayAPI's hard requirement).
- Gemini key works. Available models include `gemini-3.5-transcribe` (verified
  live), `gemini-3.6-flash` (verified live, JSON-schema mode works),
  `gemini-3.8-flash`, `gemini-2.5-flash`, `gemini-3.8-flash-tts`.

**Verified 402 output of our service (from the test suite):**
`x402Version 2` · `scheme "exact"` · `network "eip155:8453"` ·
`asset 0x833589fCD…2913` (USDC/Base) ·
`payTo 0x05523af5bd166816D1418Ebf7D6371e1fFB1D2e6` ·
`extra.name "USD Coin"` · amounts atomic: 2000 ($0.002), 5000 ($0.005),
20000 ($0.02), 30000 ($0.03) · base64 `PAYMENT-REQUIRED` header present ·
CORS + preflight (204) working.

**Tests:** `npm test` → 18/18 pass. `npm run typecheck` → clean.
`node scripts/check-gemini.mjs` → live Gemini check (key + both models).

**Git:** repo initialised, one commit, `.dev.vars` correctly **not** tracked.

---

## 2. What the user already gave you (don't ask again)

| Item | Value |
|---|---|
| Trust Wallet Base USDC receive address | `0x05523af5bd166816D1418Ebf7D6371e1fFB1D2e6` |
| Email (accounts, listings, contact) | `skypantherr@hotmail.com` |
| GitHub user | `skypantherr` (signed in in browser + GitHub Desktop) |
| Cloudflare account | created with the same email — needs one `wrangler login` approval |
| Gemini API key | in `.dev.vars` (git-ignored). **Rotate it** — it was pasted in chat |
| Arabic QA | the user is a native Arabic speaker and will QA outputs |
| Card | **not to be used** — no card-gated services, no paid tiers |
| Endpoints to ship | approved: `text/normalize` + `text/metrics` first, then the two model-backed ones |
| Local tooling | node + git present; GitHub Desktop for pushing (no `gh` CLI) |

**Still needs the user (one click each):** `wrangler login` (Cloudflare OAuth),
the rotated Gemini key via `npm run secret`, a throwaway testnet wallet for the
testnet payment test, and a push to a new GitHub repo.

---

## 3. The service as built (reference — change only if you have a reason)

```
src/index.ts        Worker entry; lazy-cached facilitator client + Hono app
src/app.ts          Hono app, CORS, x402 middleware, all routes
src/config.ts       env config, price table, facilitator defaults
src/lib/arabic.ts   normalizeArabic() + textMetrics() — pure code, $0 to serve
src/lib/gemini.ts   transcribeAudio() + extractDocument() (JSON schema mode)
src/lib/openapi.ts  OpenAPI 3.1 with per-operation x-payment-info
test/arabic.test.ts unit tests for the text utilities
test/protocol.test.ts  402 challenge, pricing, CORS, OpenAPI shape
```

**Routes and prices**

| Route | Price | Cost to serve |
|---|---|---|
| `GET /text/metrics` · `POST /text/metrics` | $0.002 | $0 |
| `POST /text/normalize` | $0.005 | $0 |
| `POST /audio/transcribe` | $0.02 | model call |
| `POST /doc/extract` | $0.03 | model call |

Free routes: `GET /`, `GET /health`, `GET /openapi.json`.

`POST /text/normalize` takes `{ text, mode?: "light"|"search"|"index" }`.
`light` = whitespace/digit/bidi cleanup only; `search` = + tashkeel removal +
letter folding; `index` = + punctuation stripped (dedup/index key).

**Notes for whoever extends it**
- `src/lib/arabic.ts` deliberately avoids `RegExp.test()` with a `/g` flag to
  gate a `replace()` — `test()` advances `lastIndex` and silently skips work.
- The 402 body is custom via `unpaidResponseBody`; it must return
  `{ contentType, body }` where `body` is an **object**, not a JSON string.
- `wrangler.toml` holds `[vars]`; secrets go through `wrangler secret put`.
- `nodejs_compat` is enabled in `compatibility_flags` for viem/SDK compatibility.

---

## 4. Remaining work (in order) — full detail in `DEPLOY.md`

1. **Rotate the Gemini key** (revoke the pasted one in AI Studio, make a new
   one, put it in `.dev.vars` and `npm run secret`).
2. **Testnet end-to-end** (free): throwaway wallet + Base Sepolia faucet funds,
   `X402_NETWORK=eip155:84532`, `https://x402.org/facilitator`, official
   `@x402/fetch` + `@x402/evm` client → 402 → sign → retry → 200 + receipt on
   BaseScan. **Verify the Base Sepolia USDC address before use.**
3. **Mainnet deploy**: `npm run login` → `npm run secret` → `npm run deploy`.
   Then the live checklist (free routes, 402, one real $0.01 payment, receipt
   into the user's address). The buyer needs **$0.01 USDC**; the first bounty
   payout covers it.
4. **Publish**: PayAPI Market form (they run a $0.10 canary → settlement-verified
   badge), official MCP registry, x402scan registry, Coinbase Bazaar. Add the
   **MCP server** with `@x402/mcp` (name `io.github.skypantherr/arabic-pipeline`).
   486 of PayAPI's 832 listings expose MCP endpoints — that's the real
   discovery channel. README already contains the required
   `url https://payapi.market/mcp` line.
5. **Push to GitHub** (`skypantherr/arabic-pipeline`) via GitHub Desktop.
6. **30-day scoreboard**: calls, unique buyers, revenue per call.
   Success = 10 buyers × 500 calls × $0.02 ≈ $100/month. Kill = 0 calls in 30
   days → repoint the same engine at a proven-thin class (regulatory/filings
   data, or enrichment/people data) rather than starting over. Never build a
   second service before the first has one paying caller.
7. **Fast lane in parallel** (see §7) — that is the first-dollar plan.

---

## 5. Definition of done (updated)

- [x] Repo, pinned deps, toolchain verified
- [x] Worker + x402 middleware + 4 paid routes + OpenAPI + README + tests
- [x] 402 challenge verified field-by-field (asset, extra.name, payTo, amounts)
- [x] Gemini models verified live
- [x] Git initialised, secrets excluded
- [ ] Testnet payment round-trip proven (receipt on BaseScan)
- [ ] Mainnet deployed to a `*.workers.dev` URL, health + 402 + one real payment checked
- [ ] Listed on PayAPI Market (settlement-verified), MCP registry, x402scan, Bazaar
- [ ] MCP server published
- [ ] Pushed to GitHub
- [ ] 30-day measurement plan + kill criteria handed to the user
- [ ] `HANDOFF.md` updated

---

## 6. Verified market data (do not re-research)

**x402scan.com (22 Oct 2026).** 30 days: **3.07M transactions, $1.50M volume,
35.74K buyers, 38K sellers**. 24 hours: 113.29K txns, $119.87K, 3.31K buyers,
2K sellers. **Average seller ≈ $39/month** ($1.5M ÷ 38K) — the base rate to be
honest about. Chains (24h): Base 88,349 txns / $98.44K / 1,529 sellers / 3,146
buyers; Solana 25,283 / $21.69K. Facilitators (24h): Coinbase 77,760 txns;
PayAI 23,256; FluxA 10,082 txns / $90.18K; Dexter; Ultravioleta DAO; Primer;
Meridian. Top services (30d): BlockRun (Solana) $2.13K / 523K calls / 205
buyers; Claw402 $1.20K / 488K / 186; X Pay $7.80K / 62K / 282; StableEnrich
$1.26K / 48.9K / 344; OneShot $396 / 43.7K / 87; Cluster Protocol $32.9K / 39K /
721; BotPay $1.78K / 24.4K / 368; **dTelecom (WebRTC/STT/TTS) $36.39K / 16.5K /
29 = $2.20 per call** ← best per-call revenue in the ecosystem; Agent402 273
buyers. Modal transaction on the network: **under $0.01**. PayAPI median listed
price: $0.01.

**Supply gaps.** PayAPI shows "832 APIs / 821 settlement-verified / 670
providers" but supply is concentrated: in the 100 unique listings pullable
(their API ignores `skip`), AutoScrape has 38, PayAPI's own first-party 10,
LoneStarOracle 6, then solo builders. **Voice/audio appeared once; Arabic,
translation, OCR, RTL and Hijri appeared zero times.**

**Other rails (verified earlier).** HackerOne: USDC on **Ethereum**, $15 min,
daily 11pm UTC, 1–2 days; gates = Veriff ID (**supports Palestine + Arabic
docs**, no VPN), payment method, tax form. HackenProof: USDC **Base**, 100 USDC
min, ≤48 business hours, 2FA, **no KYC in most cases**; web/app scopes.
Superteam Earn: **Region = Global**; external-sponsor listings pay the linked
wallet; live example "$CHIMP" thread, $500 pool, **$25 each for ranks 4–25 of
~250 entries**, deadline 14 Nov 2026. DeskCrew x402 board: $0.08 to enter, 85%
share, 82% of $1 rows awarded, 4.7 entrants (~17%/attempt), board empty at time
of check, lifetime $69.74 / 30 wallets. BTC spot 22 Oct 2026: $84,534.5.

---

## 7. Dead ends (do not propose these again)

PayPal / Payoneer / Wise / Stripe / Revolut (exclude Palestinians) · Bybit
fiat/P2P (its restricted-issuing-countries list names "Palestine (State of)"
and "West Bank (Palestinian Territory)") · Binance (app list omits Palestine;
documented freezes/seizures of Palestinian-linked funds; P2P has no local/ILS
rail) · RapidAPI (PayPal-only provider payouts) · Algora (Stripe) · OnlyDust
(winding down) · Topcoder (Trolley bank) · Opire (Stripe vs crypto, conflicting
sources) · Honeygain ($20 PayPal floor) · Packet Storm (domain parked) ·
Sherlock ($250 stake) · exchange sign-up bonuses (deposit/trade-gated) ·
bandwidth sharing, faucets, quizzes, airdrop farming, free-cloud-mining (dead or
excluded) · websites + AdSense + SEO (needs paid domain + traffic) · the AADS ad
lane (bans free subdomains, needs a 3-month-old paid domain, cents-level CPM,
~$50/month average publisher) · anything local / involving Palestinian
counterparties (explicitly ruled out) · card-gated services (the user has a debt
card and won't use it).

---

## 8. Folder contents

| File | What it is |
|---|---|
| `START-HERE.md` | this brief — read first |
| `DEPLOY.md` | the runbook: testnet → mainnet → listings → 30-day plan |
| `README.md` | public service README (contains the required discovery line) |
| `src/`, `test/` | the service and its tests |
| `the-idea.md` | the concept explained plainly + the data + the idea + kill criteria |
| `methods.md` | method families that don't need an audience |
| `aads-reality-check.md` | reality check on the "free utility tools + AADS" idea |
| `first-dollar-playbook.md` | payment-rail analysis for a Palestinian (what works, what doesn't) |
| `crevices.md` | earlier framing + corrections; corridor sections out of scope |
| `HANDOFF.md` | running notes, decisions and why |
