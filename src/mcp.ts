import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { x402ResourceServer } from "@x402/core/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createPaymentWrapper, type PaymentRequirements } from "@x402/mcp";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { PRICES, readConfig, type AppConfig, type Env } from "./config";
import { normalizeArabic, textMetrics, type NormalizeMode } from "./lib/arabic";
import { GeminiError, extractDocument, transcribeAudio } from "./lib/gemini";

/**
 * The MCP server exposes the same four paid capabilities as the REST API,
 * as MCP tools, each one behind its own x402 payment.
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
    description:
      "Text metrics for Arabic (or any) text: counts, language mix, sentence/word stats, reading time.",
  },
  text_normalize: {
    price: PRICES["POST /text/normalize"],
    description:
      "Normalize Arabic text: strip tashkeel/tatweel, fold alef/ya/ta-marbuta, unify digits, remove bidi control characters, collapse whitespace.",
  },
  audio_transcribe: {
    price: PRICES["POST /audio/transcribe"],
    description: "Transcribe an audio file to clean text (Arabic or English).",
  },
  doc_extract: {
    price: PRICES["POST /doc/extract"],
    description:
      "Extract structured fields from an Arabic document image or PDF (receipts, invoices, IDs).",
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
async function buildServer(cfg: AppConfig, facilitatorClient: HTTPFacilitatorClient): Promise<McpServer> {
  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    cfg.network as `${string}:${string}`,
    new ExactEvmScheme(),
  );
  await resourceServer.initialize();

  const server = new McpServer(
    { name: "io.github.skypantherr/arabic-pipeline", version: "0.1.0" },
    {
      instructions:
        "Pay-per-call Arabic text, audio and document utilities. USDC on Base via x402 - no API key, no account. " +
        "Discover more of this service at https://payapi.market/mcp",
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
        inputSchema: zodToJsonSchema(z.object(schema)) as Record<string, unknown>,
      }),
    });
    server.tool(toolName, info.description, schema, paid(handler as any) as any);
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

  return server;
}

/** Worker entry point for the MCP server. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cfg = readConfig(env);

    if (request.method === "GET" && new URL(request.url).pathname === "/health") {
      return Response.json({ ok: true, service: "arabic-pipeline-mcp", network: cfg.network });
    }

    const facilitator = new HTTPFacilitatorClient({ url: cfg.facilitatorUrl, timeoutMs: 30_000 });
    const server = await buildServer(cfg, facilitator);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);

    const response = await transport.handleRequest(request);
    return response;
  },
};
