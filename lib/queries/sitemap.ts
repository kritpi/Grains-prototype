import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import type { LabTx } from "@/lib/queries/lab-edits";

/**
 * Everything with a public URL, for `app/sitemap.ts`.
 *
 * Its own file rather than four additions spread across `labs.ts`, `films.ts`
 * and `books.ts`: the sitemap is one consumer with one shape, and the shape it
 * wants — an id and a last-modified date, nothing else — is not a shape any of
 * those files otherwise has. Keeping it here also keeps the tracks' query files
 * as they were merged.
 *
 * Every row here is already public. There is no draft state anywhere in the
 * product (PRD D #4), so a lab or a photobook that exists is a lab or a
 * photobook anyone can open; nothing is being exposed by listing it.
 *
 * Each takes its executor as a defaulted parameter, the same shape and for the
 * same reason as `countOriginals` in photos.ts: callers pass nothing, and a
 * test can hand it a transaction it then rolls back. The `/u/` path shaping
 * below is exactly the kind of thing that breaks quietly, so it is worth
 * asserting against a real database rather than a mock.
 */

/**
 * A page and when it last changed.
 *
 * `lastModified` is an ISO-8601 string in UTC, not a `Date`, and both halves of
 * that matter.
 *
 * **A string, because that is what comes back.** `execute<T>()` is an unchecked
 * cast — it tells TypeScript what to believe rather than checking anything — and
 * postgres.js hands raw `timestamptz` back as text through it. Typing this
 * `Date` compiled perfectly and was false at runtime. `films.ts` and `labs.ts`
 * already type their `created_at` / `updated_at` as `string` for the same
 * reason; this now matches them.
 *
 * **ISO, because Postgres's own rendering is not valid here.** It emits
 * `2026-09-10 07:17:41.55411+00` — a space instead of `T`, and an offset without
 * minutes. `<lastmod>` requires a W3C Datetime, and Next writes a string
 * straight through without touching it, so an unconverted value would go into
 * the XML verbatim and be ignored by every crawler that read it. The conversion
 * happens in SQL rather than via `new Date(…)` because parsing that shape is
 * not something the spec guarantees; leaving it to whichever engine runs the
 * code is how this breaks again somewhere it is harder to see.
 */
export type SitemapEntry = {
  path: string;
  lastModified: string;
};

/**
 * Postgres → W3C Datetime, e.g. `2026-09-10T07:17:41Z`.
 *
 * Sub-second precision is dropped deliberately: a crawler does not use it, and
 * a shorter value is one less thing to get wrong.
 */
const ISO_UTC = 'YYYY-MM-DD"T"HH24:MI:SS"Z"';

/**
 * A ceiling, not a page size.
 *
 * The sitemap protocol caps a single file at 50,000 URLs, and this query layer
 * is not the place to discover that limit was passed. At Grains' scale the cap
 * is unreachable; if it ever is reached, the fix is a sitemap index and this
 * constant is where the tripwire lives.
 */
const MAX_URLS = 10_000;

/** Every lab. `labs.status` is a business status, not a publication one. */
export async function listLabUrls(
  executor: Pick<LabTx, "execute"> = getDb(),
): Promise<SitemapEntry[]> {
  const rows = await executor.execute<{ id: string; last_modified: string }>(
    sql`select id,
               to_char(updated_at at time zone 'utc', ${ISO_UTC}) as last_modified
        from labs
        order by updated_at desc
        limit ${MAX_URLS}`,
  );
  return rows.map((row) => ({
    path: `/labs/${row.id}`,
    lastModified: row.last_modified,
  }));
}

/** Every film stock in the catalog. */
export async function listFilmStockUrls(
  executor: Pick<LabTx, "execute"> = getDb(),
): Promise<SitemapEntry[]> {
  const rows = await executor.execute<{ id: string; last_modified: string }>(
    sql`select id,
               to_char(updated_at at time zone 'utc', ${ISO_UTC}) as last_modified
        from film_stocks
        order by updated_at desc
        limit ${MAX_URLS}`,
  );
  return rows.map((row) => ({
    path: `/films/${row.id}`,
    lastModified: row.last_modified,
  }));
}

/**
 * Profiles and their photobooks.
 *
 * Joined rather than listed separately because both are gated on the same two
 * conditions, and stating them once keeps them from drifting apart:
 *
 * - **A username.** `users.username` is nullable — a person who has signed in
 *   with Google but not yet claimed a handle has no `/u/…` to link to.
 * - **At least one photobook.** A profile with none renders a real page, but it
 *   is a name and an empty grid; there is nothing there for a search result to
 *   be about.
 *
 * PRD D #9 makes the Connection graph the only discovery path *inside* the
 * product, which is why there is no global photobook index and no "Photobooks"
 * tab in the header. It is a rule about the product's own navigation, not a
 * robots policy: these pages carry `generateMetadata` and are meant to be
 * findable from outside. If that reading is ever reversed, this function is the
 * single place to drop.
 */
export async function listProfileUrls(
  executor: Pick<LabTx, "execute"> = getDb(),
): Promise<SitemapEntry[]> {
  const rows = await executor.execute<{
    username: string;
    slug: string | null;
    last_modified: string;
  }>(
    sql`
      select u.username,
             b.slug,
             to_char(b.updated_at at time zone 'utc', ${ISO_UTC}) as last_modified
      from photobooks b
      join users u on u.id = b.owner_id
      where u.username is not null

      union all

      -- Cast rather than a bare NULL: the union's column type would otherwise
      -- be resolved from the other branch, which works until somebody reorders
      -- the branches.
      select u.username,
             null::text as slug,
             to_char(max(b.updated_at) at time zone 'utc', ${ISO_UTC}) as last_modified
      from photobooks b
      join users u on u.id = b.owner_id
      where u.username is not null
      group by u.username

      order by last_modified desc
      limit ${MAX_URLS}
    `,
  );

  return rows.map((row) => ({
    // No `@`, because that is the form the application itself links to —
    // site-header, photobook-card, every redirect, and every `revalidatePath`
    // call in app/u/actions.ts.
    //
    // Both forms resolve: the route's `handleOf` strips a leading `@`, so
    // `/u/@amp` and `/u/amp` render the same page. That makes them duplicate
    // URLs, and a sitemap is precisely where picking one matters. The no-`@`
    // form wins on evidence rather than taste — if the `@` form were canonical,
    // the revalidation calls would all be missing their target.
    path:
      row.slug === null
        ? `/u/${row.username}`
        : `/u/${row.username}/${row.slug}`,
    lastModified: row.last_modified,
  }));
}
