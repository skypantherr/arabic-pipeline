import { HTTPFacilitatorClient } from "@x402/core/server";
import bundled from "./facilitator-supported.json";

/**
 * A facilitator client whose `/supported` handshake is served locally.
 *
 * Why this exists
 * ---------------
 * `x402ResourceServer.initialize()` fetches the facilitator's `/supported`
 * document, and the x402 HTTP middleware *awaits* that initialization before
 * it can answer the first paid request of a Worker isolate. Only paid routes
 * wait for it (free routes answer immediately), which is exactly the observed
 * production symptom: `GET /health` in ~70ms, but a POST to a paid route
 * stalling for many seconds.
 *
 * The stall is the facilitator being slow or rate-limited from a shared edge
 * egress IP; the SDK then retries with exponential backoff. A buyer sees a dead
 * endpoint.
 *
 * Fix: the supported document is **bundled** (`facilitator-supported.json`,
 * refreshed by `scripts/refresh-facilitator-snapshot.mjs`). The 402 path does
 * no network I/O at all. The facilitator is still contacted for `/verify` and
 * `/settle` — i.e. only when a real payment is presented.
 *
 * The edge cache is kept as a fast path for the bundled document, so a warm
 * PoP does not even have to re-parse it.
 */
export class CachedFacilitatorClient extends HTTPFacilitatorClient {
  private readonly cacheTtlSeconds: number;
  private readonly cacheOrigin: string | undefined;

  constructor(options: {
    url: string;
    timeoutMs?: number;
    cacheTtlSeconds?: number;
    /** Our own origin, used to build a same-zone cache key. */
    cacheOrigin?: string;
  }) {
    super({ url: options.url, timeoutMs: options.timeoutMs ?? 10_000 });
    this.cacheTtlSeconds = options.cacheTtlSeconds ?? 900;
    this.cacheOrigin = options.cacheOrigin;
  }

  /** Same-zone cache key. Falls back to the facilitator URL if unknown. */
  private cacheKey(): string {
    const origin = this.cacheOrigin ?? this.url;
    return `${origin.replace(/\/$/, "")}/__facilitator_supported`;
  }

  private get cache(): Cache | undefined {
    return (globalThis as { caches?: { default?: Cache } }).caches?.default;
  }

  /** Metadata about the bundled snapshot, surfaced by /diag. */
  static get snapshotInfo() {
    return {
      kinds: (bundled.kinds as unknown[]).length,
      fetchedAt: (bundled as { _fetchedAt?: string })._fetchedAt,
      facilitator: (bundled as { _facilitator?: string })._facilitator,
    };
  }

  override async getSupported(): Promise<any> {
    // Bundled snapshot: no network, no cache, no waiting. See the class comment
    // for why the edge cache was dropped: the Workers Cache API path behaved
    // differently on the edge than in local workerd, and the paid path must be
    // deterministic.
    return {
      kinds: bundled.kinds,
      extensions: bundled.extensions,
      signers: bundled.signers,
    };
  }
}
