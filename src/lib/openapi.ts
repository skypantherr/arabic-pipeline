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
} from "./arabic";
import { BATCH_MAX_DOCUMENTS } from "./gemini";

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
  chunk: {
    required: ["text"],
    description: "The text to split, plus optional chunk size and overlap.",
    schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to split. Offsets in the response index into this string." },
        max_chars: {
          type: "integer",
          minimum: CHUNK_MIN_MAX_CHARS,
          maximum: CHUNK_MAX_MAX_CHARS,
          default: CHUNK_DEFAULT_MAX_CHARS,
          description: "Target maximum characters per chunk.",
        },
        overlap: {
          type: "integer",
          minimum: 0,
          default: 0,
          description: "Characters of the previous chunk to repeat, snapped to a word start. At most max_chars / 2.",
        },
      },
    },
  },
  diff: {
    required: ["a", "b"],
    description: "Two texts to compare after Arabic normalisation.",
    schema: {
      type: "object",
      properties: {
        a: { type: "string", description: "The first text." },
        b: { type: "string", description: "The second text." },
      },
    },
  },
  search: {
    required: ["text", "query"],
    description: "The corpus to search, the query, and optional search options.",
    schema: {
      type: "object",
      properties: {
        text: { type: "string", description: `The text to search. At most ${SEARCH_MAX_CHARS} characters.` },
        query: {
          type: "string",
          description:
            "What to look for. Normalised like the corpus: tashkeel, alef/ya/ta-marbuta, hamza and Arabic-Indic digits are ignored.",
        },
        mode: { type: "string", enum: ["phrase", "words", "fuzzy"], default: "words" },
        max_results: { type: "integer", minimum: 1, maximum: SEARCH_MAX_RESULTS, default: SEARCH_DEFAULT_MAX_RESULTS },
        context_chars: {
          type: "integer",
          minimum: 0,
          maximum: SEARCH_MAX_CONTEXT,
          default: SEARCH_DEFAULT_CONTEXT,
          description: "Characters of context on each side of a match.",
        },
        max_distance: {
          type: "integer",
          minimum: 0,
          maximum: SEARCH_MAX_DISTANCE,
          default: SEARCH_DEFAULT_MAX_DISTANCE,
          description: "Edits allowed per word in fuzzy mode.",
        },
      },
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
  documentBatch: {
    required: ["documents"],
    description: `1 to ${BATCH_MAX_DOCUMENTS} documents extracted in one call, $0.02 per document instead of $0.03.`,
    schema: {
      type: "object",
      properties: {
        documents: {
          type: "array",
          minItems: 1,
          maxItems: BATCH_MAX_DOCUMENTS,
          description: "Documents to extract. Each result is independent and returned in request order.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Optional correlation id, echoed back as results[].id." },
              document_base64: { type: "string", description: "Base64-encoded document bytes." },
              mime_type: { type: "string", description: "e.g. image/jpeg, image/png, application/pdf." },
            },
            required: ["document_base64"],
          },
        },
        mime_type: { type: "string", description: "Default mime type for documents that omit their own." },
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
    op("POST /text/detect", BODIES.text, undefined, bazaarDiscovery?.["POST /text/detect"]),
    op("POST /text/chunk", BODIES.chunk, undefined, bazaarDiscovery?.["POST /text/chunk"]),
    op("POST /text/diff", BODIES.diff, undefined, bazaarDiscovery?.["POST /text/diff"]),
    op("POST /text/search", BODIES.search, undefined, bazaarDiscovery?.["POST /text/search"]),
    op("POST /audio/transcribe", BODIES.audio, undefined, bazaarDiscovery?.["POST /audio/transcribe"]),
    op("POST /doc/extract", BODIES.document, undefined, bazaarDiscovery?.["POST /doc/extract"]),
    op("POST /doc/extract/batch", BODIES.documentBatch, undefined, bazaarDiscovery?.["POST /doc/extract/batch"]),
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
      version: "0.2.0",
      summary: "Pay-per-call utilities for Arabic text, audio and documents.",
      description:
        "Nine micro-capabilities for Arabic-language work, sold per call over x402 in USDC on Base. " +
        "No API key, no account, no subscription for the buyer: the first request returns a 402 payment " +
        "challenge, the client pays it and retries. Text utilities are pure computation and cost nothing to serve.",
      "x-guidance":
        "For Arabic text cleanup call POST /text/normalize with {text}. For statistics call GET /text/metrics?text=... " +
        "or POST /text/metrics with {text}. To route work by language call POST /text/detect with {text}. " +
        "To split long text for a model call POST /text/chunk with {text, max_chars?, overlap?} and use the returned offsets. " +
        "To compare or deduplicate two texts call POST /text/diff with {a, b}. " +
        "To find Arabic phrases despite diacritics or letter variants call POST /text/search with {text, query, mode?}. " +
        "For speech call POST /audio/transcribe with {audio_base64, mime_type}. " +
        "For one receipt or invoice call POST /doc/extract with {document_base64, mime_type}; " +
        "for a stack of up to five call POST /doc/extract/batch with {documents: [{document_base64, mime_type?, id?}]} " +
        "($0.10 the batch, $0.02 per document instead of $0.03). Prices are listed per operation in x-payment-info.",
      contact: { email: "skypantherr@hotmail.com" },
      // Matches LICENSE: proprietary, all rights reserved. There is no SPDX
      // identifier for that, so `identifier` is deliberately absent — claiming
      // "MIT" here advertised terms the repository does not grant.
      license: {
        name: "Proprietary",
        url: "https://github.com/skypantherr/arabic-pipeline/blob/main/LICENSE",
      },
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
