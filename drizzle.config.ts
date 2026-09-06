import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit runs outside Next, so nothing has loaded the app's environment
 * for it. It reads `.env` by default and this project keeps its secrets in
 * `.env.local` (the name Next uses and .gitignore already covers), so load
 * that here — otherwise `pnpm db:migrate` fails with "url: undefined" and the
 * command documented in CLAUDE.md would not work as written.
 *
 * Migrations connect over DIRECT_URL, the session pooler on port 5432, never
 * the transaction pooler the app uses: DDL needs a real session.
 *
 * Migrations are hand-written SQL — `pnpm db:generate` is configured --custom,
 * so it produces an empty file to fill in rather than diffing the schema.
 * PostGIS DDL is written by hand and must not be generated: drizzle renders
 * the geography type as a quoted identifier, which Postgres rejects.
 *
 * extensionsFilters hides PostGIS's own tables (spatial_ref_sys and friends)
 * so drizzle-kit never offers to drop them.
 */
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const url = process.env.DIRECT_URL;
if (!url) {
  throw new Error(
    "DIRECT_URL is not set. Copy .env.example to .env.local and fill it in — see CLAUDE.md.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url },
  extensionsFilters: ["postgis"],
  strict: true,
  verbose: true,
});
