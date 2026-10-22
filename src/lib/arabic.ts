/**
 * Pure Arabic text utilities. No dependencies, no network, no cost.
 *
 * Two capabilities:
 *  - normalizeArabic(): make messy Arabic comparable/searchable.
 *  - textMetrics(): cheap, deterministic statistics an agent can act on
 *    (chunking, dedup keys, language routing, reading-time estimates).
 */

export type NormalizeMode = "light" | "search" | "index";

/** Harakat, superscript marks, and tatweel (ـ). */
const TASHKEEL = /[ً-ٰٟۖ-ۭـ]/g;
/** Arabic-Indic digits ٠-٩ and Extended Arabic-Indic digits ۰-۹. */
const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/g;
/** Bidi control characters, zero-width marks, BOM. */
const BIDI_AND_ZERO_WIDTH = /[-‏‪-‮⁦-⁩﻿]/g;
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
/** Arabic comma / question mark / semicolon. */
const ARABIC_PUNCT = /[،؛؟۔]/g;
const SENTENCE_BREAK = /[.!?؟۔\n]+/;

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
