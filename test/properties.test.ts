import { describe, expect, it } from "vitest";
import { chunkText, detectLanguage, diffText, normalizeArabic, searchText, textMetrics } from "../src/lib/arabic";

/**
 * Deterministic property tests over the pure text tools.
 *
 * Randomised but seeded, so a failure reproduces exactly. These caught three
 * bugs that example-based tests missed: the bidi class losing its range, the
 * normaliser not being a fixed point, and chunk overlap breaking `max_chars`.
 * Keep the seed when editing; a new seed is a new test run, not a fix.
 */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ARABIC = "ابتثجحخدذرزسشصضطظعغفقكلمنهويأإآةىؤئ";
const TASHKEEL = "\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652\u0670";
const DIGITS = "٠١٢٣٤٥٦٧٨٩0123456789";
const LATIN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PUNCT = " \n\t.,،؛؟!?.:-_()[]«»\"'/\\";
const BIDI = "\u200E\u200F\u202A\u202C\uFEFF";

const rand = rng(20261030);

function randomText(maxLen: number): string {
  const pools = [ARABIC, ARABIC, ARABIC, TASHKEEL, DIGITS, LATIN, PUNCT, PUNCT, BIDI];
  const len = Math.floor(rand() * maxLen);
  let out = "";
  for (let i = 0; i < len; i++) {
    const pool = pools[Math.floor(rand() * pools.length)];
    out += pool[Math.floor(rand() * pool.length)];
  }
  return out;
}

const samples = Array.from({ length: 400 }, () => randomText(240));

describe("properties: normalizeArabic", () => {
  it("is idempotent, strips marks/bidi, never leaves double or edge spaces", () => {
    for (const text of samples) {
      for (const mode of ["light", "search", "index"] as const) {
        const once = normalizeArabic(text, mode).text;
        expect(normalizeArabic(once, mode).text, `${mode} not idempotent for ${JSON.stringify(text)}`).toBe(once);
        // `light` keeps tashkeel by design; the folding modes must remove it.
        if (mode !== "light") {
          expect(/[\u064B-\u065F\u0670]/.test(once), `${mode} kept tashkeel in ${JSON.stringify(text)}`).toBe(false);
        }
        const leftover = [...once].filter((ch) => /[\u200E\u200F\u202A-\u202C\uFEFF]/.test(ch));
        expect(
          leftover.length,
          `${mode} left bidi ${leftover.map((c) => "U+" + c.codePointAt(0)!.toString(16)).join(",")} in ${JSON.stringify(text)}`,
        ).toBe(0);
        expect(once.includes("  ")).toBe(false);
        expect(once).toBe(once.trim());
      }
    }
  });
});

describe("properties: textMetrics", () => {
  it("keeps counts internally consistent", () => {
    for (const text of samples) {
      const m = textMetrics(text);
      expect(m.chars).toBe(text.length);
      expect(m.chars_no_spaces).toBeLessThanOrEqual(m.chars);
      expect(m.chars_arabic + m.chars_latin).toBeLessThanOrEqual(m.chars_no_spaces);
      expect(m.words).toBeLessThanOrEqual(m.chars + 1);
      // Punctuation-only fragments count as sentences, so only a loose bound holds.
      expect(m.sentences).toBeLessThanOrEqual(m.chars + 1);
      expect(m.lines).toBeLessThanOrEqual(m.chars + 1);
      expect(m.paragraphs).toBeLessThanOrEqual(m.lines + 1);
      expect(m.unique_words).toBeLessThanOrEqual(m.words);
      expect(m.avg_word_length).toBeGreaterThanOrEqual(0);
      expect(m.max_word_length).toBeGreaterThanOrEqual(m.avg_word_length);
      expect(Number.isFinite(m.reading_time_seconds)).toBe(true);
    }
  });
});

describe("properties: chunkText", () => {
  it("covers the input with slices that match the original offsets", () => {
    for (const text of samples) {
      if (!text.trim()) continue;
      const maxChars = 5 + Math.floor(rand() * 60);
      for (const overlap of [0, 0, 1, 2]) {
        const out = chunkText(text, { maxChars, overlap });
        expect(out.chunks.length).toBeGreaterThan(0);
        expect(out.count).toBe(out.chunks.length);
        expect(out.total_chars).toBe(text.length);

        let previousEnd = 0;
        for (const chunk of out.chunks) {
          expect(chunk.text).toBe(text.slice(chunk.start, chunk.end));
          expect(chunk.text.length).toBeLessThanOrEqual(maxChars);
          expect(chunk.text.length).toBeGreaterThan(0);
          expect(chunk.text.trim()).toBe(chunk.text);
          // Chunks are trimmed, so the only thing that may fall between them is whitespace.
          expect(text.slice(previousEnd, chunk.start).trim()).toBe("");
          if (overlap === 0) expect(chunk.start).toBeGreaterThanOrEqual(previousEnd);
          expect(chunk.start).toBeLessThan(previousEnd + chunk.text.length + maxChars);
          previousEnd = Math.max(previousEnd, chunk.end);
        }
        // Nothing but trailing whitespace may remain uncovered.
        expect(text.slice(previousEnd).trim()).toBe("");
      }
    }
  });
});

describe("properties: diffText", () => {
  it("is reflexive and similar to its own reverse for identical input", () => {
    for (const text of samples) {
      const self = diffText(text, text);
      expect(self.equal).toBe(true);
      expect(self.similarity).toBe(1);
      expect(self.added).toEqual([]);
      expect(self.removed).toEqual([]);
    }
  });
});

describe("properties: searchText", () => {
  it("returns slices that match, ordered, and never more than the cap", () => {
    for (const text of samples) {
      const words = text.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
      if (!words.length) continue;
      const query = words[Math.floor(rand() * words.length)];
      for (const mode of ["phrase", "words", "fuzzy"] as const) {
        const out = searchText(text, query, { mode, maxResults: 50, contextChars: 10 });
        expect(out.count).toBe(out.matches.length);
        expect(out.count).toBeLessThanOrEqual(50);
        expect(out.total_matches).toBeGreaterThanOrEqual(out.count);
        let last = -1;
        for (const match of out.matches) {
          expect(match.start).toBeGreaterThanOrEqual(0);
          expect(match.end).toBeGreaterThan(match.start);
          expect(match.end).toBeLessThanOrEqual(text.length);
          expect(text.slice(match.start, match.end)).toBe(match.text);
          expect(match.start).toBeGreaterThan(last);
          last = match.end;
          expect(match.score).toBeGreaterThan(0);
          expect(match.score).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("properties: detectLanguage", () => {
  it("labels script-homogeneous input correctly", () => {
    expect(detectLanguage("مرحبا بالعالم كيف حالك اليوم").language).toBe("ar");
    expect(detectLanguage("hello world how are you today").language).toBe("en");
    expect(detectLanguage("").language).toBe("unknown");
  });
});
