import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { LabTx } from "@/lib/queries/lab-edits";
import { listProfileUrls } from "@/lib/queries/sitemap";
import { hasDatabase } from "../db/client";
import { testDb, withRollback, type TestDb } from "../db/tx";

/**
 * What the sitemap says about people.
 *
 * `listLabUrls` and `listFilmStockUrls` are a select and a map with no
 * branching, and `grains-dev` already holds rows for both — there is nothing a
 * test could assert that reading the query does not already tell you.
 * `listProfileUrls` is the opposite: a union with two gates and a path that
 * changes shape depending on whether `slug` came back null. Every case below is
 * one that would ship broken and look fine.
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
      const newest = entries
        .filter((entry) => entry.path.startsWith(`/u/${handle}/`))
        .map((entry) => entry.lastModified.getTime());

      // The profile's date is the max of its books, not an arbitrary one —
      // otherwise a crawler is told the page is a month stale the day it
      // changed.
      expect(profile?.lastModified.getTime()).toBe(Math.max(...newest));
    });
  });
});
