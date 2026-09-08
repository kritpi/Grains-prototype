import type { NextConfig } from "next";

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
  },
};

export default nextConfig;
