import { z } from "zod";

/**
 * Environment access.
 *
 * Parsing is lazy and memoised on purpose. `next build` runs without a
 * database — and Vercel builds without one too — so validating at module
 * import would fail the build for pages that never touch Postgres. Every
 * caller is server-side; nothing here is ever bundled for the browser.
 */
const schema = z.object({
  /**
   * Supabase transaction pooler, port 6543. Used by the running app, where
   * many short-lived serverless invocations each want a connection.
   */
  DATABASE_URL: z.url(),
  /**
   * Supabase session pooler, port 5432. Used by drizzle-kit only: migrations
   * need a real session (the transaction pooler cannot run DDL reliably), and
   * the direct db.<ref> host is IPv6-only on the free tier.
   */
  DIRECT_URL: z.url(),

  /**
   * Auth.js v5. The names are its convention, not ours: it auto-discovers
   * AUTH_<PROVIDER>_ID and AUTH_<PROVIDER>_SECRET, so the Google provider
   * needs no explicit configuration.
   */
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  /** Signs the session cookie. `openssl rand -base64 32`. */
  AUTH_SECRET: z.string().min(32),

  /**
   * Supabase project URL, used to build public object URLs for lab atmosphere
   * photos.
   *
   * Optional, and deliberately so: the `photos` bucket is created in Track C
   * (C1, a dashboard step), and until it exists there is nothing to serve and
   * no rows to serve it for. A lab page without this variable simply omits its
   * photo section rather than failing to render, which is what lets Track A
   * finish ahead of the storage setup.
   *
   * An empty string is read as absent, not as an invalid URL: `.env.example`
   * ships the key with `""`, and copying that file is the documented way to
   * start — so the placeholder must not fail validation on every page.
   */
  SUPABASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().optional(),
  ),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(
      `Missing or invalid environment variables: ${missing}. ` +
        `Copy .env.example to .env.local and fill it in — see CLAUDE.md.`,
    );
  }

  cached = parsed.data;
  return cached;
}
