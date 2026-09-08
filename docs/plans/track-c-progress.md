# Track C — Media & Photobooks: progress

**C1 done (bar the entitlement), C2–C5 done. C6 is the last step.** This file exists so the
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
Upload any three images through the dashboard at the keys the fixture names.
Both the lab id and the user id are `gen_random_uuid()`, so they differ per seed
run and cannot be written down here — print them instead:

```bash
pnpm db:seed db/seed/mock-lab.sql
```

```sql
select storage_key, width, height from lab_photos
  join labs on labs.id = lab_photos.lab_id
 where labs.name_en = 'Amp''s Laboratory'
 order by storage_key;
```

Three keys come back, shaped `labs/{labId}/mock-amp-1..3`. Upload a landscape
(~3:2), a square and a portrait (~3:4) at exactly those keys, then open
`/labs/<Amp's id>`: its atmosphere strip renders with nothing uploaded through
the app. That exercises the custom domain, `publicUrl`, the image loader and
transformations in one go.

## Environment

The local environment file carries all five `R2_*` keys and they are correct
**except** `NEXT_PUBLIC_R2_PUBLIC_URL`, which is still the S3 API endpoint. It
must become the custom domain from step 2. `pnpm r2:check` refuses to run until
it does, and says why.

`@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` are installed already.

## The lab-photo key shape — decided

**`labs/{labId}/{uuid}`.** Accepted 2026-09-08, as proposed. Community photos
stay `photos/{userId}/{uuid}`; `pending/{userId}/{uuid}` is unchanged.

The reason that carried it: a key is a public string — it is in the `src` of
every image on every page — so a community photo whose key contained a lab id
would be exactly the attribution the missing `photos.lab_id` column exists to
prevent. Keeping the namespaces apart makes the content-integrity rule true in
storage as well as in the schema. It also means a deleted lab's objects stay
findable by prefix, which `lab_photos` cascading in the database does not give
you, because R2 objects do not follow a foreign key.

Both shapes are defined in `lib/photos/keys.ts` and asserted in
`tests/photos/keys.test.ts` — the test states the invariant directly rather than
leaving it to a comment. `db/seed/mock-lab.sql` was updated with it.

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

## C3 — done

`app/photos/actions.ts` carries the five writes: `requestUploadUrl`,
`confirmPhoto`, `confirmLabPhoto`, `updatePhotoMetadata`, `deletePhoto`.
Supporting them:

- `lib/photos/keys.ts` — the three key namespaces and `parsePendingKey`, which
  is the confirm path's whole defence. The key arrives from the browser, so it
  is an argument, not a fact: shape is checked there, ownership in the action.
- `lib/photos/limits.ts` — the type allowlist, 25 MB, and the cap of 50. No
  imports, so the browser pre-checks with the same function the server decides
  with. **Both numbers are PROPOSED** — nothing upstream specifies them, and
  the cap value is an open product item 00_BACKLOG already tracks.
- `lib/queries/photos.ts` — `countOriginals`, `insertPhoto`, `getPhoto`,
  `updatePhotoMetadata`, `deletePhoto`, `insertLabPhoto`. This is C4's file,
  started early because C3 cannot write SQL inline (the one layering rule).
- `lib/queries/books.ts` — `appendPhotobookItem` only. C5 owns the rest.
- `components/upload/PhotoUploader.tsx` + `photo-uploader.css`.

### Three things worth knowing before C4

**Order of operations is chosen by which failure is worse.** Confirm moves the
object first and writes the row second, so a crash between them leaves an object
nobody references — wasted storage, invisible. The reverse would leave a row
pointing at nothing, which is a permanently broken frame in somebody's
photobook. Delete runs the other way round for the same reason: the row must not
survive. Keep that asymmetry if you touch either.

**The recorded content type is a claim, not a measurement.** `headObject` reads
the `Content-Type` the browser sent, so a determined caller can label anything
`image/jpeg`. Sniffing the bytes would mean streaming the object through the app
server, which is the one thing this flow exists to avoid, so it is bounded by an
authenticated session and the cap instead. Written up in `putObject`'s comment
in the uploader.

**`PhotoUploader` has no caller yet.** C6 owns `/u/[username]`, which is where
it mounts; it takes `scannerModels` (from `listFormCatalog`) and an optional
`photobookId`. There is also no prototype screen for it — the prototype's only
upload affordance is the one film-stock PRD §3 rules out, recorded as gap J10 —
so it is built from the component library's primitives and the deviation is
written into `photo-uploader.css`.

The lab form's atmosphere-photo slot is still the disabled `+` placeholder.
Wiring it to `confirmLabPhoto` is Phase 3.1, not C3.

### Tests

`tests/photos/keys.test.ts` and `tests/photos/limits.test.ts` are pure — 15 of
them, including the namespace invariant and the refusal of a key outside the
caller's `pending/` prefix (C7).

`tests/queries/photos.test.ts` is database-backed — the cap counting originals
only, the delete cascading through every Connection, a non-owner changing
nothing. Run and passing against `grains-dev`.

## C4 — done

`lib/queries/photos.ts` gained `listGalleryPhotos` and `alsoAppearsIn`;
`lib/queries/books.ts` is now the whole read/write layer for photobooks —
`getProfile`, `getPhotobook`, `insertPhotobook`, `updatePhotobook`,
`deletePhotobook`, `connectPhoto`, `removePhotobookItem`,
`reorderPhotobookItems`, alongside C3's `appendPhotobookItem`.

Three decisions inside it:

- **`connectPhoto` is a separate function from `appendPhotobookItem`, not the
  same one behind a flag.** "Reject self-connection" cannot mean "reject when
  the photo owner is the book owner": that would forbid putting your own Photo
  in your own book, which is ordinary curation and is exactly what
  `confirmPhoto`'s upload-into-a-book path does. So the Connection refuses your
  own Photo (PRD D #12) and curation does not. Both halves are tested.
- **`getProfile` takes no viewer.** Visitor and owner see the same Photobooks;
  what differs is the cap meter and the edit affordances, which C6 adds from
  `countOriginals` and the session. Nothing here is private, so nothing here
  needs to know who is asking. `alsoAppearsIn` takes no viewer for a sharper
  reason — it is a property of the Photo, and deriving it from the viewer's own
  connections would print "1" on a Photo seven people connected (gap plan L2).
- **The gallery pages by keyset, not OFFSET.** It is append-heavy and people
  arrive days apart, so an offset silently repeats or skips a photo every time
  somebody uploads mid-scroll. The cursor is `<timestamp>|<uuid>`, opaque but
  not secret: it names a public row, and a malformed one is treated as absent
  rather than as an error.

Two things the reads assume, worth knowing before C6 builds on them:

- **There is no bio.** `users` carries `name` and `image` and nothing else, so
  the prototype's bio line has no column behind it.
- **A Photo in no Photobook has nowhere to surface on a profile.** `getProfile`
  returns Photobooks only. That is the open question gap plan J11 and PRD D #10
  both record, not an omission here — it needs a decision, and then a second
  list on this function.

### Tests

25 database-backed tests across `tests/queries/books.test.ts` (the Connection
and its refusals, remove, reorder, photobook CRUD) and
`tests/queries/profile.test.ts` (profile cards, book resolution by
username+slug, the gallery's paging, `alsoAppearsIn` counting across users).
The write tests roll back; the read tests use committed fixtures and delete
their users, which cascades the rest.

**The whole suite runs green: 264 tests, nothing skipped, no residue left in
`grains-dev`.** That includes `constraint-names.test.ts`, which is what verifies
the four photo constraint names C3 added actually exist under those names.

One bug the tests caught: `reorderPhotobookItems` had folded its ownership check
into the UPDATE's WHERE clause, so an empty list against somebody else's
photobook returned `true` — zero rows updated was indistinguishable from "not
yours". It is an explicit check first now, with a test for that exact case.

## C5 — done

`app/u/actions.ts`: `createPhotobook`, `updatePhotobook`, `deletePhotobook`,
`addToPhotobook` (the Connection), `removeFromPhotobook`, `reorderPhotobook`.

They are thin, and that is the design rather than an accident. Every rule about
*whether* a write is allowed already lives in `lib/queries/books.ts` as a WHERE
clause — ownership, self-connection, whether a photo is actually in this book —
so none of these reads a row to decide something and then writes. What is left
is what only a request can know: who is asking, what they sent, and which pages
to invalidate.

The one exception is minting a slug, which cannot be done without looking first.
`slugsStartingWith` runs inside the same transaction as the insert to keep the
window small, and `(owner_id, slug)` remains the arbiter: on a unique violation
the action retries once with a timestamp suffix rather than looping, because a
second collision would mean something other than concurrency and a loop would
hide it.

### Two decisions, both PROPOSED

**A slug is minted once and never changes.** Renaming a Photobook leaves its
address alone. A profile is something people share, and a slug that follows the
title turns every rename into a dead link for whoever has the old one. The cost
is a book whose address can drift from its name — visible only to its owner. The
alternative is a redirect table, which is not MVP work; `updatePhotobook` in the
query layer does take a slug, so a "change address" affordance is possible the
day it is worth building.

**Slugs keep non-ASCII rather than folding it** (`lib/books/slug.ts`). The
standard trick — NFKD, then strip combining marks — turns é into e and guts
Thai, because Thai vowel signs *are* combining marks: `แล็บของแอมป์` would come
back as a row of bare consonants. This is a bilingual product, so the rule that
works for both scripts beats the one that makes prettier English URLs. Browsers
percent-encode it and display it decoded. There is a test pinning it.

Also PROPOSED: an artist's note is capped at **300 characters**, read off PRD
D #7's "2–3 lines". That is an interpretation, and this is the only place the
length is enforced.

### Tests

31 new — 11 pure ones for the slug rules, and 20 running the actions for real
against `grains-dev` with only `requireUser` and `revalidatePath` mocked, which
is the pattern `tests/actions/lab-actions.test.ts` established.

**The whole suite is 295 tests, green, nothing skipped, no residue.** That
includes `constraint-names.test.ts`, which is what confirms
`photobooks_owner_id_slug_key` is the name the database actually uses — it was
inferred from Postgres' inline-`UNIQUE` convention, and had it been wrong a
duplicate slug would have surfaced as a 500 instead of a sentence.

## Where C goes next

C6 — the pages, and the last step of the track. `/u/[username]` (visitor vs
owner, cap meter, both empty states, 3-up mosaic covers, artist's note on
cards), `/u/[username]/[slug]` (true-aspect grid, `via @uploader` on connected
photos only, artist's note once), and the photo detail in book context (prev/
next, the metadata rail, "Also appears in · N", the Connect sheet, Edit/Delete
for your own).

Everything underneath it is finished and tested. Two things C6 will hit
immediately:

- **`PhotoUploader` has no caller until C6 mounts it.** It takes `scannerModels`
  from `listFormCatalog` and an optional `photobookId`.
- **`components/layout/site-header.tsx:29` already links to `/u/{username}`**,
  so signing in and clicking your own name is a 404 until this lands.

And one open decision it needs: **where a Photo belonging to no Photobook
surfaces on a profile.** `getProfile` returns Photobooks only. Gap plan J11, PRD
D #10's open sub-question.

None of C6 is blocked by the entitlement. What is still blocked is end-to-end
verification of the upload path: no real object has moved through it, because
the browser's PUT cannot succeed until Cloudflare restores the S3 API.
`pnpm r2:check` is the gate.
