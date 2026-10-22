import { describe, expect, it } from "vitest";
import { normalizeArabic, textMetrics } from "../src/lib/arabic";

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
