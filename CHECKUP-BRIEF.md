# CHECKUP-BRIEF — verification & optimisation pass

You are starting a **fresh verification session** on a live, revenue-targeting x402
service. Everything below was verified at commit `3da66f5` on 22 Oct 2026. Your
job: re-verify everything as of *now* (12+ hours later), catch anything that
decayed, and make the earning path as tight as possible. **You may not spend
money.** Read `HANDOFF.md` (esp. Round 9), `MEASUREMENT.md` and `SCOREBOARD.md`
first; this file is the task list.

## User constraints (non-negotiable)
- No spending, no card use online, no KYC-requiring actions, no new accounts.
- Do **not** rotate the Gemini key yourself — it needs clicks in Google AI
  Studio, which is the user's job. Just flag it.
- Do **not** publish to the MCP registry yourself — it needs a GitHub
  device-code click that only the user can do. Check its status instead.
- Only **one** working agent in this folder at a time. Commit after each change.

## Two landmines — do not reintroduce (full details in DEPLOY.md)
1. Never attach a Bazaar declaration to a paid route (Ajv → `new Function` →
   forbidden on Workers → paid path hangs).
2. Never let the paid path do network I/O or use `caches.default` for the
   facilitator's `/supported` (bundled snapshot instead).
After ANY change to the paid path: `npm run smoke:prod` must PASS. The vitest
suite (runs in Node) **cannot** see either failure.

## Task 1 — internal gates (10 min)
Run and record results:
- `npm run typecheck`, `npm test` (expect 18/18).
- `npm run smoke:prod` against
  `https://arabic-pipeline.arabic-pipeline.workers.dev` (expect 10 PASS, 402
  in <400ms).
- `GET /diag` — bundled snapshot present (44 kinds), live handshake timing.
- MCP worker `https://arabic-pipeline-mcp.arabic-pipeline.workers.dev`:
  `initialize`, `tools/list`, and a `tools/call` (expect the x402 challenge
  quickly, <400ms).
- Wallet `0x05523af5bd166816D1418Ebf7D6371e1fFB1D2e6`: USDC + ETH balance on
  Base via `https://mainnet.base.org` JSON-RPC. **This number decides Task 2.**

## Task 2 — external rails (the 12-hour question)
- **If USDC balance > 0**: the PayAPI canary fired. That is the first dollar of
  the project — record the tx hash, amount, date in `SCOREBOARD.md`, and locate
  the corresponding receipt in the PayAPI confirmation email if it arrived.
- **If balance is still 0** (canary review said "within 24h", so 12h is not yet
  overdue): check whether the listing appeared in PayAPI's public index
  (`https://payapi.market/agent/search?q=arabic` — at last check only 2 other
  listings showed, ours wasn't live yet). Prepare (do not send) a short,
  polite status-inquiry email draft for the user to send from
  `skypantherr@hotmail.com`, referencing the listing and asking for the canary
  status.
- x402scan: does `https://www.x402scan.com/server/298e1e2b-3f5c-4890-9791-6d063fd20931`
  still show 5/5 resources and 0 transactions?
- Coinbase Bazaar: re-run their metadata validation (the earlier session got
  `valid: true`). If it now expects the `extensions.bazaar` declaration to be
  present *in the live 402*, note the trade-off and options (re-register /
  Node VPS) — do **not** re-add the extension to the paid path.
- MCP registry: query `registry.modelcontextprotocol.io` for
  `io.github.skypantherr/arabic-pipeline`; report whether it is published or
  still waiting on the user's device-code click.
- GitHub: `git status` clean, `git log origin/main -1` == local head. Note:
  push may need a second attempt (credential manager); PowerShell may show git's
  stderr as an error even on success — check `origin/main` to confirm.

## Task 3 — optimisation pass (only after Tasks 1–2)
Cheap, safe improvements in rough priority order:
1. **Latency check from several regions** (e.g. fetch the 402 through public
   geographic endpoints or ask the user to load it from their phone). If any
   region is slow, investigate before touching anything.
2. **Discoverability completeness**: `/openapi.json` metadata, `x-bazaar`
   blocks present per operation, `x-payment-info` correct, /diag clean,
   GitHub README links correct and current.
3. **Monitoring**: add `scripts/wallet-check.mjs` output (already exists) into
   a one-command daily check, or extend `scripts/live-check.mjs` so the user
   can run one command each morning that reports: gates, balance, x402scan
   transactions, listing status. Persist the output to `SCOREBOARD.md` in an
   append-only log section.
4. Anything else only if it is free, reversible, and doesn't touch the paid
   path.

## Task 4 — report format
End with: one paragraph of what changed, one table of gate results, the wallet
number, and the 2–4 items only the user can do (rotate key, device-code click,
send any drafted email, answer the X/token-promo question from `BOUNTY-LANE.md`
so the fast lane can start).

## Baseline facts for orientation
- Prices: $0.002 metrics (GET+POST) / $0.005 normalize / $0.02 transcribe /
  $0.03 doc/extract — USDC on Base, facilitator `https://x402.dexter.cash`
  (gas sponsored → buyers need USDC only), floor 1385 atomic.
- Target success bar: 10 buyers × 500 calls × $0.02 ≈ $100/mo; market average
  ≈ $39/mo per seller. Day 3–7 with zero calls = execute the distribution plan
  in `MEASUREMENT.md`.
- Fast lane (bounties) is a separate, untouched workstream.
