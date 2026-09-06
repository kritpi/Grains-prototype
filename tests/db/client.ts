import postgres from "postgres";

/**
 * A direct connection for tests, deliberately not the app's client.
 *
 * Tests use DIRECT_URL (the session pooler) rather than the transaction
 * pooler, because the behavioural tests below run inside a transaction they
 * then roll back, and that needs a session the whole test can hold.
 */
export const hasDatabase = Boolean(process.env.DIRECT_URL);

export function testClient(): postgres.Sql {
  if (!process.env.DIRECT_URL) {
    throw new Error("DIRECT_URL is not set");
  }
  return postgres(process.env.DIRECT_URL, {
    ssl: "require",
    prepare: false,
    max: 1,
  });
}

/** Postgres error codes the invariant tests assert on. */
export const FOREIGN_KEY_VIOLATION = "23503";
export const CHECK_VIOLATION = "23514";
export const UNIQUE_VIOLATION = "23505";
