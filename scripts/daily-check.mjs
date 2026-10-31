/**
 * Daily check — one command each morning (free, no payment, no state change).
 *
 *   node scripts/daily-check.mjs
 *   npm run check:daily
 *
 * Reports, and appends one line to `notes/scoreboard-log.md` (private, git-ignored):
 *   - REST gates: /health, /diag, paid-route 402 timing + challenge shape
 *   - MCP gates: initialize timing, tools/call challenge timing
 *   - Wallet: USDC + ETH balance on Base (ground truth for "did anyone pay")
 *   - x402scan: transactions / volume / buyers (via r.jina.ai, best-effort)
 *   - MCP registry: is io.github.skypantherr/arabic-pipeline still active?
 *   - mcprush: tool count, version and grade a buyer sees on the listing
 *   - PayAPI Market: is the listing still live, verified and carrying our receipt?
 *
 * Caveat: this machine reaches the internet through a TLS-intercepting proxy,
 * so a small fraction of local fetches hang or fail spuriously (see DEPLOY.md,
 * "Notes on measuring"). A slow/failing check once is noise; run it again and
 * only react if the same check fails repeatedly or from inside Cloudflare.
 */
import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REST = "https://arabic-pipeline.arabic-pipeline.workers.dev";
const MCP = "https://arabic-pipeline-mcp.arabic-pipeline.workers.dev/";
// Private working notes live outside git (see .gitignore): the scoreboard is an
// ops log, not part of the published repository.
const SCOREBOARD = fileURLToPath(new URL("../notes/scoreboard-log.md", import.meta.url));
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WALLET = "0x05523af5bd166816D1418Ebf7D6371e1fFB1D2e6";

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "WARN"}  ${name}: ${detail}`);
}

async function timedFetch(url, opts = {}, timeoutMs = 15000) {
  // One immediate retry: this machine's TLS-intercepting proxy drops a few
  // percent of connections at random (see DEPLOY.md, "Notes on measuring").
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

// ── 5. MCP registry ──────────────────────────────────────────────────────────
{
  try {
    const r = await timedFetch("https://registry.modelcontextprotocol.io/v0/servers?search=io.github.skypantherr/arabic-pipeline");
    const j = JSON.parse(r.body ?? "{}");
    const entries = j.servers ?? [];
    // The search returns every published version. Reporting `[0]` made this
    // check say v0.1.0 forever after 0.2.0 shipped, so pick the entry the
    // registry itself marks as latest (fall back to the last one).
    const pick =
      entries.find((e) => e._meta?.["io.modelcontextprotocol.registry/official"]?.isLatest) ??
      entries.at(-1);
    const s = pick?.server;
    const meta = pick?._meta?.["io.modelcontextprotocol.registry/official"];
    record(
      "MCP registry",
      meta?.status === "active" && s?.name === "io.github.skypantherr/arabic-pipeline",
      s
        ? `${s.name} v${s.version} status=${meta?.status ?? "unknown"} icon=${s.icons?.length ? "yes" : "none"}`
        : "not found",
    );
  } catch (err) {
    record("MCP registry", false, `error: ${String(err).slice(0, 80)}`);
  }
}

// ── 6. mcprush listing ───────────────────────────────────────────────────────
// The marketplace copy, the tool surface and the version all live outside the
// repo, so they drift silently. This reads the listing's public JSON and reports
// the three things a buyer sees. A missing grade is not a failure: mcprush
// re-grades a changed tool surface and prints "not scanned" until it does.
{
  try {
    // mcprush sits behind Cloudflare, which answers a bare node fetch with a
    // "Just a moment" 403 page, and sometimes a cookie-less request even with a
    // browser UA. Retry a couple of times before reporting anything.
    let r = null, j = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      r = await timedFetch("https://mcprush.com/api/servers/arabic-pipeline-api-mcp", {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          accept: "application/json",
        },
      });
      try {
        j = JSON.parse(r.body ?? "{}");
        break;
      } catch { /* bot page — try again */ }
    }
    if (!j?.listing) throw new Error(`no JSON after retries (last status ${r?.status})`);
    const l = j.listing ?? {};
    const tools = l.toolCount ?? null;
    const version = j.version?.latest ?? null;
    const grade = l.grade ?? "not scanned";
    record(
      "mcprush listing",
      l.slug === "arabic-pipeline-api-mcp" && tools === 9,
      `${tools ?? "?"} tools, v${version ?? "?"}, grade ${grade}`,
    );
  } catch (err) {
    record("mcprush listing", false, `error: ${String(err).slice(0, 80)}`);
  }
}

// ── 7. PayAPI Market listing ─────────────────────────────────────────────────
// PayAPI Market bought a call on 2026-10-31 and published the receipt, which is
// the only independent proof that this deployment settles real money. That proof
// lives on their side and can disappear: the listing can be delisted, paused, or
// the receipt swapped. Their `get_api` MCP tool is free, read-only and spends
// nothing, so read the listing through it and pin the transaction we expect.
const PAYAPI_TX = "0xfc3e42f9f1b60fc13888cba6b400ef78cb966b1fdbcdcd2682aa99bec573ce9c";
{
  try {
    const r = await timedFetch("https://payapi.market/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_api", arguments: { id: "arabic-pipeline-api" } },
      }),
    }, 20000);
    const outer = JSON.parse(r.body ?? "{}");
    const listing = JSON.parse(outer.result?.content?.[0]?.text ?? "{}");
    if (!listing.slug) throw new Error(`no listing (status ${r.status})`);
    const routes = listing.verified_routes ?? [];
    const receipt = routes.find((v) => v.tx_hash === PAYAPI_TX);
    const verified = listing.payment_verified === true && Boolean(receipt);
    record(
      "PayAPI listing",
      verified,
      listing.payment_verified === true
        ? `live, verified, ${listing.verified_route_count ?? routes.length} route(s), ` +
          `${listing.endpoints_count ?? "?"} endpoints, $${listing.price_min}-$${listing.price_max}, ` +
          `receipt ${receipt ? "matches" : "MISSING/CHANGED"}`
        : `NOT verified (paused=${listing.verification_paused ?? "?"})`,
    );
  } catch (err) {
    record("PayAPI listing", false, `error: ${String(err).slice(0, 80)}`);
  }
}

// ── 8. Append to the private scoreboard (append-only log section) ────────────
{
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const now = new Date().toISOString().slice(0, 10);
  const usdcLine = results.find((r) => r.name === "Wallet USDC on Base")?.detail ?? "?";
  const scanLine = results.find((r) => r.name === "x402scan (best-effort)")?.detail ?? "?";
  const regLine = results.find((r) => r.name === "MCP registry")?.detail ?? "?";
  const mcprushLine = results.find((r) => r.name === "mcprush listing")?.detail ?? "?";
  const payapiLine = results.find((r) => r.name === "PayAPI listing")?.detail ?? "?";
  const paidLine = results.find((r) => r.name === "REST paid-route 402 (the landmine guard)")?.detail ?? "?";
  const failed = results.filter((r) => !r.ok);

  const entry =
    `- ${stamp} — balance: ${usdcLine} | paid route: ${paidLine} | x402scan: ${scanLine} | registry: ${regLine} | mcprush: ${mcprushLine} | payapi: ${payapiLine}` +
    (failed.length ? ` | WARN: ${failed.map((f) => f.name).join(", ")}` : " | all green");

  let text = "";
  if (existsSync(SCOREBOARD)) text = readFileSync(SCOREBOARD, "utf8");
  const heading = "## Daily check log (append-only)";
  console.log(`\nAppending to notes/scoreboard-log.md (${now})…`);
  mkdirSync(dirname(SCOREBOARD), { recursive: true });
  if (text.includes(heading)) {
    appendFileSync(SCOREBOARD, entry + "\n");
  } else {
    appendFileSync(SCOREBOARD, `# Scoreboard\n\nPrivate ops log — not published.\n\n${heading}\n\nOne line per run of \`npm run check:daily\`. Newest last. Never rewrite past entries.\n\n${entry}\n`);
  }
  console.log(entry);
  if (failed.length) process.exitCode = 2;
}
