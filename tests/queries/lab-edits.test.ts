import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { labChangesSchema, labPath } from "@/lib/labs/paths";
import {
  applyLabChanges,
  insertLab,
  recomputeCompleteness,
  type LabTx,
  type NewLabInput,
} from "@/lib/queries/lab-edits";
import { hasDatabase } from "../db/client";
import { testDb, withRollback, type TestDb } from "../db/tx";

/**
 * The write layer, against a real grains-dev, inside a transaction that is
 * always rolled back.
 *
 * Every significant bug in Track A passed typecheck, lint and format before it
 * was found, and the write path has more places to hide one: the version check
 * is a race, the pricing cascade is a foreign key nobody sees, and the hours
 * column has a check constraint that rejects the obvious implementation.
 */
describe.skipIf(!hasDatabase)("lab-edits", () => {
  let handle: ReturnType<typeof testDb>;
  let db: TestDb;

  beforeAll(() => {
    handle = testDb();
    db = handle.db;
  });

  afterAll(async () => {
    await handle?.end();
  });

  /** A user to own the fixtures. Rolled back with everything else. */
  async function seedUser(tx: LabTx): Promise<string> {
    const rows = await tx.execute<{ id: string }>(sql`
      insert into users (email, name, username)
      values (${`tx-${crypto.randomUUID()}@grains.invalid`}, 'Test', ${`t${Date.now()}${Math.floor(Math.random() * 1000)}`})
      returning id
    `);
    return rows[0].id;
  }

  /** A lab with a pin in Bangkok and one process, which is the create gate. */
  async function seedLab(
    tx: LabTx,
    overrides: Partial<NewLabInput> = {},
  ): Promise<string> {
    const createdBy = await seedUser(tx);
    return insertLab(tx, {
      createdBy,
      nameEn: "Fixture Lab",
      location: { lat: 13.7451, lng: 100.5324 },
      processes: ["c41"],
      ...overrides,
    });
  }

  function parse(...changes: { path: string; from: unknown; to: unknown }[]) {
    return labChangesSchema.parse(changes);
  }

  async function versionOf(tx: LabTx, labId: string): Promise<number> {
    const rows = await tx.execute<{ version: number }>(
      sql`select version from labs where id = ${labId}`,
    );
    return rows[0].version;
  }

  async function scalar<T>(
    tx: LabTx,
    query: ReturnType<typeof sql>,
  ): Promise<T> {
    const rows = await tx.execute<Record<string, T>>(query);
    return Object.values(rows[0] ?? {})[0];
  }

  // -------------------------------------------------------------------------

  describe("optimistic concurrency", () => {
    it("applies a diff and bumps the version", async () => {
      await withRollback(db, async (tx) => {
        const labId = await seedLab(tx);

        const result = await applyLabChanges(
          tx,
          labId,
          1,
          parse({ path: "name_th", from: null, to: "แลปทดสอบ" }),
        );

        expect(result).toEqual({ ok: true });
        expect(await versionOf(tx, labId)).toBe(2);
      });
    });

    it("refuses a stale version and writes nothing at all", async () => {
      await withRollback(db, async (tx) => {
        const labId = await seedLab(tx);
        await applyLabChanges(
          tx,
          labId,
          1,
          parse({ path: "name_th", from: null, to: "first" }),
        );

        // A second editor still holding version 1.
        const result = await applyLabChanges(
          tx,
          labId,
          1,
          parse({
            path: "landmark_note",
            from: null,
            to: "above the 7-Eleven",
          }),
        );

        expect(result).toEqual({ ok: false, reason: "conflict" });
        expect(await versionOf(tx, labId)).toBe(2);
        expect(
          await scalar(
            tx,
            sql`select landmark_note from labs where id = ${labId}`,
          ),
        ).toBeNull();
      });
    });

    /**
     * The reason leaf paths exist at all. Both editors opened the same lab; the
     * second reloads after the conflict and saves only what they changed, and
     * the first editor's field is still there afterwards. A whole-form write
     * would pass the version check and silently revert it.
     */
    it("keeps a field the second editor never touched", async () => {
      await withRollback(db, async (tx) => {
        const labId = await seedLab(tx);

        await applyLabChanges(
          tx,
          labId,
          1,
          parse({ path: "name_th", from: null, to: "แลปแรก" }),
        );
        await applyLabChanges(
          tx,
          labId,
          2,
          parse({ path: "street", from: null, to: "Rama I Rd" }),
        );

        const row = await tx.execute<{ name_th: string; street: string }>(
          sql`select name_th, street from labs where id = ${labId}`,
        );
        expect(row[0]).toEqual({ name_th: "แลปแรก", street: "Rama I Rd" });
      });
    });
  });

  describe("hours", () => {
    it("materialises the week before setting a day", async () => {
      await withRollback(db, async (tx) => {
        // The create gate does not ask for hours, so this lab has `[]` — which
        // labs_hours_shape allows and jsonb_set cannot write into.
        const labId = await seedLab(tx);

        const result = await applyLabChanges(
          tx,
          labId,
          1,
          parse(
            { path: labPath.hours(1, "closed"), from: null, to: false },
            { path: labPath.hours(1, "open"), from: null, to: "09:00" },
            { path: labPath.hours(1, "close"), from: null, to: "19:00" },
          ),
        );
        expect(result).toEqual({ ok: true });

        const hours = await scalar<unknown[]>(
          tx,
          sql`select hours from labs where id = ${labId}`,
        );
        expect(hours).toHaveLength(7);
        expect(hours[1]).toEqual({
          closed: false,
          open: "09:00",
          close: "19:00",
        });
        expect(hours[0]).toEqual({ closed: true });
      });
    });

    it("removes a cleared time rather than storing a null beside it", async () => {
      await withRollback(db, async (tx) => {
        const labId = await seedLab(tx);
        await applyLabChanges(
          tx,
          labId,
          1,
          parse(
            { path: labPath.hours(2, "closed"), from: null, to: false },
            { path: labPath.hours(2, "open"), from: null, to: "10:00" },
            { path: labPath.hours(2, "close"), from: null, to: "18:00" },
          ),
        );

        await applyLabChanges(
          tx,
          labId,
          2,
          parse(
            { path: labPath.hours(2, "closed"), from: false, to: true },
            { path: labPath.hours(2, "open"), from: "10:00", to: null },
            { path: labPath.hours(2, "close"), from: "18:00", to: null },
          ),
        );

        const hours = await scalar<unknown[]>(
          tx,
          sql`select hours from labs where id = ${labId}`,
        );
        expect(hours[2]).toEqual({ closed: true });
      });
    });
  });

  describe("pricing", () => {
    it("writes a cell, then deletes it when its last value is cleared", async () => {
      await withRollback(db, async (tx) => {
        const labId = await seedLab(tx);

        await applyLabChanges(
          tx,
          labId,
          1,
          parse({
            path: labPath.pricing("c41", "135", "price_thb"),
            from: null,
            to: 180,
          }),
        );
        expect(
          await scalar<string>(
            tx,
            sql`select count(*) from lab_pricing where lab_id = ${labId}`,
          ),
        ).toBe("1");

        // lab_pricing_not_empty forbids an all-null row, so clearing the only
        // value has to be a delete rather than an update.
        await applyLabChanges(
          tx,
          labId,
          2,
          parse({
            path: labPath.pricing("c41", "135", "price_thb"),
            from: 180,
            to: null,
          }),
        );
        expect(
          await scalar<string>(
            tx,
            sql`select count(*) from lab_pricing where lab_id = ${labId}`,
          ),
        ).toBe("0");
      });
    });

    it("keeps the fields of a cell the diff does not name", async () => {
      await withRollback(db, async (tx) => {
        const labId = await seedLab(tx);
        await applyLabChanges(
          tx,
          labId,
          1,
          parse(
            {
              path: labPath.pricing("c41", "135", "price_thb"),
              from: null,
              to: 180,
            },
            {
              path: labPath.pricing("c41", "135", "turnaround_min_d"),
              from: null,
              to: 2,
            },
          ),
        );

        await applyLabChanges(
          tx,
          labId,
          2,
          parse({
            path: labPath.pricing("c41", "135", "price_thb"),
            from: 180,
            to: 200,
          }),
        );

        const row = await tx.execute<{
          price_thb: string;
          turnaround_min_d: number;
        }>(sql`
          select price_thb, turnaround_min_d from lab_pricing
           where lab_id = ${labId} and process = 'c41' and format = '135'
        `);
        expect(Number(row[0].price_thb)).toBe(200);
        expect(row[0].turnaround_min_d).toBe(2);
      });
    });

    it("is refused by the database for a process the lab does not offer", async () => {
      await withRollback(db, async (tx) => {
        const labId = await seedLab(tx);

        // The composite foreign key, not a code path anyone can forget.
        await expect(
          applyLabChanges(
            tx,
            labId,
            1,
            parse({
              path: labPath.pricing("e6", "135", "price_thb"),
              from: null,
              to: 340,
            }),
          ),
        ).rejects.toThrow();
      });
    });
  });

  describe("the process cascade", () => {
    it("refuses to drop a process whose prices the diff does not account for", async () => {
      await withRollback(db, async (tx) => {
        const labId = await seedLab(tx, { processes: ["c41", "e6"] });
        await applyLabChanges(
          tx,
          labId,
          1,
          parse(
            {
              path: labPath.pricing("e6", "135", "price_thb"),
              from: null,
              to: 340,
            },
            {
              path: labPath.pricing("e6", "120", "price_thb"),
              from: null,
              to: 400,
            },
          ),
        );

        const result = await applyLabChanges(
          tx,
          labId,
          2,
          parse({ path: labPath.process("e6"), from: true, to: false }),
        );

        expect(result).toMatchObject({ ok: false, reason: "cascade" });
        expect((result as { missing: string[] }).missing).toEqual(
          expect.arrayContaining([
            "pricing.e6.135.price_thb",
            "pricing.e6.120.price_thb",
          ]),
        );
        // Refused before the version bump, so the editor can resubmit as-is.
        expect(await versionOf(tx, labId)).toBe(2);
      });
    });

    it("accepts the drop when the diff carries the prices it takes with it", async () => {
      await withRollback(db, async (tx) => {
        const labId = await seedLab(tx, { processes: ["c41", "e6"] });
        await applyLabChanges(
          tx,
          labId,
          1,
          parse({
            path: labPath.pricing("e6", "135", "price_thb"),
            from: null,
            to: 340,
          }),
        );

        const result = await applyLabChanges(
          tx,
          labId,
          2,
          parse(
            { path: labPath.process("e6"), from: true, to: false },
            {
              path: labPath.pricing("e6", "135", "price_thb"),
              from: 340,
              to: null,
            },
          ),
        );

        expect(result).toEqual({ ok: true });
        expect(
          await scalar<string>(
            tx,
            sql`select count(*) from lab_processes where lab_id = ${labId}`,
          ),
        ).toBe("1");
      });
    });
  });

  describe("children", () => {
    it("adds, edits and removes a contact addressed by the form's own id", async () => {
      await withRollback(db, async (tx) => {
        const labId = await seedLab(tx);
        const id = crypto.randomUUID();

        await applyLabChanges(
          tx,
          labId,
          1,
          parse(
            { path: labPath.contact(id, "channel"), from: null, to: "phone" },
            {
              path: labPath.contact(id, "value"),
              from: null,
              to: "02 214 5500",
            },
          ),
        );
        expect(
          await scalar<string>(
            tx,
            sql`select value from lab_contacts where id = ${id}`,
          ),
        ).toBe("02 214 5500");

        await applyLabChanges(
          tx,
          labId,
          2,
          parse({
            path: labPath.contact(id, "value"),
            from: "02 214 5500",
            to: "02 214 5580",
          }),
        );
        expect(
          await scalar<string>(
            tx,
            sql`select value from lab_contacts where id = ${id}`,
          ),
        ).toBe("02 214 5580");

        await applyLabChanges(
          tx,
          labId,
          3,
          parse({
            path: labPath.contact(id, "value"),
            from: "02 214 5580",
            to: null,
          }),
        );
        expect(
          await scalar<string>(
            tx,
            sql`select count(*) from lab_contacts where id = ${id}`,
          ),
        ).toBe("0");
      });
    });

    it("ticks a curated service and adds a freeform one", async () => {
      await withRollback(db, async (tx) => {
        const labId = await seedLab(tx);
        const customId = crypto.randomUUID();

        await applyLabChanges(
          tx,
          labId,
          1,
          parse(
            {
              path: labPath.curatedService("dropbox", "offered"),
              from: null,
              to: true,
            },
            {
              path: labPath.customService(customId, "custom_label"),
              from: null,
              to: "Frame return",
            },
          ),
        );

        const rows = await tx.execute<{
          service_key: string | null;
          custom_label: string | null;
        }>(sql`
          select service_key, custom_label from lab_services
           where lab_id = ${labId} order by service_key nulls last
        `);
        expect(rows).toEqual([
          { service_key: "dropbox", custom_label: null },
          { service_key: null, custom_label: "Frame return" },
        ]);
      });
    });

    it("tells an emptied inventory row from a removed one", async () => {
      await withRollback(db, async (tx) => {
        const labId = await seedLab(tx);
        const stockRows = await tx.execute<{ id: string }>(sql`
          insert into film_stocks (name, iso, formats, created_by)
          values (${`tx-${crypto.randomUUID()}`}, 400, '{135}'::film_format[],
                  (select created_by from labs where id = ${labId}))
          returning id
        `);
        const filmStockId = stockRows[0].id;

        await applyLabChanges(
          tx,
          labId,
          1,
          parse({ path: labPath.stock(filmStockId), from: null, to: ["135"] }),
        );

        await applyLabChanges(
          tx,
          labId,
          2,
          parse({ path: labPath.stock(filmStockId), from: ["135"], to: [] }),
        );
        expect(
          await scalar<string>(
            tx,
            sql`select count(*) from lab_stock where lab_id = ${labId}`,
          ),
        ).toBe("1");

        await applyLabChanges(
          tx,
          labId,
          3,
          parse({ path: labPath.stock(filmStockId), from: [], to: null }),
        );
        expect(
          await scalar<string>(
            tx,
            sql`select count(*) from lab_stock where lab_id = ${labId}`,
          ),
        ).toBe("0");
      });
    });
  });

  describe("completeness", () => {
    it("scores the create gate at zero, because every lab clears it", async () => {
      await withRollback(db, async (tx) => {
        const labId = await seedLab(tx);
        expect(
          await scalar<number>(
            tx,
            sql`select completeness from labs where id = ${labId}`,
          ),
        ).toBe(0);
      });
    });

    it("is recomputed by a write, without the caller asking", async () => {
      await withRollback(db, async (tx) => {
        const labId = await seedLab(tx);
        await applyLabChanges(
          tx,
          labId,
          1,
          parse({ path: "name_th", from: null, to: "แลปทดสอบ" }),
        );
        expect(
          await scalar<number>(
            tx,
            sql`select completeness from labs where id = ${labId}`,
          ),
        ).toBe(5);
      });
    });

    /**
     * The rule the whole formula is shaped around: recording that the lab also
     * runs E-6 must not lower its score, which any filled-over-possible ratio
     * would.
     */
    it("never falls when a contributor adds a fact", async () => {
      await withRollback(db, async (tx) => {
        const labId = await seedLab(tx);
        await applyLabChanges(
          tx,
          labId,
          1,
          parse({
            path: labPath.pricing("c41", "135", "price_thb"),
            from: null,
            to: 180,
          }),
        );
        const before = await recomputeCompleteness(tx, labId);

        await applyLabChanges(
          tx,
          labId,
          2,
          parse({ path: labPath.process("e6"), from: null, to: true }),
        );
        const after = await recomputeCompleteness(tx, labId);

        expect(after).toBeGreaterThanOrEqual(before);
      });
    });

    it("caps a facet rather than letting one field carry the score", async () => {
      await withRollback(db, async (tx) => {
        const labId = await seedLab(tx);
        const ids = [
          crypto.randomUUID(),
          crypto.randomUUID(),
          crypto.randomUUID(),
        ];

        await applyLabChanges(
          tx,
          labId,
          1,
          parse(
            ...ids.flatMap((id, i) => [
              { path: labPath.contact(id, "channel"), from: null, to: "phone" },
              { path: labPath.contact(id, "value"), from: null, to: `0${i}` },
            ]),
          ),
        );

        // Two contacts is the cap; the third adds nothing.
        expect(await recomputeCompleteness(tx, labId)).toBe(10);
      });
    });

    it("reaches 100 for a lab with everything a searcher can act on", async () => {
      await withRollback(db, async (tx) => {
        const createdBy = await seedUser(tx);
        // Two, because the inventory cap is two — one stock scores half the
        // facet, which is what a lab that carries one stock deserves.
        const stockRows = await tx.execute<{ id: string }>(sql`
          insert into film_stocks (name, iso, formats, created_by)
          values (${`tx-${crypto.randomUUID()}`}, 400, '{135}'::film_format[],
                  ${createdBy}),
                 (${`tx-${crypto.randomUUID()}`}, 100, '{120}'::film_format[],
                  ${createdBy})
          returning id
        `);

        const labId = await insertLab(tx, {
          createdBy,
          nameEn: "Complete Lab",
          nameTh: "แลปครบ",
          location: { lat: 13.7451, lng: 100.5324 },
          areaEn: "Pathum Wan",
          street: "Rama I Rd",
          hours: Array.from({ length: 7 }, () => ({
            closed: false,
            open: "10:00",
            close: "19:00",
          })),
          processes: ["c41", "e6"],
          scanners: ["Noritsu", "Flatbed"],
          pricing: [
            { process: "c41", format: "135", priceThb: 180, turnaroundMinD: 2 },
            { process: "c41", format: "120", priceThb: 220, turnaroundMinD: 3 },
            { process: "e6", format: "135", priceThb: 340 },
            { process: "e6", format: "120", priceThb: 400 },
          ],
          services: [{ key: "dropbox" }, { key: "mail_in" }],
          contacts: [
            { channel: "phone", value: "02 214 5500" },
            { channel: "line", value: "@fixture" },
          ],
          stock: [
            { filmStockId: stockRows[0].id, formats: ["135"] },
            { filmStockId: stockRows[1].id, formats: ["120"] },
          ],
        });

        expect(await recomputeCompleteness(tx, labId)).toBe(100);
      });
    });
  });
});
