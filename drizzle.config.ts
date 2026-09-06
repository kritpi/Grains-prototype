import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit talks to the database over DIRECT_URL (the session pooler on
 * port 5432), never the transaction pooler the app uses: DDL needs a real
 * session.
 *
 * Migrations are hand-written SQL — `pnpm db:generate` is configured with
 * --custom, so it produces an empty file to fill in rather than diffing the
 * schema. PostGIS DDL is written by hand and must not be generated.
 *
 * extensionsFilters hides PostGIS's own tables (spatial_ref_sys and friends)
 * so drizzle-kit does not offer to drop them.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    url: process.env.DIRECT_URL!,
  },
  extensionsFilters: ["postgis"],
  strict: true,
  verbose: true,
});
