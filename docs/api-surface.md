# API surface

The minimum needed to put real data behind [the prototype](design/grains-prototype.html). Written against the unified Next.js stack in [00_BACKLOG.md](00_BACKLOG.md) Pillar 1 — there is no wire contract to maintain, so this document describes *function signatures*, not a spec that has to be generated from.

## The one rule

**Reads render on the server. Writes are Server Actions. Route Handlers exist only for what the browser fetches after the page has loaded.**

That single split decides where every new piece of behaviour goes, and it is the whole reason there is no OpenAPI file: a Server Component calling `getLab(id)` is a function call, and TypeScript already checks it.

SQL lives in `lib/queries/*.ts` and nowhere else — the one discipline worth keeping from the old hexagonal plan. Route Handlers, Server Actions and Server Components all call into it; none of them write SQL inline.

```
lib/db/schema.ts     Drizzle schema — mirrors schema.sql, source of inferred types
lib/queries/         the only place SQL exists: labs.ts, films.ts, photos.ts, books.ts
lib/auth.ts          Auth.js config; auth() returns the session server-side
app/**/page.tsx      Server Components — call lib/queries directly
app/**/actions.ts    Server Actions — all writes
app/api/**/route.ts  the three GET handlers below
```

## Server Component reads

No endpoint, no fetch, no serialization. These are the SEO-critical pages, so they render on the server with the data already in them.

| Route | Query | Returns |
| --- | --- | --- |
| `/labs/[id]` | `getLab(id)` | lab + processes + pricing matrix + scanners + services + supplies + contacts + inventory + atmosphere photos + badge counts |
| `/labs?area=` | `searchLabs({ area, filters })` | server-rendered first page for a named area (the geolocated search is the client path below) |
| `/films` | `listFilmStocks({ q, iso, format })` | catalog rows + sample-photo counts |
| `/films/[id]` | `getFilmStock(id)` + `listGalleryPhotos(filmStockId)` | stock + its derived gallery |
| `/u/[username]` | `getProfile(username)` | user + their Photobooks (cover, title, artist's note) |
| `/u/[username]/[slug]` | `getPhotobook(username, slug)` | ordered items, each with photo metadata, `via @uploader` when the photo's owner ≠ the book's owner, and `alsoAppearsIn` |

`alsoAppearsIn` is `COUNT(*) FROM photobook_items WHERE photo_id = $1` — derived from the canonical Photo, never from the viewer's own connections (PRD D #11).

## Route Handlers — three

Only these, because only these are fetched by the browser after load.

### `GET /api/labs`

The workhorse. Backs geolocated search, every filter change, map pans, the "widen radius" prompt, and reverse search from a film page.

```
lat, lng          required, floats
radius_m          default 5000
process[]         c41 | ecn2 | bw | e6      — AND across values
scanner[]         model names               — OR within
service[]         curated keys only         — custom entries are not indexed, by design
film_stock_id     reverse search from /films/[id]
open_now          boolean, evaluated in Asia/Bangkok
```

Returns `{ labs: LabCard[], total }`, where `LabCard` carries `id, name_en, name_th, area, distance_m, status, open_now, processes[], scanners[], price_from_thb, badge_counts, completeness`.

The query is one statement: `ST_DWithin(location, ST_MakePoint(lng,lat)::geography, radius_m)` filtered to `status <> 'permanently_closed'`, with `EXISTS` sub-clauses per filter, ordered by `distance_m ASC, completeness DESC`. Permanently-closed labs are excluded here but still reachable at `/labs/[id]` by direct link.

### `GET /api/film-stocks?q=`

Typeahead. Used by the inventory picker inside the Add/Edit Lab form and by the Photo metadata form — both of which can create a catalog entry inline (PRD A #3), so this returns `{ id, name, iso, formats }` plus an `exact_match` flag the UI uses to offer "add it".

### `GET /api/labs/[id]/history?cursor=`

Paginated edit log, lazily loaded below the fold on a lab page. Reads `edit_history` where `entity = 'lab'`.

## Server Actions — all writes

Every one of these: authenticate via `auth()` first, run the whole mutation in one transaction, `revalidatePath` on success.

**Labs**

| Action | Notes |
| --- | --- |
| `createLab(input)` | gates on name + pin + ≥1 process; writes `labs` + children + one `edit_history` row |
| `updateLab(id, version, changes[], note?)` | the same form in edit mode. `UPDATE … WHERE id = $1 AND version = $2`; 0 rows affected → `{ conflict: true }`, the client reloads and shows what moved |
| `setLabStatus(id, version, status, note?)` | temporary override and "Mark as Closed" — a flag, never a delete |
| `toggleLabBadge(labId, badgeKey)` | `INSERT … ON CONFLICT DO NOTHING` / `DELETE`; retraction is the delete |

`updateLab` is the only endpoint with real domain logic, and it is where the invariant lives: **one lab mutation writes exactly one `edit_history` row and touches only the changed leaf paths.** Recomputing `labs.completeness` happens in the same transaction. Everything else in this table is a thin write.

**Film stocks** — `createFilmStock(name, iso, formats)`, `updateFilmStock(id, version, changes[], note?)`. Same version + history pattern; callable inline from the lab form.

**Photos** — the three-step upload (Pillar 3):

| Action | Notes |
| --- | --- |
| `requestUploadUrl({ kind, contentType, bytes })` | `kind` is `photo` or `lab_atmosphere`. Checks the session, checks the per-user original-upload cap for `photo`, returns a signed PUT into `pending/{userId}/{uuid}` with content-type and max size baked into the signature |
| `confirmPhoto({ key, width, height, metadata, photobookId? })` | moves the object out of `pending/`, inserts the row, optionally appends to a Photobook |
| `confirmLabPhoto({ key, labId, width, height })` | the atmosphere-photo variant — writes `lab_photos`, a different table on purpose |
| `updatePhotoMetadata(photoId, metadata)` | owner only; propagates everywhere it is Connected, since there is one canonical row |
| `deletePhoto(photoId)` | owner only; cascade removes every `photobook_items` row — the silent reflow of PRD D #8 |

The cap counts `photos WHERE owner_id = $me`. Connections don't count, because they aren't rows in `photos` (PRD D #5).

**Photobooks** — `createPhotobook(title, artistNote?)`, `updatePhotobook(id, …)`, `deletePhotobook(id)`, `addToPhotobook(photobookId, photoId)`, `removeFromPhotobook(photobookId, photoId)`, `reorderPhotobook(photobookId, orderedPhotoIds)`.

`addToPhotobook` is the **Connection**: it is one insert, and whether it counts as a Connection or as the owner filing their own photo is read off `photos.owner_id`, not stored. Self-connection is rejected — the owner's view shows Edit/Delete instead (PRD D #12).

**Account** — `claimUsername(username)`, once, at first sign-in, before `/u/@username` exists.

## Not built for MVP

No public/read API, no pagination beyond the edit log and the film gallery, no rate limiting beyond the upload cap, no search endpoint for photos, no follow/feed endpoints (PRD D #9), no moderation queue (all contributions live immediately).
