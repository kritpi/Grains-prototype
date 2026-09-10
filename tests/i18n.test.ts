import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { LANGS, isLang, t, translator } from "@/lib/i18n";
import { proxy } from "@/proxy";

/**
 * The dictionary's shape, and the one rule that keeps it honest.
 *
 * Thai copy that quietly falls back to English is the failure mode a
 * hand-rolled dictionary invites: nothing throws, the page renders, and the
 * only symptom is a reader seeing a language they did not choose. The types
 * make a missing key impossible, so what is left to check is that no entry is
 * English wearing a Thai label.
 */
describe("the dictionary", () => {
  it("offers exactly the two languages", () => {
    expect([...LANGS]).toEqual(["en", "th"]);
  });

  it("returns the language asked for", () => {
    expect(t("en", "nav.labs")).toBe("Labs");
    expect(t("th", "nav.labs")).toBe("ร้านล้างฟิล์ม");
  });

  it("has real Thai in every Thai string", () => {
    // Every entry, not a sample: a key added later with the English pasted into
    // both slots is exactly what this is here to catch. Thai has no letter
    // case and its own Unicode block, so "contains a Thai character" is a
    // sufficient and very cheap test.
    const thai = /[฀-๿]/;
    const keys = [
      "nav.labs",
      "nav.films",
      "nav.sections",
      "auth.signIn",
      "auth.signOut",
      "auth.chooseUsername",
      "lang.label",
      "notFound.title",
      "notFound.body",
      "notFound.findLab",
      "notFound.browseFilms",
      "error.title",
      "error.body",
      "error.retry",
      "error.reference",
    ] as const;

    for (const key of keys) {
      expect(t("th", key), `${key} has no Thai`).toMatch(thai);
      expect(t("th", key), `${key} is the English string`).not.toBe(
        t("en", key),
      );
    }
  });

  it("curries", () => {
    expect(translator("th")("auth.signIn")).toBe("เข้าสู่ระบบ");
  });

  it("rejects anything that is not a language", () => {
    expect(isLang("en")).toBe(true);
    expect(isLang("th")).toBe(true);
    // The cookie is user-controlled, so this guard is the only thing between a
    // hand-edited value and an undefined lookup.
    expect(isLang("fr")).toBe(false);
    expect(isLang("")).toBe(false);
    expect(isLang(undefined)).toBe(false);
    expect(isLang("TH")).toBe(false);
  });
});

/**
 * `?lang=` → cookie → same URL without it.
 *
 * The redirect is half the point: leaving the parameter in the address makes it
 * part of every URL the reader then shares, and two URLs for one page is what
 * the cookie exists to avoid.
 */
describe("the language proxy", () => {
  // A real NextRequest, because `nextUrl` is the thing under test and a plain
  // Request does not have one.
  const call = (url: string) => proxy(new NextRequest(url));

  it("passes a request without ?lang straight through", () => {
    const response = call("https://grains.test/labs");
    expect(response.status).toBe(200);
    expect(response.cookies.get("grains_lang")).toBeUndefined();
  });

  it("sets the cookie and redirects without the parameter", () => {
    const response = call("https://grains.test/labs?lang=th");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://grains.test/labs");
    expect(response.cookies.get("grains_lang")?.value).toBe("th");
  });

  it("keeps every other query parameter", () => {
    // /labs carries its map viewport and filters in the URL. Dropping them
    // while switching language would silently reset somebody's search.
    const response = call(
      "https://grains.test/labs?process=c41&radius=5000&lang=th",
    );
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("process")).toBe("c41");
    expect(location.searchParams.get("radius")).toBe("5000");
    expect(location.searchParams.get("lang")).toBeNull();
  });

  it("ignores a language it does not have", () => {
    const response = call("https://grains.test/labs?lang=fr");
    expect(response.status).toBe(200);
    expect(response.cookies.get("grains_lang")).toBeUndefined();
  });
});
