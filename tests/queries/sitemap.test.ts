import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { LabTx } from "@/lib/queries/lab-edits";
import {
  listFilmStockUrls,
  listLabUrls,
  listProfileUrls,
} from "@/lib/queries/sitemap";
import { hasDatabase } from "../db/client";
import { testDb, withRollback, type TestDb } from "../db/tx";

/**
 * What the sitemap says about people.
 *
 * `listProfileUrls` carries all the branching: a union with two gates and a
 * path whose shape depends on whether `slug` came back null. Every case below
 * is one that would ship broken and look fine.
 *
 * `listLabUrls` and `listFilmStockUrls` are a select and a map, and are covered
 * only for the timestamp format — see the second block. A conversion that is
 * right in one of three places is the failure worth catching, and the format
 * was wrong in all three until a test looked.
 *
 * Rolled back, so three tracks can share one `grains-dev`.
 */
describe.skipIf(!hasDatabase)("listProfileUrls", () => {
  let db: TestDb;
  let end: () => Promise<void>;

  beforeAll(() => {
    ({ db, end } = testDb());
  });

  afterAll(async () => {
    if (end) await end();
  });

  /** A user, optionally without a claimed handle. */
  async function user(tx: LabTx, username: string | null): Promise<string> {
    const tag = randomUUID().replace(/-/g, "").slice(0, 12);
    const rows = await tx.execute<{ id: string }>(sql`
      insert into users (email, name, username)
      values (${`${tag}@grains.test`}, ${"Test"}, ${
        username === null ? null : `${username}_${tag}`
      })
      returning id
    `);
    return rows[0].id;
  }

  async function book(tx: LabTx, ownerId: string): Promise<void> {
    await tx.execute(sql`
      insert into photobooks (owner_id, title, slug)
      values (${ownerId}, ${"A book"}, ${randomUUID()})
    `);
  }

  /** Only the rows this test created — grains-dev holds other people's. */
  async function pathsFor(tx: LabTx, handle: string): Promise<string[]> {
    const entries = await listProfileUrls(tx);
    return entries
      .map((entry) => entry.path)
      .filter((path) => path.includes(handle));
  }

  it("lists a profile and each of its photobooks", async () => {
    await withRollback(db, async (tx) => {
      const id = await user(tx, "amp");
      await book(tx, id);
      await book(tx, id);

      const rows = await tx.execute<{ username: string }>(
        sql`select username from users where id = ${id}`,
      );
      const handle = rows[0].username;

      const paths = await pathsFor(tx, handle);
      // One profile plus two photobooks — the profile is not repeated per book.
      expect(paths).toHaveLength(3);
      expect(paths).toContain(`/u/${handle}`);
      expect(paths.filter((p) => p === `/u/${handle}`)).toHaveLength(1);
    });
  });

  it("writes the handle without an @", async () => {
    await withRollback(db, async (tx) => {
      const id = await user(tx, "amp");
      await book(tx, id);
      const rows = await tx.execute<{ username: string }>(
        sql`select username from users where id = ${id}`,
      );
      const handle = rows[0].username;

      // Both forms resolve, so this is a canonicalisation choice rather than a
      // correctness one — and it has to match what the app links to, or the
      // sitemap advertises URLs that no `revalidatePath` call ever refreshes.
      const paths = await pathsFor(tx, handle);
      expect(paths.every((path) => !path.includes("@"))).toBe(true);
    });
  });

  it("omits a user who has not claimed a username", async () => {
    await withRollback(db, async (tx) => {
      const id = await user(tx, null);
      await book(tx, id);

      const entries = await listProfileUrls(tx);
      // A half-registered account has no /u/ page at all, so a `/u/null` in the
      // sitemap would be a 404 we published ourselves.
      expect(entries.some((entry) => entry.path.includes("null"))).toBe(false);
    });
  });

  it("omits a profile with no photobooks", async () => {
    await withRollback(db, async (tx) => {
      const id = await user(tx, "empty");
      const rows = await tx.execute<{ username: string }>(
        sql`select username from users where id = ${id}`,
      );

      expect(await pathsFor(tx, rows[0].username)).toEqual([]);
    });
  });

  it("dates a profile from its most recently updated photobook", async () => {
    await withRollback(db, async (tx) => {
      const id = await user(tx, "amp");
      await book(tx, id);
      await book(tx, id);
      const rows = await tx.execute<{ username: string }>(
        sql`select username from users where id = ${id}`,
      );
      const handle = rows[0].username;

      await tx.execute(sql`
        update photobooks set updated_at = now() - interval '30 days'
        where owner_id = ${id}
      `);
      await tx.execute(sql`
        update photobooks set updated_at = now()
        where id = (select id from photobooks where owner_id = ${id} limit 1)
      `);

      const entries = await listProfileUrls(tx);
      const profile = entries.find((entry) => entry.path === `/u/${handle}`);
      const books = entries
        .filter((entry) => entry.path.startsWith(`/u/${handle}/`))
        .map((entry) => entry.lastModified);

      // The profile's date is the max of its books, not an arbitrary one —
      // otherwise a crawler is told the page is a month stale the day it
      // changed. ISO-8601 in a fixed zone sorts lexicographically, which is
      // half the reason for normalising it in the first place.
      expect(books).toHaveLength(2);
      expect(profile?.lastModified).toBe(books.slice().sort().at(-1));
    });
  });

  /**
   * The one that would have shipped broken.
   *
   * `execute<T>()` is an unchecked cast, so a `Date` annotation on a column that
   * arrives as text compiles and type-checks and is simply untrue. Postgres
   * renders `timestamptz` as `2026-09-10 07:17:41.55411+00` — a space rather
   * than `T`, an offset without minutes — and Next writes a string into
   * `<lastmod>` untouched. That is not a W3C Datetime, so the whole sitemap
   * would have been syntactically wrong while every check in the repo passed.
   */
  it("returns a W3C Datetime, not Postgres's own rendering", async () => {
    await withRollback(db, async (tx) => {
      const id = await user(tx, "amp");
      await book(tx, id);
      const rows = await tx.execute<{ username: string }>(
        sql`select username from users where id = ${id}`,
      );

      const entries = await listProfileUrls(tx);
      const mine = entries.filter((entry) =>
        entry.path.includes(rows[0].username),
      );

      expect(mine.length).toBeGreaterThan(0);
      for (const entry of mine) {
        expect(typeof entry.lastModified).toBe("string");
        expect(entry.lastModified).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
        );
        // Parseable everywhere, which the unconverted form is not.
        expect(Number.isNaN(Date.parse(entry.lastModified))).toBe(false);
      }
    });
  });
});

describe.skipIf(!hasDatabase)("the other sitemap queries", () => {
  let db: TestDb;
  let end: () => Promise<void>;

  beforeAll(() => {
    ({ db, end } = testDb());
  });

  afterAll(async () => {
    if (end) await end();
  });

  // These two are a select and a map, but they carry the same timestamp
  // conversion, and a conversion that is right in one of three places is the
  // failure worth catching. grains-dev already holds labs and film stocks.
  it("formats lab and film-stock dates the same way", async () => {
    await withRollback(db, async (tx) => {
      const entries = [
        ...(await listLabUrls(tx)),
        ...(await listFilmStockUrls(tx)),
      ];

      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.lastModified).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
        );
      }
    });
  });
});
