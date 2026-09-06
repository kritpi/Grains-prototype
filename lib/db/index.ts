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
 * The connection is cached on globalThis in development because Next's dev
 * server re-evaluates modules on every edit, and a fresh pool per edit
 * exhausts the connection limit within a few minutes.
 */
const globalForDb = globalThis as unknown as {
  grainsClient?: postgres.Sql;
};

function client(): postgres.Sql {
  if (globalForDb.grainsClient) return globalForDb.grainsClient;

  const sql = postgres(env().DATABASE_URL, {
    prepare: false,
    ssl: "require",
    // Serverless invocations are short-lived; a large pool per instance buys
    // nothing and costs connections.
    max: 5,
  });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.grainsClient = sql;
  }

  return sql;
}

type Database = ReturnType<typeof drizzle<typeof schema>>;

let instance: Database | undefined;

function database(): Database {
  instance ??= drizzle(client(), { schema });
  return instance;
}

/**
 * Connecting is deferred to first use rather than done at import.
 *
 * Building the client here at module scope would read the environment during
 * import, so a missing DATABASE_URL would crash any module that merely
 * imports a query — during `next build`, or as an opaque 500 instead of the
 * handled error a caller can report. The proxy keeps `db.select(...)` reading
 * exactly like a normal client while moving that failure inside the request.
 */
export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    const value = Reflect.get(database(), property, receiver) as unknown;
    // Drizzle's methods depend on `this`; hand back a bound copy so the proxy
    // never becomes the receiver.
    return typeof value === "function" ? value.bind(database()) : value;
  },
});

export type Db = Database;
