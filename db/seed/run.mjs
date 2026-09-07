/**
 * Run a seed .sql file against the development database.
 *
 *   pnpm db:seed db/seed/bangkok-labs.sql
 *
 * P21: seeds are SQL files rather than a script per dataset, so they stay
 * reviewable in a pull request — the data is the diff. This is the runner they
 * need, because psql is not installed.
 *
 * Two properties matter and neither is free:
 *
 * The whole file runs in ONE transaction, so a seed either lands completely or
 * not at all. Half a lab — a row in `labs` with no processes and no prices — is
 * worse than no lab, because it looks like a real listing somebody neglected.
 * It is also what makes temporary tables work: bangkok-labs.sql stages its
 * coordinates in one declared `ON COMMIT DROP`, which would vanish between
 * statements if each were committed on its own.
 *
 * Statements are split on drizzle's `--> statement-breakpoint` marker rather
 * than on semicolons. Seeds contain `DO $$ ... $$` blocks whose bodies are full
 * of semicolons, and a naive split would cut them in half. The marker also means
 * a failure can name the statement that raised, which for a hand-written seed of
 * a few hundred rows is the difference between a fix and a hunt.
 *
 * It talks to DIRECT_URL — it is a script, not the app, and has no reason to go
 * through the transaction pooler. Production is not reachable from here at all:
 * seeding prod is not a thing this project does, and if it ever becomes one it
 * gets the same confirmation token as db:migrate:prod.
 */
import { existsSync, readFileSync } from "node:fs";
import postgres from "postgres";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const file = process.argv[2];
if (!file) {
  console.error("usage: pnpm db:seed <file.sql>");
  process.exit(1);
}

if (!existsSync(file)) {
  console.error(`No such file: ${file}`);
  process.exit(1);
}

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("DIRECT_URL is not set — copy .env.example to .env.local.");
  process.exit(1);
}

/**
 * Does this chunk contain anything Postgres would act on?
 *
 * Written as a line scan rather than the obvious `/^(--[^\n]*\n?)*$/`. That
 * regex is correct and it is a trap: nested quantifiers over a chunk that does
 * not match backtrack exponentially, and on a seed file with a few hundred lines
 * between breakpoints it does not finish. It hung for minutes on pure string
 * work, looking exactly like a stalled database connection.
 */
function hasStatement(chunk) {
  return chunk
    .split("\n")
    .some((line) => line.trim() !== "" && !line.trim().startsWith("--"));
}

const statements = readFileSync(file, "utf8")
  .split(/^[ \t]*-->[ \t]*statement-breakpoint[ \t]*$/m)
  .map((s) => s.trim())
  // A chunk that is only comments is not a statement. Sending one to Postgres
  // is an empty query, which errors rather than doing nothing.
  .filter(hasStatement);

const sql = postgres(url, {
  ssl: "require",
  prepare: false,
  max: 1,
  // A seed's RAISE NOTICE is a message written for the person running it —
  // bangkok-labs.sql uses one to say which labs it skipped for want of a pin.
  // The default handler dumps the whole notice object, severity and C source
  // file included, which buries the sentence that was meant to be read.
  onnotice: (notice) => console.log(notice.message),
});

try {
  await sql.begin(async (tx) => {
    for (const [index, statement] of statements.entries()) {
      try {
        await tx.unsafe(statement);
      } catch (error) {
        // The first line of a statement is almost always enough to find it,
        // and printing several hundred lines of seed data is not.
        const firstLine = statement
          .split("\n")
          .find((l) => l.trim() && !l.trim().startsWith("--"));
        console.error(
          `\nStatement ${index + 1} of ${statements.length} failed:\n  ${firstLine}\n`,
        );
        throw error;
      }
    }
  });

  console.log(`Applied ${statements.length} statements from ${file}`);
} catch (error) {
  // A seed's own RAISE EXCEPTION is a message written for the person running it
  // — bangkok-labs.sql uses one to say which labs still have no pin — so it is
  // printed on its own rather than buried in a driver stack trace.
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
