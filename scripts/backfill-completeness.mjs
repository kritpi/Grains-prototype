/**
 * Recompute `labs.completeness` for every lab.
 *
 *   pnpm db:backfill:completeness
 *
 * Completeness is only recomputed inside a write transaction, so a lab that has
 * never been edited keeps the column default. The seven seeded Bangkok labs are
 * exactly that: db/seed/bangkok-labs.sql inserts them without a score and says
 * it leaves the number to Track B. Until this has run, `order by distance_m,
 * completeness desc` has an inert tiebreaker and the search page's "nearest +
 * most complete first" is a claim the product does not keep.
 *
 * It imports the real function rather than carrying a copy of the formula. SQL
 * lives in lib/queries/ and nowhere else, and a second copy here would be the
 * one that goes stale. Node runs the TypeScript directly: lib/queries/lab-edits.ts
 * value-imports only drizzle-orm, and its two project imports are `import type`,
 * which type stripping erases.
 *
 * DIRECT_URL, like every other script here: this is a laptop talking to the
 * database, not the app, and has no reason to go through the transaction pooler.
 * Production is not reachable from here at all.
 */
import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { recomputeAllCompleteness } from "../lib/queries/lab-edits.ts";

const ENV_FILE = ".env.local";
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

if (!process.env.DIRECT_URL) {
  console.error("DIRECT_URL is not set.");
  process.exit(1);
}

const client = postgres(process.env.DIRECT_URL, {
  ssl: "require",
  prepare: false,
  max: 1,
});

try {
  const db = drizzle(client);
  // One transaction: a half-scored table would rank labs against each other
  // using two different formulas.
  const changed = await db.transaction((tx) => recomputeAllCompleteness(tx));
  console.log(
    changed === 0
      ? "Every lab's completeness was already correct."
      : `Recomputed completeness for ${changed} lab${changed === 1 ? "" : "s"}.`,
  );
} finally {
  await client.end();
}
