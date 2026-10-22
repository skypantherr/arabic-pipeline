# Arabic Pipeline API

Pay-per-call utilities for **Arabic text, audio and documents**, sold over
[x402](https://www.x402.org) in **USDC on Base**.

**No API key. No account. No subscription.** The first request returns
`402 Payment Required`; the client signs a payment and retries; the money lands
in the provider's wallet. That is the whole protocol — and it is why this
service can pay a provider directly, with no payment processor in between.

```
url https://payapi.market/mcp
```

## Live endpoints

| | URL |
|---|---|
| **REST API** | `https://arabic-pipeline.arabic-pipeline.workers.dev` |
| **MCP server** (streamable HTTP) | `https://arabic-pipeline-mcp.arabic-pipeline.workers.dev/` |
| OpenAPI | `https://arabic-pipeline.arabic-pipeline.workers.dev/openapi.json` |
| x402scan | `https://www.x402scan.com/server/298e1e2b-3f5c-4890-9791-6d063fd20931` |
| MCP registry | `io.github.skypantherr/arabic-pipeline` (v0.1.0, active) |

The MCP server exposes the same four capabilities as tools, each behind its
own x402 payment (`text_metrics`, `text_normalize`, `audio_transcribe`,
`doc_extract`).

## Endpoints

| Route | What it does | Price | Cost to serve |
|---|---|---|---|
| `GET /text/metrics?text=…` | Counts, language mix, sentence/word stats, reading time | **$0.002** | $0 (pure code) |
| `POST /text/metrics` | Same, JSON body | **$0.002** | $0 (pure code) |
| `POST /text/normalize` | Arabic text cleanup: tashkeel/tatweel, alef/ya/ta-marbuta folding, digit unification, bidi-control removal, whitespace collapse | **$0.005** | $0 (pure code) |
| `POST /audio/transcribe` | Audio → clean text (Arabic or English) | **$0.02** | model call |
| `POST /doc/extract` | Document image/PDF → structured fields (receipts, invoices, IDs) | **$0.03** | model call |

`POST /text/normalize` accepts a `mode`:

- `light` — lossless: whitespace, digit unification, bidi cleanup only.
- `search` — light + tashkeel removal + letter folding (`أإآ→ا`, `ى→ي`, `ة→ه`).
- `index` — search + punctuation stripped (use as a dedup / index key).

## Try it

```bash
# 1. Any paid route answers 402 with a payment challenge
curl -i https://arabic-pipeline.arabic-pipeline.workers.dev/text/normalize \
  -H 'content-type: application/json' \
  -d '{"text":"مُحَمَّدٌ عَلِيّ","mode":"search"}'

# 2. Free routes (no payment needed)
curl https://arabic-pipeline.arabic-pipeline.workers.dev/openapi.json
curl https://arabic-pipeline.arabic-pipeline.workers.dev/
```

## How x402 payment works (for agents)

1. Call the route with no payment header → `402 Payment Required`.
2. The response carries a base64 `PAYMENT-REQUIRED` header and, in the body,
   `accepts[]` entries describing how to pay (network, asset, price, payTo).
3. Pick one entry, sign a payment for it, and retry the request with the
   `PAYMENT-SIGNATURE` header (base64 payment payload).
4. The server verifies and settles the payment (via the facilitator) and
   returns the real result plus a `PAYMENT-RESPONSE` header with the receipt.

The full machine-readable contract — including per-operation `x-payment-info` —
is at `GET /openapi.json`.

## Settlement

- Network: **Base mainnet** (`eip155:8453`), asset **USDC**
  (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`).
- Payments are verified and settled by a public x402 facilitator
  (`https://x402.dexter.cash` — no account, no fees). The facilitator only
  executes the buyer's signed payment; it never holds funds.
- Settlement destination: `0x05523af5bd166816D1418Ebf7D6371e1fFB1D2e6`.

## Model endpoints

`/audio/transcribe` uses `gemini-3.5-transcribe`; `/doc/extract` uses
`gemini-3.6-flash` with a JSON response schema. Both model names are
configurable (`GEMINI_TRANSCRIBE_MODEL`, `GEMINI_VISION_MODEL`). The two text
endpoints are pure computation and cost nothing to serve.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # then add GEMINI_API_KEY
npm run dev                       # wrangler dev
npm test                          # vitest
npm run typecheck
```

## Deployment

See `DEPLOY.md`. The short version: `npm run login` → `npm run secret` →
`npm run deploy` → register the listing.

Two Workers are deployed from this repo:

```bash
npm run deploy              # REST API  -> arabic-pipeline.arabic-pipeline.workers.dev
npx wrangler deploy -c wrangler.mcp.toml   # MCP server -> arabic-pipeline-mcp.arabic-pipeline.workers.dev
```

## Licence

MIT.
