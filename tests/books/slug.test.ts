import { describe, expect, it } from "vitest";

import { FALLBACK_SLUG, slugify, uniqueSlug } from "@/lib/books/slug";

describe("slugify", () => {
  it("makes an ordinary title into an address", () => {
    expect(slugify("Bangkok Overcast")).toBe("bangkok-overcast");
    expect(slugify("  Rolls   from   2024 ")).toBe("rolls-from-2024");
  });

  it("collapses punctuation into single separators", () => {
    expect(slugify("Sunday // Silver — no.7")).toBe("sunday-silver-no-7");
    expect(slugify("---Edges---")).toBe("edges");
  });

  it("keeps Thai intact rather than gutting it", () => {
    // The reason non-ASCII is not folded. NFKD-then-strip-marks is the standard
    // trick for turning é into e, and Thai vowel signs *are* combining marks —
    // it would return a row of bare consonants for a title a Thai speaker typed.
    const thai = "แล็บของแอมป์";
    const slug = slugify(thai);
    expect(slug).toContain("ล");
    expect(slug).toContain("็");
    expect(slug).not.toBe("");
  });

  it("keeps Latin diacritics rather than folding them", () => {
    expect(slugify("Café Noir")).toBe("café-noir");
  });

  it("is empty when a title has nothing to build from", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("")).toBe("");
  });

  it("never ends on a separator, even when it has to cut", () => {
    const long = slugify("a ".repeat(80));
    expect(long.endsWith("-")).toBe(false);
    expect(long.length).toBeLessThanOrEqual(60);
  });
});

describe("uniqueSlug", () => {
  it("takes the plain slug when it is free", () => {
    expect(uniqueSlug("bangkok-overcast", [])).toBe("bangkok-overcast");
  });

  it("numbers from 2, so the pair reads as first and second", () => {
    expect(uniqueSlug("roll", ["roll"])).toBe("roll-2");
    expect(uniqueSlug("roll", ["roll", "roll-2"])).toBe("roll-3");
  });

  it("fills a gap rather than always going to the end", () => {
    expect(uniqueSlug("roll", ["roll", "roll-3"])).toBe("roll-2");
  });

  it("falls back when the title reduced to nothing", () => {
    expect(uniqueSlug("", [])).toBe(FALLBACK_SLUG);
    expect(uniqueSlug("", [FALLBACK_SLUG])).toBe(`${FALLBACK_SLUG}-2`);
  });

  it("ignores slugs that only look similar", () => {
    // `roll-two` is not part of the `roll`, `roll-2` series.
    expect(uniqueSlug("roll", ["roll-two"])).toBe("roll");
  });
});
