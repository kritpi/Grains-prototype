# Track C — Media & Photobooks: progress

**Not started.** This file exists so the next session does not have to
reconstruct where things stand from a conversation it cannot see.

Last updated 2026-09-08. Branch `claude/track-c-media` is cut at `c0ce154`,
which predates Tracks A and B — **cut it again from `develop`** rather than
using it.

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

## Where C starts

C2, since C1 is as done as it can be: `lib/storage.ts` as a server-only S3
client against R2 — `createSignedUpload`, `headObject`, `moveObject`,
`deleteObject`, `publicUrl` — plus `lib/image-loader.ts` pointing at
`/cdn-cgi/image/`, and deleting `lib/labs/photo-url.ts` with `SUPABASE_URL`
(P24). `headObject` is the one addition to the original interface: P19\'s limits
are enforced after the object lands now, because R2 has no bucket-level mime or
size configuration.

None of that needs the entitlement. `pnpm r2:check` verifies it the moment
Cloudflare fixes their side.
