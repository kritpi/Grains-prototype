/**
 * What may be uploaded, and how much of it.
 *
 * These used to be bucket configuration. Supabase Storage enforced
 * `allowed_mime_types` and `file_size_limit` on the bucket itself; R2 has no
 * equivalent, and signing `Content-Type`/`Content-Length` into a presigned PUT
 * is defeated by the headers a browser adds. So the rules moved into our code,
 * and this file is the single copy of them (P19).
 *
 * Checked twice, deliberately. The browser checks before uploading, so a person
 * who picks a 400 MB TIFF is told immediately instead of after a long upload;
 * the server checks again with `headObject` after the object lands, because the
 * first check is a courtesy to an honest caller and not a control. Only the
 * second one decides anything — which is why this module has no imports and is
 * safe on both sides.
 */

/**
 * Formats a browser can actually display, since a Photo is served straight to
 * an `<img>` with no conversion step of our own. HEIC is the notable absence:
 * Safari would render it and nothing else would. Cloudflare's `format=auto`
 * converts on the way out, not on the way in.
 *
 * PROPOSED — nothing upstream specifies the list. Widening it is a one-line
 * change; narrowing it after people have uploaded is not.
 */
export const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

/**
 * 25 MB. A 6000 px film scan at quality 90 is around 8 MB, so this admits a
 * generous scan and a 16-bit-ish export while still refusing a raw TIFF.
 *
 * PROPOSED, like the list above. It is a storage-budget number — R2's free tier
 * is 10 GB — rather than a technical ceiling, so it is worth revisiting once
 * real uploads exist rather than guessed at twice.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Per-user cap on *original* uploads (PRD D #5). Connections are pointers, cost
 * no storage, and are explicitly not capped.
 *
 * 50 is the placeholder the PRD records as placeholder data (PRD D #12); the
 * real number is an open product decision, listed in 00_BACKLOG.
 */
export const UPLOAD_CAP = 50;

/** The `accept` attribute for a file input, from the one list above. */
export const UPLOAD_ACCEPT = ALLOWED_CONTENT_TYPES.join(",");

export type LimitCheck = { ok: true } | { ok: false; message: string };

function isAllowedType(value: string): value is AllowedContentType {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(value);
}

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  // Below a megabyte, "0.0 MB" reads as an error rather than as a small file.
  if (mb < 0.1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

/**
 * The rule, in one place, phrased for a person rather than a log.
 *
 * A zero-byte object is refused too: it is what a PUT that was cut off halfway
 * leaves behind, and it would otherwise become a Photo whose image never loads.
 */
export function checkUpload(input: {
  contentType: string | null;
  bytes: number;
}): LimitCheck {
  if (input.contentType === null || !isAllowedType(input.contentType)) {
    return {
      ok: false,
      message: `That file is a ${input.contentType ?? "unknown type"}. Upload a JPEG, PNG, WebP or AVIF.`,
    };
  }
  if (input.bytes <= 0) {
    return { ok: false, message: "That file is empty — the upload cut off." };
  }
  if (input.bytes > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `That file is ${formatBytes(input.bytes)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    };
  }
  return { ok: true };
}
