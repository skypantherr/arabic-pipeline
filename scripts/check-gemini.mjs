/**
 * One-off live check of the Gemini integration (not part of the test suite).
 *   node scripts/check-gemini.mjs
 * Verifies: key auth, model availability, JSON-mode response parsing.
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".dev.vars", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const key = env.GEMINI_API_KEY;
if (!key) {
  console.error("No GEMINI_API_KEY in .dev.vars");
  process.exit(1);
}

async function call(model, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${model} -> HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = JSON.parse(text);
  const out = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  return { out, usage: json.usageMetadata };
}

// 1. Does the transcribe model exist and respond to a text-only request?
try {
  const r = await call("gemini-3.5-transcribe", {
    contents: [{ role: "user", parts: [{ text: "Reply with the single word: OK" }] }],
    generationConfig: { temperature: 0 },
  });
  console.log("gemini-3.5-transcribe OK ->", JSON.stringify(r.out.slice(0, 80)), JSON.stringify(r.usage));
} catch (e) {
  console.log("gemini-3.5-transcribe FAILED ->", e.message);
}

// 2. Does the vision model exist and honour JSON mode + schema?
try {
  const r = await call("gemini-3.6-flash", {
    contents: [{ role: "user", parts: [{ text: "Return JSON with document_type='test' and confidence=0.5." }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          document_type: { type: "string" },
          merchant: { type: "string" },
          date: { type: "string" },
          total: { type: "number" },
          currency: { type: "string" },
          tax_number: { type: "string" },
          items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, quantity: { type: "number" }, price: { type: "number" } } } },
          notes: { type: "string" },
          raw_text: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["document_type", "items", "confidence"],
      },
    },
  });
  const parsed = JSON.parse(r.out);
  console.log("gemini-3.6-flash JSON-mode OK ->", JSON.stringify(parsed).slice(0, 160));
} catch (e) {
  console.log("gemini-3.6-flash FAILED ->", e.message);
}
