import { env } from "@/lib/env";

/**
 * Public URLs for lab atmosphere photos.
 *
 * A deliberate stand-in. Track C owns `lib/storage.ts` and the `publicUrl` that
 * belongs there, along with the signed-upload path that writes these rows in
 * the first place; Track A only ever reads. Rather than block the lab page on
 * another worktree, this derives the one URL shape the arrangement fixes — the
 * bucket is public-read (P20), so the object path *is* the CDN path — and
 * Phase 3 deletes this file when it wires the real uploader in.
 *
 * Returns null, never a broken URL, when the project has no storage configured
 * yet. The caller renders nothing rather than a grid of empty frames.
 *
 * Server-only by way of `env()`, which reads variables that are not exposed to
 * the browser: call it while rendering on the server and pass the result down.
 */

/** Public-read, per P20; writes only ever happen through signed URLs. */
const BUCKET = "photos";

export function labPhotoUrl(storageKey: string): string | null {
  const base = env().SUPABASE_URL;
  if (!base) return null;

  // Each segment is encoded separately: the key contains slashes that are real
  // path separators, and encoding the whole string would escape them.
  const path = storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${path}`;
}
