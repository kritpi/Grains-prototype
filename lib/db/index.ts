import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * The database client.
 *
 * `prepare: false` is required, not optional: the app connects through
 * Supabase's transaction pooler on port 6543, which hands a different backend
 * to each transaction and so cannot honour named prepared statements.
 *
 * Both the connection and the Drizzle instance are cached on globalThis in
 * development, because Next's dev server re-evaluates modules on every edit
 * and a fresh pool per edit exhausts the connection limit within minutes.
 */
type Database = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  grainsDb?: Database;
};

/**
 * Connecting is deferred to the first call rather than done at import.
 *
 * Reading the environment during import would fail any module that merely
 * imports a query — `next build` runs without a database — and would surface
 * a missing DATABASE_URL as an opaque 500 instead of an error the caller can
 * report.
 *
 * This is a function rather than a lazily-proxied object on purpose. A proxy
 * reads more nicely at the call site, but it does not survive the identity
 * checks libraries make: the Auth.js Drizzle adapter detects the dialect from
 * the client's class, and a proxy that binds methods hides it, failing with
 * "Unsupported database type (object)". Explicit is cheaper than clever here.
 */
export function getDb(): Database {
  if (globalForDb.grainsDb) return globalForDb.grainsDb;

  const client = postgres(env().DATABASE_URL, {
    prepare: false,
    ssl: "require",
    // Serverless invocations are short-lived; a large pool per instance buys
    // nothing and costs connections.
    max: 5,
  });

  const db = drizzle(client, { schema });
  globalForDb.grainsDb = db;
  return db;
}

export type Db = Database;
