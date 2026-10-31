/**
 * Refresh the bundled facilitator "/supported" snapshot.
 *
 *   node scripts/refresh-facilitator-snapshot.mjs
 *
 * Why this exists
 * ---------------
 * The x402 resource server asks the facilitator what it supports
 * ("/supported") before it can answer a 402. That call happens on the request
 * path, and a public facilitator can be slow or rate-limited from a shared
 * edge egress IP — which showed up in production as paid requests stalling for
 * many seconds while every free route answered in ~70ms.
 *
 * So the document is bundled instead: the 402 path never touches the network.
 * The facilitator is still contacted for /verify and /settle, i.e. only when a
 * real payment is presented.
 *
 * Run this whenever the facilitator's supported set changes (or quarterly).
 */
import { writeFileSync } from "node:fs";

const FACILITATOR = process.env.X402_FACILITATOR_URL || "https://x402.dexter.cash";
const OUT = "src/lib/facilitator-supported.json";

const res = await fetch(`${FACILITATOR.replace(/\/$/, "")}/supported`);
if (!res.ok) {
  console.error(`FAIL: ${FACILITATOR}/supported -> HTTP ${res.status}`);
  process.exit(1);
}
const doc = await res.json();

const snapshot = {
  _note:
    "Snapshot of the facilitator's /supported document. Bundled so the 402 path NEVER waits on a network call. Refresh with: node scripts/refresh-facilitator-snapshot.mjs",
  _fetchedAt: new Date().toISOString(),
  _facilitator: FACILITATOR,
  kinds: doc.kinds,
  extensions: doc.extensions,
  signers: doc.signers,
};

writeFileSync(OUT, JSON.stringify(snapshot, null, 2));

const base = (doc.kinds || []).filter((k) => k.network === "eip155:8453" && k.scheme === "exact");
console.log(`wrote ${OUT}`);
console.log(`  kinds: ${(doc.kinds || []).length}`);
for (const k of base) {
  console.log(
    `  base/exact -> asset=${k.extra?.name} floor=${k.extra?.minPaymentAmountAtomic} atomic gasSponsored=${k.extra?.features?.gasSponsored}`,
  );
}
if (!base.length) {
  console.error("WARNING: no eip155:8453 exact kind in the snapshot — check the facilitator");
  process.exit(2);
}
