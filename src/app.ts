import { Hono } from "hono";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { FacilitatorClient, RouteConfig, RoutesConfig } from "@x402/core/server";
import {
  declareDiscoveryExtension,
} from "@x402/extensions/bazaar";
import { PRICES, ROUTE_DESCRIPTIONS, usd, type AppConfig } from "./config";
import { CachedFacilitatorClient } from "./lib/facilitator";
import {
  CHUNK_DEFAULT_MAX_CHARS,
  CHUNK_MAX_MAX_CHARS,
  CHUNK_MIN_MAX_CHARS,
  SEARCH_DEFAULT_CONTEXT,
  SEARCH_DEFAULT_MAX_DISTANCE,
  SEARCH_DEFAULT_MAX_RESULTS,
  SEARCH_MAX_CHARS,
  SEARCH_MAX_CONTEXT,
  SEARCH_MAX_DISTANCE,
  SEARCH_MAX_RESULTS,
  chunkText,
  detectLanguage,
  diffText,
  normalizeArabic,
  searchText,
  textMetrics,
  type NormalizeMode,
  type SearchMode,
} from "./lib/arabic";
import {
  BATCH_MAX_DOCUMENTS,
  GeminiError,
  extractDocument,
  extractDocuments,
  geminiKeyStatus,
  transcribeAudio,
  type BatchDocumentInput,
} from "./lib/gemini";
import { buildOpenApi } from "./lib/openapi";

const MAX_DOC_BYTES = 12 * 1024 * 1024; // 12 MB base64 payload ceiling

/**
 * Base64 <-> UTF-8 text.
 *
 * `PAYMENT-REQUIRED` is base64 JSON. `atob`/`btoa` only handle latin1, and the
 * discovery examples contain Arabic, so the bytes are converted explicitly
 * instead of using the shorthand. The chunked loop avoids a spread over a large
 * array (the challenge is small today, but a caller can make it large).
 */
function base64ToText(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function textToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Build the Hono app.
 *
 * `facilitatorClient` is injected so tests can drive the 402 challenge without
 * touching the network, and so the Worker can lazily build a real client.
 */
/**
 * Bazaar discovery declaration for one route.
 *
 * `input` is the example the Bazaar sends back when it probes the route, so
 * it must satisfy `inputSchema`.
 */
function bazaarFor(route: string): Record<string, unknown> {
  const [method] = route.split(" ");
  /**
   * `method` is not decoration: without it the generated schema requires
   * `input.method` while `info.input` omits it, and the Bazaar validator rejects
   * the declaration ("must have required property 'method'"). Passing it from
   * the route key keeps the two in sync by construction.
   */
  const declare = (config: Record<string, unknown>) =>
    declareDiscoveryExtension({ ...config, method } as Parameters<typeof declareDiscoveryExtension>[0]);
  const textSchema = {
    type: "object",
    properties: { text: { type: "string", description: "The text to measure." } },
    required: ["text"],
  };
  if (route.startsWith("GET")) {
    return declare({
      input: { text: "مرحبا بالعالم" },
      inputSchema: textSchema,
      output: {
        example: {
          endpoint: "GET /text/metrics",
          cost_usd: 0.002,
          metrics: { characters: 12, words: 2, sentences: 1, arabic_characters: 12, latin_characters: 0 },
        },
      },
    });
  }
  if (route === "POST /text/metrics") {
    return declare({
      bodyType: "json",
      input: { text: "مرحبا بالعالم" },
      inputSchema: textSchema,
      output: {
        example: {
          endpoint: "POST /text/metrics",
          cost_usd: 0.002,
          metrics: { characters: 12, words: 2, sentences: 1, arabic_characters: 12, latin_characters: 0 },
        },
      },
    });
  }
  if (route === "POST /text/normalize") {
    return declare({
      bodyType: "json",
      input: { text: "مرحبا بالعالم", mode: "search" },
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The Arabic text to normalize." },
          mode: { type: "string", enum: ["light", "search", "index"] },
        },
        required: ["text"],
      },
      output: {
        example: {
          endpoint: "POST /text/normalize",
          cost_usd: 0.005,
          text: "مرحبا بالعالم",
          mode: "search",
          changed: false,
          applied: [],
          before_chars: 12,
          after_chars: 12,
        },
      },
    });
  }
  if (route === "POST /text/detect") {
    return declare({
      bodyType: "json",
      input: { text: "مرحبا بالعالم" },
      inputSchema: textSchema,
      output: {
        example: {
          endpoint: "POST /text/detect",
          cost_usd: 0.002,
          language: "ar",
          confidence: 1,
          script_mix: { arabic: 12, latin: 0, other: 0 },
        },
      },
    });
  }
  if (route === "POST /text/chunk") {
    return declare({
      bodyType: "json",
      input: { text: "مرحبا بالعالم", max_chars: 1000 },
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The text to split." },
          max_chars: { type: "integer", minimum: CHUNK_MIN_MAX_CHARS, maximum: CHUNK_MAX_MAX_CHARS },
          overlap: { type: "integer", minimum: 0 },
        },
        required: ["text"],
      },
      output: {
        example: {
          endpoint: "POST /text/chunk",
          cost_usd: 0.002,
          count: 1,
          total_chars: 12,
          chunks: [{ text: "مرحبا بالعالم", start: 0, end: 12, index: 0 }],
        },
      },
    });
  }
  if (route === "POST /text/diff") {
    return declare({
      bodyType: "json",
      input: { a: "مرحبا بالعالم", b: "مرحبا يا عالم" },
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "string", description: "The first text." },
          b: { type: "string", description: "The second text." },
        },
        required: ["a", "b"],
      },
      output: {
        example: {
          endpoint: "POST /text/diff",
          cost_usd: 0.002,
          equal: false,
          similarity: 0.4,
          added: ["يا", "عالم"],
          removed: ["بالعالم"],
        },
      },
    });
  }
  if (route === "POST /text/search") {
    return declare({
      bodyType: "json",
      input: { text: "قَالَتْ فَاطِمَةُ: مرحبا بالعالم", query: "فاطمة", mode: "words" },
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The text to search." },
          query: { type: "string", description: "What to look for." },
          mode: { type: "string", enum: ["phrase", "words", "fuzzy"] },
          max_results: { type: "integer", minimum: 1, maximum: SEARCH_MAX_RESULTS },
          context_chars: { type: "integer", minimum: 0, maximum: SEARCH_MAX_CONTEXT },
          max_distance: { type: "integer", minimum: 0, maximum: SEARCH_MAX_DISTANCE },
        },
        required: ["text", "query"],
      },
      output: {
        example: {
          endpoint: "POST /text/search",
          cost_usd: 0.002,
          mode: "words",
          count: 1,
          total_matches: 1,
          matches: [
            {
              start: 8,
              end: 17,
              text: "فَاطِمَةُ",
              snippet: "قَالَتْ فَاطِمَةُ: مرحبا بالعالم",
              score: 1,
            },
          ],
        },
      },
    });
  }
  if (route === "POST /audio/transcribe") {
    return declare({
      bodyType: "json",
      input: { audio_base64: "<base64 audio>", mime_type: "audio/webm" },
      inputSchema: {
        type: "object",
        properties: {
          audio_base64: { type: "string", description: "Base64-encoded audio file." },
          mime_type: { type: "string" },
        },
        required: ["audio_base64"],
      },
      output: {
        example: {
          endpoint: "POST /audio/transcribe",
          cost_usd: 0.02,
          model: "gemini-3.5-transcribe",
          text: "النص المستخرج من الصوت",
        },
      },
    });
  }
  if (route === "POST /doc/extract/batch") {
    return declare({
      bodyType: "json",
      input: {
        documents: [
          { id: "receipt-1", document_base64: "<base64 document>", mime_type: "image/jpeg" },
          { id: "receipt-2", document_base64: "<base64 document>", mime_type: "image/jpeg" },
        ],
      },
      inputSchema: {
        type: "object",
        properties: {
          documents: {
            type: "array",
            minItems: 1,
            maxItems: BATCH_MAX_DOCUMENTS,
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Optional correlation id, echoed back in the result." },
                document_base64: { type: "string", description: "Base64-encoded document image or PDF." },
                mime_type: { type: "string" },
              },
              required: ["document_base64"],
            },
          },
          mime_type: { type: "string", description: "Default mime type for documents that omit their own." },
        },
        required: ["documents"],
      },
      output: {
        example: {
          endpoint: "POST /doc/extract/batch",
          cost_usd: 0.1,
          model: "gemini-3.6-flash",
          count: 2,
          succeeded: 1,
          failed: 1,
          results: [
            {
              index: 0,
              id: "receipt-1",
              ok: true,
              document: {
                document_type: "receipt",
                merchant: "اسم المتجر",
                date: "2026-10-22",
                total: 12.5,
                currency: "SAR",
                tax_number: null,
                items: [{ name: "منتج", quantity: 1, price: 12.5 }],
                notes: null,
                raw_text: null,
                confidence: 0.9,
              },
            },
            { index: 1, id: "receipt-2", ok: false, error: "Gemini ... failed (400): image could not be read", status: 400 },
          ],
        },
      },
    });
  }
  return declare({
    bodyType: "json",
    input: { document_base64: "<base64 document>", mime_type: "image/jpeg" },
    inputSchema: {
      type: "object",
      properties: {
        document_base64: { type: "string", description: "Base64-encoded document image or PDF." },
        mime_type: { type: "string" },
      },
      required: ["document_base64"],
    },
    output: {
      example: {
        endpoint: "POST /doc/extract",
        cost_usd: 0.03,
        document: {
          document_type: "receipt",
          merchant: "اسم المتجر",
          date: "2026-10-22",
          total: 12.5,
          currency: "USD",
          tax_number: null,
          items: [{ name: "منتج", quantity: 1, price: 12.5 }],
          notes: null,
          raw_text: null,
          confidence: 0.9,
        },
      },
    },
  });
}

export function createApp(cfg: AppConfig, facilitatorClient: FacilitatorClient) {
  const app = new Hono();

  // CORS + preflight, registered before the payment middleware so that
  // OPTIONS never triggers a 402.
  app.use("*", async (c, next) => {
    c.header("Access-Control-Allow-Origin", "*");
    c.header(
      "Access-Control-Allow-Headers",
      "Content-Type, PAYMENT-SIGNATURE, PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT, X-PAYMENT-RESPONSE",
    );
    c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    c.header("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await next();
  });

  // ---- free, human/machine-readable service info -------------------------
  app.get("/", (c) =>
    c.json({
      service: "Arabic Pipeline API",
      description:
        "Pay-per-call utilities for Arabic text, audio and documents. USDC on Base via x402: no API key, no account, no subscription.",
      network: cfg.network,
      payTo: cfg.payTo,
      asset: "USDC",
      price_model: "per call, fixed",
      endpoints: Object.entries(PRICES).map(([route, price]) => ({
        route,
        price_usd: price,
        description: ROUTE_DESCRIPTIONS[route as keyof typeof ROUTE_DESCRIPTIONS],
      })),
      // Free, unpriced surface. Kept out of `endpoints` on purpose: that array
      // is the price table, and the audit asserts it matches PRICES exactly.
      utilities: {
        openapi: "/openapi.json",
        x402_manifest: "/.well-known/x402",
        llms: "/llms.txt",
        health: "/health",
        diagnostics: "/diag",
        mcp: "https://arabic-pipeline-mcp.arabic-pipeline.workers.dev/",
      },
      quickstart: {
        rest: "POST /text/normalize with {\"text\":\"مَرْحَبًا\"} -> 402 -> sign accepts[0] -> retry with PAYMENT-SIGNATURE",
        mcp: "Call any tool without payment; the challenge arrives in structuredContent. Paying puts the payload in params._meta[\"x402/payment\"].",
        why_arabic:
          "Generic text tools break on tashkeel, alef/ya/ta-marbuta variants, Arabic-Indic digits and bidi marks. These normalise deliberately and return offsets into the original text.",
      },
      openapi: "/openapi.json",
      discovery: {
        mcprush: "https://mcprush.com/skypantherr/arabic-pipeline-api-mcp",
        x402scan: "https://www.x402scan.com/server/298e1e2b-3f5c-4890-9791-6d063fd20931",
        mcp_registry: "https://registry.modelcontextprotocol.io",
        bazaar: BAZAAR_DISCOVERY,
      },
      how_it_works:
        "Send a request with no payment header -> receive 402 Payment Required -> sign a payment for one of the accepts entries -> retry with the PAYMENT-SIGNATURE header.",
    }),
  );

  app.get("/health", (c) => c.json({ ok: true, network: cfg.network }));

  /**
   * Diagnostics: what the edge sees.
   *
   * `liveHandshake` times a real call to the facilitator's /supported from
   * this isolate — the thing that used to stall the 402 path. The bundled
   * snapshot is what the 402 path actually uses, so this route is the way to
   * tell "the facilitator is slow from here" apart from "something else is
   * hanging".
   */
  app.get("/diag", async (c) => {
    const t0 = Date.now();
    let live: Record<string, unknown>;
    try {
      const res = await fetch(`${cfg.facilitatorUrl.replace(/\/$/, "")}/supported`, {
        signal: AbortSignal.timeout(6000),
      });
      const doc = (await res.json()) as { kinds?: unknown[] };
      live = { ok: res.ok, ms: Date.now() - t0, kinds: doc.kinds?.length ?? null };
    } catch (err) {
      live = { ok: false, ms: Date.now() - t0, error: String(err).slice(0, 140) };
    }
    /**
     * Whether the deployed GEMINI_API_KEY actually works, as seen from this
     * Worker. Free (model-metadata GET, no tokens). The key can only be
     * rotated by hand in a terminal, so a stale secret would otherwise
     * surface as a 502 on a buyer's first paid model call.
     */
    let geminiKey: Record<string, unknown>;
    if (!cfg.geminiApiKey) {
      geminiKey = { configured: false };
    } else {
      const s = await geminiKeyStatus(cfg.geminiApiKey, cfg.transcribeModel);
      geminiKey = { configured: true, ok: s.ok, ms: s.ms, status: s.status ?? null, error: s.error ?? null };
    }
    return c.json({
      network: cfg.network,
      payTo: cfg.payTo,
      facilitator: cfg.facilitatorUrl,
      bundledSnapshot: CachedFacilitatorClient.snapshotInfo,
      liveHandshake: live,
      geminiKeyStatus: geminiKey,
      routes: Object.keys(PRICES),
    });
  });

  app.get("/openapi.json", (c) => c.json(buildOpenApi(cfg, BAZAAR_DISCOVERY)));

  /**
   * Origin-hosted x402 manifest.
   *
   * x402scan reads this after OpenAPI (its documented compatibility path) and
   * the IETF x402 discovery draft expects a manifest at this exact path, so one
   * document covers both. The `version: 1` + string `resources` shape is the one
   * x402scan parses; the extra fields are ignored by it and useful to a human or
   * an agent that fetches the manifest directly.
   *
   * Only paid routes are listed, because the manifest promises "this URL answers
   * 402 with a parseable challenge". Listing free helpers here would make a
   * conforming crawler mark them as failed.
   */
  app.get("/.well-known/x402", (c) => {
    const origin = new URL(c.req.url).origin;
    return c.json(
      {
        version: 1,
        x402Version: 2,
        name: "Arabic Pipeline API",
        description:
          "Pay-per-call Arabic text, audio and document utilities. USDC on Base, no API key or account.",
        // GET and POST /text/metrics are the same URL; the manifest lists
        // resources, not methods, so dedupe before emitting.
        resources: [
          ...new Set(Object.keys(PRICES).map((route) => `${origin}${route.split(" ")[1]}`)),
        ],
        network: cfg.network,
        payTo: cfg.payTo,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        openapi: `${origin}/openapi.json`,
        llms: `${origin}/llms.txt`,
        mcp: "https://arabic-pipeline-mcp.arabic-pipeline.workers.dev/",
        instructions:
          "GET or POST a listed resource without payment to receive 402 + PAYMENT-REQUIRED. Sign one accepts[] entry, retry with PAYMENT-SIGNATURE. Prices and request bodies: /openapi.json.",
      },
      undefined,
      { "Cache-Control": "public, max-age=300" },
    );
  });

  /**
   * `/llms.txt` — the emerging plain-text convention for agent crawlers.
   *
   * Cheap to serve, and it is the one document that explains *why* to call this
   * service (Arabic-specific handling) rather than just what the routes are.
   * Prices come from the shared table so this cannot drift.
   */
  app.get("/llms.txt", (c) => {
    const origin = new URL(c.req.url).origin;
    const lines = [
      "# Arabic Pipeline API",
      "",
      "> Pay-per-call Arabic text, audio and document utilities. USDC on Base via x402.",
      "> No API key, no account, no subscription. Each call costs $0.002–$0.10.",
      "",
      "This service exists because Arabic is not just \"another language\" for generic",
      "text tools: diacritics (tashkeel), alef/ya/ta-marbuta variants, Arabic-Indic",
      "digits and right-to-left control characters all break naive matching. Every",
      "text tool here normalises those on purpose and returns offsets into the",
      "original string, so results can be applied to the caller's own text.",
      "",
      "## How to pay",
      "",
      "1. Call any paid route without a payment header. You get HTTP 402 with a",
      "   base64 JSON challenge in the `PAYMENT-REQUIRED` response header.",
      "2. Pick one entry from `accepts` (Base mainnet, USDC, exact scheme), sign it",
      "   with an x402 client, retry the same request with `PAYMENT-SIGNATURE`.",
      "3. The response body is the result. No key, no signup, no dashboard.",
      "",
      "MCP clients: the same nine capabilities are tools on",
      "https://arabic-pipeline-mcp.arabic-pipeline.workers.dev/ — an unpaid call",
      "returns the challenge in `structuredContent`.",
      "",
      "## Endpoints",
      "",
      ...Object.entries(PRICES).map(([route, price]) => `- \`${route}\` — $${price}`),
      "",
      "## Examples",
      "",
      "```bash",
      `# free: see the contract and every price`,
      `curl ${origin}/openapi.json`,
      "",
      `# paid: 402 with the challenge, then retry with a signed payment`,
      `curl -i -X POST ${origin}/text/normalize \\`,
      "  -H 'content-type: application/json' \\",
      `  -d '{"text":"مَرْحَبًا بِالْعَالَمِ","mode":"search"}'`,
      "```",
      "",
      "## Notes",
      "",
      "- `GET /text/metrics?text=...` is the only GET paid route; the rest are POST.",
      "- Document and audio routes take base64 payloads up to 12 MB.",
      "- Batch document extraction: up to 5 documents for $0.10 ($0.02 each, vs $0.03 single).",
      `- Machine-readable: ${origin}/openapi.json · ${origin}/.well-known/x402`,
      "",
    ];
    return c.text(lines.join("\n"), 200, {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "text/plain; charset=utf-8",
    });
  });

  /**
   * A favicon, because discovery validators flag its absence and a bare 404 is a
   * poor first impression for anyone opening the origin in a browser.
   */
  app.get("/favicon.svg", (c) => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
      '<rect width="64" height="64" rx="14" fill="#0b1220"/>',
      '<text x="32" y="45" font-size="40" text-anchor="middle" fill="#7dd3fc"',
      ' font-family="system-ui,Segoe UI,Arial">ع</text>',
      "</svg>",
    ].join("");
    return c.body(svg, 200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" });
  });

  // ---- paid routes -------------------------------------------------------
  /**
   * Bazaar discovery metadata.
   *
   * The SDK validates a route's `extensions.bazaar` declaration with Ajv at
   * middleware-setup time, and Ajv compiles JSON Schema via `new Function`.
   * Cloudflare Workers forbid dynamic code generation ("Code generation from
   * strings disallowed for this context"), so that validation throws inside
   * the request path: the isolate burns its whole CPU budget generating a
   * validator it is not allowed to build, gets killed, and the buyer sees a
   * hang instead of a 402. It looked random because it only bit the first
   * paid request of each cold isolate. See DEPLOY.md, "Two things that break
   * the paid path on Workers".
   *
   * So we never hand the SDK a route config that *declares* bazaar at
   * setup time. Instead:
   *   1. build the routes with no `extensions` (setup sees no bazaar, so the
   *      AJV validation never runs),
   *   2. register the bazaar extension on the resource server ourselves, so
   *      the per-request enrichment path (which does NOT use Ajv) applies it,
   *   3. attach the declaration to the route configs afterwards, so the 402
   *      response carries the discovery metadata.
   */
  const routeEntries = Object.entries(PRICES).map(([route, price]): [string, RouteConfig] => [
    route,
    {
      accepts: {
        scheme: "exact",
        price: usd(price),
        network: cfg.network as `${string}:${string}`,
        payTo: cfg.payTo,
      },
      description: ROUTE_DESCRIPTIONS[route as keyof typeof ROUTE_DESCRIPTIONS],
      mimeType: "application/json",
      serviceName: "Arabic Pipeline API",
      tags: ["arabic", "text", "audio", "documents"],
      unpaidResponseBody: () => ({
        contentType: "application/json",
        body: {
          error: "payment_required",
          message: "This endpoint is paid per call over x402. No API key, no account, no subscription.",
          price_usd: price,
          network: cfg.network,
          asset: "USDC",
          pay_to: cfg.payTo,
          how_to_pay:
            "1) Read the PAYMENT-REQUIRED response header (base64 JSON). 2) Pick one accepts[] entry and sign a payment for it. 3) Retry the request with the PAYMENT-SIGNATURE header. Full contract: /openapi.json",
        },
      }),
    },
  ]);
  const routes: RoutesConfig = Object.fromEntries(routeEntries);

  const server = new x402ResourceServer(facilitatorClient).register(
    cfg.network as `${string}:${string}`,
    new ExactEvmScheme(),
  );

  // ---------------------------------------------------------------------------
  // BAZAAR DISCOVERY METADATA — BUILT WITHOUT AJV, INJECTED AFTER THE 402
  // ---------------------------------------------------------------------------
  // History worth keeping: attaching `extensions.bazaar` directly to a route
  // config used to hang the paid path outright. `@x402/extensions/bazaar`
  // validates a declaration with `ajv.compile(schema)`, Ajv compiles by
  // generating a function from a string, and Cloudflare Workers forbid code
  // generation from strings. Measured 22 Oct 2026: with the extension attached
  // POST /text/metrics never returned; without it, 402 in ~116ms. That is why
  // the paid path stayed declaration-free for several rounds.
  //
  // The rule that matters is "no runtime code generation", not "no metadata".
  // `declareDiscoveryExtension()` is pure object construction — the only Ajv
  // call in that module lives in `validateDiscoveryExtension*`, which this
  // server never invokes on the request path. So the declaration is built here
  // (safe on Workers), validated offline in the test suite, and attached to the
  // 402 *after* the payment middleware has produced it. Nothing new runs inside
  // the paid path: it is two JSON parses and a base64 round-trip on a document
  // that already exists. `smoke:prod` and the live audit assert the 402 still
  // lands in under 2s on every route.
  //
  // Why bother: x402 indexers (x402scan's discovery spec, the agentcash
  // validator) read `extensions.bazaar.schema.properties.input` from the live
  // challenge and mark a route "non-invocable, skipped" when it is absent. The
  // metadata was already correct in `/` and `/openapi.json`; the missing part
  // was the one document buyers and crawlers actually fetch — the 402.
  const BAZAAR_DISCOVERY: Record<string, unknown> = Object.fromEntries(
    Object.keys(PRICES).map((route) => [route, (bazaarFor(route) as { bazaar?: unknown }).bazaar]),
  );

  const middleware = paymentMiddleware(routes, server);

  /**
   * Attach the Bazaar declaration to a 402 challenge.
   *
   * Registered *before* the payment middleware so that it wraps it: the payment
   * middleware short-circuits without calling `next()`, so a middleware
   * registered after it would never run.
   */
  app.use(async (c, next) => {
    await next();
    if (c.res.status !== 402) return;

    const route = `${c.req.method} ${new URL(c.req.url).pathname}`;
    const declaration = BAZAAR_DISCOVERY[route];
    if (!declaration) return;

    const header = c.res.headers.get("PAYMENT-REQUIRED");
    if (!header) return;

    try {
      const challenge = JSON.parse(base64ToText(header)) as Record<string, unknown>;
      const extensions = {
        ...((challenge.extensions as Record<string, unknown> | undefined) ?? {}),
        bazaar: declaration,
      };
      challenge.extensions = extensions;
      const encoded = textToBase64(JSON.stringify(challenge));

      let body = await c.res.text();
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        parsed.extensions = extensions;
        body = JSON.stringify(parsed);
      } catch {
        // A non-JSON 402 body is left exactly as produced.
      }

      const headers = new Headers(c.res.headers);
      headers.delete("content-length");
      c.res = new Response(body, { status: 402, statusText: c.res.statusText, headers });
      // Hono's `c.res` setter copies the previous response's headers onto the new
      // one, which would revert this header to the un-enriched challenge. Set it
      // *after* the assignment. (Found the hard way: the body had the metadata,
      // the header did not, and every indexer reads the header.)
      c.res.headers.set("PAYMENT-REQUIRED", encoded);
      c.res.headers.set("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE");
    } catch {
      // Discovery metadata is an optimisation. If anything here fails, the
      // buyer must still receive the plain 402 that the payment middleware
      // produced, so the error is swallowed rather than turned into a 500.
    }
  });

  app.use(middleware);

  // GET /text/metrics
  app.get("/text/metrics", async (c) => {
    const text = c.req.query("text") ?? "";
    if (!text) {
      return c.json({ error: "missing_query_param", message: "Pass ?text=..." }, 400);
    }
    return c.json({ endpoint: "GET /text/metrics", cost_usd: PRICES["GET /text/metrics"], metrics: textMetrics(text) });
  });

  // POST /text/metrics
  app.post("/text/metrics", async (c) => {
    const body = await readJson(c);
    if (!body || typeof body.text !== "string") {
      return c.json({ error: "invalid_body", message: 'Expected { "text": "..." }' }, 400);
    }
    return c.json({ endpoint: "POST /text/metrics", cost_usd: PRICES["POST /text/metrics"], metrics: textMetrics(body.text) });
  });

  // POST /text/normalize
  app.post("/text/normalize", async (c) => {
    const body = await readJson(c);
    if (!body || typeof body.text !== "string") {
      return c.json({ error: "invalid_body", message: 'Expected { "text": "...", "mode"?: "light"|"search"|"index" }' }, 400);
    }
    const mode = (body.mode ?? "search") as NormalizeMode;
    if (!["light", "search", "index"].includes(mode)) {
      return c.json({ error: "invalid_mode", message: 'mode must be "light", "search" or "index"' }, 400);
    }
    const result = normalizeArabic(body.text, mode);
    return c.json({ endpoint: "POST /text/normalize", cost_usd: PRICES["POST /text/normalize"], ...result });
  });

  // POST /text/detect
  app.post("/text/detect", async (c) => {
    const body = await readJson(c);
    if (!body || typeof body.text !== "string") {
      return c.json({ error: "invalid_body", message: 'Expected { "text": "..." }' }, 400);
    }
    return c.json({
      endpoint: "POST /text/detect",
      cost_usd: PRICES["POST /text/detect"],
      ...detectLanguage(body.text),
    });
  });

  // POST /text/chunk
  app.post("/text/chunk", async (c) => {
    const body = await readJson(c);
    if (!body || typeof body.text !== "string") {
      return c.json({ error: "invalid_body", message: 'Expected { "text": "...", "max_chars"?: number, "overlap"?: number }' }, 400);
    }

    const maxChars = body.max_chars ?? CHUNK_DEFAULT_MAX_CHARS;
    if (
      typeof maxChars !== "number" ||
      !Number.isInteger(maxChars) ||
      maxChars < CHUNK_MIN_MAX_CHARS ||
      maxChars > CHUNK_MAX_MAX_CHARS
    ) {
      return c.json(
        {
          error: "invalid_max_chars",
          message: `max_chars must be an integer between ${CHUNK_MIN_MAX_CHARS} and ${CHUNK_MAX_MAX_CHARS}.`,
        },
        400,
      );
    }

    const overlap = body.overlap ?? 0;
    if (typeof overlap !== "number" || !Number.isInteger(overlap) || overlap < 0 || overlap > Math.floor(maxChars / 2)) {
      return c.json(
        {
          error: "invalid_overlap",
          message: `overlap must be an integer between 0 and ${Math.floor(maxChars / 2)} (half of max_chars).`,
        },
        400,
      );
    }

    const result = chunkText(body.text, { maxChars, overlap });
    return c.json({ endpoint: "POST /text/chunk", cost_usd: PRICES["POST /text/chunk"], ...result });
  });

  // POST /text/diff
  app.post("/text/diff", async (c) => {
    const body = await readJson(c);
    if (!body || typeof body.a !== "string" || typeof body.b !== "string") {
      return c.json({ error: "invalid_body", message: 'Expected { "a": "...", "b": "..." }' }, 400);
    }
    try {
      return c.json({ endpoint: "POST /text/diff", cost_usd: PRICES["POST /text/diff"], ...diffText(body.a, body.b) });
    } catch (err) {
      if (err instanceof RangeError) {
        return c.json({ error: "text_too_large", message: err.message }, 413);
      }
      throw err;
    }
  });

  // POST /text/search
  app.post("/text/search", async (c) => {
    const body = await readJson(c);
    if (!body || typeof body.text !== "string" || typeof body.query !== "string") {
      return c.json(
        {
          error: "invalid_body",
          message:
            'Expected { "text": "...", "query": "...", "mode"?: "phrase"|"words"|"fuzzy", "max_results"?: number, "context_chars"?: number, "max_distance"?: number }',
        },
        400,
      );
    }
    if (body.text.length > SEARCH_MAX_CHARS) {
      return c.json(
        {
          error: "text_too_large",
          message: `text must be at most ${SEARCH_MAX_CHARS} characters; split it with /text/chunk first.`,
        },
        413,
      );
    }

    const mode = body.mode ?? "words";
    if (typeof mode !== "string" || !["phrase", "words", "fuzzy"].includes(mode)) {
      return c.json({ error: "invalid_mode", message: 'mode must be "phrase", "words" or "fuzzy"' }, 400);
    }

    const maxResults = body.max_results ?? SEARCH_DEFAULT_MAX_RESULTS;
    if (
      typeof maxResults !== "number" ||
      !Number.isInteger(maxResults) ||
      maxResults < 1 ||
      maxResults > SEARCH_MAX_RESULTS
    ) {
      return c.json(
        { error: "invalid_max_results", message: `max_results must be an integer between 1 and ${SEARCH_MAX_RESULTS}.` },
        400,
      );
    }

    const contextChars = body.context_chars ?? SEARCH_DEFAULT_CONTEXT;
    if (
      typeof contextChars !== "number" ||
      !Number.isInteger(contextChars) ||
      contextChars < 0 ||
      contextChars > SEARCH_MAX_CONTEXT
    ) {
      return c.json(
        {
          error: "invalid_context_chars",
          message: `context_chars must be an integer between 0 and ${SEARCH_MAX_CONTEXT}.`,
        },
        400,
      );
    }

    const maxDistance = body.max_distance ?? SEARCH_DEFAULT_MAX_DISTANCE;
    if (
      typeof maxDistance !== "number" ||
      !Number.isInteger(maxDistance) ||
      maxDistance < 0 ||
      maxDistance > SEARCH_MAX_DISTANCE
    ) {
      return c.json(
        {
          error: "invalid_max_distance",
          message: `max_distance must be an integer between 0 and ${SEARCH_MAX_DISTANCE}.`,
        },
        400,
      );
    }

    try {
      const result = searchText(body.text, body.query, {
        mode: mode as SearchMode,
        maxResults,
        contextChars,
        maxDistance,
      });
      return c.json({ endpoint: "POST /text/search", cost_usd: PRICES["POST /text/search"], ...result });
    } catch (err) {
      if (err instanceof RangeError) {
        return c.json({ error: "invalid_query", message: err.message }, 400);
      }
      throw err;
    }
  });

  // POST /audio/transcribe
  app.post("/audio/transcribe", async (c) => {
    if (!cfg.geminiApiKey) {
      return c.json({ error: "model_unavailable", message: "GEMINI_API_KEY is not configured on this deployment." }, 503);
    }
    const body = await readJson(c);
    if (!body || typeof body.audio_base64 !== "string" || !body.audio_base64.length) {
      return c.json({ error: "invalid_body", message: 'Expected { "audio_base64": "...", "mime_type"?: "..." }' }, 400);
    }
    if (body.audio_base64.length > MAX_DOC_BYTES) {
      return c.json({ error: "payload_too_large", message: "Audio payload exceeds 12 MB base64." }, 413);
    }
    try {
      const result = await transcribeAudio({
        apiKey: cfg.geminiApiKey,
        model: cfg.transcribeModel,
        audioBase64: body.audio_base64,
        mimeType: typeof body.mime_type === "string" ? body.mime_type : "audio/webm",
      });
      return c.json({
        endpoint: "POST /audio/transcribe",
        cost_usd: PRICES["POST /audio/transcribe"],
        model: result.model,
        text: result.text,
        usage: result.usage,
      });
    } catch (err) {
      return geminiError(c, err);
    }
  });

  // POST /doc/extract
  app.post("/doc/extract", async (c) => {
    if (!cfg.geminiApiKey) {
      return c.json({ error: "model_unavailable", message: "GEMINI_API_KEY is not configured on this deployment." }, 503);
    }
    const body = await readJson(c);
    if (!body || typeof body.document_base64 !== "string" || !body.document_base64.length) {
      return c.json({ error: "invalid_body", message: 'Expected { "document_base64": "...", "mime_type"?: "..." }' }, 400);
    }
    if (body.document_base64.length > MAX_DOC_BYTES) {
      return c.json({ error: "payload_too_large", message: "Document payload exceeds 12 MB base64." }, 413);
    }
    try {
      const result = await extractDocument({
        apiKey: cfg.geminiApiKey,
        model: cfg.visionModel,
        documentBase64: body.document_base64,
        mimeType: typeof body.mime_type === "string" ? body.mime_type : "image/jpeg",
      });
      return c.json({
        endpoint: "POST /doc/extract",
        cost_usd: PRICES["POST /doc/extract"],
        model: result.model,
        document: result.data,
        usage: result.usage,
      });
    } catch (err) {
      return geminiError(c, err);
    }
  });

  // POST /doc/extract/batch
  //
  // The stack-of-receipts workflow: one payment, up to five documents. Every
  // document is extracted independently in parallel, so an unreadable image
  // costs the buyer one entry rather than the whole call — only a batch where
  // *every* document failed is reported as a 502.
  app.post("/doc/extract/batch", async (c) => {
    if (!cfg.geminiApiKey) {
      return c.json({ error: "model_unavailable", message: "GEMINI_API_KEY is not configured on this deployment." }, 503);
    }
    const body = await readJson(c);
    const documents = body?.documents;
    if (!Array.isArray(documents) || documents.length === 0) {
      return c.json(
        {
          error: "invalid_body",
          message:
            'Expected { "documents": [{ "document_base64": "...", "mime_type"?: "...", "id"?: "..." }] } with 1 to ' +
            `${BATCH_MAX_DOCUMENTS} documents, and an optional top-level "mime_type" used as the default.`,
        },
        400,
      );
    }
    if (documents.length > BATCH_MAX_DOCUMENTS) {
      return c.json(
        {
          error: "too_many_documents",
          message: `At most ${BATCH_MAX_DOCUMENTS} documents per batch; split larger stacks across calls.`,
        },
        400,
      );
    }

    const defaultMimeType = typeof body?.mime_type === "string" ? body.mime_type : "image/jpeg";
    const inputs: BatchDocumentInput[] = [];
    let totalBase64 = 0;

    for (let index = 0; index < documents.length; index++) {
      const raw = documents[index];
      if (!raw || typeof raw !== "object") {
        return c.json({ error: "invalid_document", index, message: `documents[${index}] must be an object.` }, 400);
      }
      const doc = raw as Record<string, unknown>;
      if (typeof doc.document_base64 !== "string" || !doc.document_base64.length) {
        return c.json(
          {
            error: "invalid_document",
            index,
            message: `documents[${index}].document_base64 must be a non-empty base64 string.`,
          },
          400,
        );
      }
      if (doc.id !== undefined && (typeof doc.id !== "string" || doc.id.length > 128)) {
        return c.json(
          { error: "invalid_document", index, message: `documents[${index}].id must be a string of at most 128 characters.` },
          400,
        );
      }
      totalBase64 += doc.document_base64.length;
      inputs.push({
        id: typeof doc.id === "string" ? doc.id : null,
        documentBase64: doc.document_base64,
        mimeType: typeof doc.mime_type === "string" ? doc.mime_type : defaultMimeType,
      });
    }

    if (totalBase64 > MAX_DOC_BYTES) {
      return c.json(
        {
          error: "payload_too_large",
          message: `Combined document payload exceeds 12 MB base64; send fewer or smaller documents per batch.`,
        },
        413,
      );
    }

    try {
      const result = await extractDocuments({
        apiKey: cfg.geminiApiKey,
        model: cfg.visionModel,
        documents: inputs,
      });
      const payload = {
        endpoint: "POST /doc/extract/batch",
        cost_usd: PRICES["POST /doc/extract/batch"],
        model: result.model,
        count: result.count,
        succeeded: result.succeeded,
        failed: result.failed,
        results: result.results,
      };
      if (result.succeeded === 0) {
        return c.json({ error: "model_failed", message: "No document in the batch could be extracted.", ...payload }, 502);
      }
      return c.json(payload);
    } catch (err) {
      return geminiError(c, err);
    }
  });

  return app;
}

async function readJson(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await c.req.json();
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function geminiError(c: { json: (o: unknown, s: number) => Response }, err: unknown) {
  if (err instanceof GeminiError) {
    return c.json({ error: "model_error", message: err.message }, err.status === 429 ? 429 : 502);
  }
  return c.json({ error: "internal_error", message: "Unexpected failure while calling the model." }, 500);
}
