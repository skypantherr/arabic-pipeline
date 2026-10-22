/**
 * Runtime configuration + the price table.
 *
 * Env vars are read per-request (Cloudflare Workers style) and are the single
 * source of truth for: which chain we settle on, where the money goes, which
 * facilitator verifies/settles, and which Gemini models to call.
 */

export const NETWORKS = {
  /** Base mainnet */
  base: "eip155:8453",
  /** Base Sepolia (testnet, free faucet ETH) */
  baseSepolia: "eip155:84532",
} as const;

export type NetworkKey = keyof typeof NETWORKS;

/**
 * Public facilitators (no account, no card, no KYC).
 *  - Dexter: free, no account required, no facilitator fee, Base + 10 EVM + Solana.
 *  - x402.org: the public dev/testnet facilitator (SDK default).
 */
export const FACILITATOR_URLS = {
  base: "https://x402.dexter.cash",
  baseSepolia: "https://x402.org/facilitator",
} as const;

/** Price per call in USD. Median listed price across the x402 market is $0.01. */
export const PRICES = {
  "GET /text/metrics": 0.002,
  "POST /text/metrics": 0.002,
  "POST /text/normalize": 0.005,
  "POST /audio/transcribe": 0.02,
  "POST /doc/extract": 0.03,
} as const;

export type PricedRoute = keyof typeof PRICES;

export const ROUTE_DESCRIPTIONS: Record<PricedRoute, string> = {
  "GET /text/metrics": "Text metrics for Arabic (or any) text: counts, language mix, sentence/word stats, reading time.",
  "POST /text/metrics": "Text metrics for Arabic (or any) text: counts, language mix, sentence/word stats, reading time.",
  "POST /text/normalize": "Normalize Arabic text: strip tashkeel/tatweel, fold alef/ya/ta-marbuta, unify digits, remove bidi control characters, collapse whitespace.",
  "POST /audio/transcribe": "Transcribe an audio file to clean text (Arabic or English).",
  "POST /doc/extract": "Extract structured fields from an Arabic document image or PDF (receipts, invoices, IDs).",
};

export interface AppConfig {
  network: string;
  payTo: string;
  facilitatorUrl: string;
  geminiApiKey?: string;
  transcribeModel: string;
  visionModel: string;
}

export interface Env {
  X402_NETWORK?: string;
  X402_PAY_TO?: string;
  X402_FACILITATOR_URL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_TRANSCRIBE_MODEL?: string;
  GEMINI_VISION_MODEL?: string;
}

const DEFAULT_PAY_TO = "0x05523af5bd166816D1418Ebf7D6371e1fFB1D2e6";

export function readConfig(env: Env = {}): AppConfig {
  const network = env.X402_NETWORK?.trim() || NETWORKS.base;
  const isTestnet = network === NETWORKS.baseSepolia;
  return {
    network,
    payTo: (env.X402_PAY_TO?.trim() || DEFAULT_PAY_TO) as `0x${string}`,
    facilitatorUrl:
      env.X402_FACILITATOR_URL?.trim() || (isTestnet ? FACILITATOR_URLS.baseSepolia : FACILITATOR_URLS.base),
    geminiApiKey: env.GEMINI_API_KEY?.trim() || undefined,
    transcribeModel: env.GEMINI_TRANSCRIBE_MODEL?.trim() || "gemini-3.5-transcribe",
    visionModel: env.GEMINI_VISION_MODEL?.trim() || "gemini-3.6-flash",
  };
}

/** Format a USD number the way the x402 SDK expects ("$0.005"). */
export function usd(amount: number): string {
  return `$${amount.toFixed(6).replace(/0+$/, "").replace(/\.$/, ".0")}`;
}
