import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isIndexable, siteUrl } from "@/lib/site-url";

/**
 * These read `process.env` inside the functions rather than at module scope, so
 * stubbing works the same way `tests/storage/image-loader.test.ts` does it.
 *
 * Every test starts from all three unset. A developer's own environment must
 * not decide the result — and on Vercel these tests would otherwise inherit
 * whatever the deployment sets.
 */
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined);
  vi.stubEnv("VERCEL_ENV", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteUrl", () => {
  it("falls back to localhost when nothing is configured", () => {
    // The launch decision has not been made, so this is the honest local
    // answer rather than a guessed production domain.
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("uses Vercel's production domain when it is present", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "grains.vercel.app");
    expect(siteUrl()).toBe("https://grains.vercel.app");
  });

  it("prefers an explicit NEXT_PUBLIC_SITE_URL over Vercel's", () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "grains.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://grains.example.com");
    expect(siteUrl()).toBe("https://grains.example.com");
  });

  it("never returns a trailing slash", () => {
    // Callers append `/labs` directly; a trailing slash here would produce
    // `//labs` in every sitemap URL.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://grains.example.com/");
    expect(siteUrl()).toBe("https://grains.example.com");
  });

  it("adds a scheme when the value is a bare hostname", () => {
    // VERCEL_PROJECT_PRODUCTION_URL has no scheme, and a sitemap URL without
    // one is invalid rather than merely ugly.
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "grains.vercel.app");
    expect(siteUrl().startsWith("https://")).toBe(true);
  });

  it("leaves an explicit http:// alone", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:4000");
    expect(siteUrl()).toBe("http://localhost:4000");
  });
});

describe("isIndexable", () => {
  it("is false when VERCEL_ENV is unset, which is local development", () => {
    expect(isIndexable()).toBe(false);
  });

  it("is false on a preview deployment", () => {
    // The one that matters: a preview is the whole app on a public hostname,
    // serving grains-dev's unverified prices for real, named businesses.
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isIndexable()).toBe(false);
  });

  it("is true only on production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isIndexable()).toBe(true);
  });
});
