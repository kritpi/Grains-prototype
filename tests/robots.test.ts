import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import robots from "@/app/robots";

/**
 * The rule worth a test is the closed default.
 *
 * A Vercel preview serves the whole application, reading `grains-dev` — which
 * holds seed prices for real, named Bangkok businesses that nobody has verified
 * and that say so on every listing. Indexed, that is unverified pricing
 * published under a company's name on a hostname nobody is watching. It is the
 * kind of thing that is only ever noticed afterwards, so it is asserted here.
 */
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots.txt", () => {
  it("disallows everything on a preview deployment", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  it("disallows everything locally", () => {
    expect(robots().rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  it("advertises no sitemap when it is closed", () => {
    // Pointing a crawler at a sitemap while telling it to stay out is a
    // contradiction, and the sitemap would list the production domain anyway.
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robots().sitemap).toBeUndefined();
  });

  it("opens up on production and links the sitemap", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://grains.example.com");

    const result = robots();
    expect(result.sitemap).toBe("https://grains.example.com/sitemap.xml");
    expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" });
  });

  it("keeps auth and contribution surfaces out even when open", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const rules = robots().rules;
    const disallow = Array.isArray(rules) ? [] : (rules.disallow ?? []);

    // These are the same paths sitemap.ts omits. The two files have to agree,
    // and nothing but this test makes them.
    expect(disallow).toEqual(
      expect.arrayContaining(["/api/", "/sign-in", "/welcome", "/labs/new"]),
    );
  });
});
