import { Hono } from "hono";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { FacilitatorClient, RouteConfig, RoutesConfig } from "@x402/core/server";
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
   * Bazaar discovery metadata is deliberately NOT attached to the REST routes.
   *
   * The SDK validates any `extensions.bazaar` declaration with Ajv, and Ajv
   * compiles JSON Schema by calling `new Function`. Cloudflare Workers forbid
   * dynamic code generation ("Code generation from strings disallowed for this
   * context"), so that validation throws on every cold isolate. The cost of
   * the failed compile blows the Workers CPU limit and the first paid request
   * of each isolate dies mid-flight, which makes the buyer see a hang instead
   * of a 402. See HANDOFF.md ("Bazaar extension breaks paid routes on
   * Workers").
   *
   * The MCP server still ships Bazaar metadata: that path never runs Ajv, and
   * it is the discovery surface PayAPI and the Bazaar actually index for MCP
   * listings.
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
  app.use(paymentMiddleware(routes, server));

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
