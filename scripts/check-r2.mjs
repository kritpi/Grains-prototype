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

// The mistake that looks like a working configuration: the S3 API endpoint is
// where objects are *written*, needs a signature on every request, and is not
// the CDN. Putting it here makes every image src a 401.
if (/r2\.cloudflarestorage\.com/.test(pub)) {
  console.error(
    "NEXT_PUBLIC_R2_PUBLIC_URL is the S3 API endpoint, not a public domain.\n" +
      "It should be the custom domain bound to the bucket — step 2 of\n" +
      "docs/plans/r2-setup.md, e.g. https://images-dev.<your-domain>",
  );
  process.exit(1);
}
if (/r2\.dev/.test(pub)) {
  console.error(
    "NEXT_PUBLIC_R2_PUBLIC_URL is an r2.dev development URL. It is rate-limited,\n" +
      "and Images transformations do not run on it — use a custom domain.",
  );
  process.exit(1);
}

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
function report(label, pass, detail = "") {
  if (!pass) failed = true;
  console.log(
    `${pass ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`,
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
  if (error.name === "NotEntitled") {
    console.error(
      "\nNotEntitled means the account has no R2 entitlement for the S3 API,\n" +
        "even if the dashboard works and the subscription reads Active. It is an\n" +
        "account state, not a configuration error — no env value fixes it.",
    );
  }
  process.exit(1);
}

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

await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
let gone = false;
try {
  await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
} catch {
  gone = true;
}
report("delete removes it", gone);

console.log(failed ? "\nR2 is not ready." : "\nR2 is wired correctly.");
process.exit(failed ? 1 : 0);
