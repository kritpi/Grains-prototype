# C1 — Cloudflare R2 setup

The steps only a person can do, in the order that works. Everything here is
dashboard and clipboard; nothing in it is code. It is the whole of C1, and Track
C's second step cannot start without the four values at the end.

Read [00_BACKLOG.md](../00_BACKLOG.md#object-storage-r2-not-supabase-reversed-2026-09-08)
first if you want the argument for R2 over Supabase Storage. This file assumes
the decision and just does it.

Do the whole thing for **dev** now. Repeat it for **prod** at launch — same
steps, but a different bucket (`grains-photos-prod`), a different custom domain
(`images.<yourdomain>`) and a token scoped to that bucket. Transformations are
enabled per *zone*, so step 5 is already done for both.

The prod values go into Vercel's Production environment under the **plain**
names, not the `_PROD` ones — the deployed app reads `R2_BUCKET`, and Vercel is
what makes that mean something different per environment.

**The failure worth naming now:** if the Production environment does not
override `R2_BUCKET`, production uploads land in the development bucket and
nothing errors. The credentials are valid, the bucket exists, the write
succeeds; it shows up later as production photos that 404 behind the production
domain. Verify it at launch rather than assuming it, the same way the `sin1`
region is verified.

**Do step 7 before you try to upload from a browser.** It is CORS. It is
numbered last only because renumbering these steps would break every reference
to them elsewhere in the repository — read it fourth. Without it, every upload
fails on the preflight with an opaque `403` and nothing in the app explains why.
This document went six steps without mentioning CORS once, and that omission
cost an hour of debugging that had nothing wrong with it.

---

## Before you start

You need a Cloudflare account with a domain on it, because the public URL and
the image transformations both hang off a zone. If the domain is not on
Cloudflare yet, that is the first job and everything below waits on it.

R2 asks for a payment method even to use the free tier. Nothing bills at our
volumes — 10 GB storage, no egress charge, 5,000 image transformations a month —
but the card is not optional.

---

## 1. Create the bucket

Dashboard → **R2** → **Create bucket**.

- **Name:** `grains-photos-dev` (at launch: `grains-photos-prod`)
- **Location:** Automatic, or **Asia-Pacific** if offered. The database is in
  Singapore and most readers are in Bangkok.
- **Storage class:** Standard. Infrequent Access has retrieval fees and is wrong
  for images people are actively browsing.

Leave everything else alone.

## 2. Give it a public custom domain

Bucket → **Settings** → **Public access** → **Custom domain** → **Connect domain**.

- **A custom domain binds to exactly one bucket**, so dev and prod need one
  each. Use `images-dev.<yourdomain>` now and keep the plain
  `images.<yourdomain>` for production — the nice name should belong to the
  environment strangers actually reach.
- Cloudflare adds the DNS record itself. Make sure it is **proxied** (the orange
  cloud) — that is what puts the CDN in front, and it is also what makes
  `/cdn-cgi/image/` work in step 5.

**Do not enable the `r2.dev` development URL for anything real.** It is
rate-limited, it is not a domain we control, and every stored key would end up
embedded in pages pointing at it.

> ### If you do not have a domain on Cloudflare yet
>
> There is a supported fallback, and it is explicitly a fallback. Enable
> **Public Development URL** on the bucket and set `NEXT_PUBLIC_R2_PUBLIC_URL`
> to the `https://pub-<hash>.r2.dev` it gives you.
>
> `lib/image-loader.ts` detects that host and serves objects **untransformed**,
> because `/cdn-cgi/image/` only runs on a zone somebody configured and
> `r2.dev` is Cloudflare's hostname, not ours. Without that bypass every image
> would 404 on a URL that looks right — which is exactly what happens if you
> point the variable at the S3 API endpoint instead.
>
> What it costs: full-size objects over the wire (a 6000px scan is several
> megabytes, a photobook of twenty is over 100 MB), a rate limit, and storage
> keys published on a domain we do not control. Fine for working locally.
> **Never production.** `pnpm r2:check` passes on it but says so on every run.
>
> Everything else on this page still applies — the bucket, the lifecycle rule,
> the token and CORS are all unchanged. Only the read origin differs.

Check it: upload any file through the dashboard and open
`https://images-dev.<yourdomain>/<that file's name>`. You should get the file, not a
403. Delete the test file afterwards.

> The bucket is public-read on purpose (P20). Photos are public content and the
> CDN serves them. Writing is a different matter — that only ever happens through
> a presigned URL the server issues, never from the browser directly.

## 3. Add the lifecycle rule that replaces a cron job

Bucket → **Settings** → **Object lifecycle rules** → **Add rule**.

- **Name:** `expire-pending`
- **Prefix:** `pending/`
- **Action:** delete objects **1 day** after upload

This is the orphan cleanup. An upload that starts and never confirms — someone
closes the tab between the PUT and the save — leaves an object nobody will ever
reference. Under Supabase Storage this needed a weekly cron job we would have
had to write, deploy and monitor; here it is this checkbox, so make sure it is
actually set.

## 4. Create an API token

Dashboard → **R2** → **API** → **Manage API tokens** → **Create API token**.

- **Permission:** *Object Read & Write*
- **Scope:** this one bucket, not "all buckets"
- **TTL:** no expiry, unless you would rather rotate it on a schedule

You get three values, **shown once**:

| Shown as | Goes in env as |
| --- | --- |
| Access Key ID | `R2_ACCESS_KEY_ID` |
| Secret Access Key | `R2_SECRET_ACCESS_KEY` |
| Account ID (top of the R2 page) | `R2_ACCOUNT_ID` |

Copy all three now. The secret is not retrievable later; losing it means making
a new token.

**These are server-only.** They are not `NEXT_PUBLIC_*`, they never reach a
browser, and a leaked secret is write access to the bucket. If one ever appears
in a client bundle, a commit or a screenshot, revoke it in the dashboard and
issue a new one rather than hoping.

## 5. Turn on image transformations

Dashboard → your **zone** (the domain, not the bucket) → **Images** →
**Transformations** → enable for the zone.

This is what resizes on the fly, and it is not optional: an unresized film scan
is 6000 px and several megabytes, so one photobook of twenty photos is over
100 MB without it. With it, the same page is about 1.5 MB.

5,000 unique transformations a month are free. At roughly six variants per photo
(three widths × two formats) that covers about 800 new photos a month; beyond it
the rate is $0.50 per 1,000 and cached variants do not re-count.

Check it: `https://images-dev.<yourdomain>/cdn-cgi/image/width=200/<a test file>`
should return a 200 px wide version. A 404 here almost always means the DNS
record is grey-clouded rather than proxied.

## 6. Put the values in the environment

Four keys, added to your local env file and to the Vercel project (all
environments except that prod gets the prod bucket's values):

```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=grains-photos-dev
NEXT_PUBLIC_R2_PUBLIC_URL=https://images-dev.<yourdomain>
```

`R2_BUCKET` is needed even though the public URL never mentions a bucket: the
custom domain is bound to one bucket for *reads*, but uploads go through the S3
API, which addresses buckets by name.

`NEXT_PUBLIC_R2_PUBLIC_URL` has **no trailing slash** and no bucket name in it —
the custom domain is already bound to the bucket, so a key of `photos/abc.jpg`
is served at `<url>/photos/abc.jpg`.

The `NEXT_PUBLIC_` prefix is deliberate and is not a mistake to fix later:
`next/image`'s custom loader runs in the browser, so a server-only variable
would be undefined exactly where the image `src` is built. Nothing leaks — the
value is already in the `src` of every image on every page. The other three
carry the opposite rule and must never be prefixed.

`SUPABASE_URL` is gone — C2 deleted it along with `lib/labs/photo-url.ts`. The
four keys above are now required by `lib/env.ts`, so an install without them
fails on the first page that reads the environment rather than only on upload.

I will add the four names to `.env.example` — tell me the public URL and I will
fill that one in, since it is not a secret. **Do not paste the token values into
chat.** Put them in the env file yourself; I never read those.

## 7. Allow the browser to upload (CORS)

**Read this fourth, not last.** Nothing uploads without it, and the failure is
opaque: the browser reports "CORS error", the network panel shows a `403` on a
preflight, and the app itself never sees a response to explain.

Bucket → **Settings** → **CORS policy** → edit:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "http://localhost:3001"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

`AllowedHeaders` is the line people leave out, and leaving it out is what
produces the 403. The browser sends `Content-Type: image/jpeg` with the PUT —
deliberately, because R2 records that header and serves the object back with
it, and `confirmPhoto` reads the recorded type to decide whether to keep the
object. A `Content-Type` outside
`application/x-www-form-urlencoded | multipart/form-data | text/plain` is not a
CORS-simple header, so it triggers a preflight that has to be authorised by
name. Without `AllowedHeaders`, R2 refuses the preflight and the PUT never
happens.

The other three lines:

- **`PUT` only.** The browser never issues `GET`, `POST` or `DELETE` against the
  S3 API. Reads come from the public origin and deletes happen server-side in
  `deletePhoto`; granting them to a browser origin buys nothing.
- **Both localhost ports**, because a port mismatch produces a byte-identical
  403 with a completely different cause.
- **`ExposeHeaders: ["ETag"]`** is not needed today — the uploader only checks
  the status — and is what a multipart upload would want.

**At launch, add the production origin.** `localhost` alone fails in production
exactly the way a missing `AllowedHeaders` fails locally.

To check it without a browser, ask R2 for the preflight directly. The second
command is the one that matters; if it answers `403` while the first answers
`204`, `AllowedHeaders` is the problem:

```bash
EP=https://<account>.r2.cloudflarestorage.com/<bucket>/pending/probe.jpg
curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS "$EP" \
  -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: PUT'
curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS "$EP" \
  -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: PUT' \
  -H 'Access-Control-Request-Headers: content-type'
```

`pnpm r2:check` cannot catch this: it runs in Node, where CORS does not exist,
so it passes while every real upload fails.

---

## When it is done

C2 has landed: `lib/storage.ts` against R2, `lib/image-loader.ts` pointing at
`/cdn-cgi/image/`, and Track A's `photo-url.ts` stand-in deleted.

The quickest way to know steps 2 and 5 worked is the lab detail page. The mock
fixture already has `lab_photos` rows for **Amp's Laboratory**, so uploading
three images through the R2 dashboard at the keys those rows name makes the
atmosphere strip render — custom domain, `publicUrl`, the loader and
transformations, with nothing uploaded through the app. The keys are in
docs/plans/track-c-progress.md.

## What is still true afterwards

- **Photos never transit the app server.** The browser PUTs straight to R2; the
  server only ever issues the signature and, afterwards, checks what landed.
- **The database does not move.** Postgres, PostGIS, both poolers and Singapore
  co-location are untouched by any of this.
- **Nothing is enforced by the bucket any more.** R2 has no `allowed_mime_types`
  or `file_size_limit`, so type and size are checked in `confirmPhoto` after the
  object lands and the object is deleted if it is wrong (P19). That is code
  rather than configuration, and it is the real cost of this change.
