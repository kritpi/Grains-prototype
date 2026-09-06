import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CHECK_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  hasDatabase,
  testClient,
} from "./client";

/**
 * The three product rules that 00_BACKLOG.md says the schema enforces
 * structurally, asserted against a real database rather than trusted.
 *
 * Two of them are checked twice on purpose: once by reading the catalog (the
 * column is absent, the constraint exists) and once by behaviour (the database
 * actually rejects the write). A catalog check alone would still pass if a
 * constraint were present but somehow not enforced, and a behavioural check
 * alone would not catch a rule quietly downgraded to something weaker.
 *
 * Skipped when there is no DIRECT_URL, which is how CI runs them without
 * holding credentials.
 */
describe.skipIf(!hasDatabase)("schema invariants", () => {
  let sql: postgres.Sql;

  beforeAll(() => {
    sql = testClient();
  });

  afterAll(async () => {
    await sql?.end();
  });

  describe("1. photos carries no lab attribution", () => {
    it("has no lab_id column, and no column referencing labs", async () => {
      const columns = await sql<{ column_name: string }[]>`
        select column_name
        from information_schema.columns
        where table_schema = 'public' and table_name = 'photos'
      `;
      const names = columns.map((c) => c.column_name);

      expect(names).not.toContain("lab_id");
      // A rename would defeat a check that only looks for "lab_id".
      expect(names.filter((n) => n.includes("lab"))).toEqual([]);
    });

    it("has no foreign key from photos to labs", async () => {
      const fks = await sql<{ constraint_name: string }[]>`
        select con.conname as constraint_name
        from pg_constraint con
        where con.conrelid = 'photos'::regclass
          and con.contype = 'f'
          and con.confrelid = 'labs'::regclass
      `;
      expect(fks).toEqual([]);
    });
  });

  describe("2. a lab cannot be priced for a process it does not offer", () => {
    it("declares the composite foreign key to lab_processes", async () => {
      const [fk] = await sql<{ definition: string }[]>`
        select pg_get_constraintdef(con.oid) as definition
        from pg_constraint con
        where con.conrelid = 'lab_pricing'::regclass
          and con.contype = 'f'
          and con.confrelid = 'lab_processes'::regclass
      `;
      expect(fk?.definition).toMatch(/FOREIGN KEY \(lab_id, process\)/);
      expect(fk?.definition).toMatch(
        /REFERENCES lab_processes\(lab_id, process\)/,
      );
    });

    it("rejects pricing for an unoffered process", async () => {
      await expect(
        sql.begin(async (tx) => {
          const [user] = await tx<{ id: string }[]>`
            insert into users (email) values ('invariant-test@example.com')
            returning id
          `;
          const [lab] = await tx<{ id: string }[]>`
            insert into labs (name_en, location, created_by)
            values (
              'Invariant Test Lab',
              ST_SetSRID(ST_MakePoint(100.5018, 13.7563), 4326)::geography,
              ${user.id}
            )
            returning id
          `;
          await tx`insert into lab_processes (lab_id, process) values (${lab.id}, 'c41')`;

          // The lab offers C-41 only. Pricing E-6 must not be storable.
          await tx`
            insert into lab_pricing (lab_id, process, format, price_thb)
            values (${lab.id}, 'e6', '135', 250)
          `;
        }),
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it("accepts pricing for a process the lab does offer", async () => {
      let stored: string | null = null;

      // Everything here is rolled back; the assertion is that the write
      // succeeded inside the transaction.
      await sql
        .begin(async (tx) => {
          const [user] = await tx<{ id: string }[]>`
            insert into users (email) values ('invariant-test2@example.com')
            returning id
          `;
          const [lab] = await tx<{ id: string }[]>`
            insert into labs (name_en, location, created_by)
            values (
              'Invariant Test Lab 2',
              ST_SetSRID(ST_MakePoint(100.5018, 13.7563), 4326)::geography,
              ${user.id}
            )
            returning id
          `;
          await tx`insert into lab_processes (lab_id, process) values (${lab.id}, 'c41')`;
          const [row] = await tx<{ price_thb: string }[]>`
            insert into lab_pricing (lab_id, process, format, price_thb)
            values (${lab.id}, 'c41', '135', 250)
            returning price_thb
          `;
          stored = row.price_thb;
          throw new Rollback();
        })
        .catch((error) => {
          if (!(error instanceof Rollback)) throw error;
        });

      expect(stored).toBe("250.00");
    });
  });

  describe("3. only curated services and supplies are indexed", () => {
    it("indexes curated keys only, never contributor freeform labels", async () => {
      const indexes = await sql<{ indexname: string; indexdef: string }[]>`
        select indexname, indexdef
        from pg_indexes
        where schemaname = 'public'
          and tablename in ('lab_services', 'lab_supplies')
      `;

      const partial = (name: string) =>
        indexes.find((i) => i.indexname === name)?.indexdef ?? "";

      expect(partial("lab_services_filter_idx")).toMatch(
        /WHERE \(service_key IS NOT NULL\)/,
      );
      expect(partial("lab_services_curated_idx")).toMatch(
        /WHERE \(service_key IS NOT NULL\)/,
      );
      expect(partial("lab_supplies_curated_idx")).toMatch(
        /WHERE \(supply_key IS NOT NULL\)/,
      );

      // A freeform entry can be displayed but must never back a filter.
      const overCustom = indexes.filter((i) =>
        i.indexdef.includes("custom_label"),
      );
      expect(overCustom).toEqual([]);
    });
  });

  describe("supporting structure", () => {
    it("stores lab location as geography(Point,4326) with a GIST index", async () => {
      const [column] = await sql<{ type: string }[]>`
        select format_type(a.atttypid, a.atttypmod) as type
        from pg_attribute a
        where a.attrelid = 'labs'::regclass and a.attname = 'location'
      `;
      expect(column.type).toBe("geography(Point,4326)");

      const [index] = await sql<{ indexdef: string }[]>`
        select indexdef from pg_indexes
        where schemaname = 'public' and indexname = 'labs_location_idx'
      `;
      expect(index.indexdef).toContain("USING gist");
    });

    it("starts optimistic-concurrency versions at 1", async () => {
      const rows = await sql<{ table_name: string; column_default: string }[]>`
        select table_name, column_default
        from information_schema.columns
        where table_schema = 'public'
          and column_name = 'version'
          and table_name in ('labs', 'film_stocks')
        order by table_name
      `;
      expect(rows.map((r) => r.table_name)).toEqual(["film_stocks", "labs"]);
      for (const row of rows) expect(row.column_default).toBe("1");
    });

    it("refuses an edit_history row that records no change", async () => {
      await expect(
        sql.begin(async (tx) => {
          const [user] = await tx<{ id: string }[]>`
            insert into users (email) values ('invariant-test3@example.com')
            returning id
          `;
          await tx`
            insert into edit_history (entity, entity_id, editor_id, changes)
            values ('lab', gen_random_uuid(), ${user.id}, '[]'::jsonb)
          `;
        }),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });

    it("seeds the curated catalogs", async () => {
      const counts = await sql<
        {
          scanners: number;
          services: number;
          supplies: number;
          badges: number;
        }[]
      >`
        select
          (select count(*)::int from scanner_models)  as scanners,
          (select count(*)::int from service_catalog) as services,
          (select count(*)::int from supply_catalog)  as supplies,
          (select count(*)::int from badge_catalog)   as badges
      `;
      expect(counts[0]).toEqual({
        scanners: 4,
        services: 6,
        supplies: 4,
        badges: 4,
      });
    });
  });
});

/** Sentinel used to roll back a transaction whose writes should not persist. */
class Rollback extends Error {}
