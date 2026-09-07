import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";
import type { LabTx } from "@/lib/queries/lab-edits";

/**
 * A drizzle transaction that is always rolled back.
 *
 * tests/db/client.ts hands out a raw postgres.js client, which suits the schema
 * invariants — they assert on error codes and never call our code. The write
 * layer is the other shape: every function in lib/queries/lab-edits.ts takes a
 * drizzle transaction precisely so a test can run the real function against a
 * real database and leave nothing behind.
 *
 * DIRECT_URL, not DATABASE_URL, for the same reason as client.ts: a transaction
 * held open across a whole test needs a session, and the transaction pooler
 * hands a different backend to each one.
 */
export function testDb() {
  if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL is not set");

  const client = postgres(process.env.DIRECT_URL, {
    ssl: "require",
    prepare: false,
    max: 1,
  });

  return {
    db: drizzle(client, { schema }),
    end: () => client.end(),
  };
}

export type TestDb = ReturnType<typeof testDb>["db"];

/** Thrown to roll back, and swallowed again — never a test failure. */
const ROLLBACK = Symbol("rollback");

/**
 * Run `fn` inside a transaction and roll it back, whatever it returns.
 *
 * Rolling back rather than cleaning up afterwards is what lets the three tracks
 * share one `grains-dev` without colliding, and it means a test that fails
 * half-way leaves no wreckage for the next one to trip over.
 */
export async function withRollback<T>(
  db: TestDb,
  fn: (tx: LabTx) => Promise<T>,
): Promise<T> {
  let result: T;
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
  return result!;
}
