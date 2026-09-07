import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CONSTRAINT_MESSAGES } from "@/lib/constraint-messages";
import { hasDatabase, testClient } from "../db/client";

/**
 * Every constraint we translate into a sentence must exist under that name.
 *
 * The map is keyed on the names the database actually uses, and three of them
 * were named by Postgres rather than by us: db/migrations/0000_init.sql declares
 * its CHECK constraints anonymously, so `lab_pricing`'s three became
 * `lab_pricing_check`, `_check1` and `_check2` — by declaration order. The
 * Drizzle mirror calls them `lab_pricing_not_empty`,
 * `lab_pricing_turnaround_min_present` and `lab_pricing_turnaround_order`, names
 * that exist in no database. The migration is what ran, so the migration wins.
 *
 * Positional names are exactly the kind that can be reordered without anybody
 * noticing, and the failure would be silent: the wrong sentence attached to the
 * wrong rule, which is worse than no sentence. This is the check that makes it
 * loud. It is also the parity review CLAUDE.md asks for, automated for the one
 * case that has a consumer.
 */
describe.skipIf(!hasDatabase)(
  "constraint messages name real constraints",
  () => {
    let sql: postgres.Sql;

    beforeAll(() => {
      sql = testClient();
    });

    afterAll(async () => {
      await sql?.end();
    });

    it("finds every mapped name in the live schema", async () => {
      const names = Object.keys(CONSTRAINT_MESSAGES);
      expect(names.length).toBeGreaterThan(0);

      // Unique *indexes* raise a violation naming the index, not a constraint, so
      // both catalogs count as somewhere a name can legitimately live.
      const rows = await sql<{ name: string }[]>`
      select conname as name from pg_constraint
       where conname in ${sql(names)}
      union
      select relname as name from pg_class
       where relkind = 'i' and relname in ${sql(names)}
    `;

      const found = new Set(rows.map((r) => r.name));
      expect([...names].filter((n) => !found.has(n))).toEqual([]);
    });
  },
);
