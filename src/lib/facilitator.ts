import { HTTPFacilitatorClient } from "@x402/core/server";

/**
 * A facilitator client whose `/supported` handshake is served from the
 * Cloudflare edge cache.
 *
 * Why this exists
 * ---------------
 * `x402ResourceServer.initialize()` fetches the facilitator's `/supported`
 * document, and the x402 HTTP middleware *awaits* that initialization before
 * it can answer the first paid request of a Worker isolate. Only paid routes
 * wait for it (free routes and 404s are answered immediately), which is
 * exactly the observed symptom: paid requests intermittently stall for many
 * seconds while every other route answers instantly.
 *
 * The stall comes from the facilitator's own rate limiting. The SDK retries a
 * throttled `/supported` with exponential backoff (1s, 2s, 4s ...), so one
 * throttled handshake costs the buyer ~7s of dead time — which a scanner
 * reads as a failed endpoint, and a real buyer reads as a broken service.
 *
 * The supported document (network list, scheme list, minimum payment
 * amounts, asset metadata) changes rarely, so it is cached at the edge for 15
 * minutes. Cold isolates then answer a paid request with no outbound call at
 * all, and the facilitator sees one request per edge location per quarter
 * hour instead of one per isolate.
 *
 * The cache key is a URL on *our own* origin, because the Workers Cache API
 * only stores entries for the current zone; caching under the facilitator's
 * origin would silently never hit.
 */
export class CachedFacilitatorClient extends HTTPFacilitatorClient {
  private readonly cacheTtlSeconds: number;
  private readonly cacheOrigin: string | undefined;
  private inFlight: Promise<unknown> | null = null;

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

  override async getSupported(): Promise<any> {
    const cache = this.cache;
    const key = this.cacheKey();

    if (cache) {
      try {
        const hit = await cache.match(key);
        if (hit) {
          return await hit.json();
        }
      } catch {
        // A cache read failure must never break the request.
      }
    }

    // Collapse concurrent misses within this isolate onto one fetch.
    if (!this.inFlight) {
      this.inFlight = super
        .getSupported()
        .then(async supported => {
          if (cache) {
            await cache
              .put(
                key,
                new Response(JSON.stringify(supported), {
                  headers: {
                    "content-type": "application/json",
                    "cache-control": `max-age=${this.cacheTtlSeconds}`,
                  },
                }),
              )
              .catch(() => undefined);
          }
          return supported;
        })
        .finally(() => {
          this.inFlight = null;
        });
    }

    return this.inFlight;
  }
}
