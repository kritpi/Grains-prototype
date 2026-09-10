import type { NextConfig } from "next";

/**
 * True when the read origin is R2's public development URL.
 *
 * Duplicated from `lib/image-loader.ts` rather than imported: this file is
 * evaluated by Next's own loader before the app's module graph exists, and a
 * TypeScript import from `lib/` here is a different resolution problem than it
 * looks. Two lines of regex is the cheaper of the two mistakes, and
 * `tests/storage/image-loader.test.ts` pins the behaviour they share.
 */
const DEVELOPMENT_ORIGIN = /^https?:\/\/[^/]*\.r2\.dev$/i.test(
  (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, ""),
);

const nextConfig: NextConfig = {
  images: {
    /**
     * Cloudflare Images transformations on the R2 domain, rather than Next's
     * own optimiser (P23).
     *
     * `loaderFile` is the App Router way to do this: a `loader` prop would have
     * to be passed to `next/image`, which is a client component, and a function
     * cannot cross that boundary from a Server Component. So it is configured
     * once, globally, and `lib/image-loader.ts` passes through anything that is
     * not served from the R2 domain.
     *
     * The optimiser it replaces would have run on the app's host — resizing
     * multi-megabyte film scans on a Vercel function, having first pulled every
     * byte across from Cloudflare. Transforming at the origin that already
     * holds the bytes is both cheaper and the only version that stays true if
     * the app itself moves hosts.
     */
    loader: "custom",
    loaderFile: "./lib/image-loader.ts",

    /**
     * On an `r2.dev` origin, say plainly that nothing is being optimised.
     *
     * `next/image` requires a custom loader to put the requested `width` into
     * the URL it returns, and checks that it did. The development fallback
     * cannot: `/cdn-cgi/image/` does not run on `r2.dev`, so the loader returns
     * the original URL, Next sees a loader ignoring its contract, and warns on
     * every image — server and browser both — while quietly degrading the
     * `srcset`.
     *
     * Next's own suggestion is the honest answer, because it is simply true
     * here: these images are unoptimised. Declaring it silences a warning that
     * was correct, and produces a single plain `src` instead of a `srcset` of
     * widths that all resolve to the same full-size object.
     *
     * The alternative — appending an inert `?width=` to satisfy the check —
     * would pass by telling Next something untrue.
     *
     * This is read at config time, so switching to a custom domain needs a dev
     * server restart. That is already true of `NEXT_PUBLIC_*` values, which are
     * inlined at compile time.
     */
    unoptimized: DEVELOPMENT_ORIGIN,
  },
};

export default nextConfig;
