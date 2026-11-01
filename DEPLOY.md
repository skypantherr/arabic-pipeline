# Deployment runbook

Two Workers are deployed from this repository, both paid on Base mainnet:
the REST API and the MCP server. They share the price table in `src/config.ts`
and the same payout wallet.

| | REST API | MCP server |
|---|---|---|
| Worker name | `arabic-pipeline` | `arabic-pipeline-mcp` |
| Config | `wrangler.toml` | `wrangler.mcp.toml` |
| Entry | `src/index.ts` → `src/app.ts` | `src/mcp.ts` |
| URL | `https://arabic-pipeline.arabic-pipeline.workers.dev` | `https://arabic-pipeline-mcp.arabic-pipeline.workers.dev/` |

## 1. Prerequisites

- Node 22+, npm, a Cloudflare account, and a Google AI Studio API key (the two
  model-backed routes need it; the six text routes do not).
- `npm install`.
- `.dev.vars` for local development (`cp .dev.vars.example .dev.vars`, then fill
  in `GEMINI_API_KEY`). It is git-ignored.

Configuration lives in `[vars]` in both `wrangler*.toml`:

| Variable | Meaning |
|---|---|
| `X402_NETWORK` | `eip155:8453` (Base mainnet) or `eip155:84532` (Base Sepolia) |
| `X402_PAY_TO` | The wallet that receives USDC |
| `X402_FACILITATOR_URL` | `https://x402.dexter.cash` (mainnet) or `https://x402.org/facilitator` (Sepolia) |
| `GEMINI_TRANSCRIBE_MODEL` | Model for `/audio/transcribe` |
| `GEMINI_VISION_MODEL` | Model for `/doc/extract` and `/doc/extract/batch` |

`GEMINI_API_KEY` is a secret, never a `[vars]` entry.

## 2. Deploy

```bash
npm run login                      # Cloudflare OAuth, once per machine
npm run secret                     # wrangler secret put GEMINI_API_KEY (REST)
npx wrangler secret put GEMINI_API_KEY -c wrangler.mcp.toml   # MCP Worker
npm run deploy                     # REST API
npx wrangler deploy -c wrangler.mcp.toml                      # MCP server
```

If you prefer a token over the browser flow, create a Cloudflare API token with
*Account → Workers Scripts: Edit* and set `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` in the environment.

## 3. Verify

Free checks, no payment, no wallet:

```bash
npm run typecheck
npm test                   # 82 tests
npm run smoke:prod         # 402 shape + timing against production
npm run check:daily        # health, registry, wallet balance, listing
```

```bash
curl https://arabic-pipeline.arabic-pipeline.workers.dev/health
curl https://arabic-pipeline.arabic-pipeline.workers.dev/openapi.json
curl -i -X POST https://arabic-pipeline.arabic-pipeline.workers.dev/text/normalize \
  -H 'content-type: application/json' -d '{"text":"مُحَمَّدٌ"}'
```

The last one must answer `402` with a base64 `PAYMENT-REQUIRED` header carrying
the correct network, asset, amount and `payTo`. **Run `npm run smoke:prod` after
every deploy and after any change to the paid path.** The vitest suite runs in
Node, where the two Workers-only failure modes below cannot appear.

## 4. Two things that break the paid path on Workers

Both produced the same symptom — a paid request that hangs instead of returning
402 — and both are avoided by construction in `src/app.ts`. Do not reintroduce
them.

1. **Never put a Bazaar declaration in a route config.** The SDK validates
   `extensions.bazaar` with Ajv, Ajv compiles JSON Schema via `new Function`, and
   Workers forbid code generation from strings. The isolate burns its CPU budget
   building a validator it is not allowed to build and is killed mid-request.
   What works instead: `declareDiscoveryExtension()` is pure object construction,
   so the declaration is built up front with no Ajv call, then injected into the
   402 response (header and body) after the payment middleware has produced it.
   Indexers read the challenge; nothing new runs inside the paid path.
2. **Never let a paid request wait on the network for the facilitator
   handshake.** The middleware awaits `initialize()` (a `/supported` fetch)
   before answering the first paid request of an isolate, and the SDK retries a
   throttled handshake with backoff. `caches.default` also hangs here: the Cache
   API only stores entries for the current zone. Instead the facilitator's
   `/supported` document is bundled as `src/lib/facilitator-supported.json` and
   `getSupported()` returns it from memory — refresh it with
   `node scripts/refresh-facilitator-snapshot.mjs` when the facilitator changes.
   The facilitator is contacted only for `/verify` and `/settle`, i.e. only when
   a real payment is presented.

## 5. Discovery surfaces

The service is listed in four places, all free, plus one validator.

- **MCP registry** — `server.json` (namespace `io.github.skypantherr`, verified
  by GitHub auth). `mcp-publisher login github`, then `mcp-publisher publish
  server.json`. Registry versions are immutable: every metadata change needs a
  version bump, and clients pick the entry the registry marks `isLatest`.
- **x402scan** — register at `https://www.x402scan.com/resources/register`
  (wallet signature, free). It indexes calls and revenue per resource.
- **mcprush** — the MCP marketplace listing. Its studio reads `tools/list` from
  the live MCP endpoint, so after adding or renaming a tool use *Tool surface →
  Read the tools again*; do not wait for the monthly scan.
- **PayAPI Market** — `https://payapi.market/api/arabic-pipeline-api`. Their
  verifier bought a real call on 31 Oct 2026: $0.005 USDC for
  `POST /text/normalize`, settled in tx
  [`0xfc3e42f9…73ce9c`](https://basescan.org/tx/0xfc3e42f9f1b60fc13888cba6b400ef78cb966b1fdbcdcd2682aa99bec573ce9c)
  at block 53,330,178 on Base. A live listing cannot be edited from here
  (re-submitting returns "already submitted"), and the published card lags the
  API, so treat `/openapi.json` and the MCP `tools/list` as the source of truth
  rather than the card's route count.
- **Coinbase x402 Bazaar** — validate a route with
  `POST https://api.cdp.coinbase.com/platform/v2/x402/validate`
  (`{"resource":"<paid route URL>","method":"POST"}`). Actual indexing happens on
  a settled payment through Coinbase's facilitator, which is not the facilitator
  used here, so treat this as a validator rather than a listing.

`GET /openapi.json`, `GET /.well-known/x402` and `GET /llms.txt` are generated
from the same price table, so a route added to `src/config.ts` appears in all
three without further edits.

## 6. Rotating the Gemini key

```bash
node scripts/set-gemini-key.mjs            # writes .dev.vars only
node scripts/set-gemini-key.mjs --deploy   # writes .dev.vars and pushes the secret
node scripts/check-gemini.mjs              # confirms the key and both models
```

The script prompts with echo off so the key never appears in shell history.
Install the new key first, verify, then delete the old key in Google AI Studio —
that order keeps the two model-backed routes answering throughout.

## 7. Notes on measuring

This project's own measurements go through whatever network the machine is on.
A TLS-intercepting proxy or a flaky connection can make a few percent of local
`fetch` calls hang for reasons unrelated to the Worker: confirm a suspected
Worker hang against the production URL from a browser before changing Worker
code.
