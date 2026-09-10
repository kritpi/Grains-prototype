import "server-only";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/lib/env";

/**
 * Object storage — Cloudflare R2 over its S3-compatible API.
 *
 * This is the write half. Reads never come through here: the bucket is
 * public-read on a custom domain (P20), so serving an object is `publicUrl` in
 * `lib/image-loader.ts` and costs no request against these credentials. Every
 * function below either signs something or manages an object's life.
 *
 * `server-only` is not decoration. The three credentials in `env()` are write
 * access to the bucket, and `@aws-sdk/client-s3` is a large dependency that has
 * no business in a browser bundle. Importing this from a client component is a
 * build error rather than a runtime surprise.
 *
 * Photos never transit the app server. The browser is given a signature and
 * PUTs the bytes straight to R2; the server's involvement is issuing that
 * signature and, afterwards, inspecting what landed.
 */

export { publicUrl } from "@/lib/image-loader";

/**
 * Ten minutes. Long enough for a slow connection to finish a film scan, short
 * enough that a signature copied out of a network tab is stale by the time
 * anyone would use it.
 */
const UPLOAD_TTL_SECONDS = 600;

/**
 * Lazily constructed and memoised, for the same reason `env()` is lazy: `next
 * build` runs without credentials, and a module-scope client would fail the
 * build for every page that merely imports something from here.
 *
 * A plain module-level cache rather than `globalThis`, unlike `getDb`. That one
 * guards a connection pool against a dev server that re-evaluates modules on
 * every edit; an S3 client holds no such scarce resource.
 */
let cached: S3Client | undefined;

function client(): S3Client {
  if (cached) return cached;

  const config = env();
  cached = new S3Client({
    // R2 has no regions. "auto" is what its S3 API expects, and any real region
    // name here breaks the signature.
    region: "auto",
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
  });
  return cached;
}

/**
 * The bucket the S3 API addresses by name — needed even though the public URL
 * never mentions it, because the custom domain is bound to a bucket for reads
 * while writes address it explicitly.
 *
 * Read per call rather than captured, so that a Vercel environment overriding
 * `R2_BUCKET` for production is honoured. Getting this wrong is the failure
 * r2-setup.md names: production uploads land in the development bucket and
 * nothing errors, because the credentials are valid and the write succeeds.
 */
function bucket(): string {
  return env().R2_BUCKET;
}

/**
 * S3 encodes a copy's source as `bucket/key`, and does not encode it for us.
 * Segment-wise again, since the slashes are path separators.
 */
function copySource(key: string): string {
  return `${bucket()}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** A 404 from HEAD carries no body to parse, so it arrives as a bare name. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const shaped = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    shaped.name === "NotFound" ||
    shaped.name === "NoSuchKey" ||
    shaped.$metadata?.httpStatusCode === 404
  );
}

export type SignedUpload = {
  /** Where the browser PUTs the bytes. Valid for `expiresIn` seconds. */
  url: string;
  /** Echoed back so the caller confirms against the key it was actually given. */
  key: string;
  expiresIn: number;
};

/**
 * A presigned PUT for one key.
 *
 * Neither `Content-Type` nor `Content-Length` is signed, and that is the
 * decision rather than an omission (P19). Signing them binds the browser to
 * send exactly those headers, and browsers add and normalise headers of their
 * own, so the signature fails in precisely the case it was meant to police —
 * a real upload from a real device. Enforcement moved to after the object
 * lands: `confirmPhoto` HEADs it, and deletes it and refuses if the type or
 * size is wrong. R2 has no bucket-level mime or size configuration to fall back
 * on, which is what Supabase Storage used to provide.
 *
 * So the signature's guarantee is narrow and worth stating plainly: it grants
 * writing *this one key* for ten minutes, and nothing else. The caller decides
 * what key that is, and must not derive it from anything a client sent —
 * `pending/{userId}/{uuid}`, where the user id comes from the session.
 */
export async function createSignedUpload(
  key: string,
  { expiresIn = UPLOAD_TTL_SECONDS }: { expiresIn?: number } = {},
): Promise<SignedUpload> {
  const url = await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn },
  );

  return { url, key, expiresIn };
}

export type StoredObject = {
  /** Whatever the uploader claimed. Trust it only as far as P19's check. */
  contentType: string | null;
  /** Bytes actually stored — this one is measured, not claimed. */
  contentLength: number;
};

/**
 * What is actually at a key, or null if nothing is.
 *
 * The addition to the original interface, and the one this arrangement cannot
 * do without: it is how an upload's type and size are checked at all now that
 * the bucket does not check them. Null rather than a throw for the absent case,
 * because "the object is not there" is an ordinary answer — a confirm arriving
 * after the lifecycle rule swept a stale `pending/` object is a refusal, not a
 * server error.
 */
export async function headObject(key: string): Promise<StoredObject | null> {
  try {
    const head = await client().send(
      new HeadObjectCommand({ Bucket: bucket(), Key: key }),
    );
    return {
      contentType: head.ContentType ?? null,
      contentLength: head.ContentLength ?? 0,
    };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/**
 * Promote an object from one key to another — `pending/` to its permanent home.
 *
 * Copy then delete, because S3 has no move. The order matters: if the delete
 * fails after the copy succeeds, the object exists at both keys and the row
 * that gets written points at the good one. The leftover is under `pending/`,
 * which the lifecycle rule clears within a day. The reverse order would risk
 * losing the bytes outright.
 */
export async function moveObject(from: string, to: string): Promise<void> {
  await client().send(
    new CopyObjectCommand({
      Bucket: bucket(),
      CopySource: copySource(from),
      Key: to,
    }),
  );
  await deleteObject(from);
}

/**
 * Remove an object. Idempotent — S3 reports success for a key that was already
 * gone, so a retried delete is not an error and a caller need not check first.
 */
export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
