# Arabic Pipeline API

[![Arabic Pipeline API MCP server](https://mcprush.com/badge/arabic-pipeline-api-mcp/card.svg)](https://mcprush.com/to/arabic-pipeline-api-mcp?ref=badge)

Pay-per-call utilities for **Arabic text, audio and documents**, sold over
[x402](https://www.x402.org) in **USDC on Base**.

**No API key. No account. No subscription.** The first request returns
`402 Payment Required`; the client signs a payment and retries; the money lands
in the provider's wallet. That is the whole protocol — and it is why this
service can pay a provider directly, with no payment processor in between.

```bash
# Claude Code (any Streamable HTTP MCP client works the same way)
claude mcp add --scope user --transport http arabic-pipeline-mcp \
  https://arabic-pipeline-mcp.arabic-pipeline.workers.dev/
```

No install, no key: the tools are already on the other end. A tool call without
payment answers with the x402 challenge, and your client pays it on Base.

## Live endpoints

| | URL |
|---|---|
| **REST API** | `https://arabic-pipeline.arabic-pipeline.workers.dev` |
| **MCP server** (streamable HTTP) | `https://arabic-pipeline-mcp.arabic-pipeline.workers.dev/` |
| OpenAPI | `https://arabic-pipeline.arabic-pipeline.workers.dev/openapi.json` |
| x402 manifest (`/.well-known/x402`) | `https://arabic-pipeline.arabic-pipeline.workers.dev/.well-known/x402` |
| `llms.txt` (agent-readable summary) | `https://arabic-pipeline.arabic-pipeline.workers.dev/llms.txt` |
| x402scan | `https://www.x402scan.com/server/298e1e2b-3f5c-4890-9791-6d063fd20931` |
| mcprush (MCP marketplace) | `https://mcprush.com/skypantherr/arabic-pipeline-api-mcp` |
| PayAPI Market (settlement-verified listing) | `https://payapi.market/api/arabic-pipeline-api` |
| MCP registry | `io.github.skypantherr/arabic-pipeline` (v0.2.0, active) |
| Source | `https://github.com/skypantherr/arabic-pipeline` |

The MCP server exposes the same nine capabilities as tools, each behind its
own x402 payment (`text_metrics`, `text_normalize`, `text_detect_language`,
`text_chunk`, `text_diff`, `text_search`, `audio_transcribe`, `doc_extract`,
`doc_extract_batch`).

## Why not a generic text tool

Arabic breaks naive string handling in ways that are invisible until they cost
you a failed match:

- **Tashkeel** — `فَاطِمَة` and `فاطمة` are the same name, but not the same bytes.
- **Letter variants** — `أ إ آ → ا`, `ى → ي`, `ة → ه` are folded on purpose, not by accident.
- **Arabic-Indic digits** — `١٢٣` must match `123`, and the tashkeel range overlaps
  the digit range, so order of operations matters.
- **Bidi control characters** — LRM/RLM and zero-width joiners are invisible, and
  strip "clean" text unless removed deliberately.
- **Offsets** — every text tool returns `start`/`end` into the *original* string, so
  a result can be applied to the caller's own text rather than a rewritten copy.

The paid routes declare this in the 402 itself: each challenge carries a Bazaar
`input` schema **and** an `output` example, so a client can see exactly what it is
buying before it signs anything.

## Endpoints

| Route | What it does | Price | Cost to serve |
|---|---|---|---|
| `GET /text/metrics?text=…` | Counts, language mix, sentence/word stats, reading time | **$0.002** | $0 (pure code) |
| `POST /text/metrics` | Same, JSON body | **$0.002** | $0 (pure code) |
| `POST /text/normalize` | Arabic text cleanup: tashkeel/tatweel, alef/ya/ta-marbuta folding, digit unification, bidi-control removal, whitespace collapse | **$0.005** | $0 (pure code) |
| `POST /text/detect` | Arabic / English / mixed detection with confidence and script mix | **$0.002** | $0 (pure code) |
| `POST /text/chunk` | Sentence-aligned chunks with exact offsets, for model context windows | **$0.002** | $0 (pure code) |
| `POST /text/diff` | Word-level diff after Arabic normalisation: equal flag, similarity, added/removed | **$0.002** | $0 (pure code) |
| `POST /text/search` | Normalised Arabic search (phrase / whole-word / fuzzy) with exact offsets and snippets | **$0.002** | $0 (pure code) |
| `POST /audio/transcribe` | Audio → clean text (Arabic or English) | **$0.02** | model call |
| `POST /doc/extract` | Document image/PDF → structured fields (receipts, invoices, IDs) | **$0.03** | model call |
| `POST /doc/extract/batch` | 1–5 documents in one call, independent results and partial failures | **$0.10** | model call ×n |

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

PayAPI Market independently verified this deployment by buying a call and
publishing the receipt: `POST /text/normalize` for **$0.005 USDC**, settled in
transaction
[`0xfc3e42f9…73ce9c`](https://basescan.org/tx/0xfc3e42f9f1b60fc13888cba6b400ef78cb966b1fdbcdcd2682aa99bec573ce9c)
at block 53,330,178 on Base. The listing is
[payapi.market/api/arabic-pipeline-api](https://payapi.market/api/arabic-pipeline-api).

## Model endpoints

`/audio/transcribe` uses `gemini-3.5-transcribe`; `/doc/extract` and
`/doc/extract/batch` use `gemini-3.6-flash` with a JSON response schema. Both
model names are configurable (`GEMINI_TRANSCRIBE_MODEL`, `GEMINI_VISION_MODEL`).
The six text endpoints are pure computation and cost nothing to serve.

A batch runs one model call per document, concurrently. At $0.10 for five
documents that is $0.02 each, a third below the $0.03 single-document price;
for one or two documents the single route is cheaper, and the batch route says
so. A failed document is reported in place (`ok: false` plus `error`) instead of
failing the whole call, so a bad scan costs one slot rather than the payment.

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

Proprietary — all rights reserved. The source is public so the service can be
audited; it is not licensed for reuse or redistribution. The API itself is sold
per call, not licensed.
