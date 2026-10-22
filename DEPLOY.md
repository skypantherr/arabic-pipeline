# Deployment & go-live runbook

Everything below is ordered. Steps marked **[USER]** need a human click.

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

> **Do this before going live:** the Gemini key was pasted into a chat, so treat
> it as public. Revoke it in Google AI Studio, create a fresh key, and put the
> new one in `.dev.vars` (local) and `npm run secret` (production).

---

## Phase 1 — testnet end-to-end (free, no card)

Base Sepolia, free faucet funds, public `x402.org` facilitator. This proves the
whole flow — including real settlement — before a single cent of real money moves.

1. **[USER]** Create a *throwaway* EVM wallet for testing only (never fund it
   with anything real). Generate a key locally, e.g.
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   → prefix with `0x` and keep it in `.dev.vars` as `TEST_EVM_PRIVATE_KEY`.
2. **[USER]** Get test ETH from a Base Sepolia faucet, and test USDC from the
   Circle testnet faucet (USDC Sepolia address is
   `0x036CbD53842c5426634e7929541eC2318f3dCF7e` — **verify this before use**).
3. Set the testnet config (do NOT commit it): `.dev.vars` →
   `X402_NETWORK=eip155:84532`, `X402_FACILITATOR_URL=https://x402.org/facilitator`.
4. Write a tiny x402 client using the official SDK
   (`@x402/fetch` + `@x402/evm`) and call `POST /text/normalize`:
   expect `402` → sign → retry with `PAYMENT-SIGNATURE` → expect `200` and a
   settlement receipt. Confirm the receipt on BaseScan.
5. Only when step 4 passes, flip `wrangler.toml` back to mainnet.

## Phase 2 — mainnet deploy

6. **[USER]** `npm run login` — opens a browser for Cloudflare OAuth. Approve the
   account `skypantherr@hotmail.com`.
7. **[USER]** `npm run secret` → paste the (rotated) `GEMINI_API_KEY`. This sets
   it as an encrypted Worker secret, not a plain variable.
8. `npm run deploy` → gives the `https://arabic-pipeline.<sub>.workers.dev` URL.
9. Sanity checks against the live URL:
   - `GET /` → service info (200).
   - `GET /openapi.json` → spec (200).
   - `GET /health` → 200.
   - `POST /text/normalize` without payment → 402 with the correct challenge.
   - `POST /text/normalize` with a real payment → 200 + a BaseScan receipt
     landing in `0x05523af5bd166816D1418Ebf7D6371e1fFB1D2e6`.
   - The live test needs **$0.01 of USDC** on Base (the buyer needs USDC; the
     facilitator pays gas). The first Superteam bounty payout covers this.

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
11. **Official MCP registry** — publish the MCP server (see Phase 4). 486 of
    PayAPI's 832 listings expose an MCP endpoint; that is how Claude Desktop,
    Cursor and agent runtimes actually call tools.
12. **x402scan registry** — `https://www.x402scan.com/resources/register`
    (free, wallet auth). Bonus: x402scan is the explorer that indexes calls and
    revenue, so the listing becomes observable — you can see your own calls and
    earnings there.
13. **Coinbase x402 Bazaar** — discovery layer for agents:
    `https://docs.cdp.coinbase.com/x402/seller/get-discovered`.
14. **MCP server** — add it with the official package (`@x402/mcp`); wrap the
    same four handlers as tools. Name it `io.github.skypantherr/arabic-pipeline`.
    Put `url https://payapi.market/mcp` in the README (done) and in the MCP
    server description so agents know where to search.
15. **GitHub** — create the repo (`skypantherr/arabic-pipeline`) and push. GitHub
    Desktop is installed and signed in; the `gh` CLI is not.

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
