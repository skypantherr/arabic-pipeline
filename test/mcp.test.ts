import { describe, expect, it } from "vitest";
import worker from "../src/mcp";
import type { Env } from "../src/config";

/**
 * Tests for the MCP *worker entry*, not the tool logic.
 *
 * This surface had no coverage at all, and that is where the worst deployed bug
 * lived: the SDK transport rejects every Accept header except the exact pair
 * with a 406 before it reads the body, so scanners graded a manifest instead of
 * the live server. These tests pin the transport behaviour (Accept
 * normalisation, CORS preflight, protocol errors) so it cannot regress silently.
 *
 * No network is used: the facilitator snapshot is bundled, and every call here
 * stops before a model invocation.
 */
const env = { X402_NETWORK: "eip155:8453" } as Env;

async function post(body: unknown, accept?: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (accept !== undefined) headers.accept = accept;
  return worker.fetch(
    new Request("https://mcp.test/", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    env,
  );
}

const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
};

describe("mcp worker transport", () => {
  it("answers a CORS preflight without a body", async () => {
    const res = await worker.fetch(new Request("https://mcp.test/", { method: "OPTIONS" }), env);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-headers")).toContain("Mcp-Session-Id");
    expect(res.headers.get("access-control-expose-headers")).toContain("PAYMENT-REQUIRED");
  });

  it("accepts the exact Accept pair and exposes CORS on the response", async () => {
    const res = await post(INIT, "application/json, text/event-stream");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = (await res.json()) as { result?: { serverInfo?: { name?: string }; protocolVersion?: string } };
    expect(body.result?.serverInfo?.name).toBe("io.github.skypantherr/arabic-pipeline");
    expect(body.result?.protocolVersion).toBe("2025-06-18");
  });

  it("normalises a bare or wildcard Accept header instead of returning 406", async () => {
    for (const accept of ["*/*", "application/json", undefined]) {
      const res = await post(INIT, accept);
      expect(res.status, `accept=${accept}`).toBe(200);
    }
  });

  it("lists every tool with client-facing metadata", async () => {
    const res = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, "*/*");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result?: { tools?: Array<{ name: string; title?: string; annotations?: { readOnlyHint?: boolean } }> };
    };
    const tools = body.result?.tools ?? [];
    expect(tools.length).toBe(9);
    for (const tool of tools) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
    }
  });

  it("returns a tool-level error for an unknown tool", async () => {
    const res = await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "nope", arguments: {} } }, "*/*");
    const body = (await res.json()) as { result?: { isError?: boolean; content?: Array<{ text?: string }> } };
    expect(res.status).toBe(200);
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toContain("not found");
  });

  it("rejects an unknown method with -32601", async () => {
    const res = await post({ jsonrpc: "2.0", id: 4, method: "does/not/exist" }, "*/*");
    const body = (await res.json()) as { error?: { code?: number } };
    expect(body.error?.code).toBe(-32601);
  });

  it("rejects malformed JSON with a client error", async () => {
    const res = await post("{ not json", "*/*");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("serves /health with CORS", async () => {
    const res = await worker.fetch(new Request("https://mcp.test/health"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("puts a complete discovery declaration in every unpaid challenge", async () => {
    // Indexers grade MCP tools from the challenge: an input-only declaration is
    // reported as "missing output schema", which is why this is asserted for
    // every tool rather than one representative.
    const argsFor: Record<string, Record<string, unknown>> = {
      text_metrics: { text: "مرحبا" },
      text_normalize: { text: "مرحبا" },
      text_detect_language: { text: "مرحبا" },
      text_chunk: { text: "مرحبا" },
      text_diff: { a: "مرحبا", b: "مرحبا" },
      text_search: { text: "مرحبا", query: "مرحبا" },
      audio_transcribe: { audio_base64: "AAAA" },
      doc_extract: { document_base64: "AAAA" },
      doc_extract_batch: { documents: [{ document_base64: "AAAA" }] },
    };

    for (const [name, args] of Object.entries(argsFor)) {
      const res = await post({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } }, "*/*");
      const body = (await res.json()) as {
        result?: {
          structuredContent?: {
            extensions?: { bazaar?: { info?: Record<string, unknown>; schema?: { properties?: Record<string, unknown> } } };
          };
        };
      };
      const bazaar = body.result?.structuredContent?.extensions?.bazaar;
      expect(bazaar, name).toBeTruthy();
      expect(bazaar?.schema?.properties?.input, `${name} input`).toBeTruthy();
      expect(bazaar?.schema?.properties?.output, `${name} output`).toBeTruthy();
      expect(bazaar?.info?.output, `${name} output example`).toBeTruthy();
    }
  });
});
