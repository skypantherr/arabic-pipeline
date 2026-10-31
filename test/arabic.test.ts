import { describe, expect, it } from "vitest";
import { chunkText, detectLanguage, diffText, normalizeArabic, searchText, textMetrics } from "../src/lib/arabic";

describe("normalizeArabic", () => {
  it("strips tashkeel and folds ta-marbuta in search mode", () => {
    const input = "مُحَمَّدٌ عَلِيّ فَاطِمَةٌ";
    const out = normalizeArabic(input, "search");
    expect(out.text).toBe("محمد علي فاطمه");
    expect(out.applied).toContain("tashkeel_and_tatweel_removed");
    expect(out.applied).toContain("ta_marbuta_folded");
    expect(out.changed).toBe(true);
  });

  it("folds alef and ya variants when they are present", () => {
    const out = normalizeArabic("أحمد وإبراهيم وعلى", "search");
    expect(out.text).toBe("احمد وابراهيم وعلي");
    expect(out.applied).toContain("alef_folded");
    expect(out.applied).toContain("yeh_folded");
  });

  it("keeps tashkeel and letter forms intact in light mode", () => {
    const input = "مُحَمَّدٌ عَلِيّ";
    const out = normalizeArabic(input, "light");
    expect(out.text).toBe(input);
    expect(out.applied).not.toContain("tashkeel_and_tatweel_removed");
  });

  it("unifies Arabic-Indic and Extended Arabic-Indic digits", () => {
    const out = normalizeArabic("الفاتورة رقم ١٢٣٤ بمبلغ ٥٠ و ٤٥", "light");
    expect(out.text).toContain("1234");
    expect(out.text).toContain("50");
    expect(out.text).toContain("45");
    expect(out.applied).toContain("arabic_indic_digits_unified");
  });

  it("removes bidi control characters and collapses whitespace", () => {
    const out = normalizeArabic("مرحبا‏ \n\t بالعالم  ", "light");
    expect(out.text).toBe("مرحبا بالعالم");
    expect(out.applied).toContain("bidi_and_zero_width_removed");
    expect(out.applied).toContain("whitespace_collapsed");
  });

  it("index mode strips punctuation to letters, digits and spaces", () => {
    const out = normalizeArabic("فاتورة، رقم 55!", "index");
    expect(out.text).toBe("فاتوره رقم 55");
    expect(out.applied).toContain("punctuation_stripped");
  });

  it("is idempotent", () => {
    const once = normalizeArabic("الأحمدُ ١٢٣", "search").text;
    const twice = normalizeArabic(once, "search").text;
    expect(twice).toBe(once);
  });

  it("removes every invisible control, including LRM and the zero-width joiners", () => {
    // Regression: the character class was stored as raw invisible characters and
    // had silently lost its \u200B-\u200E range, so LRM, ZWSP, ZWNJ and ZWJ
    // survived "bidi removal". Invisible bugs survive reviews; this pins them.
    const invisible = "\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069\uFEFF";
    for (const mode of ["light", "search", "index"] as const) {
      const out = normalizeArabic(`مرحبا${invisible}بالعالم`, mode);
      expect(out.text, mode).toBe("مرحبابالعالم");
      expect(out.applied, mode).toContain("bidi_and_zero_width_removed");
      for (const ch of invisible) {
        expect(out.text.includes(ch), `${mode} kept U+${ch.codePointAt(0)!.toString(16).toUpperCase()}`).toBe(false);
      }
    }

    // The same characters must not be counted as letters or as word breaks.
    expect(textMetrics(`مرحبا${invisible} بالعالم`).chars_arabic).toBe(12);
  });

  it("stays a fixed point when mark removal strands whitespace", () => {
    // Regression: whitespace was collapsed before tashkeel was stripped, so a
    // mark sitting between two spaces left a double space behind ("لد  ص") and
    // a second normalisation produced a different string.
    const out = normalizeArabic("لد ّ ص", "search");
    expect(out.text).toBe("لد ص");
    expect(out.text.includes("  ")).toBe(false);
    expect(normalizeArabic(out.text, "search").text).toBe(out.text);

    // Punctuation stripping in index mode has the same failure mode.
    const indexed = normalizeArabic("كلمة ! كلمة", "index");
    expect(indexed.text).toBe("كلمه كلمه");
    expect(normalizeArabic(indexed.text, "index").text).toBe(indexed.text);
  });
});

describe("textMetrics", () => {
  it("counts Arabic text and reports language", () => {
    const m = textMetrics("مرحبا بالعالم. كيف حالك؟");
    expect(m.language).toBe("ar");
    expect(m.words).toBe(4); // whitespace-delimited tokens
    expect(m.sentences).toBe(2);
    expect(m.chars_arabic).toBeGreaterThan(0);
    expect(m.chars_latin).toBe(0);
    expect(m.reading_time_seconds).toBeGreaterThan(0);
  });

  it("detects latin and mixed text", () => {
    expect(textMetrics("hello world").language).toBe("en");
    expect(textMetrics("hello مرحبا").language).toBe("ar");
    expect(textMetrics("").language).toBe("unknown");
  });

  it("handles empty input safely", () => {
    const m = textMetrics("");
    expect(m.words).toBe(0);
    expect(m.avg_word_length).toBe(0);
    expect(m.reading_time_seconds).toBe(0);
  });
});

describe("detectLanguage", () => {
  it("detects Arabic and reports the script counts", () => {
    const d = detectLanguage("مرحبا بالعالم");
    expect(d.language).toBe("ar");
    expect(d.confidence).toBe(1);
    expect(d.script_mix).toEqual({ arabic: 12, latin: 0, other: 0 });
  });

  it("detects English", () => {
    const d = detectLanguage("hello world");
    expect(d.language).toBe("en");
    expect(d.confidence).toBe(1);
    expect(d.script_mix.latin).toBe(10);
  });

  it("reports mixed for a balanced bilingual text", () => {
    const d = detectLanguage("مرحبا hello");
    expect(d.language).toBe("mixed");
    expect(d.confidence).toBe(0.5);
    expect(d.script_mix).toEqual({ arabic: 5, latin: 5, other: 0 });
  });

  it("treats a heavily dominant script as that language", () => {
    // 18 Arabic letters + 3 Latin: 86% Arabic, so still "ar".
    const d = detectLanguage("مرحبا بالعالم كلامكم hey");
    expect(d.script_mix.arabic).toBeGreaterThan(d.script_mix.latin);
    expect(d.language).toBe("ar");
    expect(d.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("returns unknown for no letters and for other scripts", () => {
    expect(detectLanguage("12345 !!!").language).toBe("unknown");
    expect(detectLanguage("12345 !!!").confidence).toBe(0);
    const cyrillic = detectLanguage("Привет");
    expect(cyrillic.language).toBe("unknown");
    expect(cyrillic.script_mix).toEqual({ arabic: 0, latin: 0, other: 6 });
  });
});

describe("chunkText", () => {
  const join = (s: string) => s.replace(/\s+/g, " ").trim();

  it("returns no chunks for empty text", () => {
    expect(chunkText("")).toEqual({ chunks: [], count: 0, total_chars: 0 });
  });

  it("keeps short text in one chunk with exact offsets", () => {
    const input = "مرحبا بالعالم";
    const out = chunkText(input, { maxChars: 100 });
    expect(out.count).toBe(1);
    expect(out.total_chars).toBe(input.length);
    expect(out.chunks[0]).toMatchObject({ text: input, start: 0, end: input.length, index: 0 });
  });

  it("cuts at sentence boundaries and never exceeds maxChars", () => {
    const input = "أول جملة. ثاني جملة. ثالث جملة.";
    const out = chunkText(input, { maxChars: 15 });
    expect(out.count).toBeGreaterThan(1);
    for (const chunk of out.chunks) {
      expect(chunk.end - chunk.start).toBeLessThanOrEqual(15);
      expect(input.slice(chunk.start, chunk.end)).toBe(chunk.text);
      expect(chunk.text).not.toMatch(/^\s|\s$/);
    }
    expect(join(out.chunks.map((c) => c.text).join(" "))).toBe(join(input));
  });

  it("packs short sentences together", () => {
    const out = chunkText("أول. ثاني. ثالث.", { maxChars: 12 });
    expect(out.chunks[0].text).toBe("أول. ثاني.");
    expect(out.chunks[1].text).toBe("ثالث.");
  });

  it("treats line and paragraph breaks as boundaries", () => {
    const lines = chunkText("line one\nline two\nline three", { maxChars: 12 });
    expect(lines.chunks.map((c) => c.text)).toEqual(["line one", "line two", "line three"]);

    const paragraphs = chunkText("first paragraph\n\nsecond paragraph", { maxChars: 20 });
    expect(paragraphs.chunks.map((c) => c.text)).toEqual(["first paragraph", "second paragraph"]);
  });

  it("does not split a decimal number", () => {
    const out = chunkText("pi is 3.14 exactly", { maxChars: 30 });
    expect(out.count).toBe(1);
    expect(out.chunks[0].text).toBe("pi is 3.14 exactly");
  });

  it("never splits a word when a word boundary fits", () => {
    const input = "كلمة طويلة جدا هنا";
    const out = chunkText(input, { maxChars: 10 });
    for (const chunk of out.chunks) {
      expect(input.slice(chunk.start, chunk.end)).toBe(chunk.text);
      expect(chunk.text).toMatch(/^\S/);
      expect(chunk.text).toMatch(/\S$/);
    }
    expect(out.chunks[0].text).toBe("كلمة طويلة");
  });

  it("hard-splits a single word longer than maxChars", () => {
    const input = "abcdefghij".repeat(3); // 30 chars, one word
    const out = chunkText(input, { maxChars: 20 });
    expect(out.count).toBe(2);
    expect(out.chunks[0].text).toBe("abcdefghijabcdefghij");
    expect(out.chunks[1].text).toBe("abcdefghij");
    expect(out.chunks.map((c) => c.text).join("")).toBe(input);
  });

  it("overlap repeats the previous tail from a word start", () => {
    const input = "one two three four five six";
    const out = chunkText(input, { maxChars: 20, overlap: 5 });
    expect(out.count).toBe(2);
    expect(out.chunks[0].text).toBe("one two three four");
    expect(out.chunks[1].text).toBe("four five six");
    for (const chunk of out.chunks) {
      expect(input.slice(chunk.start, chunk.end)).toBe(chunk.text);
    }
  });

  it("never exceeds max_chars, even with overlap", () => {
    // Regression: overlap used to extend a chunk past max_chars, which defeats
    // the reason the parameter exists (fitting a model context window). The
    // overlap is dropped where it would break the cap.
    const input = "one two three four five six";
    const out = chunkText(input, { maxChars: 12, overlap: 5 });
    expect(out.chunks.map((c) => c.text)).toEqual(["one two", "three four", "five six"]);
    for (const chunk of out.chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(12);
      expect(input.slice(chunk.start, chunk.end)).toBe(chunk.text);
    }

    const long = "كلمة ".repeat(60).trim();
    for (const maxChars of [20, 31, 64]) {
      const capped = chunkText(long, { maxChars, overlap: Math.floor(maxChars / 2) });
      for (const chunk of capped.chunks) {
        expect(chunk.text.length, `maxChars=${maxChars}`).toBeLessThanOrEqual(maxChars);
      }
      expect(capped.chunks.map((c) => c.text).join(" ").includes("كلمة")).toBe(true);
    }
  });

  it("rejects out-of-range options", () => {
    expect(() => chunkText("x", { maxChars: 0 })).toThrow(RangeError);
    expect(() => chunkText("x", { maxChars: 9000 })).toThrow(RangeError);
    expect(() => chunkText("x", { maxChars: 100, overlap: 51 })).toThrow(RangeError);
  });
});

describe("searchText", () => {
  it("matches across tashkeel and letter variants", () => {
    const text = "قَالَتْ فَاطِمَةُ: مرحبا";
    const out = searchText(text, "فاطمة");
    expect(out.count).toBe(1);
    expect(out.total_matches).toBe(1);
    expect(out.matches[0].text).toBe("فَاطِمَةُ");
    expect(text.slice(out.matches[0].start, out.matches[0].end)).toBe(out.matches[0].text);

    expect(searchText("أحمد وإبراهيم", "احمد وابراهيم").count).toBe(1);
    expect(searchText("الفاتورة ١٢٣", "123").count).toBe(1);
  });

  it("is case-insensitive for Latin text", () => {
    expect(searchText("Hello World", "hello").count).toBe(1);
  });

  it("collapses whitespace in the query and the text", () => {
    expect(searchText("فاطمة   علي", "فاطمة علي").count).toBe(1);
  });

  it("matches across invisible bidi marks and reports the original offsets", () => {
    // Word processors inject LRM/RLM between letters; a buyer searching for a
    // word must still get a hit whose offset points into the untouched input.
    const text = "قال \u200Fفاطم\u200Eة\u200F علي";
    const out = searchText(text, "فاطمة");
    expect(out.count).toBe(1);
    expect(text.slice(out.matches[0].start, out.matches[0].end)).toBe(out.matches[0].text);
    expect(out.matches[0].text.startsWith("فاطم")).toBe(true);
  });

  it("words mode requires word boundaries, phrase mode does not", () => {
    const text = "كتاب في الكتاب";
    expect(searchText(text, "كتاب", { mode: "words" }).count).toBe(1);
    expect(searchText(text, "كتاب", { mode: "phrase" }).count).toBe(2);
    expect(searchText("فاطمة، علي", "فاطمة", { mode: "words" }).count).toBe(1);
  });

  it("returns every match with exact offsets and respects max_results", () => {
    const text = "مرحبا بك. مرحبا بك. مرحبا بك.";
    const all = searchText(text, "مرحبا");
    expect(all.count).toBe(3);
    expect(all.total_matches).toBe(3);
    for (const match of all.matches) {
      expect(text.slice(match.start, match.end)).toBe(match.text);
    }

    const capped = searchText(text, "مرحبا", { maxResults: 2 });
    expect(capped.count).toBe(2);
    expect(capped.total_matches).toBe(3);
  });

  it("builds a snippet with ellipses when context is truncated", () => {
    const text = "كلام كثير قبل المطلوب كلام كثير بعده";
    const out = searchText(text, "المطلوب", { contextChars: 5 });
    expect(out.matches[0].snippet.startsWith("…")).toBe(true);
    expect(out.matches[0].snippet.endsWith("…")).toBe(true);
    expect(out.matches[0].snippet).toContain("المطلوب");
  });

  it("fuzzy mode tolerates one edit per word", () => {
    const text = "قالت فاطمه إن";
    const exact = searchText(text, "فاطمخ", { mode: "words" });
    expect(exact.count).toBe(0);

    const fuzzy = searchText(text, "فاطمخ", { mode: "fuzzy" });
    expect(fuzzy.count).toBe(1);
    expect(fuzzy.matches[0].text).toBe("فاطمه");
    expect(fuzzy.matches[0].score).toBeGreaterThan(0);
    expect(fuzzy.matches[0].score).toBeLessThan(1);

    expect(searchText(text, "فاطمخ", { mode: "fuzzy", maxDistance: 0 }).count).toBe(0);
  });

  it("fuzzy mode matches a multi-word phrase in order", () => {
    const text = "ثم قالت مرحبا بالعالم جميعا";
    const out = searchText(text, "مرحبا بالعالم", { mode: "fuzzy" });
    expect(out.count).toBe(1);
    expect(text.slice(out.matches[0].start, out.matches[0].end)).toBe("مرحبا بالعالم");
  });

  it("rejects out-of-range options and empty queries", () => {
    expect(() => searchText("x", "")).toThrow(RangeError);
    expect(() => searchText("x", "!!", { mode: "fuzzy" })).toThrow(RangeError);
    expect(() => searchText("x", "x", { maxResults: 0 })).toThrow(RangeError);
    expect(() => searchText("x", "x", { contextChars: 201 })).toThrow(RangeError);
    expect(() => searchText("x", "x", { maxDistance: 3 })).toThrow(RangeError);
    expect(() => searchText("x".repeat(100_001), "x")).toThrow(RangeError);
  });
});

describe("diffText", () => {
  it("treats identical text as equal", () => {
    const d = diffText("مرحبا بالعالم", "مرحبا بالعالم");
    expect(d).toEqual({ equal: true, similarity: 1, added: [], removed: [] });
  });

  it("ignores tashkeel, letter variants and Arabic-Indic digits", () => {
    expect(diffText("مُحَمَّدٌ عَلِيّ", "محمد علي").equal).toBe(true);
    expect(diffText("فاطمة", "فاطمه").equal).toBe(true);
    expect(diffText("الفاتورة ١٢٣", "الفاتوره 123").equal).toBe(true);
  });

  it("reports added and removed words with a similarity score", () => {
    const d = diffText("مرحبا بالعالم", "مرحبا يا عالم");
    expect(d.equal).toBe(false);
    expect(d.removed).toEqual(["بالعالم"]);
    expect(d.added).toEqual(["يا", "عالم"]);
    expect(d.similarity).toBe(0.4);
  });

  it("handles empty sides", () => {
    expect(diffText("", "")).toEqual({ equal: true, similarity: 1, added: [], removed: [] });
    expect(diffText("", "hello")).toEqual({ equal: false, similarity: 0, added: ["hello"], removed: [] });
  });

  it("refuses inputs above the word limit", () => {
    const long = Array.from({ length: 1501 }, () => "w").join(" ");
    expect(() => diffText(long, "w")).toThrow(RangeError);
  });
});
