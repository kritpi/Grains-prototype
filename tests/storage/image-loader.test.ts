import { afterEach, describe, expect, it, vi } from "vitest";

import r2ImageLoader, { publicUrl } from "@/lib/image-loader";

const ORIGIN = "https://images-dev.example.com";

/**
 * The origin is read from `process.env` inside the functions rather than at
 * module scope precisely so it can be stubbed here — Next inlines
 * `NEXT_PUBLIC_*` either way.
 */
function withOrigin(value: string) {
  vi.stubEnv("NEXT_PUBLIC_R2_PUBLIC_URL", value);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("publicUrl", () => {
  it("serves a key as a path under the custom domain", () => {
    withOrigin(ORIGIN);
    expect(publicUrl("photos/user-1/abc.jpg")).toBe(
      `${ORIGIN}/photos/user-1/abc.jpg`,
    );
  });

  it("tolerates a trailing slash on the configured origin", () => {
    withOrigin(`${ORIGIN}/`);
    expect(publicUrl("photos/a")).toBe(`${ORIGIN}/photos/a`);
  });

  it("encodes segments without eating the separators", () => {
    withOrigin(ORIGIN);
    // A space is the realistic case — a key copied from a filename — and the
    // slashes must survive as path separators rather than becoming %2F.
    expect(publicUrl("photos/user 1/a b.jpg")).toBe(
      `${ORIGIN}/photos/user%201/a%20b.jpg`,
    );
  });
});

describe("r2ImageLoader", () => {
  it("inserts a transformation path before the key", () => {
    withOrigin(ORIGIN);
    expect(
      r2ImageLoader({ src: publicUrl("photos/u/abc.jpg"), width: 640 }),
    ).toBe(
      `${ORIGIN}/cdn-cgi/image/width=640,format=auto,fit=scale-down/photos/u/abc.jpg`,
    );
  });

  it("appends quality only when one is asked for", () => {
    withOrigin(ORIGIN);
    const url = r2ImageLoader({
      src: publicUrl("photos/u/abc.jpg"),
      width: 320,
      quality: 70,
    });
    expect(url).toContain("width=320,format=auto,fit=scale-down,quality=70");
  });

  it("returns the absolute origin, not a path", () => {
    withOrigin(ORIGIN);
    // The app is not on the Cloudflare zone that transforms; a relative
    // /cdn-cgi/image/… would hit the app's own host and 404.
    expect(
      r2ImageLoader({ src: publicUrl("photos/u/a.jpg"), width: 640 }),
    ).toMatch(/^https:\/\//);
  });

  it("passes through anything not served from our origin", () => {
    withOrigin(ORIGIN);
    expect(r2ImageLoader({ src: "/logo.svg", width: 64 })).toBe("/logo.svg");
    expect(
      r2ImageLoader({ src: "https://elsewhere.example/a.jpg", width: 64 }),
    ).toBe("https://elsewhere.example/a.jpg");
  });

  it("passes everything through when no origin is configured", () => {
    // Without this guard an empty origin makes the prefix test `startsWith("/")`,
    // which matches every local asset on the site.
    withOrigin("");
    expect(r2ImageLoader({ src: "/logo.svg", width: 64 })).toBe("/logo.svg");
  });
});
