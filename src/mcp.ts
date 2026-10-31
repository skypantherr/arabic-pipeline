import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createPaymentWrapper, type PaymentRequirements } from "@x402/mcp";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { PRICES, readConfig, type AppConfig, type Env } from "./config";
import {
  CHUNK_DEFAULT_MAX_CHARS,
  CHUNK_MAX_MAX_CHARS,
  CHUNK_MIN_MAX_CHARS,
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
} from "./lib/arabic";
import { CachedFacilitatorClient } from "./lib/facilitator";
import {
  BATCH_MAX_DOCUMENTS,
  GeminiError,
  extractDocument,
  extractDocuments,
  transcribeAudio,
} from "./lib/gemini";

/**
 * The MCP server exposes the same paid capabilities as the REST API, as MCP
 * tools, each one behind its own x402 payment.
 *
 * Payment model (identical to the REST routes):
 *   - `exact` scheme on Base mainnet, USDC, paid to the same wallet.
 *   - The facilitator sponsors gas, so the buyer only needs USDC.
 *   - A tool call with no payment in `_meta` returns a 402-shaped
 *     PaymentRequired payload; the client retries with the payload in
 *     `_meta["x402/payment"]`.
 */

/** Descriptions reused by both the REST OpenAPI spec and the MCP tool list. */
const TOOL_INFO = {
  text_metrics: {
    price: PRICES["GET /text/metrics"],
    title: "Text metrics",
    outputExample: {
      chars: 24,
      chars_no_spaces: 21,
      chars_arabic: 19,
      chars_latin: 0,
      words: 4,
      unique_words: 4,
      sentences: 2,
      lines: 1,
      paragraphs: 1,
      digits: 0,
      punctuation: 2,
      avg_word_length: 5.25,
      max_word_length: 8,
      avg_sentence_words: 2,
      language: "ar",
      reading_time_seconds: 1,
    },
    description:
      "Measure text deterministically: characters, words, unique words, sentences, lines, paragraphs, digits, punctuation, average word and sentence length, reading time and an Arabic/Latin language mix. Works on any language, not only Arabic.",
  },
  text_normalize: {
    price: PRICES["POST /text/normalize"],
    title: "Normalize Arabic text",
    outputExample: {
      text: "مرحبا بالعالم",
      mode: "search",
      changed: true,
      applied: ["tashkeel_and_tatweel_removed"],
      before_chars: 22,
      after_chars: 13,
    },
    description:
      "Canonicalise Arabic text for search, matching or indexing: remove tashkeel and tatweel, fold alef/ya/ta-marbuta, unify Arabic-Indic digits, strip bidi control characters and collapse whitespace. mode=light is lossless; search adds letter folding; index also strips punctuation so the result can be used as a dedup key.",
  },
  text_detect_language: {
    price: PRICES["POST /text/detect"],
    title: "Detect language",
    outputExample: { language: "ar", confidence: 1, script_mix: { arabic: 12, latin: 0, other: 0 } },
    description:
      "Identify whether text is Arabic, English, mixed or unknown from its script mix, with a confidence score and the count of Arabic, Latin and other letters. Deterministic and model-free, so it is cheap enough to run on every incoming message to route Arabic work.",
  },
  text_chunk: {
    price: PRICES["POST /text/chunk"],
    title: "Chunk text",
    outputExample: {
      chunks: [
        { text: "جملة أولى.", start: 0, end: 10, index: 0 },
        { text: "جملة ثانية.", start: 11, end: 22, index: 1 },
        { text: "جملة ثالثة.", start: 23, end: 34, index: 2 },
      ],
      count: 3,
      total_chars: 34,
    },
    description:
      "Split long text into chunks for a model context window. Cuts at sentence boundaries when possible, then at word boundaries, and never mid-word unless a single word is longer than max_chars. Returns each chunk with exact start/end offsets into the original string plus an optional overlap for context carry-over.",
  },
  text_diff: {
    price: PRICES["POST /text/diff"],
    title: "Diff two texts",
    outputExample: { equal: false, similarity: 0.4, added: ["يا", "عالم"], removed: ["بالعالم"] },
    description:
      "Compare two texts word by word after Arabic normalisation (tashkeel, alef/ya/ta-marbuta and digit variants are treated as equal). Returns an equal flag, a similarity score and the added and removed words. Use it for deduplication, re-import checks and QA of edited Arabic copy. Each side is limited to 1500 words.",
  },
  text_search: {
    price: PRICES["POST /text/search"],
    title: "Search text",
    outputExample: {
      mode: "words",
      count: 1,
      total_matches: 1,
      matches: [{ start: 5, end: 10, text: "فاطمة", snippet: "قالت فاطمة: مرحبا", score: 1 }],
    },
    description:
      "Search Arabic (or any) text with normalisation: tashkeel, alef/ya/ta-marbuta, hamza and Arabic-Indic digit variants are ignored, so فَاطِمَة matches فاطمة and ١٢٣ matches 123. mode=words (default) matches whole words, phrase matches any substring, fuzzy tolerates up to max_distance edits per word. Returns exact start/end offsets into the original text plus a context snippet.",
  },
  audio_transcribe: {
    price: PRICES["POST /audio/transcribe"],
    title: "Transcribe audio",
    outputExample: { text: "مرحبا بكم في المتجر", model: "gemini-3.5-transcribe" },
    description:
      "Transcribe Arabic or English speech to plain text. Send the audio as base64 (webm, mp3, wav or mp4); the payload limit is 12 MB of base64. Returns the transcript plus the model that produced it.",
  },
  doc_extract: {
    price: PRICES["POST /doc/extract"],
    title: "Extract document fields",
    outputExample: {
      document_type: "receipt",
      merchant: "سوبرماركت الأمانة",
      date: "2026-10-29",
      total: 57.5,
      currency: "ILS",
      tax_number: null,
      items: [
        { name: "حليب", quantity: 2, price: 12.5 },
        { name: "خبز", quantity: 1, price: 8 },
      ],
      notes: null,
      raw_text: "سوبرماركت الأمانة - المجموع 57.50",
      confidence: 0.92,
    },
    description:
      "Extract structured fields from an Arabic document image or PDF (receipts, invoices, official letters, national IDs, bank slips) as JSON: amounts, dates, names, identifiers and tax numbers, with null for fields the document does not contain. Send the file as base64 (jpeg, png or pdf); the limit is 12 MB of base64.",
  },
  doc_extract_batch: {
    price: PRICES["POST /doc/extract/batch"],
    title: "Extract document fields (batch)",
    outputExample: {
      model: "gemini-3.6-flash",
      count: 1,
      succeeded: 1,
      failed: 0,
      results: [
        {
          index: 0,
          id: "inv-1",
          ok: true,
          document: {
            document_type: "invoice",
            merchant: "شركة النور",
            date: "2026-10-29",
            total: 250,
            currency: "ILS",
            tax_number: "512345678",
            items: [{ name: "خدمة صيانة", quantity: 1, price: 250 }],
            notes: null,
            raw_text: "فاتورة ضريبية - المجموع 250.00",
            confidence: 0.95,
          },
        },
      ],
    },
    description:
      "Extract structured fields from 1 to 5 Arabic documents in one paid call: $0.10 for the batch, i.e. $0.02 per document instead of $0.03. Documents are processed independently and in parallel, results come back in request order with an echoed id, and one unreadable image does not fail the rest (it appears with ok=false and an error). Use this for a stack of receipts, invoices or bank slips.",
  },
} as const;

function text(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Build the MCP server for one request.
 *
 * Stateless mode (no session id) is deliberate: Cloudflare Workers may route
 * consecutive requests of one MCP session to different isolates, so
 * in-memory session state cannot be relied on.
 */
async function buildServer(cfg: AppConfig, facilitatorClient: CachedFacilitatorClient): Promise<McpServer> {
  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    cfg.network as `${string}:${string}`,
    new ExactEvmScheme(),
  );
  await resourceServer.initialize();

  const server = new McpServer(
    {
      name: "io.github.skypantherr/arabic-pipeline",
      title: "Arabic Pipeline API",
      version: "0.2.0",
      websiteUrl: "https://github.com/skypantherr/arabic-pipeline",
    },
    {
      instructions:
        "Arabic Pipeline API - pay-per-call Arabic text, audio and document utilities. " +
        "Nine tools, each billed per call in USDC on Base (eip155:8453): text_metrics $0.002, " +
        "text_normalize $0.005, text_detect_language $0.002, text_chunk $0.002, text_diff $0.002, " +
        "text_search $0.002, audio_transcribe $0.02, doc_extract $0.03, doc_extract_batch $0.10. " +
        "A call made without payment returns isError:true with the x402 challenge in the result's " +
        "structuredContent (and as JSON text in content[0].text); pick one accepts entry, pay it on " +
        "Base, and repeat the same call with the payment payload in params._meta[\"x402/payment\"]. " +
        "No API key, account or subscription is needed. " +
        "audio_transcribe and doc_extract take base64 payloads of up to 12 MB. " +
        "Free discovery: GET https://arabic-pipeline.arabic-pipeline.workers.dev/openapi.json " +
        "for the REST contract and prices.",
    },
  );

  /** Build the accepts[] entry for one tool, priced from the shared price table. */
  const acceptsFor = async (toolName: string, price: number): Promise<PaymentRequirements[]> => {
    const [req] = await resourceServer.buildPaymentRequirements({
      scheme: "exact",
      network: cfg.network as `${string}:${string}`,
      payTo: cfg.payTo,
      price: `${
        price.toFixed(6).replace(/0+$/, "").replace(/\.$/, ".0")
      }`,
    });
    return [req];
  };

  /**
   * Drop the JSON Schema dialect key from a generated schema.
   *
   * Zod 4 emits `$schema: "https://json-schema.org/draft/2020-12/schema"`, which
   * is correct at the top level of a document but noise when the schema is
   * embedded as a property inside another document (the provider's `input`).
   * Indexers read the embedded copy, and a nested `$schema` has confused some
   * consumers, so it is removed here and only here.
   */
  const stripSchemaDialect = (schema: Record<string, unknown>): Record<string, unknown> => {
    const { $schema: _dialect, ...rest } = schema;
    return rest;
  };

  const register = async (
    toolName: keyof typeof TOOL_INFO,
    schema: z.ZodRawShape,
    handler: (args: any) => Promise<{ content: Array<{ type: "text"; text: string }> }>,
  ) => {
    const info = TOOL_INFO[toolName];
    const accepts = await acceptsFor(toolName, info.price);
    const paid = createPaymentWrapper(resourceServer, {
      accepts,
      resource: {
        url: `mcp://tool/${toolName}`,
        description: info.description,
        mimeType: "application/json",
        serviceName: "Arabic Pipeline API",
        tags: ["arabic", "text", "tools"],
      },
      extensions: declareDiscoveryExtension({
        toolName,
        description: info.description,
        transport: "streamable-http",
        // Zod 4 renders JSON Schema itself (`z.toJSONSchema`), so the separate
        // `zod-to-json-schema` package is gone. `io: "input"` matches what the
        // caller sends (optional fields stay optional). `$schema` is dropped
        // because the discovery extension embeds this under `input`, where a
        // nested meta-schema key is noise for indexers.
        inputSchema: stripSchemaDialect(z.toJSONSchema(z.object(schema), { io: "input" })) as Record<string, unknown>,
        // x402 indexers read the challenge for both an input and an output
        // schema. Without the output example the MCP tools were graded
        // "missing output schema" just like the REST routes were.
        output: { example: info.outputExample },
      }),
    });
    const tool = server.tool(toolName, info.description, schema, paid(handler as any) as any);

    // Client-facing metadata: a human title and honest annotations. These tools
    // only read their input and return a computed result; none of them writes
    // state or reaches a destination the model chooses, so read-only,
    // closed-world and idempotent is the accurate declaration. Directories and
    // scanners grade the tool list as served, so leaving these unset read as
    // "unknown" rather than "safe".
    tool.update({
      title: info.title,
      annotations: {
        title: info.title,
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    });
  };

  await register(
    "text_metrics",
    { text: z.string().describe("The text to measure.") },
    async (args) => ({ content: [{ type: "text", text: text(textMetrics(args.text)) }] }),
  );

  await register(
    "text_normalize",
    {
      text: z.string().describe("The Arabic text to normalize."),
      mode: z
        .enum(["light", "search", "index"])
        .optional()
        .describe("light = whitespace/digits/bidi cleanup; search = + tashkeel removal and letter folding; index = + punctuation stripped."),
    },
    async (args) => ({
      content: [
        {
          type: "text",
          text: text(normalizeArabic(args.text, (args.mode ?? "search") as NormalizeMode)),
        },
      ],
    }),
  );

  await register(
    "text_detect_language",
    { text: z.string().describe("The text to identify.") },
    async (args) => ({ content: [{ type: "text", text: text(detectLanguage(args.text)) }] }),
  );

  await register(
    "text_chunk",
    {
      text: z.string().describe("The text to split."),
      max_chars: z
        .number()
        .int()
        .min(CHUNK_MIN_MAX_CHARS)
        .max(CHUNK_MAX_MAX_CHARS)
        .optional()
        .describe(`Target maximum characters per chunk (default ${CHUNK_DEFAULT_MAX_CHARS}).`),
      overlap: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Characters of the previous chunk to repeat, snapped to a word start. At most half of max_chars."),
    },
    async (args) => ({
      content: [
        {
          type: "text",
          text: text(chunkText(args.text, { maxChars: args.max_chars, overlap: args.overlap })),
        },
      ],
    }),
  );

  await register(
    "text_diff",
    {
      a: z.string().describe("The first text."),
      b: z.string().describe("The second text."),
    },
    async (args) => ({ content: [{ type: "text", text: text(diffText(args.a, args.b)) }] }),
  );

  await register(
    "text_search",
    {
      text: z.string().describe("The text to search (the corpus)."),
      query: z.string().describe("What to look for; normalised like the corpus."),
      mode: z
        .enum(["phrase", "words", "fuzzy"])
        .optional()
        .describe("words = whole-word phrase (default); phrase = any substring; fuzzy = edit-distance per word."),
      max_results: z.number().int().min(1).max(SEARCH_MAX_RESULTS).optional().describe("Maximum matches to return."),
      context_chars: z
        .number()
        .int()
        .min(0)
        .max(SEARCH_MAX_CONTEXT)
        .optional()
        .describe("Characters of context on each side of a match."),
      max_distance: z
        .number()
        .int()
        .min(0)
        .max(SEARCH_MAX_DISTANCE)
        .optional()
        .describe("Edits allowed per word in fuzzy mode (default 1)."),
    },
    async (args) => ({
      content: [
        {
          type: "text",
          text: text(
            searchText(args.text, args.query, {
              mode: args.mode,
              maxResults: args.max_results,
              contextChars: args.context_chars,
              maxDistance: args.max_distance,
            }),
          ),
        },
      ],
    }),
  );

  await register(
    "audio_transcribe",
    {
      audio_base64: z.string().describe("Base64-encoded audio file."),
      mime_type: z.string().optional().describe("Audio MIME type, e.g. audio/webm."),
    },
    async (args) => {
      if (!cfg.geminiApiKey) {
        throw new Error("GEMINI_API_KEY is not configured on this deployment.");
      }
      try {
        const result = await transcribeAudio({
          apiKey: cfg.geminiApiKey,
          model: cfg.transcribeModel,
          audioBase64: args.audio_base64,
          mimeType: typeof args.mime_type === "string" ? args.mime_type : "audio/webm",
        });
        return { content: [{ type: "text", text: text(result) }] };
      } catch (err) {
        throw new GeminiError(err instanceof Error ? err.message : "Transcription failed");
      }
    },
  );

  await register(
    "doc_extract",
    {
      document_base64: z.string().describe("Base64-encoded document image or PDF."),
      mime_type: z.string().optional().describe("Document MIME type, e.g. image/jpeg."),
    },
    async (args) => {
      if (!cfg.geminiApiKey) {
        throw new Error("GEMINI_API_KEY is not configured on this deployment.");
      }
      try {
        const result = await extractDocument({
          apiKey: cfg.geminiApiKey,
          model: cfg.visionModel,
          documentBase64: args.document_base64,
          mimeType: typeof args.mime_type === "string" ? args.mime_type : "image/jpeg",
        });
        return { content: [{ type: "text", text: text(result) }] };
      } catch (err) {
        throw new GeminiError(err instanceof Error ? err.message : "Extraction failed");
      }
    },
  );

  await register(
    "doc_extract_batch",
    {
      documents: z
        .array(
          z.object({
            id: z.string().optional().describe("Optional correlation id, echoed back as results[].id."),
            document_base64: z.string().describe("Base64-encoded document image or PDF."),
            mime_type: z.string().optional().describe("Document MIME type, e.g. image/jpeg."),
          }),
        )
        .min(1)
        .max(BATCH_MAX_DOCUMENTS)
        .describe(`1 to ${BATCH_MAX_DOCUMENTS} documents, extracted independently and in parallel.`),
      mime_type: z.string().optional().describe("Default MIME type for documents that omit their own."),
    },
    async (args) => {
      if (!cfg.geminiApiKey) {
        throw new Error("GEMINI_API_KEY is not configured on this deployment.");
      }
      try {
        const result = await extractDocuments({
          apiKey: cfg.geminiApiKey,
          model: cfg.visionModel,
          documents: (args.documents as Array<{ id?: string; document_base64: string; mime_type?: string }>).map(
            (doc) => ({
              id: doc.id ?? null,
              documentBase64: doc.document_base64,
              mimeType: doc.mime_type ?? args.mime_type ?? "image/jpeg",
            }),
          ),
        });
        return { content: [{ type: "text", text: text(result) }] };
      } catch (err) {
        throw new GeminiError(err instanceof Error ? err.message : "Batch extraction failed");
      }
    },
  );

  return server;
}

/**
 * Be liberal about the `Accept` header on MCP POSTs.
 *
 * The Streamable HTTP spec asks clients to accept both `application/json` and
 * `text/event-stream`, and the SDK transport enforces it strictly: anything
 * else - `application/json` alone, `* / *`, or no header at all - is rejected
 * with 406 before the JSON-RPC body is read. Real probes do exactly that.
 *
 * Measured 30 Oct 2026: MCPRush's scanner graded this server from a *manifest*
 * instead of a live read ("Live transport not available") and lost the 4 points
 * that separate 96 from 100 on its coverage term, and Coinbase's Bazaar
 * validator was unable to read the MCP challenge for the same reason. Both send
 * a POST without the exact pair.
 *
 * The fix is header-only: POSTs get the pair the transport requires, the body
 * is untouched, and `enableJsonResponse` still decides the wire format. GET
 * (SSE resume) is left alone - rewriting it could open a stream that never ends.
 */
function normalizeMcpAccept(request: Request): Request {
  if (request.method !== "POST") return request;
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/json") && accept.includes("text/event-stream")) return request;
  const headers = new Headers(request.headers);
  headers.set("accept", "application/json, text/event-stream");
  return new Request(request, { headers });
}

/**
 * CORS for browser-based MCP clients.
 *
 * The SDK transport sets no CORS headers at all, so a page calling this server
 * from another origin was blocked twice: the preflight got a bare 405, and the
 * POST response carried no `Access-Control-Allow-Origin` to read. Server-side
 * agents never noticed, which is exactly why it stayed hidden. The header list
 * covers the MCP session headers, the x402 payment headers and the SSE resume
 * header, and the payment challenge is exposed so a browser client can read it.
 */
const MCP_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, " +
    "PAYMENT-SIGNATURE, PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT, X-PAYMENT-RESPONSE",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, PAYMENT-REQUIRED, PAYMENT-RESPONSE",
  "Access-Control-Max-Age": "86400",
};

/** Copy a response through with the CORS headers added (body stays a stream). */
function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(MCP_CORS_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Worker entry point for the MCP server. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
    }
    return withCors(await respond(request, env));
  },
};

async function respond(request: Request, env: Env): Promise<Response> {
  const cfg = readConfig(env);

  if (request.method === "GET" && new URL(request.url).pathname === "/health") {
    return Response.json({ ok: true, service: "arabic-pipeline-mcp", network: cfg.network });
  }

  const facilitator = new CachedFacilitatorClient({
    url: cfg.facilitatorUrl,
    timeoutMs: 10_000,
    cacheOrigin: new URL(request.url).origin,
  });
  const server = await buildServer(cfg, facilitator);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  return transport.handleRequest(normalizeMcpAccept(request));
}
