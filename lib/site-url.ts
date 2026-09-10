/**
 * Where this deployment thinks it lives, and whether it should be indexed.
 *
 * Deliberately not in `lib/env.ts`. Everything there is required and throws
 * when absent, which is right for a database URL and wrong here: the production
 * hostname is a launch decision nobody has made yet (the profile page prints
 * `/u/@name` rather than a domain for the same reason), and a sitemap that
 * refuses to build until someone picks one would block work that does not
 * depend on it. These resolve instead of throwing, and say what they fell back
 * to.
 */

/** No trailing slash, so callers can append `/labs` without doubling it. */
function normalise(origin: string): string {
  const trimmed = origin.replace(/\/+$/, "");
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * The canonical origin for absolute URLs.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` is the *production* domain and is set on
 * every deployment including previews — which is exactly what canonical URLs
 * want. `VERCEL_URL`, the per-deployment hostname, is deliberately not used: it
 * changes on every push, so a sitemap built from it would advertise URLs that
 * stop existing.
 *
 * Set `NEXT_PUBLIC_SITE_URL` once the real domain is bound and it wins over
 * both.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return normalise(explicit);

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return normalise(vercel);

  // The port matters even though this branch never runs in production: a
  // hardcoded 3000 while the server is on 3001 prints a sitemap full of URLs
  // that do not resolve, which is a confusing thing to hand somebody who is
  // checking the sitemap locally. Next sets PORT when `-p` is passed.
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/**
 * Whether search engines should be allowed in.
 *
 * Only true on a production deployment. Preview deployments carry the whole
 * app and real `grains-dev` data on a public hostname, so without this they are
 * indexable duplicates of the site — and `grains-dev` holds unverified seed
 * prices for real, named businesses. Locally it is false too, which costs
 * nothing and keeps the default closed.
 */
export function isIndexable(): boolean {
  return process.env.VERCEL_ENV === "production";
}
