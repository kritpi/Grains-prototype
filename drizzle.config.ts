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

/**
 * Which database to migrate. Defaults to development; production is opt-in
 * through `pnpm db:migrate:prod`, never by editing a variable, so migrating
 * production is always a deliberate act rather than a consequence of whatever
 * DIRECT_URL happened to hold.
 */
const target = process.env.GRAINS_DB_TARGET === "prod" ? "prod" : "dev";
const variable = target === "prod" ? "DIRECT_URL_PROD" : "DIRECT_URL";
const url = process.env[variable];

if (!url) {
  throw new Error(
    `${variable} is not set. Copy .env.example to .env.local and fill it in — see CLAUDE.md.`,
  );
}

/**
 * Production needs a second, explicit confirmation naming the project.
 *
 * Selecting the target with an environment variable alone is not enough of a
 * guard: it takes one stray `GRAINS_DB_TARGET=prod` to migrate production
 * without meaning to, which is exactly how this file's first version was
 * written. The token has to match the database user, so confirming requires
 * looking at which project is about to change rather than pressing through a
 * prompt.
 */
if (target === "prod") {
  const account = new URL(url).username;
  if (process.env.GRAINS_CONFIRM_PROD !== account) {
    throw new Error(
      `Refusing to touch PRODUCTION (${new URL(url).host}, ${account}).\n` +
        `Re-run naming the project explicitly:\n\n` +
        `  GRAINS_CONFIRM_PROD=${account} pnpm db:migrate:prod\n`,
    );
  }
}

// Print the host, never the credentials, so it is obvious which database is
// about to be changed.
console.log(
  `drizzle-kit target: ${target.toUpperCase()} (${new URL(url).host})`,
);

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url },
  extensionsFilters: ["postgis"],
  strict: true,
  verbose: true,
});
