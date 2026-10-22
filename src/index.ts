import { createApp } from "./app";
import { readConfig, type Env } from "./config";
import { CachedFacilitatorClient } from "./lib/facilitator";

interface Cached {
  key: string;
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => Response | Promise<Response>;
}

let cached: Cached | null = null;

/**
 * Cloudflare Worker entry point.
 *
 * The facilitator client and the Hono app are built lazily and cached, so a
 * cold isolate only pays the facilitator handshake once.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const cfg = readConfig(env);
    const key = `${cfg.network}|${cfg.payTo}|${cfg.facilitatorUrl}`;
    if (!cached || cached.key !== key) {
      const facilitator = new CachedFacilitatorClient({
        url: cfg.facilitatorUrl,
        timeoutMs: 10_000,
        // Cache the facilitator handshake under our own origin: the Workers
        // Cache API only stores entries for the current zone.
        cacheOrigin: new URL(request.url).origin,
      });
      const app = createApp(cfg, facilitator);
      cached = { key, fetch: (req, e, c) => app.fetch(req, e, c) };
    }
    return cached.fetch(request, env, ctx);
  },
};
