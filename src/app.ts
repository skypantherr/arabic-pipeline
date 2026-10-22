import { Hono } from "hono";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { FacilitatorClient, RouteConfig, RoutesConfig } from "@x402/core/server";
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension,
} from "@x402/extensions/bazaar";
import { PRICES, ROUTE_DESCRIPTIONS, usd, type AppConfig } from "./config";
import { normalizeArabic, textMetrics, type NormalizeMode } from "./lib/arabic";
import { GeminiError, extractDocument, transcribeAudio } from "./lib/gemini";
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
      price_model: "per call, fixed",
      endpoints: Object.entries(PRICES).map(([route, price]) => ({
        route,
        price_usd: price,
        description: ROUTE_DESCRIPTIONS[route as keyof typeof ROUTE_DESCRIPTIONS],
      })),
      openapi: "/openapi.json",
      discovery: {
        payapi_market: "https://payapi.market/mcp",
        x402scan: "https://www.x402scan.com/resources/register",
        mcp_registry: "https://registry.modelcontextprotocol.io",
      },
      how_it_works:
        "Send a request with no payment header -> receive 402 Payment Required -> sign a payment for one of the accepts entries -> retry with the PAYMENT-SIGNATURE header.",
    }),
  );

  app.get("/health", (c) => c.json({ ok: true, network: cfg.network }));

  app.get("/openapi.json", (c) => c.json(buildOpenApi(cfg)));

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

  // (2) Register bazaar ourselves: the SDK would only do this on its AJV
  // path, which is exactly the path we are avoiding.
  server.registerExtension(bazaarResourceServerExtension);

  // The middleware captures the routes object; `checkIfBazaarNeeded` runs on
  // it synchronously here, while no route declares bazaar yet.
  const middleware = paymentMiddleware(routes, server);

  // (3) Now attach the discovery declaration to each route config. The
  // per-request path reads it from here and enriches it without Ajv.
  // `declareDiscoveryExtension` already returns `{ bazaar: {...} }`, which is
  // exactly the shape `extensions` expects.
  for (const [route, config] of Object.entries(routes) as [string, RouteConfig][]) {
    config.extensions = bazaarFor(route);
  }

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
