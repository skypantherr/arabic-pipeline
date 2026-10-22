/**
 * The machine-readable contract for the service.
 *
 * Agents read this to learn what the endpoints cost and how to call them, so
 * the x402scan discovery spec's requirements are followed:
 *  - info.title, info.version, info.x-guidance, info.contact.email
 *  - per-operation responses.402 and x-payment-info
 *  - security + components.securitySchemes
 */

import { PRICES, ROUTE_DESCRIPTIONS, type AppConfig, type PricedRoute } from "../config";

const SECURITY_SCHEME = "x402Payment";

const BODIES: Record<string, { schema: object; required: string[]; description: string }> = {
  text: {
    required: ["text"],
    description: "The text to process.",
    schema: {
      type: "object",
      properties: { text: { type: "string", description: "Text content." } },
    },
  },
  audio: {
    required: ["audio_base64"],
    description: "Base64-encoded audio file plus its mime type.",
    schema: {
      type: "object",
      properties: {
        audio_base64: { type: "string", description: "Base64-encoded audio bytes." },
        mime_type: { type: "string", description: "e.g. audio/webm, audio/mpeg, audio/wav, audio/mp4." },
      },
    },
  },
  document: {
    required: ["document_base64"],
    description: "Base64-encoded document image or PDF plus its mime type.",
    schema: {
      type: "object",
      properties: {
        document_base64: { type: "string", description: "Base64-encoded document bytes." },
        mime_type: { type: "string", description: "e.g. image/jpeg, image/png, application/pdf." },
      },
    },
  },
};

const RESPONSES = {
  ok: {
    description: "Result.",
    content: { "application/json": { schema: { type: "object" } } },
  },
  paymentRequired: {
    description:
      "Payment required. Read the x402 payment requirements from the PAYMENT-REQUIRED header, sign a payment for one of the `accepts` entries, and retry the request with the PAYMENT-SIGNATURE header.",
    content: { "application/json": { schema: { type: "object" } } },
  },
  badRequest: {
    description: "Invalid request body.",
    content: { "application/json": { schema: { type: "object" } } },
  },
  error: {
    description: "The request could not be fulfilled.",
    content: { "application/json": { schema: { type: "object" } } },
  },
};

function op(
  route: PricedRoute,
  body: { schema: object; required: string[]; description: string },
  query?: Record<string, { schema: object; required: string[]; description: string }>,
  bazaar?: unknown,
) {
  const price = PRICES[route];
  const [method, path] = route.split(" ");
  return {
    method,
    path,
    operation: {
      operationId: `${method.toLowerCase()}_${path.replace(/\//g, "_").replace(/^_/, "")}`,
      summary: ROUTE_DESCRIPTIONS[route],
      description: ROUTE_DESCRIPTIONS[route],
      tags: ["arabic"],
      ...(query
        ? {
            parameters: Object.entries(query).map(([name, spec]) => ({
              name,
              in: "query",
              required: spec.required.includes(name),
              description: spec.description,
              schema: spec.schema,
            })),
          }
        : {}),
      ...(method === "POST"
        ? {
            requestBody: {
              required: true,
              content: { "application/json": { schema: body.schema } },
            },
          }
        : {}),
      responses: {
        200: RESPONSES.ok,
        402: RESPONSES.paymentRequired,
        400: RESPONSES.badRequest,
        500: RESPONSES.error,
      },
      security: [{ [SECURITY_SCHEME]: [] }],
      "x-payment-info": {
        price: { mode: "fixed", currency: "USD", amount: price.toFixed(6) },
        protocols: [{ x402: {} }],
      },
      // Bazaar discovery metadata, published here rather than in the route's
      // `extensions` (see src/app.ts: the Bazaar extension's Ajv validation
      // uses `new Function`, which Cloudflare Workers forbid, and it hangs the
      // paid path).
      ...(bazaar ? { "x-bazaar": bazaar } : {}),
    },
  };
}

export function buildOpenApi(
  cfg: AppConfig,
  bazaarDiscovery?: Record<string, unknown>,
): Record<string, unknown> {
  const ops = [
    op("GET /text/metrics", BODIES.text, {
      text: {
        required: ["text"],
        description: "The text to measure. URL-encoded.",
        schema: { type: "string" },
      },
    }, bazaarDiscovery?.["GET /text/metrics"]),
    op("POST /text/metrics", BODIES.text, undefined, bazaarDiscovery?.["POST /text/metrics"]),
    op("POST /text/normalize", BODIES.text, undefined, bazaarDiscovery?.["POST /text/normalize"]),
    op("POST /audio/transcribe", BODIES.audio, undefined, bazaarDiscovery?.["POST /audio/transcribe"]),
    op("POST /doc/extract", BODIES.document, undefined, bazaarDiscovery?.["POST /doc/extract"]),
  ];

  const paths: Record<string, Record<string, unknown>> = {};
  for (const o of ops) {
    paths[o.path] = paths[o.path] ?? {};
    paths[o.path][o.method.toLowerCase()] = o.operation;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Arabic Pipeline API",
      version: "0.1.0",
      summary: "Pay-per-call utilities for Arabic text, audio and documents.",
      description:
        "Four micro-capabilities for Arabic-language work, sold per call over x402 in USDC on Base. " +
        "No API key, no account, no subscription for the buyer: the first request returns a 402 payment " +
        "challenge, the client pays it and retries. Text utilities are pure computation and cost nothing to serve.",
      "x-guidance":
        "For Arabic text cleanup call POST /text/normalize with {text}. For statistics call GET /text/metrics?text=... " +
        "or POST /text/metrics with {text}. For speech call POST /audio/transcribe with {audio_base64, mime_type}. " +
        "For receipts/invoices call POST /doc/extract with {document_base64, mime_type}. Prices are listed per operation in x-payment-info.",
      contact: { email: "skypantherr@hotmail.com" },
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: "/", description: "This deployment." }],
    security: [{ [SECURITY_SCHEME]: [] }],
    components: {
      securitySchemes: {
        [SECURITY_SCHEME]: {
          type: "apiKey",
          in: "header",
          name: "PAYMENT-SIGNATURE",
          description:
            "Base64-encoded x402 payment payload. Obtained by paying the 402 challenge returned on the first request.",
        },
      },
    },
    paths,
    "x-x402": {
      network: cfg.network,
      payTo: cfg.payTo,
      asset: "USDC",
      facilitator: cfg.facilitatorUrl,
    },
  };
}
