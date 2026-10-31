/**
 * Smoke test for the PAID path.
 *
 *   node scripts/smoke-paid-route.mjs [baseUrl]
 *   npm run smoke          # against a local `wrangler dev` on :8787
 *   npm run smoke:prod     # against the deployed Worker
 *
 * Why this exists separately from the vitest suite
 * -------------------------------------------------
 * Two landmines broke the paid path on Cloudflare Workers while every unit
 * test still passed:
 *   1. the Bazaar extension validates route declarations with Ajv, and Ajv
 *      compiles schemas with `new Function` — forbidden in Workers;
 *   2. the Workers Cache API in the facilitator client's `getSupported()`.
 * Both fail only in the Workers runtime, never in Node, so vitest (which runs
 * in Node) could not see them. This script runs against a real Worker
 * (local workerd or the deployed edge) and fails loudly if a paid route does
 * not answer 402 quickly.
 *
 * A paid route that does not answer is worse than a route that 500s: the buyer
 * sees a hang and every indexer writes the service off as dead.
 */
const base = (process.argv[2] || "http://127.0.0.1:8787").replace(/\/$/, "");

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const MAX_MS = 2000;

const t0 = Date.now();
let res;
try {
  res = await fetch(`${base}/text/normalize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "مرحبا بالعالم" }),
  });
} catch (err) {
  console.error(`FAIL  request threw: ${String(err).slice(0, 160)}`);
  process.exit(1);
}
const ms = Date.now() - t0;

const header = res.headers.get("payment-required");
let challenge = null;
if (header) {
  try {
    challenge = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    /* leave null; the checks below will fail */
  }
}
const accept = challenge?.accepts?.[0] ?? {};

const checks = [
  ["status is 402 Payment Required", res.status === 402],
  [`responded in < ${MAX_MS}ms (took ${ms}ms)`, ms < MAX_MS],
  ["PAYMENT-REQUIRED header present", Boolean(header)],
  ["x402Version is 2", challenge?.x402Version === 2],
  ["scheme is exact", accept.scheme === "exact"],
  ["network is eip155:8453 (Base)", accept.network === "eip155:8453"],
  ["asset is USDC on Base", accept.asset === USDC_BASE],
  ['extra.name is "USD Coin"', accept.extra?.name === "USD Coin"],
  ["amount is 5000 atomic ($0.005)", accept.amount === "5000"],
  ["payTo is set", typeof accept.payTo === "string" && accept.payTo.startsWith("0x")],
];

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) ok = false;
}

/**
 * MCP surface guard.
 *
 * Free path, but it is what every directory and scanner reads - and the SDK
 * transport rejects any Accept header other than the exact pair with a 406
 * before it reads the JSON-RPC body. That is how MCPRush's scanner ended up
 * grading a manifest instead of a live surface (96 instead of 100) and how
 * Coinbase's validator could not read the MCP challenge. A probe that sends
 * `* / *` must get the tools, with the declared metadata attached.
 */
const MCP_URL = process.env.MCP_URL || "https://arabic-pipeline-mcp.arabic-pipeline.workers.dev/";
const mcpChecks = [];
try {
  const init = await fetch(MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "*/*" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } },
    }),
  });
  mcpChecks.push([`mcp initialize accepts Accept: */* (${init.status})`, init.status === 200]);

  const list = await fetch(MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "*/*" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  });
  const body = await list.json().catch(() => ({}));
  const tools = body?.result?.tools ?? [];
  const expected = [
    "text_metrics",
    "text_normalize",
    "text_detect_language",
    "text_chunk",
    "text_diff",
    "text_search",
    "audio_transcribe",
    "doc_extract",
    "doc_extract_batch",
  ].sort();
  const names = tools.map((t) => t.name).sort();
  mcpChecks.push([
    `mcp tools/list returns the 9 declared tools (${tools.length})`,
    list.status === 200 && names.join(",") === expected.join(","),
  ]);
  mcpChecks.push([
    "every tool declares a title and readOnlyHint",
    tools.length > 0 && tools.every((t) => Boolean(t.title) && t.annotations?.readOnlyHint === true),
  ]);
} catch (err) {
  mcpChecks.push([`mcp probe threw: ${String(err).slice(0, 80)}`, false]);
}
for (const [name, pass] of mcpChecks) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) ok = false;
}

console.log(`\n${base} -> 402 in ${ms}ms  |  mcp -> ${MCP_URL}`);
if (!ok) {
  console.error("\nThe paid path is broken. Nothing can buy this service until this passes.");
  process.exit(1);
}
