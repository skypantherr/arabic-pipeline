import { Hono } from "hono";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { FacilitatorClient, RouteConfig, RoutesConfig } from "@x402/core/server";
import {
  declareDiscoveryExtension,
} from "@x402/extensions/bazaar";
import { PRICES, ROUTE_DESCRIPTIONS, usd, type AppConfig } from "./config";
import { CachedFacilitatorClient } from "./lib/facilitator";
import { normalizeArabic, textMetrics, type NormalizeMode } from "./lib/arabic";
import { GeminiError, extractDocument, geminiKeyStatus, transcribeAudio } from "./lib/gemini";
import { buildOpenApi } from "./lib/openapi";

const MAX_DOC_BYTES = 12 * 1024 * 1024; // 12 MB base64 payload ceiling

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
  const textSchema = {
    type: "object",
    properties: { text: { type: "string", description: "The text to measure." } },
    required: ["text"],
  };
  if (route.startsWith("GET")) {
    return declareDiscoveryExtension({
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
    return declareDiscoveryExtension({
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
    return declareDiscoveryExtension({
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
  if (route === "POST /audio/transcribe") {
    return declareDiscoveryExtension({
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
  return declareDiscoveryExtension({
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
      price_model: "per call, fixed",      endpoints: Object.entries(PRICES).map(([route, price]) => ({
        route,
        price_usd: price,
        description: ROUTE_DESCRIPTIONS[route as keyof typeof ROUTE_DESCRIPTIONS],
      })),
      openapi: "/openapi.json",
      discovery: {
        payapi_market: "https://payapi.market/mcp",
        x402scan: "https://www.x402scan.com/resources/register",
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
   * paid request of each cold isolate. See HANDOFF.md, "Bazaar extension
   * breaks paid routes on Cloudflare Workers".
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
  // BAZAAR DISCOVERY METADATA — INFORMATIONAL ONLY, NEVER ON THE PAID PATH
  // ---------------------------------------------------------------------------
  // Why this is not attached to the route configs:
  //
  // `@x402/extensions/bazaar` validates a route's `extensions.bazaar`
  // declaration with Ajv (`ajv.compile(schema)`), and Ajv compiles a schema by
  // generating a function from a string — `new Function`. Cloudflare Workers
  // forbid code generation from strings ("Code generation from strings
  // disallowed for this context"), so the request dies before a response can be
  // written and the buyer sees a hang instead of a 402.
  //
  // Measured, on 22 Oct 2026, against this deployment:
  //   - Bazaar extension attached  -> POST /text/metrics never returns (hang),
  //                                    while GET /health answers in ~70ms
  //   - Bazaar extension removed   -> POST /text/metrics returns 402 in ~116ms
  // Reproduced identically with `wrangler dev` locally and on the edge.
  //
  // So: the metadata is published in the FREE routes (`/` and `/openapi.json`)
  // and the service is separately registered with Coinbase's Bazaar index, but
  // the paid path must never touch the Bazaar code. A working 402 matters more
  // than a live discovery declaration.
  const BAZAAR_DISCOVERY: Record<string, unknown> = Object.fromEntries(
    Object.keys(PRICES).map((route) => [route, (bazaarFor(route) as { bazaar?: unknown }).bazaar]),
  );

  const middleware = paymentMiddleware(routes, server);

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
