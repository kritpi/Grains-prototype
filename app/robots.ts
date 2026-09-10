import type { MetadataRoute } from "next";

import { isIndexable, siteUrl } from "@/lib/site-url";

/**
 * `/robots.txt`.
 *
 * The important case is the one that is easy to forget: **a preview deployment
 * must not be indexed.** Every Vercel preview carries the whole application on
 * a public hostname, reading `grains-dev` — which holds seed prices for real,
 * named Bangkok businesses that nobody has verified yet, and says so on every
 * listing. Indexed, that is a duplicate of the site publishing unverified
 * prices under a company's name. So the default here is closed, and only a
 * production deployment opens it.
 *
 * No database, so this can be generated at build the way Next prefers.
 * `VERCEL_ENV` is set during the build and is per-environment, which is exactly
 * the granularity this needs.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        // Infrastructure and the JSON the map fetches after load. Neither is a
        // page, and `/api/health` reports the deployment region.
        "/api/",
        // Auth and contribution surfaces: a form or a redirect, never content.
        // The same three are absent from sitemap.ts.
        "/sign-in",
        "/welcome",
        "/labs/new",
        "/labs/*/edit",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
