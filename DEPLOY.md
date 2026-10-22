# Deployment & go-live runbook

Everything below is ordered. Steps marked **[USER]** need a human click.

> **Status 22 Oct 2026: LIVE.** REST API on
> `https://arabic-pipeline.arabic-pipeline.workers.dev`, MCP server on
> `https://arabic-pipeline-mcp.arabic-pipeline.workers.dev`. PayAPI listing
> submitted, x402scan 5/5 registered, Coinbase's Bazaar validator accepts all
> five routes. See `HANDOFF.md` (round 7) for the two bugs that had to be
> fixed to get here, and `SCOREBOARD.md` for the 30-day plan.

---

## Phase 0 — already done (verified locally)

- [x] Toolchain: Node v22.23.2, npm 10.9.8, git 2.55.0 (identity: SkyPanther
      / skypantherr@hotmail.com), GitHub Desktop installed, no `gh` CLI, no Python.
- [x] Dependencies installed and pinned: `@x402/core` 2.28.0, `@x402/evm` 2.28.0,
      `@x402/hono` 2.28.0, `hono` 4.13.13, `wrangler` 4.151.3, `vitest` 5.0.5.
- [x] Code written: `src/index.ts` (Worker entry), `src/app.ts` (Hono app +
      x402 middleware + routes), `src/config.ts`, `src/lib/arabic.ts`,
      `src/lib/gemini.ts`, `src/lib/openapi.ts`.
- [x] `npm run typecheck` clean; `npm test` → **18/18 passing**.
- [x] The 402 challenge was inspected and is correct:
      `x402Version 2`, `scheme "exact"`, `network eip155:8453`,
      `asset 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (USDC on Base),
      `payTo 0x05523af5bd166816D1418Ebf7D6371e1fFB1D2e6`,
      `extra.name "USD Coin"`, atomic amounts (5000 = $0.005), and a base64
      `PAYMENT-REQUIRED` header. PayAPI's requirements (durable URL, price
      matching the live 402, `extra.name = "USD Coin"`) are all satisfied.
- [x] Gemini key verified live: `gemini-3.5-transcribe` responds,
      `gemini-3.6-flash` honours JSON response-schema mode.
- [x] `.dev.vars` created (git-ignored) with `GEMINI_API_KEY`; `.dev.vars.example`
      is the committed template.

> **Key rotation status:** the user has created a new key in Google AI
> Studio but has **not yet installed it**. The live Worker still holds the
> old key, which was pasted into a chat and should be treated as public.
> Rotation is done by the user in their own terminal via
> `node scripts/set-gemini-key.mjs --deploy` (the key never enters the
> agent's chat context), then the old key is deleted in AI Studio. Order
> matters: install new → verify → delete old, so the model-backed routes
> never go dark.

---

## Phase 1 — free integration checks (no funds, no faucet)

**Skip the testnet.** Testnet faucets now demand mainnet ETH, and it turns out
you don't need testnet at all: the facilitator sponsors gas, so the buyer only
ever needs a tiny bit of **USDC** and never any ETH.

These checks cost $0 and cover most of the risk:

1. `curl https://x402.dexter.cash/supported` → confirms the facilitator is
   live and advertises **Base mainnet (`eip155:8453`) + scheme `exact` +
   `extra.name "USD Coin"`**, with `minPaymentAmountAtomic: 1402` ($0.0014
   floor — all four of our prices, from $0.002 up, clear it),
   `assetTransferMethod: "permit2"` and `gasSponsored: true` (the buyer needs
   no ETH). Extensions include `bazaar`.
   **Already verified on 22 Oct 2026 — free to re-run any time.**
2. `npm test` → 18/18 green (the 402 challenge is asserted field-by-field, so
   the wire format is already proven).
3. `node scripts/check-gemini.mjs` → live Gemini check (key + both models).
4. After deploying: `GET /`, `GET /health`, `GET /openapi.json` are free and
   prove the Worker is live.

**The only step that needs money** is one real payment to prove settlement.
Its source is PayAPI's own canary: when the listing is approved, PayAPI pays
one call to the listed route (cap $0.10) from their wallet, and the
settlement receipt becomes the listing's badge. We do not need to hold any
USDC ourselves to prove the service works.

A testnet rehearsal is optional and not required.

---

## Phase 2 — mainnet deploy

6. **[USER]** Authenticate Cloudflare — pick one:
   - **Browser OAuth (simplest):** `npm run login` opens a tab, you click
     "Allow", and wrangler stores a token on this machine so later deploys need
     no browser. One click, full account access.
   - **API token (no browser loop):** Cloudflare dashboard → My Profile → API
     Tokens → Create Token → template **"Edit Cloudflare Workers"** → copy the
     token; also copy your **Account ID** (Workers & Pages overview). Then set
     `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment and
     `wrangler deploy` works headlessly. The token needs
     *Account → Workers Scripts: Edit*.
7. **Gemini key (production secret).** The key was pasted into chat in an
   earlier session, so it should be treated as public and rotated. The user
   creates the new key themselves in Google AI Studio; **the key is never
   pasted into a chat with the agent.** Run this in your own terminal, in the
   project folder:

   ```bash
   node scripts/set-gemini-key.mjs --deploy
   ```

   It prompts for the key with echo off, writes it to `.dev.vars`
   (git-ignored), and pipes it into `wrangler secret put GEMINI_API_KEY`.
   Without `--deploy` it only writes the local `.dev.vars`.
   To update the MCP Worker as well: `npx wrangler deploy -c wrangler.mcp.toml`.

   **Then revoke the old key** in Google AI Studio (AI Studio → API Keys →
   the old key → ⋮ → Delete). Order matters: install the new key first
   (above), then delete the old one, so the two model-backed routes never go
   dark. Re-run `node scripts/check-gemini.mjs` to confirm the new key works.
8. `npm run deploy` → gives the `https://arabic-pipeline.<sub>.workers.dev` URL.
   The MCP server is a **second Worker** with its own config file:
   `npx wrangler deploy -c wrangler.mcp.toml`.
9. Sanity checks against the live URL:
   - `GET /` → service info (200).
   - `GET /openapi.json` → spec (200).
   - `GET /health` → 200.
   - `POST /text/normalize` without payment → 402 with the correct challenge.
   - `POST /text/normalize` with a real payment → 200 + a BaseScan receipt
     landing in `0x05523af5bd166816D1418Ebf7D6371e1fFB1D2e6`.

### ⚠ Two things that break paid routes on Workers (both fixed here)

Do not reintroduce either. Both produced the *same* symptom — paid requests
hanging instead of returning 402 — so read the fix before changing
`src/app.ts` or `src/index.ts`.

1. **Never let the SDK validate a Bazaar declaration.** Declaring
   `extensions.bazaar` on a route makes the SDK validate it with Ajv, which
   compiles JSON Schema via `new Function` — forbidden on Workers. The failure
   happens inside the request path, so the isolate dies mid-request. The fix
   in `src/app.ts`: build the routes *without* `extensions`, register
   `bazaarResourceServerExtension` on the resource server ourselves, and only
   then attach the declaration to the route configs. There is no
   `unsafe_eval` compatibility flag to fall back on — the API rejects it.
2. **Do not let a paid request wait on a cold facilitator handshake.** The
   middleware awaits `initialize()` (a `/supported` fetch) before answering
   the first paid request of an isolate, and the SDK retries a throttled
   handshake with exponential backoff — ~7s of dead time for the buyer.
   `src/lib/facilitator.ts` caches the handshake at the edge (15 min, keyed on
   our own origin because the Cache API only stores same-zone entries).

**Measurement trap:** this sandbox reaches the internet through a
TLS-intercepting proxy, so a few percent of local `fetch` calls hang for
reasons that have nothing to do with the Worker. Confirm any suspected Worker
hang **from inside Cloudflare** (probe the production URL from a throwaway
Worker) before changing Worker code.

## Phase 3 — publish the listing (this is what makes agents find you)

10. **PayAPI Market** — `https://payapi.market/list`
    - Form: name, email (`skypantherr@hotmail.com`), optional company.
    - Give: the live `*.workers.dev` URL, the paid route, **your Base USDC
      wallet** (`0x05523af5...`), and the price that matches the live 402.
    - They run a **$0.10 canary call** and, if it returns real product and the
      money landed on your wallet, the listing goes live with a
      settlement-verified badge (on-chain receipt).
    - Rejections to avoid: ephemeral hosts (trycloudflare/ngrok/sslip/zrok — a
      `*.workers.dev` URL is durable and fine), prepaid credits instead of
      per-call x402, a `payTo` that isn't the wallet on the form, duplicate
      product listings.
    - **Done 22 Oct 2026**: listing submitted; the canary is PayAPI's side of
      the deal and runs on their review schedule (they say within 24h). The
      receipt hash appears on the listing once it goes live.
11. **Official MCP registry** — publish the MCP server (see Phase 4). 486 of
    PayAPI's 832 listings expose an MCP endpoint; that is how Claude Desktop,
    Cursor and agent runtimes actually call tools.
    - `server.json` is written and **validates** (`mcp-publisher validate`).
    - Publishing needs a GitHub device-code login:
      `mcp-publisher login github` → open `https://github.com/login/device` →
      enter the code → authorize → `mcp-publisher publish server.json`.
    - The CLI is a GitHub release binary, not an npm package:
      `https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_windows_amd64.tar.gz`.
    - The registry verifies you control the **namespace** in `name`
      (`io.github.skypantherr/arabic-pipeline` under GitHub auth). It does not
      verify the remote URL.
    - **Done 22 Oct 2026**: published as `io.github.skypantherr/arabic-pipeline`
      v0.1.0, status `active`. Verify with
      `GET https://registry.modelcontextprotocol.io/v0/servers?search=arabic-pipeline`.
12. **x402scan registry** — `https://www.x402scan.com/resources/register`
    (free, wallet auth). Bonus: x402scan is the explorer that indexes calls and
    revenue, so the listing becomes observable — you can see your own calls and
    earnings there.
13. **Coinbase x402 Bazaar** — discovery layer for agents:
    `https://docs.cdp.coinbase.com/x402/seller/get-discovered`.
    - Validate (no API key needed):
      `POST https://api.cdp.coinbase.com/platform/v2/x402/validate`
      with `{"resource":"<paid route URL>","method":"POST"}`.
    - **Done 22 Oct 2026**: all five routes return `valid: true` /
      `simulation.outcome: "accepted"` with a populated `bazaarExtension`.
    - Actual indexing happens on a **settled payment through the CDP
      Facilitator**; dexter.cash is the facilitator in use here, so indexing
      there is not automatic.
14. **MCP server** — add it with the official package (`@x402/mcp`); wrap the
    same four handlers as tools. Name it `io.github.skypantherr/arabic-pipeline`.
    Put `url https://payapi.market/mcp` in the README (done) and in the MCP
    server description so agents know where to search.
    - **Done 22 Oct 2026**: `https://arabic-pipeline-mcp.arabic-pipeline.workers.dev/`
      (streamable HTTP), 4 tools, each behind its own x402 payment.
15. **GitHub** — create the repo (`skypantherr/arabic-pipeline`) and push. GitHub
    Desktop is installed and signed in; the `gh` CLI is not.
    - The repo URL in `server.json` should point at a real public repo.

## Phase 4 — the 30-day test

16. Measure weekly: calls, unique buyers, revenue per call (x402scan dashboard +
   your own facilitator receipts).
    - **Success bar:** 10 buyers × 500 calls × $0.02 ≈ **$100/month**.
      (Context: top services in this market have 100–700 buyers; the average
      seller earns ≈ $39/month.)
    - **Kill criterion:** 0 calls in 30 days → the Arabic buyer pool doesn't
      exist yet. Repoint the *same engine* at a proven-thin class (regulatory /
      filings data, or enrichment/people data) instead of starting over.
    - **Second kill criterion:** calls happen but revenue per call < 20% of list
      price → reprice or re-scope.
17. Do not build a second service until the first has one paying caller.

## Phase 5 — keep the fast lane running

The x402 build is the compounding lane; the **fastest first dollar** is still
the bounty lane, and it costs nothing:

- **Superteam Earn** — filter **Region = Global** → Content. A live example:
  $500 pool, **$25 each for ranks 4–25 of ~250 entries** (~10% per entry),
  judged on writing quality, external sponsor → paid to your wallet, no KYC.
- **DeskCrew x402 paid-answer board** — $0.08 to enter, ~$0.85 back on a win,
  ~17% per attempt (their published data). Board was empty on 22 Oct 2026 —
  check it, don't depend on it.
- **Bug bounty** — HackerOne pays USDC straight to a wallet ($15 floor, daily
  payouts, Veriff accepts Palestinian ID); HackenProof pays USDC on Base
  (100 USDC floor, ≤48h, no KYC in most cases) and has web/app scopes.
