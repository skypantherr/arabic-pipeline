/**
 * Pure Arabic text utilities. No dependencies, no network, no cost.
 *
 * Five capabilities:
 *  - normalizeArabic(): make messy Arabic comparable/searchable.
 *  - textMetrics(): cheap, deterministic statistics an agent can act on
 *    (chunking, dedup keys, language routing, reading-time estimates).
 *  - detectLanguage(): script mix and an ar/en/mixed label.
 *  - chunkText(): sentence-aligned chunks with exact offsets.
 *  - diffText(): word-level comparison after normalisation.
 */

export type NormalizeMode = "light" | "search" | "index";

/** Harakat, superscript marks, tatweel (ـ) and the Quranic annotation marks. */
const TASHKEEL = /[\u064B-\u0670\u06D6-\u06ED\u0640]/g;
/** Arabic-Indic digits ٠-٩ and Extended Arabic-Indic digits ۰-۹. */
const ARABIC_INDIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;
/**
 * Bidi controls, zero-width marks and the BOM.
 *
 * Escaped, not literal: these characters are invisible in an editor, and an
 * earlier raw-character version of this line silently lost the `\u200B-\u200E`
 * range, so LRM/ZWSP/ZWNJ/ZWJ were never stripped. Covered by a test.
 */
const BIDI_AND_ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
/** Alef variants: آ أ إ ٱ ٲ ٳ ٵ. */
const ALEF_VARIANTS = /[آأإٱٲٳٵ]/g;
/** Alef wasla ٱ handled above; ya ى and alef maksura. */
const YEH_VARIANTS = /[ىی]/g;
/** Ta marbuta ة. */
const TA_MARBUTA = /ة/g;
/** Standalone hamza ء and waw-with-hamza ؤ. */
const HAMZA_FORMS = /[ءؤئ]/g;
/** Arabic letters (for counting), excluding Arabic punctuation and digits. */
const ARABIC_LETTER = /[ء-يٱ-ۓ]/g;
const LATIN_LETTER = /[A-Za-z]/g;
/** Single-character variants for per-character external loops (a /g regex is stateful). */
const ARABIC_LETTER_ONE = /[ء-يٱ-ۓ]/;
const LATIN_LETTER_ONE = /[A-Za-z]/;
const UNICODE_LETTER = /\p{L}/u;
/**
 * Single-character versions of the classes that per-character loops need (a /g
 * regex is stateful, so it must not be used with `.test` in a loop).
 *
 * The bidi and tashkeel sets are duplicated as escapes here on purpose: they are
 * defined once as /g constants at the top of the file, and an earlier version of
 * those constants was written as raw invisible characters and silently lost part
 * of its range (`\u200B-\u200E`), leaving LRM and the joiners in "clean" text.
 * Keep every one of these escaped.
 */
const BIDI_AND_ZERO_WIDTH_ONE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;
/** Tashkeel/tatweel; note the range contains the Arabic-Indic digits (see above). */
const TASHKEEL_ONE = /[\u064B-\u0670\u06D6-\u06ED\u0640]/;
const ARABIC_INDIC_DIGIT_ONE = /[\u0660-\u0669\u06F0-\u06F9]/;
const ALEF_VARIANT_ONE = /[آأإٱٲٳٵ]/;
const YEH_VARIANT_ONE = /[ىی]/;
const HAMZA_FORM_ONE = /[ءؤئ]/;
/** A character that can be part of a searchable word. */
const WORD_CHAR = /[\p{L}\p{N}]/u;
/** Combining marks that belong to the preceding letter (tashkeel, etc.). */
const COMBINING_MARK = /\p{M}/u;
/** Arabic comma / question mark / semicolon. */
const ARABIC_PUNCT = /[،؛؟۔]/g;
const SENTENCE_BREAK = /[.!?؟۔\n]+/;
/** A single character that ends a sentence. */
const SENTENCE_END = /[.!?؟۔\n]/;

export interface NormalizeResult {
  text: string;
  mode: NormalizeMode;
  changed: boolean;
  applied: string[];
  before_chars: number;
  after_chars: number;
}

function foldDigits(input: string): string {
  return input.replace(ARABIC_INDIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}
/**
 * Normalize Arabic text.
 *
 * - "light": whitespace + digits + bidi cleanup only. Lossless for meaning.
 * - "search": light + tashkeel removal + letter folding (أ/إ/آ→ا, ى→ي, ة→ه, ء/ؤ/ئ→ء).
 * - "index": search + punctuation stripped, letters/digits/spaces only. Use as a
 *   dedup key or search index key (not for display).
 */
export function normalizeArabic(input: string, mode: NormalizeMode = "search"): NormalizeResult {
  const applied: string[] = [];
  let text = input;

  const bidi = replaceAll(text, BIDI_AND_ZERO_WIDTH, "");
  if (bidi.changed) applied.push("bidi_and_zero_width_removed");
  text = bidi.text;

  const digits = replaceAll(text, ARABIC_INDIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
  if (digits.changed) applied.push("arabic_indic_digits_unified");
  text = digits.text;

  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed !== text) applied.push("whitespace_collapsed");
  text = collapsed;

  if (mode === "light") {
    return finish(text, input, mode, applied);
  }

  const tashkeel = replaceAll(text, TASHKEEL, "");
  if (tashkeel.changed) applied.push("tashkeel_and_tatweel_removed");
  text = tashkeel.text;

  if (mode === "search" || mode === "index") {
    const alef = replaceAll(text, ALEF_VARIANTS, "ا");
    if (alef.changed) applied.push("alef_folded");
    text = alef.text;

    const yeh = replaceAll(text, YEH_VARIANTS, "ي");
    if (yeh.changed) applied.push("yeh_folded");
    text = yeh.text;

    const marbuta = replaceAll(text, TA_MARBUTA, "ه");
    if (marbuta.changed) applied.push("ta_marbuta_folded");
    text = marbuta.text;

    const hamza = replaceAll(text, HAMZA_FORMS, "ء");
    if (hamza.changed) applied.push("hamza_folded");
    text = hamza.text;
  }

  if (mode === "index") {
    const stripped = text.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    if (stripped !== text) applied.push("punctuation_stripped");
    text = stripped;
  }

  /**
   * Collapse whitespace again, after the transformations.
   *
   * Mark removal and punctuation stripping can leave two spaces around a
   * character that disappeared ("كلمة ً كلمة" -> "كلمة  كلمة"), so a single
   * early pass is not enough: the result must also be a fixed point, otherwise
   * normalising twice gives two different answers.
   */
  const settled = text.replace(/\s+/g, " ").trim();
  if (settled !== text && !applied.includes("whitespace_collapsed")) applied.push("whitespace_collapsed");
  text = settled;

  return finish(text, input, mode, applied);
}

/** Stateless replace (never use RegExp.test with a /g flag to gate a replace). */
function replaceAll(
  text: string,
  re: RegExp,
  replacement: string | ((match: string) => string),
): { text: string; changed: boolean } {
  const next = text.replace(re, replacement as never);
  return { text: next, changed: next !== text };
}

function finish(text: string, input: string, mode: NormalizeMode, applied: string[]): NormalizeResult {
  return {
    text,
    mode,
    changed: text !== input,
    applied,
    before_chars: input.length,
    after_chars: text.length,
  };
}

export interface TextMetrics {
  chars: number;
  chars_no_spaces: number;
  chars_arabic: number;
  chars_latin: number;
  words: number;
  unique_words: number;
  sentences: number;
  lines: number;
  paragraphs: number;
  digits: number;
  punctuation: number;
  avg_word_length: number;
  max_word_length: number;
  avg_sentence_words: number;
  language: "ar" | "en" | "mixed" | "unknown";
  reading_time_seconds: number;
}

/** Words per minute for silent reading; used for an approximate reading time. */
const WPM = 200;

export function textMetrics(input: string): TextMetrics {
  const text = input ?? "";
  const chars = text.length;
  const charsNoSpaces = text.replace(/\s/g, "").length;
  const charsArabic = (text.match(ARABIC_LETTER) || []).length;
  const charsLatin = (text.match(LATIN_LETTER) || []).length;

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const unique = new Set(words.map((w) => w.toLowerCase())).size;

  const sentenceParts = text.split(SENTENCE_BREAK).map((s) => s.trim()).filter((s) => s.length > 0);
  const sentences = sentenceParts.length;

  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0).length;
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;

  const digits = (text.match(/[0-9]/g) || []).length;
  const punctuation = (
    text.match(/[.,;:!?'"()\[\]{}\/\\@#%&*+=<>|~`^$]/g) || []
  ).length + (text.match(ARABIC_PUNCT) || []).length;

  const wordLengths = words.map((w) => w.length);
  const avgWordLength = words.length ? round2(wordLengths.reduce((a, b) => a + b, 0) / words.length) : 0;
  const maxWordLength = words.length ? Math.max(...wordLengths) : 0;
  const avgSentenceWords = sentences ? round2(words.length / sentences) : 0;

  const language: TextMetrics["language"] =
    charsArabic === 0 && charsLatin === 0
      ? "unknown"
      : charsArabic === 0
        ? "en"
        : charsLatin === 0
          ? "ar"
          : charsArabic >= charsLatin
            ? "ar"
            : "mixed";

  return {
    chars,
    chars_no_spaces: charsNoSpaces,
    chars_arabic: charsArabic,
    chars_latin: charsLatin,
    words: words.length,
    unique_words: unique,
    sentences,
    lines,
    paragraphs,
    digits,
    punctuation,
    avg_word_length: avgWordLength,
    max_word_length: maxWordLength,
    avg_sentence_words: avgSentenceWords,
    language,
    reading_time_seconds: words.length ? Math.round((words.length / WPM) * 60) : 0,
  };
}

export interface LanguageDetection {
  language: "ar" | "en" | "mixed" | "unknown";
  /** Share of the dominant script among Arabic + Latin letters, 0..1. */
  confidence: number;
  /** Letter counts by script. */
  script_mix: { arabic: number; latin: number; other: number };
}

/** Above this share a text is treated as a single language, not "mixed". */
const DOMINANT_SHARE = 0.85;

/**
 * Detect the language of a text from its script mix.
 *
 * Deliberately script-based, not statistical: it is deterministic, needs no
 * model, and is exactly what routing Arabic vs English work needs. `other`
 * counts letters outside the Arabic and Latin blocks, so a Cyrillic or CJK
 * text reports `unknown` instead of being guessed as English.
 */
export function detectLanguage(input: string): LanguageDetection {
  const text = input ?? "";
  let arabic = 0;
  let latin = 0;
  let other = 0;

  for (const ch of text) {
    if (!UNICODE_LETTER.test(ch)) continue;
    if (ARABIC_LETTER_ONE.test(ch)) arabic++;
    else if (LATIN_LETTER_ONE.test(ch)) latin++;
    else other++;
  }

  const known = arabic + latin;
  if (known === 0) {
    return { language: "unknown", confidence: 0, script_mix: { arabic, latin, other } };
  }

  const arabicShare = arabic / known;
  const language: LanguageDetection["language"] =
    arabic === 0 ? "en" : latin === 0 ? "ar" : arabicShare >= DOMINANT_SHARE ? "ar" : arabicShare <= 1 - DOMINANT_SHARE ? "en" : "mixed";

  return {
    language,
    confidence: round3(Math.max(arabicShare, 1 - arabicShare)),
    script_mix: { arabic, latin, other },
  };
}

export interface TextChunk {
  /** Exact slice of the input: `input.slice(start, end)`. */
  text: string;
  /** Start offset in the original input (inclusive). */
  start: number;
  /** End offset in the original input (exclusive). */
  end: number;
  index: number;
}

export interface ChunkResult {
  chunks: TextChunk[];
  count: number;
  total_chars: number;
}

export interface ChunkOptions {
  /** Target maximum characters per chunk. Default 1000, allowed 20..8000. */
  maxChars?: number;
  /** Characters of the previous chunk to repeat, snapped to a word start. Default 0. */
  overlap?: number;
}

export const CHUNK_DEFAULT_MAX_CHARS = 1000;
export const CHUNK_MIN_MAX_CHARS = 1;
export const CHUNK_MAX_MAX_CHARS = 8000;

interface Span {
  start: number;
  end: number;
}

/**
 * Split text into chunks an LLM can digest.
 *
 * Boundaries, in order of preference:
 *   1. sentence end (`. ! ? ؟ ۔` or a newline) followed by whitespace,
 *   2. word boundary,
 *   3. a hard cut, only when a single word is longer than `maxChars`.
 *
 * `text` is always `input.slice(start, end)`, so offsets can be used to slice
 * the original document. `maxChars` limits the non-overlapping part; with
 * `overlap` a chunk can be up to `maxChars + overlap` characters.
 */
export function chunkText(input: string, options: ChunkOptions = {}): ChunkResult {
  const text = input ?? "";
  const maxChars = options.maxChars ?? CHUNK_DEFAULT_MAX_CHARS;
  const overlap = options.overlap ?? 0;

  if (!Number.isInteger(maxChars) || maxChars < CHUNK_MIN_MAX_CHARS || maxChars > CHUNK_MAX_MAX_CHARS) {
    throw new RangeError(`maxChars must be an integer between ${CHUNK_MIN_MAX_CHARS} and ${CHUNK_MAX_MAX_CHARS}`);
  }
  if (!Number.isInteger(overlap) || overlap < 0 || overlap > Math.floor(maxChars / 2)) {
    throw new RangeError(`overlap must be an integer between 0 and ${Math.floor(maxChars / 2)}`);
  }

  if (text.length === 0) {
    return { chunks: [], count: 0, total_chars: 0 };
  }

  const ranges = packSpans(sentenceSpans(text), text, maxChars);
  const withOverlap = applyOverlap(text, ranges, overlap, maxChars);

  const chunks = withOverlap.map((span, index) => ({
    text: text.slice(span.start, span.end),
    start: span.start,
    end: span.end,
    index,
  }));

  return { chunks, count: chunks.length, total_chars: text.length };
}

/** Sentence spans with surrounding whitespace trimmed. */
function sentenceSpans(text: string): Span[] {
  const spans: Span[] = [];
  const n = text.length;
  let i = 0;

  while (i < n) {
    while (i < n && /\s/.test(text[i])) i++;
    if (i >= n) break;

    const start = i;
    let end = n;
    while (i < n) {
      if (SENTENCE_END.test(text[i])) {
        let j = i + 1;
        while (j < n && SENTENCE_END.test(text[j])) j++;
        // A newline is itself the boundary; punctuation needs whitespace (or EOF)
        // after it so that "3.14" is not split into two sentences.
        if (j >= n || text[i] === "\n" || /\s/.test(text[j])) {
          end = j;
          i = j;
          break;
        }
        i = j;
        continue;
      }
      i++;
    }

    let trimmed = end;
    while (trimmed > start && /\s/.test(text[trimmed - 1])) trimmed--;
    if (trimmed > start) spans.push({ start, end: trimmed });
  }

  return spans;
}

/** Greedily pack sentence spans up to maxChars, splitting oversized ones by word. */
function packSpans(spans: Span[], text: string, maxChars: number): Span[] {
  const out: Span[] = [];
  let current: Span | null = null;

  for (const span of spans) {
    if (span.end - span.start > maxChars) {
      if (current) {
        out.push(current);
        current = null;
      }
      out.push(...splitByWords(text, span, maxChars));
      continue;
    }
    if (!current) {
      current = { start: span.start, end: span.end };
    } else if (span.end - current.start <= maxChars) {
      current.end = span.end;
    } else {
      out.push(current);
      current = { start: span.start, end: span.end };
    }
  }

  if (current) out.push(current);
  return out;
}

/** Word-aligned spans for a sentence that is longer than maxChars. */
function splitByWords(text: string, span: Span, maxChars: number): Span[] {
  const out: Span[] = [];
  const slice = text.slice(span.start, span.end);
  let current: Span | null = null;

  for (const match of slice.matchAll(/\S+/g)) {
    const wordStart = span.start + (match.index ?? 0);
    const wordEnd = wordStart + match[0].length;

    if (wordEnd - wordStart > maxChars) {
      if (current) {
        out.push(current);
        current = null;
      }
      for (let p = wordStart; p < wordEnd; p += maxChars) {
        out.push({ start: p, end: Math.min(p + maxChars, wordEnd) });
      }
      continue;
    }

    if (!current) {
      current = { start: wordStart, end: wordEnd };
    } else if (wordEnd - current.start <= maxChars) {
      current.end = wordEnd;
    } else {
      out.push(current);
      current = { start: wordStart, end: wordEnd };
    }
  }

  if (current) out.push(current);
  return out;
}

/**
 * Repeat up to `overlap` characters of the previous chunk at the start of the
 * next one. The repeated tail is snapped forward to a word start, so a chunk
 * never begins mid-word (unless the window contains no whitespace at all).
 */
/**
 * Repeat the tail of the previous chunk at the start of the next one.
 *
 * The extension is clamped to `maxChars`: `max_chars` exists so a chunk fits a
 * model context window, and an overlap that breaks that contract is worse than
 * no overlap at all. The clamp moves forward to the next word start, so the
 * result is shorter than the overlap would have been, never longer.
 */
function applyOverlap(text: string, ranges: Span[], overlap: number, maxChars: number): Span[] {
  if (overlap <= 0) return ranges;

  return ranges.map((range, index) => {
    if (index === 0) return range;

    let start = Math.max(ranges[index - 1].start, range.start - overlap);
    if (start > 0 && !/\s/.test(text[start - 1])) {
      const rel = text.slice(start, range.start).search(/\s/);
      if (rel !== -1) {
        let snapped = start + rel + 1;
        while (snapped < range.start && /\s/.test(text[snapped])) snapped++;
        start = snapped;
      }
    }

    if (start >= range.start) return range;

    while (start < range.start && /\s/.test(text[start])) start++;
    if (start >= range.start) return range;

    if (range.end - start > maxChars) {
      start = range.end - maxChars;
      while (start < range.start && start > 0 && !/\s/.test(text[start - 1])) start++;
      if (start >= range.start) return range;
    }

    return { start, end: range.end };
  });
}

export interface TextDiff {
  /** True when the two texts are identical after normalisation. */
  equal: boolean;
  /** Dice coefficient over words: 2 * shared / (wordsA + wordsB), 0..1. */
  similarity: number;
  /** Words present in b but not in a, in b's order. */
  added: string[];
  /** Words present in a but not in b, in a's order. */
  removed: string[];
}

/** Word-level diff is quadratic; this keeps the DP table small on the edge. */
export const DIFF_MAX_WORDS = 1500;

/**
 * Compare two texts after normalising both with `search` mode, so tashkeel,
 * alef/ya/ta-marbuta variants and Arabic-Indic digits do not count as changes.
 * That is the comparison people actually want for dedup, re-imports and QA.
 */
export function diffText(a: string, b: string): TextDiff {
  const left = words(normalizeArabic(a ?? "", "search").text);
  const right = words(normalizeArabic(b ?? "", "search").text);

  if (left.length > DIFF_MAX_WORDS || right.length > DIFF_MAX_WORDS) {
    throw new RangeError(`each side must be at most ${DIFF_MAX_WORDS} words; chunk longer text first`);
  }

  const n = left.length;
  const m = right.length;
  const width = m + 1;
  // dp[i][j] = length of the longest common subsequence of left[i..] and right[j..]
  const dp = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        left[i] === right[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }

  const added: string[] = [];
  const removed: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      removed.push(left[i++]);
    } else {
      added.push(right[j++]);
    }
  }
  while (i < n) removed.push(left[i++]);
  while (j < m) added.push(right[j++]);

  const shared = dp[0];
  const total = n + m;
  return {
    equal: added.length === 0 && removed.length === 0,
    similarity: total === 0 ? 1 : round3((2 * shared) / total),
    added,
    removed,
  };
}

function words(normalized: string): string[] {
  return normalized.length ? normalized.split(" ").filter((w) => w.length > 0) : [];
}

export type SearchMode = "phrase" | "words" | "fuzzy";

export interface SearchOptions {
  /** phrase = raw substring; words = whole-word phrase; fuzzy = token-level edit distance. */
  mode?: SearchMode;
  /** Maximum matches returned. Default 20, allowed 1..100. */
  maxResults?: number;
  /** Characters of context on each side of a match. Default 40, allowed 0..200. */
  contextChars?: number;
  /** Edit distance allowed per word in fuzzy mode. Default 1, allowed 0..2. */
  maxDistance?: number;
}

export interface SearchMatch {
  /** Start offset in the original text (inclusive). */
  start: number;
  /** End offset in the original text (exclusive). */
  end: number;
  /** Original text at the match, diacritics included. */
  text: string;
  /** Match with surrounding context; "…" marks a truncated edge. */
  snippet: string;
  /** 1 for exact matches; below 1 in fuzzy mode. */
  score: number;
}

export interface SearchResult {
  mode: SearchMode;
  /** Number of matches returned (≤ max_results). */
  count: number;
  /** Matches found before the max_results cap. */
  total_matches: number;
  matches: SearchMatch[];
}

export const SEARCH_MAX_CHARS = 100_000;
export const SEARCH_MAX_RESULTS = 100;
export const SEARCH_DEFAULT_MAX_RESULTS = 20;
export const SEARCH_MAX_CONTEXT = 200;
export const SEARCH_DEFAULT_CONTEXT = 40;
export const SEARCH_MAX_DISTANCE = 2;
export const SEARCH_DEFAULT_MAX_DISTANCE = 1;
export const SEARCH_MAX_FUZZY_QUERY_WORDS = 10;

interface SearchIndex {
  /** Text with tashkeel removed, letters/digits folded, whitespace collapsed. */
  text: string;
  /** For each character of `text`, the index of that character in the original. */
  map: number[];
}

/**
 * Build a normalised copy of `text` plus an offset map back to the original.
 *
 * `normalizeArabic` cannot be used here because it changes the string length
 * (tashkeel and bidi marks disappear, whitespace collapses), which would make
 * every reported offset wrong. This keeps one map entry per produced character,
 * so a match can always be translated to an exact slice of the input.
 *
 * Folding is the `search` mode set: tashkeel/tatweel, alef/ya/ta-marbuta and
 * hamza variants, Arabic-Indic digits, bidi controls, plus ASCII lowercasing.
 * Punctuation is preserved so phrase searches can include it.
 */
function buildSearchIndex(input: string): SearchIndex {
  let text = "";
  const map: number[] = [];
  let pendingSpace = -1;

  const flushSpace = () => {
    if (pendingSpace === -1) return;
    text += " ";
    map.push(pendingSpace);
    pendingSpace = -1;
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (BIDI_AND_ZERO_WIDTH_ONE.test(ch)) continue;

    if (/\s/.test(ch)) {
      if (pendingSpace === -1 && text.length > 0) pendingSpace = i;
      continue;
    }

    // Digits are folded *before* the tashkeel test on purpose: the tashkeel
    // range ends at U+0670 and therefore contains the Arabic-Indic digits
    // ٠-٩ (U+0660-U+0669). Dropping marks first would silently delete them.
    if (ARABIC_INDIC_DIGIT_ONE.test(ch)) {
      flushSpace();
      const code = ch.charCodeAt(0);
      text += String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
      map.push(i);
      continue;
    }

    if (TASHKEEL_ONE.test(ch)) continue;

    flushSpace();

    let out = ch;
    if (ALEF_VARIANT_ONE.test(ch)) {
      out = "ا";
    } else if (YEH_VARIANT_ONE.test(ch)) {
      out = "ي";
    } else if (ch === "ة") {
      out = "ه";
    } else if (HAMZA_FORM_ONE.test(ch)) {
      out = "ء";
    } else if (ch >= "A" && ch <= "Z") {
      out = String.fromCharCode(ch.charCodeAt(0) + 32);
    }

    text += out;
    map.push(i);
  }

  return { text, map };
}

/**
 * Search Arabic (or any) text after the same normalisation used for indexing:
 * `فَاطِمَة` matches `فاطمة`, `فاطمه` and `فاطمة`, and `١٢٣` matches `123`.
 *
 * Modes:
 *  - `phrase` — normalised substring, including inside longer words.
 *  - `words` (default) — the phrase, but only on whole-word boundaries.
 *  - `fuzzy` — token-level matching with a bounded edit distance per word.
 *
 * Offsets always refer to the original `text`, so `text.slice(start, end)` is
 * the match as written.
 */
export function searchText(text: string, query: string, options: SearchOptions = {}): SearchResult {
  const source = text ?? "";
  const mode = options.mode ?? "words";
  const maxResults = options.maxResults ?? SEARCH_DEFAULT_MAX_RESULTS;
  const contextChars = options.contextChars ?? SEARCH_DEFAULT_CONTEXT;
  const maxDistance = options.maxDistance ?? SEARCH_DEFAULT_MAX_DISTANCE;

  if (source.length > SEARCH_MAX_CHARS) {
    throw new RangeError(`text must be at most ${SEARCH_MAX_CHARS} characters; split it with text_chunk first`);
  }
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > SEARCH_MAX_RESULTS) {
    throw new RangeError(`maxResults must be an integer between 1 and ${SEARCH_MAX_RESULTS}`);
  }
  if (!Number.isInteger(contextChars) || contextChars < 0 || contextChars > SEARCH_MAX_CONTEXT) {
    throw new RangeError(`contextChars must be an integer between 0 and ${SEARCH_MAX_CONTEXT}`);
  }
  if (!Number.isInteger(maxDistance) || maxDistance < 0 || maxDistance > SEARCH_MAX_DISTANCE) {
    throw new RangeError(`maxDistance must be an integer between 0 and ${SEARCH_MAX_DISTANCE}`);
  }
  if (!["phrase", "words", "fuzzy"].includes(mode)) {
    throw new RangeError('mode must be "phrase", "words" or "fuzzy"');
  }

  const index = buildSearchIndex(source);
  const normalizedQuery = buildSearchIndex(query ?? "").text;
  if (!normalizedQuery) {
    throw new RangeError("query is empty after normalisation");
  }

  if (mode === "fuzzy") {
    return fuzzySearch(source, index, normalizedQuery, maxResults, contextChars, maxDistance);
  }
  return literalSearch(source, index, normalizedQuery, mode, maxResults, contextChars);
}

function literalSearch(
  source: string,
  index: SearchIndex,
  query: string,
  mode: "phrase" | "words",
  maxResults: number,
  contextChars: number,
): SearchResult {
  const matches: SearchMatch[] = [];
  let total = 0;
  let from = 0;

  while (from <= index.text.length - query.length) {
    const at = index.text.indexOf(query, from);
    if (at === -1) break;

    const endNormalized = at + query.length;
    const onBoundary =
      mode === "phrase" ||
      ((at === 0 || !WORD_CHAR.test(index.text[at - 1])) &&
        (endNormalized === index.text.length || !WORD_CHAR.test(index.text[endNormalized])));

    if (onBoundary) {
      total++;
      if (matches.length < maxResults) {
        const start = index.map[at];
        const end = sourceEnd(source, index.map[endNormalized - 1]);
        matches.push(makeMatch(source, start, end, 1, contextChars));
      }
    }

    from = at + Math.max(1, query.length);
  }

  return { mode, count: matches.length, total_matches: total, matches };
}

interface Token {
  text: string;
  start: number;
  end: number;
}

function tokenizeIndexed(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const start = match.index ?? 0;
    tokens.push({ text: match[0], start, end: start + match[0].length });
  }
  return tokens;
}

function fuzzySearch(
  source: string,
  index: SearchIndex,
  query: string,
  maxResults: number,
  contextChars: number,
  maxDistance: number,
): SearchResult {
  const corpus = tokenizeIndexed(index.text);
  const queryTokens = tokenizeIndexed(query).map((token) => token.text);

  if (queryTokens.length === 0) {
    throw new RangeError("query is empty after normalisation");
  }
  if (queryTokens.length > SEARCH_MAX_FUZZY_QUERY_WORDS) {
    throw new RangeError(`fuzzy mode accepts at most ${SEARCH_MAX_FUZZY_QUERY_WORDS} query words`);
  }

  const queryLength = queryTokens.reduce((sum, token) => sum + token.length, 0);
  const matches: SearchMatch[] = [];
  let total = 0;

  for (let i = 0; i + queryTokens.length <= corpus.length; ) {
    let distance = 0;
    let matched = true;
    for (let k = 0; k < queryTokens.length; k++) {
      const d = boundedDistance(corpus[i + k].text, queryTokens[k], maxDistance);
      if (d > maxDistance) {
        matched = false;
        break;
      }
      distance += d;
    }

    if (!matched) {
      i++;
      continue;
    }

    total++;
    if (matches.length < maxResults) {
      const first = corpus[i];
      const last = corpus[i + queryTokens.length - 1];
      const start = index.map[first.start];
      const end = sourceEnd(source, index.map[last.end - 1]);
      const score = Math.max(0, 1 - distance / queryLength);
      matches.push(makeMatch(source, start, end, score, contextChars));
    }
    i += queryTokens.length;
  }

  return { mode: "fuzzy", count: matches.length, total_matches: total, matches };
}

/** Levenshtein distance, abandoned as soon as it is known to exceed `max`. */
function boundedDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) previous[j] = j;

  for (let i = 1; i <= a.length; i++) {
    const current = new Array<number>(b.length + 1);
    current[0] = i;
    let rowMin = current[0];

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (current[j] < rowMin) rowMin = current[j];
    }

    if (rowMin > max) return max + 1;
    previous = current;
  }

  return previous[b.length];
}

/** Include combining marks that trail the last matched letter (e.g. a final damma). */
function sourceEnd(source: string, lastMapped: number): number {
  let end = lastMapped + 1;
  while (end < source.length && COMBINING_MARK.test(source[end])) end++;
  return end;
}

function makeMatch(source: string, start: number, end: number, score: number, contextChars: number): SearchMatch {
  const left = Math.max(0, start - contextChars);
  const right = Math.min(source.length, end + contextChars);
  return {
    start,
    end,
    text: source.slice(start, end),
    snippet: `${left > 0 ? "…" : ""}${source.slice(left, right)}${right < source.length ? "…" : ""}`,
    score: round3(score),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
