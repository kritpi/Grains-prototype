import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  insertFilmStock,
  applyFilmChanges,
  readFilmStock,
} from "@/lib/queries/film-edits";
import type { LabTx } from "@/lib/queries/lab-edits";
import {
  getFilmStock,
  listFilmStocks,
  searchFilmStocks,
} from "@/lib/queries/films";
import { hasDatabase, testClient } from "../db/client";
import { testDb, withRollback, type TestDb } from "../db/tx";

/**
 * The catalog's writes and its one structural rule, against a real grains-dev.
 *
 * The reads (`listFilmStocks`, `searchFilmStocks`) go through `getDb()` and
 * cannot be rolled back, so they are exercised over HTTP in
 * tests/api/film-stocks.test.ts instead. What is here is everything that takes
 * a transaction.
 */
describe.skipIf(!hasDatabase)("film stocks", () => {
  let handle: ReturnType<typeof testDb>;
  let db: TestDb;

  beforeAll(() => {
    handle = testDb();
    db = handle.db;
  });

  afterAll(async () => {
    await handle?.end();
  });

  async function seedUser(tx: LabTx): Promise<string> {
    const rows = await tx.execute<{ id: string }>(sql`
      insert into users (email, name, username)
      values (${`film-${crypto.randomUUID()}@grains.invalid`}, 'Test',
              ${`f${Date.now()}${Math.floor(Math.random() * 1000)}`})
      returning id
    `);
    return rows[0].id;
  }

  const unique = () => `Test Stock ${crypto.randomUUID().slice(0, 8)}`;

  it("inserts a stock and reads it back whole", async () => {
    await withRollback(db, async (tx) => {
      const createdBy = await seedUser(tx);
      const name = unique();
      const id = await insertFilmStock(tx, {
        name,
        iso: 400,
        formats: ["135", "120"],
        createdBy,
      });

      expect(await readFilmStock(tx, id)).toEqual({
        name,
        iso: 400,
        formats: ["135", "120"],
        version: 1,
      });
    });
  });

  /**
   * Identity is name + ISO (PRD B #2), enforced on `lower(name)` so that
   * "portra 400" and "Portra 400" are the same entry. This is the rule the
   * whole catalog rests on: a lab's inventory points at an id, so two entries
   * for one film split its reverse search in half.
   */
  it("refuses a second entry with the same name and ISO", async () => {
    await withRollback(db, async (tx) => {
      const createdBy = await seedUser(tx);
      const name = unique();
      await insertFilmStock(tx, {
        name,
        iso: 400,
        formats: ["135"],
        createdBy,
      });

      await expect(
        insertFilmStock(tx, {
          name: name.toLowerCase(),
          iso: 400,
          formats: ["120"],
          createdBy,
        }),
      ).rejects.toThrow();
    });
  });

  it("allows the same name at a different ISO", async () => {
    await withRollback(db, async (tx) => {
      const createdBy = await seedUser(tx);
      const name = unique();
      await insertFilmStock(tx, {
        name,
        iso: 400,
        formats: ["135"],
        createdBy,
      });
      await expect(
        insertFilmStock(tx, { name, iso: 800, formats: ["135"], createdBy }),
      ).resolves.toBeTruthy();
    });
  });

  describe("applyFilmChanges", () => {
    it("applies a diff and bumps the version", async () => {
      await withRollback(db, async (tx) => {
        const createdBy = await seedUser(tx);
        const id = await insertFilmStock(tx, {
          name: unique(),
          iso: 400,
          formats: ["135"],
          createdBy,
        });

        const result = await applyFilmChanges(tx, id, 1, [
          { path: "iso", from: 400, to: 800 },
          { path: "formats", from: ["135"], to: ["135", "120"] },
        ]);

        expect(result).toEqual({ ok: true });
        expect(await readFilmStock(tx, id)).toMatchObject({
          iso: 800,
          formats: ["135", "120"],
          version: 2,
        });
      });
    });

    it("refuses a stale version and writes nothing", async () => {
      await withRollback(db, async (tx) => {
        const createdBy = await seedUser(tx);
        const id = await insertFilmStock(tx, {
          name: unique(),
          iso: 400,
          formats: ["135"],
          createdBy,
        });
        await applyFilmChanges(tx, id, 1, [
          { path: "iso", from: 400, to: 800 },
        ]);

        const result = await applyFilmChanges(tx, id, 1, [
          { path: "formats", from: ["135"], to: ["120"] },
        ]);

        expect(result).toEqual({ ok: false, reason: "conflict" });
        expect(await readFilmStock(tx, id)).toMatchObject({
          iso: 800,
          formats: ["135"],
          version: 2,
        });
      });
    });
  });
});

/**
 * The reads, which go through `getDb()` and so cannot be rolled back.
 *
 * They get their own fixtures with unmistakable names and delete them
 * afterwards, rather than asserting against the seeded catalog: a test that
 * depends on db/seed/film-stocks.sql fails the day somebody corrects a name in
 * it, which is a change the seed is explicitly meant to allow.
 */
describe.skipIf(!hasDatabase)("film stock reads", () => {
  const marker = `zz-test-${crypto.randomUUID().slice(0, 8)}`;
  let sql: ReturnType<typeof testClient>;
  let ids: string[] = [];

  beforeAll(async () => {
    sql = testClient();
    const users = await sql<{ id: string }[]>`
      insert into users (email, name, username)
      values (${`read-${crypto.randomUUID()}@grains.invalid`}, 'Test',
              ${`r${Date.now()}${Math.floor(Math.random() * 1000)}`})
      returning id`;

    const rows = await sql<{ id: string }[]>`
      insert into film_stocks (name, iso, formats, created_by) values
        (${`${marker} Alpha`}, 100, '{135}'::film_format[], ${users[0].id}),
        (${`${marker} Alpha Plus`}, 400, '{120}'::film_format[], ${users[0].id}),
        (${`${marker} Beta`}, 400, '{135,120}'::film_format[], ${users[0].id})
      returning id`;
    ids = rows.map((r) => r.id);
  });

  afterAll(async () => {
    if (ids.length > 0)
      await sql`delete from film_stocks where id in ${sql(ids)}`;
    await sql`delete from users where email like 'read-%@grains.invalid'`;
    await sql?.end();
  });

  it("filters by ISO and by format, each OR within itself", async () => {
    const byIso = await listFilmStocks({ q: marker, iso: [400] });
    expect(byIso.map((s) => s.name).sort()).toEqual([
      `${marker} Alpha Plus`,
      `${marker} Beta`,
    ]);

    // Overlap, not containment: a 135-and-120 stock matches a 120 filter.
    const byFormat = await listFilmStocks({ q: marker, format: ["120"] });
    expect(byFormat.map((s) => s.name).sort()).toEqual([
      `${marker} Alpha Plus`,
      `${marker} Beta`,
    ]);
  });

  it("counts samples, which is zero until photos exist", async () => {
    const [stock] = await listFilmStocks({ q: `${marker} Beta` });
    expect(stock.sampleCount).toBe(0);
  });

  /**
   * The flag the inline "add it" depends on. Offering to add a stock somebody
   * has just named exactly is how the catalog grows a duplicate the identity
   * index then refuses.
   */
  it("says whether the query is a stock rather than merely resembling one", async () => {
    const partial = await searchFilmStocks(`${marker} Alpha`);
    expect(partial.matches.map((m) => m.name)).toContain(
      `${marker} Alpha Plus`,
    );
    expect(partial.exactMatch).toBe(true);

    const resembling = await searchFilmStocks(`${marker} Alp`);
    expect(resembling.matches.length).toBeGreaterThan(0);
    expect(resembling.exactMatch).toBe(false);

    // Case and surrounding space are not a different stock.
    const loose = await searchFilmStocks(`  ${marker.toUpperCase()} BETA  `);
    expect(loose.exactMatch).toBe(true);
  });

  it("returns nothing for an empty query rather than the whole catalog", async () => {
    expect(await searchFilmStocks("   ")).toEqual({
      matches: [],
      exactMatch: false,
    });
  });

  it("reads one stock with its edit line", async () => {
    const stock = await getFilmStock(ids[2]);
    expect(stock).toMatchObject({
      name: `${marker} Beta`,
      iso: 400,
      formats: ["135", "120"],
      version: 1,
      editCount: 0,
    });
  });
});
