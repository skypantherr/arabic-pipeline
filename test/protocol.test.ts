import { describe, expect, it } from "vitest";
import type { FacilitatorClient } from "@x402/core/server";
import { validateDiscoveryExtension, validateDiscoveryExtensionSpec } from "@x402/extensions/bazaar";
import { createApp } from "../src/app";
import { PRICES, readConfig } from "../src/config";

const NET = "eip155:8453";
const PAY_TO = "0x05523af5bd166816D1418Ebf7D6371e1fFB1D2e6";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/** Stub facilitator: lets us assert the 402 challenge without touching the network. */
const stubFacilitator = {
  verify: async () => ({ isValid: true, payer: "0x" + "1".repeat(40) }),
  settle: async () => ({
    success: true,
    transaction: "0x" + "2".repeat(64),
    network: NET,
    payer: "0x" + "1".repeat(40),
  }),
  getSupported: async () => ({
    kinds: [{ x402Version: 2, scheme: "exact", network: NET }],
    extensions: [],
    signers: {},
  }),
} as unknown as FacilitatorClient;

const cfg = readConfig({ X402_NETWORK: NET, X402_PAY_TO: PAY_TO, X402_FACILITATOR_URL: "https://x402.dexter.cash" });
const app = createApp(cfg, stubFacilitator);

interface Accept {
  scheme: string;
  network: string;
  payTo: string;
  asset?: string;
  amount?: string;
  maxTimeoutSeconds?: number;
  extra?: { name?: string; version?: string };
}

async function challenge(res: Response): Promise<{ x402Version: number; accepts: Accept[] }> {
  const header = res.headers.get("PAYMENT-REQUIRED");
  expect(header).toBeTruthy();
  const decoded = Buffer.from(header as string, "base64").toString("utf8");
  return JSON.parse(decoded) as { x402Version: number; accepts: Accept[] };
}

describe("free routes", () => {
  it("serves service info without payment", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { network: string; payTo: string; endpoints: unknown[] };
    expect(body.network).toBe(NET);
    expect(body.payTo).toBe(PAY_TO);
    expect(Array.isArray(body.endpoints)).toBe(true);
  });

  it("serves health without payment", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("serves a valid OpenAPI 3.1 document with per-operation x-payment-info", async () => {
    const res = await app.request("/openapi.json");
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      openapi: string;
      info: { title: string; "x-guidance"?: string; contact?: { email?: string } };
      paths: Record<string, Record<string, { responses: Record<string, unknown>; "x-payment-info"?: { price: { amount: string; currency: string } } }>>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("Arabic Pipeline API");
    expect(spec.info["x-guidance"]).toBeTruthy();
    expect(spec.info.contact?.email).toBe("skypantherr@hotmail.com");
    expect(Object.keys(spec.paths).sort()).toEqual([
      "/audio/transcribe",
      "/doc/extract",
      "/doc/extract/batch",
      "/text/chunk",
      "/text/detect",
      "/text/diff",
      "/text/metrics",
      "/text/normalize",
      "/text/search",
    ]);
    const normalize = spec.paths["/text/normalize"].post;
    expect(normalize.responses["402"]).toBeTruthy();
    expect(normalize["x-payment-info"]?.price.currency).toBe("USD");
    expect(normalize["x-payment-info"]?.price.amount).toBe("0.005000");
    expect(Object.keys(spec.components.securitySchemes)).toContain("x402Payment");
  });

  it("serves an x402 manifest that lists exactly the priced routes", async () => {
    const res = await app.request("https://api.test/.well-known/x402");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age");
    const body = (await res.json()) as { version: number; resources: string[]; network: string };
    expect(body.version).toBe(1);
    expect(body.network).toBe(NET);

    const listed = [...new Set(body.resources.map((url) => new URL(url).pathname))].sort();
    const priced = [...new Set(Object.keys(PRICES).map((route) => route.split(" ")[1]))].sort();
    expect(listed).toEqual(priced);
    // Absolute https URLs on this origin, as the manifest contract requires.
    for (const url of body.resources) expect(url).toMatch(/^https:\/\/api\.test\/[a-z]+\//);
  });

  it("serves /llms.txt naming every route and price", async () => {
    const res = await app.request("/llms.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const text = await res.text();
    for (const [route, price] of Object.entries(PRICES)) {
      expect(text).toContain(route);
      expect(text).toContain(`$${price}`);
    }
    expect(text).toContain("PAYMENT-REQUIRED");
  });

  it("serves a favicon for discovery validators", async () => {
    const res = await app.request("/favicon.svg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
  });
});

describe("bazaar discovery on the paid path", () => {
  /**
   * These are the assertions that would have caught the discovery gap: the
   * metadata existed in `/` and `/openapi.json`, but not in the 402 itself, so
   * indexers graded every route "non-invocable". The declarations are validated
   * here with the package's own validators (Ajv runs in Node, never in the
   * Worker) so a malformed example cannot ship.
   */
  it("attaches a valid input and output schema to every 402", async () => {
    for (const route of Object.keys(PRICES)) {
      const [method, path] = route.split(" ");

      const res =
        method === "GET"
          ? await app.request(`${path}?text=${encodeURIComponent("مرحبا")}`)
          : await app.request(path, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({}),
            });

      expect(res.status, route).toBe(402);
      const decoded = (await challenge(res)) as unknown as {
        extensions?: { bazaar?: { info?: Record<string, unknown>; schema?: { properties?: Record<string, unknown> } } };
      };
      const bazaar = decoded.extensions?.bazaar;
      expect(bazaar, `${route} has no bazaar extension`).toBeTruthy();
      expect(bazaar?.schema?.properties?.input, `${route} input schema missing`).toBeTruthy();
      expect(bazaar?.schema?.properties?.output, `${route} output schema missing`).toBeTruthy();

      const spec = validateDiscoveryExtensionSpec(bazaar as never);
      expect(spec.valid, `${route}: ${spec.errors?.join("; ")}`).toBe(true);
      const schema = validateDiscoveryExtension(bazaar as never);
      expect(schema.valid, `${route}: ${schema.errors?.join("; ")}`).toBe(true);

      // The JSON body must carry the same declaration as the header, because
      // clients that do not decode headers still read the body.
      const body = (await res.json()) as { extensions?: { bazaar?: { info?: Record<string, unknown> } } };
      expect(body.extensions?.bazaar?.info, `${route} body metadata`).toEqual(bazaar?.info);
    }
  });
});

describe("paid route handlers", () => {
  /** The stub facilitator accepts any well-formed payload; this exercises the handler, not the chain. */
  const paymentHeaderFor = (amount: string) =>
    Buffer.from(
      JSON.stringify({
        x402Version: 2,
        accepted: {
          scheme: "exact",
          network: NET,
          amount,
          asset: USDC_BASE,
          payTo: PAY_TO,
          maxTimeoutSeconds: 300,
          extra: { name: "USD Coin", version: "2" },
        },
        payload: {
          signature: "0x" + "3".repeat(130),
          authorization: {
            from: "0x" + "1".repeat(40),
            to: PAY_TO,
            value: amount,
            validAfter: "0",
            validBefore: "9999999999",
            nonce: "0x" + "0".repeat(64),
          },
        },
      }),
    ).toString("base64");

  const paymentHeader = paymentHeaderFor("2000");

  async function paid(path: string, body: unknown): Promise<Response> {
    return app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "PAYMENT-SIGNATURE": paymentHeader },
      body: JSON.stringify(body),
    });
  }

  it("POST /text/detect returns a language guess", async () => {
    const res = await paid("/text/detect", { text: "مرحبا بالعالم" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cost_usd: number; language: string; confidence: number };
    expect(body.cost_usd).toBe(0.002);
    expect(body.language).toBe("ar");
    expect(body.confidence).toBe(1);
  });

  it("POST /text/chunk returns offsets into the original text", async () => {
    const input = "أول جملة. ثاني جملة. ثالث جملة.";
    const res = await paid("/text/chunk", { text: input, max_chars: 15 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      count: number;
      total_chars: number;
      chunks: Array<{ text: string; start: number; end: number }>;
    };
    expect(body.total_chars).toBe(input.length);
    expect(body.count).toBeGreaterThan(1);
    for (const chunk of body.chunks) {
      expect(input.slice(chunk.start, chunk.end)).toBe(chunk.text);
      expect(chunk.text.length).toBeLessThanOrEqual(15);
    }
  });

  it("POST /text/chunk rejects an invalid max_chars", async () => {
    const res = await paid("/text/chunk", { text: "مرحبا", max_chars: 9000 });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_max_chars");
  });

  it("POST /text/diff returns added and removed words", async () => {
    const res = await paid("/text/diff", { a: "مرحبا بالعالم", b: "مرحبا يا عالم" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { equal: boolean; added: string[]; removed: string[]; similarity: number };
    expect(body.equal).toBe(false);
    expect(body.added).toEqual(["يا", "عالم"]);
    expect(body.removed).toEqual(["بالعالم"]);
    expect(body.similarity).toBe(0.4);
  });

  it("POST /text/diff rejects text above the word limit with 413", async () => {
    const long = Array.from({ length: 1501 }, () => "w").join(" ");
    const res = await paid("/text/diff", { a: long, b: "w" });
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toBe("text_too_large");
  });

  it("POST /text/search returns normalised matches with exact offsets", async () => {
    const text = "قَالَتْ فَاطِمَةُ: مرحبا";
    const res = await paid("/text/search", { text, query: "فاطمة" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      count: number;
      total_matches: number;
      matches: Array<{ start: number; end: number; text: string; snippet: string }>;
    };
    expect(body.count).toBe(1);
    expect(body.total_matches).toBe(1);
    expect(body.matches[0].text).toBe("فَاطِمَةُ");
    expect(text.slice(body.matches[0].start, body.matches[0].end)).toBe("فَاطِمَةُ");
    expect(body.matches[0].snippet).toContain("فَاطِمَةُ");
  });

  it("POST /text/search validates options and size", async () => {
    const bad = await paid("/text/search", { text: "مرحبا", query: "مرحبا", max_results: 0 });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe("invalid_max_results");

    const tooBig = await paid("/text/search", { text: "x".repeat(100_001), query: "x" });
    expect(tooBig.status).toBe(413);
    expect(((await tooBig.json()) as { error: string }).error).toBe("text_too_large");
  });

  /**
   * Batch validation runs before any model call, so these use an app with a
   * dummy key: a validation bug shows up as the wrong status instead of a
   * silent network attempt, and no test ever reaches Gemini.
   */
  const keyedApp = createApp(
    readConfig({
      X402_NETWORK: NET,
      X402_PAY_TO: PAY_TO,
      X402_FACILITATOR_URL: "https://x402.dexter.cash",
      GEMINI_API_KEY: "test-key",
    }),
    stubFacilitator,
  );

  async function paidKeyed(path: string, body: unknown): Promise<Response> {
    return keyedApp.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "PAYMENT-SIGNATURE": paymentHeaderFor("100000") },
      body: JSON.stringify(body),
    });
  }

  it("POST /doc/extract/batch rejects a missing document list", async () => {
    const res = await paidKeyed("/doc/extract/batch", { documents: [] });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("invalid_body");
    expect(body.message).toContain("1 to 5 documents");
  });

  it("POST /doc/extract/batch caps a batch at five documents", async () => {
    const documents = Array.from({ length: 6 }, () => ({ document_base64: "AAA" }));
    const res = await paidKeyed("/doc/extract/batch", { documents });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("too_many_documents");
  });

  it("POST /doc/extract/batch reports which document is malformed", async () => {
    const res = await paidKeyed("/doc/extract/batch", {
      documents: [{ document_base64: "AAA" }, { id: "second" }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; index: number };
    expect(body.error).toBe("invalid_document");
    expect(body.index).toBe(1);
  });

  it("POST /doc/extract/batch rejects a combined payload above 12 MiB", async () => {
    const chunk = "A".repeat(2_600_000);
    const documents = Array.from({ length: 5 }, () => ({ document_base64: chunk }));
    const res = await paidKeyed("/doc/extract/batch", { documents });
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toBe("payload_too_large");
  });

  it("POST /doc/extract/batch refuses to call the model without a key", async () => {
    const res = await app.request("/doc/extract/batch", {
      method: "POST",
      headers: { "content-type": "application/json", "PAYMENT-SIGNATURE": paymentHeaderFor("100000") },
      body: JSON.stringify({ documents: [{ document_base64: "AAA" }] }),
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("model_unavailable");
  });
});

describe("x402 payment gate", () => {
  it("returns 402 with a correct challenge for a paid route", async () => {
    const res = await app.request("/text/normalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "مرحبا" }),
    });
    expect(res.status).toBe(402);

    const ch = await challenge(res);
    expect(ch.x402Version).toBe(2);
    const accept = ch.accepts[0];
    expect(accept.scheme).toBe("exact");
    expect(accept.network).toBe(NET);
    expect(accept.payTo).toBe(PAY_TO);
    expect(accept.asset).toBe(USDC_BASE);
    // 0.005 USDC == 5000 atomic units (6 decimals)
    expect(accept.amount).toBe("5000");
    expect(accept.extra?.name).toBe("USD Coin");
  });

  it("returns a self-describing 402 body for human callers", async () => {
    const res = await app.request("/text/normalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "مرحبا" }),
    });
    const body = (await res.json()) as { error: string; price_usd: number; how_to_pay: string };
    expect(body.error).toBe("payment_required");
    expect(body.price_usd).toBe(0.005);
    expect(body.how_to_pay).toContain("PAYMENT-REQUIRED");
  });

  it("prices each route differently", async () => {
    const metrics = await app.request("/text/metrics?text=مرحبا");
    expect((await challenge(metrics)).accepts[0].amount).toBe("2000"); // $0.002

    const normalize = await app.request("/text/normalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "مرحبا" }),
    });
    expect((await challenge(normalize)).accepts[0].amount).toBe("5000"); // $0.005

    for (const path of ["/text/detect", "/text/chunk", "/text/diff", "/text/search"]) {
      const payload =
        path === "/text/diff"
          ? { a: "أ", b: "ب" }
          : path === "/text/search"
            ? { text: "مرحبا", query: "مرحبا" }
            : { text: "مرحبا" };
      const res = await app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect((await challenge(res)).accepts[0].amount).toBe("2000"); // $0.002
    }

    const transcribe = await app.request("/audio/transcribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ audio_base64: "AAA" }),
    });
    expect((await challenge(transcribe)).accepts[0].amount).toBe("20000"); // $0.02

    const extract = await app.request("/doc/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ document_base64: "AAA" }),
    });
    expect((await challenge(extract)).accepts[0].amount).toBe("30000"); // $0.03

    const batch = await app.request("/doc/extract/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ documents: [{ document_base64: "AAA" }] }),
    });
    expect((await challenge(batch)).accepts[0].amount).toBe("100000"); // $0.10
  });

  it("does not gate OPTIONS preflight", async () => {
    const res = await app.request("/text/normalize", { method: "OPTIONS" });
    expect(res.status).toBe(204);
  });

  it("sets CORS headers on the 402 so browsers can pay", async () => {
    const res = await app.request("/text/normalize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "مرحبا" }),
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-expose-headers")).toContain("PAYMENT-REQUIRED");
  });
});
