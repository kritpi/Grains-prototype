/**
 * Public URLs for stored objects, and the `next/image` loader that resizes them.
 *
 * Two halves of one fact — where an object is served from — and they belong in
 * the same file because they must never disagree. `publicUrl` writes the `src`;
 * the loader rewrites that `src` into a transformation URL. If the origin were
 * configured in two places, one of them would eventually be wrong and the
 * symptom would be a 404 on a URL that looks correct.
 *
 * This module is isomorphic on purpose, which is why it — and not
 * `lib/storage.ts` — owns `publicUrl`. A `next/image` loader runs in the
 * browser as well as on the server, so it cannot reach `env()`, and
 * `lib/storage.ts` carries the R2 write credentials and is `server-only`.
 * `lib/storage.ts` re-exports `publicUrl` so the storage interface still reads
 * whole; the implementation lives here, where a client component can import it.
 *
 * Reads are the CDN and need no signature: the bucket is public-read (P20), the
 * custom domain is bound to it, so a stored key *is* a path under the origin.
 * Writes are the other direction entirely — presigned PUTs against the S3 API,
 * in `lib/storage.ts`.
 */

/**
 * The custom domain bound to the bucket — no trailing slash, no bucket name in
 * it. `NEXT_PUBLIC_` because this value has to survive into the browser bundle,
 * and nothing is leaked by that: it is already in the `src` of every image on
 * every page.
 *
 * Read inside a function rather than at module scope so tests can stub it.
 * Next inlines `process.env.NEXT_PUBLIC_*` wherever it appears, function bodies
 * included, so this costs nothing at build time.
 */
function origin(): string {
  return (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");
}

/**
 * Each segment is encoded separately: the key's slashes are real path
 * separators, and encoding the whole string would escape them into a single
 * literal filename.
 */
function encodeKey(storageKey: string): string {
  return storageKey.split("/").map(encodeURIComponent).join("/");
}

/**
 * The URL a stored object is served at.
 *
 * Deliberately total — no `string | null`. Track A's stand-in returned null
 * because storage did not exist yet and a lab page had to render anyway; now it
 * does exist, and a photo product with no configured origin is broken rather
 * than degraded. A missing variable shows up as a relative URL that 404s
 * visibly, which is what `pnpm r2:check` is for.
 */
export function publicUrl(storageKey: string): string {
  return `${origin()}/${encodeKey(storageKey)}`;
}

/**
 * `next/image`'s custom loader — Cloudflare Images transformations on the R2
 * domain (P23).
 *
 * `/cdn-cgi/image/` runs on any Cloudflare-proxied zone, so it works whether
 * the app is deployed to Vercel or to Cloudflare; the transformation happens at
 * the image's origin, not the app's. That is also why the returned URL is
 * absolute: the app is not on that zone, so a path-relative `/cdn-cgi/image/…`
 * would hit the app's own host and 404.
 *
 * `fit=scale-down` is the frame-respect rule expressed as a query parameter:
 * never crop, never upscale past the stored pixels. A photobook grid renders
 * true aspect ratios, so a loader that cropped to fit would silently undo the
 * one thing the grid exists to do.
 *
 * `format=auto` is what makes the free tier viable — an unresized scan is
 * several megabytes and a photobook of twenty is over 100 MB. Each distinct
 * width counts once against the 5,000 free transformations a month, so a
 * component that wants to be frugal narrows the `sizes` prop rather than
 * changing anything here.
 *
 * Anything not served from our origin passes through untouched — a static asset
 * under /public, say. It is then unoptimised, which is honest: this zone can
 * only transform objects it serves.
 */
export default function r2ImageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  const base = origin();
  if (base === "" || !src.startsWith(`${base}/`)) return src;

  const key = src.slice(base.length + 1);
  const options = [`width=${width}`, "format=auto", "fit=scale-down"];
  if (quality) options.push(`quality=${quality}`);

  return `${base}/cdn-cgi/image/${options.join(",")}/${key}`;
}
