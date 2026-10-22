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
console.log(`\n${base} -> 402 in ${ms}ms`);
if (!ok) {
  console.error("\nThe paid path is broken. Nothing can buy this service until this passes.");
  process.exit(1);
}
