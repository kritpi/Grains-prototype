/**
 * Check that R2 is actually wired up — `pnpm r2:check`.
 *
 * Run it after C1 (docs/plans/r2-setup.md), and again after setting production
 * up. It writes a 1x1 PNG, reads it back over the S3 API, fetches it through
 * the public domain, asks Cloudflare Images to resize it, deletes it, and
 * confirms it is gone. Nothing is left behind, and the object it uses lives
 * under `pending/` so the lifecycle rule would clear it even if a step throws.
 *
 * It exists because none of this can be verified by type checking, and every
 * part of it has already been wrong once: an S3 API endpoint pasted in as the
 * public URL, a token issued against an account with no R2 entitlement, a
 * custom domain left grey-clouded so /cdn-cgi/image/ 404s.
 */
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  ListBucketsCommand,
} from "@aws-sdk/client-s3";

const ENV_FILE = ".env.local";
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const NEEDED = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "NEXT_PUBLIC_R2_PUBLIC_URL",
];

const missing = NEEDED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error("Missing:", missing.join(", "));
  console.error("See docs/plans/r2-setup.md.");
  process.exit(1);
}

const pub = process.env.NEXT_PUBLIC_R2_PUBLIC_URL.replace(/\/$/, "");
const bucket = process.env.R2_BUCKET;

// Two independent paths are being checked here, and they fail independently.
//
// The *read* path is the custom domain: a public URL that is wrong makes every
// image src a 404 or a 401, and no credential is involved. The *write* path is
// the S3 API: account id, token and bucket, and no domain is involved.
//
// This used to exit on a bad public URL before a single write was attempted,
// which is how a recorded `NotEntitled` blocker stayed on the books after it had
// stopped being true — the one command meant to detect that never reached it. A
// misconfigured read path is now a failed read-path check, reported at the end
// with everything else. Diagnostics that stop at the first problem hide the
// second one, and here the second one was good news.
const readPathProblem = /r2\.cloudflarestorage\.com/.test(pub)
  ? "it is the S3 API endpoint, not a public domain — step 2 of docs/plans/r2-setup.md"
  : /r2\.dev/.test(pub)
    ? "it is an r2.dev development URL: rate-limited, and Images transformations do not run on it"
    : null;

console.log(`bucket ${bucket} · public ${pub}`);

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const key = `pending/_check/${randomUUID()}.png`;

let failed = false;
let wrote = true;
function report(label, pass, detail = "") {
  if (!pass) failed = true;
  console.log(
    `${pass ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`,
  );
}

/**
 * Where a write failure actually lives: the credential, the account, or R2.
 *
 * `NotEntitled` reads like a verdict on the account, and it was recorded as one
 * here. It is weaker than that. R2 stores a token's bucket scope *with the
 * credential*, so an out-of-scope bucket can be refused before the account is
 * ever resolved — which means "NotEntitled on the in-scope bucket, AccessDenied
 * on the other" is equally consistent with an account id that is simply not an
 * R2-enabled account. Two probes separate them:
 *
 * - `ListBuckets` is account-level and names no bucket. It cannot be answered
 *   from token scope alone, so its error is about the account.
 * - `HeadBucket` is the same account plus one bucket name.
 *
 * The third possibility is a jurisdiction: a bucket created under EU data
 * residency answers only on `<account>.eu.r2.cloudflarestorage.com`, and the
 * plain endpoint has no idea it exists.
 */
async function diagnoseWrite() {
  const attempt = async (label, client, command) => {
    try {
      const out = await client.send(command);
      console.log(
        `  ok    ${label}` +
          (out.Buckets
            ? ` — ${out.Buckets.length} bucket(s): ${out.Buckets.map((b) => b.Name).join(", ")}`
            : ""),
      );
      return null;
    } catch (error) {
      console.log(`  fail  ${label} — ${error.name}: ${error.message}`);
      return error.name;
    }
  };

  console.log("\nNarrowing it down:");
  const accountLevel = await attempt(
    "ListBuckets (account-level, no bucket named)",
    s3,
    new ListBucketsCommand({}),
  );
  await attempt(
    `HeadBucket ${bucket}`,
    s3,
    new HeadBucketCommand({ Bucket: bucket }),
  );

  const eu = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  const euLevel = await attempt(
    "ListBuckets against the EU jurisdiction endpoint",
    eu,
    new ListBucketsCommand({}),
  );

  console.log("");
  if (euLevel === null && accountLevel !== null) {
    console.error(
      "The bucket is under EU data residency. Point the endpoint at\n" +
        `https://<account>.eu.r2.cloudflarestorage.com — this is a code change in\n` +
        "lib/storage.ts, not an env value, and it is not an account problem.",
    );
    return;
  }
  if (accountLevel === "NotEntitled") {
    console.error(
      "ListBuckets names no bucket, so token scope cannot explain this: the\n" +
        "account behind R2_ACCOUNT_ID has no R2 entitlement on the S3 API.\n" +
        "Before opening a support ticket, confirm R2_ACCOUNT_ID really is the\n" +
        "account id from the top of the R2 page — a zone id, or the id of a\n" +
        "second account you also have access to, fails in exactly this way.",
    );
    return;
  }
  if (accountLevel === null) {
    console.error(
      "The account answers ListBuckets, so it IS entitled and the credential is\n" +
        "valid. The failure is about this bucket: check the name against the\n" +
        "listing above, and that the token's scope covers it.",
    );
    return;
  }
  console.error(
    "The account-level probe failed too — see its error above; it is the one\n" +
      "worth acting on, since it involves neither the bucket nor its scope.",
  );
}

try {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: png,
      ContentType: "image/png",
    }),
  );
  report("write over the S3 API", true, key);
} catch (error) {
  report("write over the S3 API", false, `${error.name}: ${error.message}`);
  await diagnoseWrite();
  // Deliberately not an early exit: the read path below needs no credential
  // and is a separate piece of work, so report it in the same run.
  wrote = false;
}

// Everything from here needs the object that the write would have created, so
// a failed write makes these unknown rather than passing. They are still
// printed: a run that reports one line and stops teaches nothing about the
// other three, and this script exists to be run while things are broken.
const NO_OBJECT = "not checked — nothing was written";

if (wrote) {
  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    report(
      "read it back (HEAD)",
      head.ContentLength === png.length,
      `${head.ContentLength} bytes, ${head.ContentType}`,
    );
  } catch (error) {
    report("read it back (HEAD)", false, error.message);
  }
} else {
  report("read it back (HEAD)", false, NO_OBJECT);
}

if (readPathProblem) {
  // The read path's own configuration is wrong, which is knowable without any
  // object and independent of everything above.
  report(
    "public domain serves it",
    false,
    `NEXT_PUBLIC_R2_PUBLIC_URL is unusable: ${readPathProblem}`,
  );
  report("Images transformations run", false, "no public domain to test");
} else if (!wrote) {
  report("public domain serves it", false, NO_OBJECT);
  report("Images transformations run", false, NO_OBJECT);
} else {
  const direct = await fetch(`${pub}/${key}`).catch((error) => ({
    status: 0,
    detail: error.message,
  }));
  report(
    "public domain serves it",
    direct.status === 200,
    `HTTP ${direct.status}${direct.detail ? ` ${direct.detail}` : ""}`,
  );

  const resized = await fetch(
    `${pub}/cdn-cgi/image/width=50,format=auto/${key}`,
  ).catch((error) => ({ status: 0, detail: error.message }));
  report(
    "Images transformations run",
    resized.status === 200,
    `HTTP ${resized.status}${
      resized.headers ? ` ${resized.headers.get("content-type") ?? ""}` : ""
    }${resized.detail ? ` ${resized.detail}` : ""}`,
  );
  if (resized.status === 404) {
    console.error(
      "  A 404 here is usually the DNS record being grey-clouded rather than\n" +
        "  proxied, or Transformations not enabled on the zone (step 5).",
    );
  }
}

if (wrote) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  let gone = false;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    gone = true;
  }
  report("delete removes it", gone);
} else {
  report("delete removes it", false, NO_OBJECT);
}

console.log(failed ? "\nR2 is not ready." : "\nR2 is wired correctly.");
process.exit(failed ? 1 : 0);
