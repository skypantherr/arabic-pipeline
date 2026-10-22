/**
 * Gemini calls (only used by the two model-backed endpoints).
 *
 * The Gemini API key lives in a Worker secret / .dev.vars, never in the repo.
 * Models are configurable because the free tier's model list changes.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface TranscribeResult {
  text: string;
  model: string;
  usage?: GeminiUsage;
}

export interface ExtractedDocument {
  document_type: string | null;
  merchant: string | null;
  date: string | null;
  total: number | null;
  currency: string | null;
  tax_number: string | null;
  items: Array<{ name: string | null; quantity: number | null; price: number | null }>;
  notes: string | null;
  raw_text: string | null;
  confidence: number | null;
}

export class GeminiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GeminiError";
  }
}

async function callGemini(
  apiKey: string,
  model: string,
  body: Record<string, unknown>,
): Promise<{ text: string; usage?: GeminiUsage }> {
  const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GeminiError(`Gemini ${model} failed (${res.status}): ${detail.slice(0, 400)}`, res.status);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: GeminiUsage;
  };

  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new GeminiError(`Gemini ${model} returned an empty response`, 502);
  }
  return { text, usage: json.usageMetadata };
}

/**
 * Key liveness for the /diag route.
 *
 * Checks the configured model's *metadata* endpoint (a GET that returns the
 * model description — no prompt, no tokens, effectively free) to answer the
 * question "does the key installed on this Worker still work?" without having
 * to make a paid model call. This exists because the Gemini key was rotated
 * by hand in a terminal, and a stale secret on a deployed Worker would only
 * show up as a 502 on a buyer's first paid model call.
 */
export async function geminiKeyStatus(apiKey: string, model: string): Promise<{
  ok: boolean;
  ms: number;
  status?: number;
  error?: string;
}> {
  const t0 = Date.now();
  try {
    const url = `${API_BASE}/${encodeURIComponent(model)}?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    return { ok: res.ok, ms: Date.now() - t0, status: res.status };
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, error: String(err).slice(0, 140) };
  }
}

const TRANSCRIBE_PROMPT = `Transcribe this audio verbatim in its original language.
Rules:
- Output ONLY the transcription. No preamble, no translation, no commentary.
- Keep Arabic script exactly as spoken; do not add tashkeel that was not audible.
- If the audio is silent or unintelligible, output exactly: [inaudible]
- If the audio contains speech in more than one language, transcribe each segment in order and separate segments with a blank line.`;

export async function transcribeAudio(opts: {
  apiKey: string;
  model: string;
  audioBase64: string;
  mimeType: string;
}): Promise<TranscribeResult> {
  const { text, usage } = await callGemini(opts.apiKey, opts.model, {
    contents: [
      {
        role: "user",
        parts: [{ inline_data: { mime_type: opts.mimeType, data: opts.audioBase64 } }, { text: TRANSCRIBE_PROMPT }],
      },
    ],
    generationConfig: { temperature: 0 },
  });
  return { text, model: opts.model, usage };
}

const EXTRACT_PROMPT = `You extract structured data from Arabic documents (receipts, invoices, official letters, national IDs, bank slips).
Read every visible field. Return only the JSON described by the response schema.
Rules:
- If a field is not present or not legible, use null. Never guess.
- "total" is the final amount payable (after tax/discount) as a number without currency symbols.
- "items" is the list of purchased line items when the document is a receipt or invoice, otherwise an empty list.
- "raw_text" is the full visible text, preserving Arabic.
- "confidence" is 0-1: your confidence that the extracted fields are correct.`;

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    document_type: { type: "string", description: "receipt | invoice | letter | id | bank_slip | other" },
    merchant: { type: "string" },
    date: { type: "string" },
    total: { type: "number" },
    currency: { type: "string" },
    tax_number: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          price: { type: "number" },
        },
      },
    },
    notes: { type: "string" },
    raw_text: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["document_type", "items", "confidence"],
} as const;

export async function extractDocument(opts: {
  apiKey: string;
  model: string;
  documentBase64: string;
  mimeType: string;
}): Promise<{ data: ExtractedDocument; model: string; usage?: GeminiUsage }> {
  const { text, usage } = await callGemini(opts.apiKey, opts.model, {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: opts.mimeType, data: opts.documentBase64 } },
          { text: EXTRACT_PROMPT },
        ],
      },
    ],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: EXTRACT_SCHEMA },
  });

  let data: ExtractedDocument;
  try {
    data = JSON.parse(text) as ExtractedDocument;
  } catch {
    throw new GeminiError("Gemini did not return valid JSON for document extraction", 502);
  }
  return { data, model: opts.model, usage };
}
