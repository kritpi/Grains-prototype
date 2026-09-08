# Track C — Media & Photobooks: progress

**C1 done (bar the entitlement), C2 done. C3 is next.** This file exists so the
next session does not have to reconstruct where things stand from a conversation
it cannot see.

Last updated 2026-09-08. C2 is on `claude/c2-storage-image-loader-a6c43f`, cut
from `develop`. The older `claude/track-c-media` branch is cut at `c0ce154`,
which predates Tracks A and B — **do not use it**.

## Read these first

| File | Why |
| --- | --- |
| [build-plan.html](build-plan.html) C1–C7 | the steps, already revised for R2 |
| [00_BACKLOG.md](../00_BACKLOG.md) "Object storage: R2, not Supabase" | why storage is not Supabase, and the upload flow |
| [r2-setup.md](r2-setup.md) | the dashboard work, and what is done |
| [track-b-progress.md](track-b-progress.md) | what B left for C |

## Blocked: R2's S3 API returns `NotEntitled`

**C1 is done except that the S3 API does not work**, and it is a Cloudflare-side
problem, not a configuration one. `pnpm r2:check` reproduces it in one command.

What is true:

- The R2 subscription reads **Active** (R2 Paid, renews Oct 8 2026)
- Buckets `grains-photos-dev` and `grains-photos-prod` exist
- Uploading an object through the R2 dashboard succeeds
- `R2_ACCOUNT_ID` matches the S3 endpoint shown on the bucket's settings page
- The API token is valid and correctly scoped — proven by the two buckets
  returning *different* errors for the same credentials: `NotEntitled` on the
  bucket the token covers, `AccessDenied` on the one it does not

What fails: every S3 operation on `grains-photos-dev` — `PutObject`,
`ListObjectsV2`, `HeadBucket` — with `NotEntitled` 403, "Please enable R2
through the Cloudflare Dashboard" (code 10042).

Already tried, no change: cancelling and reactivating the subscription, and
issuing a fresh token afterwards. The error predates the cancellation. A support
ticket is the remaining path.

**Do not spend time re-diagnosing this.** Run `pnpm r2:check`; if it still says
`NotEntitled`, nothing in this repository will fix it.

## What is not blocked

Reading does not touch the S3 API — it is the CDN. So **steps 2, 3 and 5 of
r2-setup.md can be done now**: the custom domain, the `pending/` lifecycle rule,
and Images transformations.

That unblocks the more interesting half to prove, because P23 (resizing) has
never been exercised. The fixture makes it a five-minute check: `lab_photos`
already holds three rows for **Amp\'s Laboratory** from `db/seed/mock-lab.sql`.
Upload any three images through the dashboard at exactly these keys —

```
photos/2c3e3284-2172-41e8-9309-7f968a4e598d/mock-amp-1     landscape, ~3:2
photos/2c3e3284-2172-41e8-9309-7f968a4e598d/mock-amp-2     square
photos/2c3e3284-2172-41e8-9309-7f968a4e598d/mock-amp-3     portrait, ~3:4
```

— and `/labs/<Amp\'s id>` renders its atmosphere strip with nothing uploaded
through the app. That exercises the custom domain, `publicUrl`, the image loader
and transformations in one go.

## Environment

The local environment file carries all five `R2_*` keys and they are correct
**except** `NEXT_PUBLIC_R2_PUBLIC_URL`, which is still the S3 API endpoint. It
must become the custom domain from step 2. `pnpm r2:check` refuses to run until
it does, and says why.

`@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` are installed already.

## One decision still open

**The storage key for lab atmosphere photos.** Community photos are
`photos/{userId}/{uuid}` and that is settled. Lab photos have no shape specified
anywhere; `db/seed/mock-lab.sql` assumes they share `photos/{userId}/`.

The proposal, not yet accepted, is `labs/{labId}/{uuid}`:

- it matches the schema, which keeps `lab_photos` and `photos` deliberately
  apart — venue documentation is not a Photo
- a community photo\'s key then never contains a lab id, so the key namespace
  cannot become the attribution link the content-integrity rule forbids
- deleting a lab leaves its objects findable by prefix; `lab_photos` cascades in
  the database but R2 objects do not follow

Decide it before C3 writes `confirmLabPhoto`. Accepting it means updating P20,
C3, and the keys and comment in `mock-lab.sql`.

## C2 — done

`lib/storage.ts` is the server-only S3 client: `createSignedUpload`,
`headObject`, `moveObject`, `deleteObject`, and `publicUrl` re-exported. It
imports `server-only`, which is a new dependency and the point of it — those
three credentials are write access to the bucket and `@aws-sdk/client-s3` has no
business in a browser bundle.

`publicUrl`'s implementation is in `lib/image-loader.ts`, not in `storage.ts`,
and that is the one shape decision worth knowing. A `next/image` loader runs in
the browser, so it cannot call `env()`; putting the public origin and the
loader in one isomorphic module is what stops the two from ever disagreeing
about where an object is served. `storage.ts` re-exports it so the interface
still reads whole.

Also landed:

- `next.config.ts` sets `images.loader: "custom"` + `loaderFile`. A per-image
  `loader` prop is not an option in the App Router — `next/image` is a client
  component and a function cannot cross that boundary — so it is global, and
  the loader passes through anything not on the R2 domain.
- `components/labs/lab-photos.tsx` moved from `<img>` to `next/image` with
  `fill` + `sizes`. Its own comment had named this as the thing to do once the
  loader existed, and without it the loader would ship with no caller. `sizes`
  rather than the row's intrinsic width on purpose: a 6000 px scan in a 700 px
  slot would have Cloudflare bill a 6000 px variant.
- `lib/env.ts` drops `SUPABASE_URL` and requires the four server-only `R2_*`
  keys. `NEXT_PUBLIC_R2_PUBLIC_URL` is deliberately *not* in `env()` — it has to
  be legible in the browser, and `pnpm r2:check` is what validates its shape.
- `lib/labs/photo-url.ts` deleted (P24); the lab page calls `publicUrl`.
- `tests/storage/image-loader.test.ts` — 8 pure tests, no network.

Verified by rendering a throwaway page against the dev server: the loader emits
absolute `https://<domain>/cdn-cgi/image/width=…,format=auto,fit=scale-down/<key>`
URLs, and `server-only` does refuse a client import of `lib/storage.ts` (the
build says so in as many words). Neither is provable by type checking.

**One measurement C6 should have.** `next/image`'s default `deviceSizes` gives a
`fill` image with a `vw`-based `sizes` an eight-to-ten-width srcset — measured,
not guessed. Only the width a browser picks is ever transformed, so nothing is
billed for the breadth; but across viewports and DPRs it is more distinct
variants per photo than the 5,000-a-month budget was reckoned against (three
widths × two formats). PROPOSED, for C6 to take with the photobook grid in
front of it rather than for C2 to guess at: narrow `images.deviceSizes` to
something like `[640, 828, 1080, 1600, 2048]`. Left at the defaults for now
because under-serving a fine-art photobook is the worse failure of the two.

One behaviour changed on purpose. `labPhotoUrl` returned `string | null` and the
lab page filtered, so an unconfigured install omitted the photo section;
`publicUrl` is total. A photo product with no configured origin is broken rather
than early, and a visibly broken image is a better signal than a silently
missing section. The practical effect: **Amp's Laboratory now renders three
broken frames until objects exist at the fixture's keys.**

## Where C goes next

C3 — `app/photos/actions.ts` and `components/upload/PhotoUploader.tsx`. Nothing
in C2 is blocked by the entitlement, but C3's *verification* is: `confirmPhoto`
cannot be exercised end to end until an S3 PUT works. It can still be written
and unit-tested against the S3 client.

Decide the lab-photo key shape first — the open item above. `confirmLabPhoto` is
the first code that has to commit to it.
