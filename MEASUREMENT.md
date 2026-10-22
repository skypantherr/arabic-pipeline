# Measurement plan — revised (22 Oct 2026)

*This supersedes the "Phase 4 — the 30-day test" section in `DEPLOY.md`
(leave that file alone; the deploy session is editing it concurrently).*

**30 days is a review checkpoint, not a waiting period.** Earnings can start
immediately: PayAPI Market's $0.10 canary settles on the day you publish, and
other agents can call the listing the same hour. The window is simply how long
a fresh listing gets to find its first real buyers before we judge it.

## Staged decision tree

| When | Check | If good | If bad |
|---|---|---|---|
| **Day 0 (publish)** | canary receipt | first money lands → note the tx hash | canary failed → read the error, fix, resubmit (free) |
| **Day 3–7** | any calls beyond the canary? | push harder: more endpoints, more directories, announce it | **zero calls = a *discovery* problem, not a demand problem.** Fix distribution first (below) |
| **Day 14** | calls + unique buyers + revenue/call | keep going | still zero after real distribution → demand is the problem |
| **Day 21–30** | same | keep going | still zero → **repoint the same engine** at a proven-thin class (regulatory/filings data, or enrichment/people data). Do not rebuild |

## If calls are zero, do distribution before touching the product

1. Publish the **MCP server** (this is the main discovery channel — 486 of
   PayAPI's 832 listings expose an MCP endpoint).
2. Register in every index: PayAPI Market, official MCP Registry, x402scan,
   Coinbase x402 Bazaar, the402.dev, endpoint.x402jp.
3. Put the service link where agent-tool listings get shared: an X post, the
   Solana/agent Discords, the x402 community channels.
4. Only after all of that, consider that the capability itself is unwanted.

## Numbers to judge it against

- **Success bar:** 10 buyers × 500 calls × $0.02 ≈ **$100/month**.
  (Context: the best services in this market have 100–700 buyers; the *average*
  seller earns ≈ $39/month — $1.5M ÷ 38K sellers. That is the base rate, so
  don't promise yourself $100.)
- **Kill criterion 2:** calls happen but revenue per call < 20% of list price →
  the buyers want something else. Reprice or re-scope.
- **Never build a second service before the first has one paying caller.**

## Free things to point the canary at

When filling the PayAPI listing form, nominate a **zero-cost-to-serve route**
(`/text/normalize` $0.005 or `/text/metrics` $0.002) as the paid route, so
their $0.10 test call costs us no model calls and no money.
