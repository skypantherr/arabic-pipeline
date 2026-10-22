import { describe, expect, it } from "vitest";
import type { FacilitatorClient } from "@x402/core/server";
import { createApp } from "../src/app";
import { readConfig } from "../src/config";

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
      "/text/metrics",
      "/text/normalize",
    ]);
    const normalize = spec.paths["/text/normalize"].post;
    expect(normalize.responses["402"]).toBeTruthy();
    expect(normalize["x-payment-info"]?.price.currency).toBe("USD");
    expect(normalize["x-payment-info"]?.price.amount).toBe("0.005000");
    expect(Object.keys(spec.components.securitySchemes)).toContain("x402Payment");
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
