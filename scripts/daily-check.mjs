/**
 * Daily check — one command each morning (free, no payment, no state change).
 *
 *   node scripts/daily-check.mjs
 *   npm run check:daily
 *
 * Reports, and appends one line to SCOREBOARD.md (append-only log section):
 *   - REST gates: /health, /diag, paid-route 402 timing + challenge shape
 *   - MCP gates: initialize timing, tools/call challenge timing
 *   - Wallet: USDC + ETH balance on Base (ground truth for "did anyone pay")
 *   - x402scan: transactions / volume / buyers (via r.jina.ai, best-effort)
 *   - PayAPI Market: is our listing live in the public index?
 *   - MCP registry: is io.github.skypantherr/arabic-pipeline still active?
 *
 * Caveat: this machine reaches the internet through a TLS-intercepting proxy,
 * so a small fraction of local fetches hang or fail spuriously (see DEPLOY.md,
 * "measurement trap"). A slow/failing check once is noise; run it again and
 * only react if the same check fails repeatedly or from inside Cloudflare.
 */
import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REST = "https://arabic-pipeline.arabic-pipeline.workers.dev";
const MCP = "https://arabic-pipeline-mcp.arabic-pipeline.workers.dev/";
const SCOREBOARD = fileURLToPath(new URL("../SCOREBOARD.md", import.meta.url));
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WALLET = "0x05523af5bd166816D1418Ebf7D6371e1fFB1D2e6";

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "WARN"}  ${name}: ${detail}`);
}

async function timedFetch(url, opts = {}, timeoutMs = 15000) {
  // One immediate retry: this machine's TLS-intercepting proxy drops a few
  // percent of connections at random (the DEPLOY.md "measurement trap").
  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        ...opts,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await res.text();
      return { status: res.status, ms: Date.now() - t0, body, headers: res.headers, error: null };
    } catch (err) {
      if (attempt === 0) continue;
      return { status: 0, ms: Date.now() - t0, body: null, headers: null, error: String(err?.cause ?? err) };
    }
  }
}

// ── 1. REST gates ────────────────────────────────────────────────────────────
{
  const h = await timedFetch(`${REST}/health`);
  record("REST /health", h.status === 200, h.error ? `error: ${h.error}` : `${h.status} in ${h.ms}ms`);
}
{
  const d = await timedFetch(`${REST}/diag`);
  let kinds = null, gem = null;
  try {
    const j = JSON.parse(d.body);
    kinds = j?.bundledSnapshot?.kinds ?? null;
    gem = j?.geminiKeyStatus ?? null;
  } catch { /* covered by the recorded result */ }
  const ok = d.status === 200 && kinds === 44 && (gem === null || gem.ok === true);
  const gemNote = gem
    ? gem.configured
      ? `, gemini key ${gem.ok ? "valid (live, " + gem.ms + "ms)" : "INVALID — model routes are dark, rotate again"}`
      : ", gemini key not configured"
    : "";
  record(
    "REST /diag (bundled snapshot)",
    ok,
    ok ? `${kinds} kinds in ${d.ms}ms${gemNote}` : `status ${d.status}, kinds ${kinds ?? "unreadable"}`,
  );
}
{
  const r = await timedFetch(`${REST}/text/normalize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "مرحبا بالعالم" }),
  });
  let challenge = null;
  try {
    challenge = JSON.parse(Buffer.from(r.headers?.get("payment-required") ?? "", "base64").toString("utf8"));
  } catch { /* covered by the recorded result */ }
  const a = challenge?.accepts?.[0] ?? {};
  const ok =
    r.status === 402 &&
    r.ms < 2000 &&
    challenge?.x402Version === 2 &&
    a.scheme === "exact" &&
    a.network === "eip155:8453" &&
    a.asset === USDC_BASE &&
    a.extra?.name === "USD Coin" &&
    a.amount === "5000" &&
    String(a.payTo ?? "").toLowerCase() === WALLET.toLowerCase();
  record(
    "REST paid-route 402 (the landmine guard)",
    ok,
    ok
      ? `402, ${r.ms}ms, challenge correct`
      : `status ${r.status} in ${r.ms}ms, challenge ${challenge ? "wrong shape" : "absent"} — ${r.error ?? ""}${ok ? "" : " RUN npm run smoke:prod"}`,
  );
}

// ── 2. MCP gates ─────────────────────────────────────────────────────────────
{
  const i = await timedFetch(MCP, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "daily-check", version: "1.0" } },
    }),
  });
  record("MCP initialize", i.status === 200, i.error ? `error: ${i.error}` : `${i.status} in ${i.ms}ms`);
}
{
  const c = await timedFetch(MCP, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "text_normalize", arguments: { text: "بيت" } },
    }),
  });
  const carriesChallenge = (c.body ?? "").includes("Payment required") && (c.body ?? "").includes("x402Version");
  record("MCP tools/call challenge", c.status === 200 && carriesChallenge, `${c.status} in ${c.ms}ms, challenge ${carriesChallenge ? "present" : "MISSING"}`);
}

// ── 3. Wallet balance on Base (the decision point) ───────────────────────────
{
  const rpc = (method, params) =>
    fetch("https://mainnet.base.org", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }).then((r) => r.json());

  let usdcAtomic = "error", ethAtomic = "error";
  try {
    const [u, e] = await Promise.all([
      rpc("eth_call", [{ to: USDC_BASE, data: "0x70a08231" + WALLET.toLowerCase().slice(2).padStart(64, "0") }, "latest"]),
      rpc("eth_getBalance", [WALLET, "latest"]),
    ]);
    usdcAtomic = u.result ? BigInt(u.result).toString() : "rpc-error";
    ethAtomic = e.result ? BigInt(e.result).toString() : "rpc-error";
  } catch (err) {
    usdcAtomic = `fetch-error: ${String(err).slice(0, 80)}`;
    ethAtomic = usdcAtomic;
  }
  const usdc = /^\d+$/.test(usdcAtomic) ? (Number(BigInt(usdcAtomic)) / 1e6).toFixed(6) : "?";
  const eth = /^\d+$/.test(ethAtomic) ? (Number(BigInt(ethAtomic)) / 1e18).toFixed(8) : "?";
  record("Wallet USDC on Base", /^\d+$/.test(usdcAtomic), `${usdc} USDC (${Number(usdc) > 0 ? "THE CANARY LANDED / revenue exists" : "no payments yet"}) · ${eth} ETH`);
}

// ── 4. x402scan (best-effort; JS-heavy page, read through r.jina.ai) ─────────
{
  let scan = "unavailable";
  const p = await timedFetch(`https://r.jina.ai/https://www.x402scan.com/server/298e1e2b-3f5c-4890-9791-6d063fd20931`, {}, 25000);
  if (p.body) {
    const grab = (label) => {
      const m = p.body.match(new RegExp(`${label}\\s*\\n+###+\\s*([^\\n]+)`));
      return m ? m[1].trim() : "?";
    };
    scan = `tx ${grab("Transactions")} · vol ${grab("Volume")} · buyers ${grab("Buyers")}`;
  } else {
    scan = `unreachable (${p.error ?? p.status})`;
  }
  record("x402scan (best-effort)", true, scan);
}

// ── 5. PayAPI Market index ───────────────────────────────────────────────────
{
  let payapi = "error";
  try {
    const p = await timedFetch("https://payapi.market/agent/search?q=arabic");
    const j = JSON.parse(p.body ?? "{}");
    const others = j.results?.length ?? 0;
    const ours = (j.results ?? []).some((r) => String(r.base_url ?? "").includes("arabic-pipeline"));
    payapi = ours
      ? "OUR LISTING IS LIVE"
      : `not live yet (${others} other 'arabic' listings; index only shows settlement-verified)`;
    record("PayAPI index", true, payapi);
  } catch (err) {
    record("PayAPI index", false, `error: ${String(err).slice(0, 80)}`);
  }
}

// ── 6. MCP registry ──────────────────────────────────────────────────────────
{
  try {
    const r = await timedFetch("https://registry.modelcontextprotocol.io/v0/servers?search=arabic-pipeline");
    const j = JSON.parse(r.body ?? "{}");
    const s = j.servers?.[0]?.server;
    const meta = j.servers?.[0]?._meta?.["io.modelcontextprotocol.registry/official"];
    record(
      "MCP registry",
      meta?.status === "active",
      s ? `${s.name} v${s.version} status=${meta?.status ?? "unknown"}` : "not found",
    );
  } catch (err) {
    record("MCP registry", false, `error: ${String(err).slice(0, 80)}`);
  }
}

// ── 7. Append to SCOREBOARD.md (append-only log section) ─────────────────────
{
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const now = new Date().toISOString().slice(0, 10);
  const usdcLine = results.find((r) => r.name === "Wallet USDC on Base")?.detail ?? "?";
  const payLine = results.find((r) => r.name === "PayAPI index")?.detail ?? "?";
  const scanLine = results.find((r) => r.name === "x402scan (best-effort)")?.detail ?? "?";
  const regLine = results.find((r) => r.name === "MCP registry")?.detail ?? "?";
  const paidLine = results.find((r) => r.name === "REST paid-route 402 (the landmine guard)")?.detail ?? "?";
  const failed = results.filter((r) => !r.ok);

  const entry =
    `- ${stamp} — balance: ${usdcLine} | paid route: ${paidLine} | x402scan: ${scanLine} | PayAPI: ${payLine} | registry: ${regLine}` +
    (failed.length ? ` | WARN: ${failed.map((f) => f.name).join(", ")}` : " | all green");

  let text = "";
  if (existsSync(SCOREBOARD)) text = readFileSync(SCOREBOARD, "utf8");
  const heading = "## Daily check log (append-only)";
  console.log(`\nAppending to SCOREBOARD.md (${now})…`);
  if (text.includes(heading)) {
    appendFileSync(SCOREBOARD, entry + "\n");
  } else {
    appendFileSync(SCOREBOARD, `\n${heading}\n\nOne line per run of \`npm run check:daily\`. Newest last. Never rewrite past entries.\n\n${entry}\n`);
  }
  console.log(entry);
  if (failed.length) process.exitCode = 2;
}
