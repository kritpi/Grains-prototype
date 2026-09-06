import { existsSync } from "node:fs";

/**
 * Vitest runs outside Next, so nothing has loaded the app's environment.
 * Tests that need a database skip themselves when DATABASE_URL is absent, so
 * a missing .env.local is not an error here — it just means the schema suite
 * does not run. CI relies on that: it has no credentials by design.
 */
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}
