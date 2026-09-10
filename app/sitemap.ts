import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site-url";
import {
  listFilmStockUrls,
  listLabUrls,
  listProfileUrls,
} from "@/lib/queries/sitemap";

/**
 * `/sitemap.xml`.
 *
 * Discovery is the product, so this is not housekeeping: a lab page nobody can
 * find is a lab that is not listed. Labs and film stocks are the two surfaces
 * somebody searches for by name.
 *
 * **`force-dynamic` is load-bearing.** Without it Next generates this at build
 * time, which would query Postgres during `next build` and re-introduce exactly
 * the defect the `/films` pages are fixed for in this same change: Supabase's
 * free tier pauses after 7 idle days, so a deploy after a quiet week would fail
 * at build. Generated per request, a paused database is a 500 on one route that
 * a crawler retries, rather than a deployment that does not happen.
 */
export const dynamic = "force-dynamic";

/**
 * The pages that exist without a database row behind them.
 *
 * `/sign-in`, `/welcome` and `/labs/new` are deliberately absent: they are
 * either auth-gated or a form, and none of them is content. `robots.ts`
 * disallows them as well, so the two files agree.
 */
const STATIC_PATHS = ["/", "/labs", "/films"] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteUrl();
  const now = new Date();

  const [labs, films, profiles] = await Promise.all([
    listLabUrls(),
    listFilmStockUrls(),
    listProfileUrls(),
  ]);

  // `changeFrequency` and `priority` are omitted on purpose. Google has said
  // for years that it ignores both, and a number nobody reads is a number that
  // goes stale without anybody noticing. `lastModified` is the field crawlers
  // actually use, and every row here has a real `updated_at` behind it.
  return [
    ...STATIC_PATHS.map((path) => ({
      url: `${origin}${path}`,
      lastModified: now,
    })),
    ...[...labs, ...films, ...profiles].map((entry) => ({
      url: `${origin}${entry.path}`,
      lastModified: entry.lastModified,
    })),
  ];
}
