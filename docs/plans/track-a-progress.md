# Track A — Lab Discovery & Map: progress

Phase 2, worktree `discovery`, branch `claude/track-a-discovery`, cut from `develop` at `c0ce154`.
**Merged into `develop` on 2026-09-08 as `5420b3a`.** Last updated 2026-09-08.

Step numbering follows [build-plan.html](build-plan.html). **A1–A7 are done and merged.** 102 tests.

| Step | State | Commit |
| --- | --- | --- |
| A1 basemap + nuqs adapter | done | `4373ab7` |
| A2 `lib/queries/labs.ts` | done | `39c0fbb` |
| A3 `/api/labs`, `/api/labs/[id]/history` | done | `b9826e3` |
| A4 `/labs` page | done | `c96a9a8` |
| A5 `/labs/[id]` | done | `44c608e` |
| A6 Bangkok seed | done — 7 labs | `89dc51e` |
| A7 remaining query tests | done | `8bc2092` |

## What is verified, and how

Everything below was checked against a running app and a real `grains-dev`, not only by
type checking. That distinction earned its keep: **every significant bug in this track
passed `typecheck`, `lint` and `format` before it was found.**

- **Search correctness.** `tests/queries/labs.test.ts` places fixtures with `ST_Project`,
  so "4900 metres north" is a geodesic distance rather than a decimal guess, and asserts
  the claim PostGIS is kept for: 4.9 km is inside a 5 km search, 5.1 km is outside. A
  degree-box approximation passes every other case in the file and fails those two.
- **Filter semantics.** Processes AND, scanners OR, curated services AND, and a
  contributor's freeform service is invisible to the filter by construction.
- **Open now.** Tested against the current Asia/Bangkok weekday rather than a hard-coded
  schedule, and covers the three ways a lab is *not* open: shut today, no hours entered,
  and a manual status override contradicting an otherwise-open schedule.
- **The Route Handlers**, exercised over HTTP for both the happy path and every rejection.
- **The page**, in a browser: the area list, `?area=` results present in the server HTML,
  filters writing to the URL, the near-miss empty state, pins, and the radius ring.
- **Atmosphere photos**, which are otherwise the one part of the detail page no data can
  exercise until Track C exists. Verified end to end without touching the app: a throwaway
  server serving Supabase's public-object URL shape on localhost, with `SUPABASE_URL` passed
  on the dev server's command line rather than written to an env file, so `labPhotoUrl`, the
  null-filter on the page and `LabPhotos` all ran exactly as they will in production — only
  the host differed. Three PNGs at the mock's true dimensions came back at uniform height
  with widths following their real aspect ratios (1:1 → 192x192, 3:4 → 144x192, 3:2 →
  288x192), uncropped, scrolling inside their own container while the page body did not
  scroll horizontally. **What this does not prove** is the Supabase wiring itself, which is
  Track C's `lib/storage.ts` and bucket.

A7 is complete. Radius, AND/OR semantics, closed-lab exclusion and open-now were already
covered; `getLab` and `listLabHistory` now have coverage against populated rows, and the
hours and edit-log-path helpers are tested as pure functions. 94 tests, up from 44.

- **The detail page**, in a browser against `grains-dev`: the pricing matrix showing "not
  offered" and "not entered" as different things, the temporarily-closed banner, quick
  actions appearing only for channels the lab has, every "not entered yet" prompt on a
  sparse lab, and a non-uuid path returning 404 rather than 500.

## Decisions taken here, worth a review

These extend or depart from the plan. None are hard to reverse.

1. **`components/map/base-map.tsx`, not `BaseMap.tsx`.** Every component in the repo is
   kebab-case. **Track B must import `@/components/map/base-map` exactly** — macOS will
   not care about the case, the Vercel build will.
2. **Services filter is AND**, matching processes. `api-surface.md` specifies AND for
   processes and OR for scanners but leaves services open.
3. **Caps on `/api/labs`:** 50 km radius, 100 page size. Guardrails against a hand-edited
   URL asking for a circle that contains the whole table, not product limits — both sit
   far outside anything the PRD's controls can produce.
4. **`?area=` renders rather than redirects.** The server resolves the name and ships
   results in the HTML, and hands the resolved centre to the client, so the URL stays a
   crawlable page instead of becoming a redirect to coordinates.
5. **`LabCard` returns `areaEn` and `areaTh`,** where `api-surface.md` says `area`. The
   language choice belongs to the UI, and bilingual copy is a Phase 3 item (P22).
6. **`lib/labs/search-params.ts` is a new file in a directory Track B also uses.** B owns
   `lib/labs/paths.ts` specifically; these are different files and should not conflict.
7. **`@types/geojson` added explicitly.** It was only a transitive dependency of
   maplibre-gl, which pnpm's strict layout keeps out of the top-level `@types`.
8. **Turnaround is rendered per cell, not per process row.** The wireframe gives the
   pricing table one turnaround column per process; the schema stores turnaround per
   `(process, format)`. A 135 back next day while 120 goes out to a partner lab for a week
   is exactly why that shape exists, so printing one number for both would invent data.
9. **`getLab` returns the whole badge roster with counts, including zeros**, and no longer
   returns `badgeCounts`. `LabCard.badgeCounts` on the search path is unchanged.
10. **`SUPABASE_URL` is a new optional env key**, read only to build public URLs for
   atmosphere photos via `lib/labs/photo-url.ts`. **Track C: that file is a stand-in for
   `lib/storage.ts`'s `publicUrl` and should be deleted when the real one lands.**
11. **Edit-log leaf paths are formatted by shape, not by importing Track B's grammar.**
   `components/labs/edit-log-format.ts` labels the segments it recognises and humanises the
   rest. **Track B: it does not need to be kept in sync with `lib/labs/paths.ts`** — it is
   built to render paths it has never seen, because history recorded today has to stay
   readable after new fields are added.

## Things found the hard way

Recorded so nobody pays for them twice. Each is explained in full in the commit that
fixed it.

- **MapLibre 6's worker never loads under Turbopack.** It derives the worker URL from its
  own bundle, landing on a chunk path Turbopack never emits. It 404s *silently* — style
  and sprites load on the main thread — so the map is a blank canvas with no error.
  `scripts/copy-maplibre-worker.mjs` copies it into `public/` at install time.
- **Server-only modules reach the browser through value imports.** `search-state.ts`
  importing one constant from `lib/queries/labs.ts` pulled the postgres driver into the
  client bundle. `import type` is erased; a plain import is not, and nothing but running
  the page reports it.
- **nuqs parsers must come from `nuqs/server`** when a Server Component reads them.
- **`isStyleLoaded()` is not "can I add a layer".** It also waits for sources, which waits
  for tiles, which only load while the map renders — so it is never true in a background
  tab. `map.once("load")` is worse: an effect running after load attaches to an event
  that has already fired.
- **An IntersectionObserver cannot be verified in a non-rendering page.** The edit log
  loads when it scrolls into view, and in a hidden browser tab `requestAnimationFrame`
  never fires, so neither does the observer — correctly, but it means the lazy path cannot
  be exercised by automation that does not composite. Verified by temporarily forcing an
  eager load, which is also how the next entry was found.
- **Appending a fetched page to state is not idempotent.** The whole edit log rendered
  twice in development: React mounts effects twice, `load()` ran twice, and each run
  appended the same page. Entries are now de-duplicated by id, which also covers a retry
  after a partly-successful load. Nothing about this is visible in production, which is
  what makes it worth recording.
- **A catastrophic regex looks exactly like a hung database.** The seed runner's
  comment-only-chunk test was `/^(--[^\n]*\n?)*$/` — correct, and exponentially
  backtracking on a chunk that does not match. It hung for minutes on pure string work
  before ever opening a connection, and the first three things investigated were the
  pooler, a stale lock and a paused project. Nested quantifiers over untrusted-length input
  are worth a second look; the fix was a line scan.
- **The five-connection pool is small enough to deadlock.** `/labs` needs connections for
  the filter options, the areas, the search and the header's user lookup; when it fanned
  out one more, two overlapping renders each held connections the other waited for and
  the page went from 200 ms to two minutes. `/api/labs` stayed at 78 ms throughout, which
  is what made it look like a rendering problem. Keep per-request fan-out low, or raise
  `max` in `lib/db/index.ts` — a foundation file, so that is a PR to `main`.

## Housekeeping before resuming

- **A fully-populated fixture lives at [db/seed/mock-lab.sql](../../db/seed/mock-lab.sql).**
  "Amp's Laboratory" is invented and does not exist; it fills every field the detail page
  renders, which is what makes it useful for looking at `/labs/[id]` with nothing missing —
  a pricing matrix with no gaps, all four scanners, every contact channel, all four badges,
  and an edit log spanning five leaf-path shapes. It is owned by `mock-…@grains.invalid`
  users so `created_by` tells it apart from the real seven, its own edit-history entry says
  it is a fixture, and `pnpm db:seed db/seed/mock-lab-remove.sql` takes it out by ownership
  rather than by name. Re-running refreshes it rather than duplicating.
- **`grains-dev` holds seven real Bangkok labs**, seeded from
  [db/seed/bangkok-labs.sql](../../db/seed/bangkok-labs.sql) and attributed to `@grains`.
  Their pins are geocoded to the street rather than the door — good enough for `ST_DWithin`,
  visibly off on the detail map — and the seeded `edit_history` note says so where the
  product shows it. Nothing here is verified against a lab; everything to check is in
  [track-a-lab-seed-review.md](track-a-lab-seed-review.md).
- **A6 landed seven labs, not the ten the plan asks for.** Three met the selection rule but
  could not be given a location by any means available, and a lab without a pin cannot be
  seeded — `labs.location` is NOT NULL. They were dropped rather than carried as rows that
  never insert; their research is in the review doc, and they belong in Track B's Add Lab
  form, whose pin-on-a-map step is exactly what the seed could not do.
- **`grains-dev` currently holds six invented labs** from `db/seed/dev-labs.mjs`, added so
  the pages could be looked at, plus three seed users and three seed film stocks. All are
  namespaced `[dev-seed]`. Remove with `pnpm db:seed:dev --clean`. A6 replaces the labs
  with the ten real Bangkok ones, which needs names, pins and prices from a person.
- **The seed film stocks will collide conceptually with Track B's `film-stocks.sql`.** They
  are namespaced, so they cannot collide on the `(lower(name), iso)` unique index, but they
  should be cleaned once B's catalog exists.
- **Nothing in this track is deployed.** The Singapore region and the production callback
  URL are still unproven outside a laptop, carried over from Phase 1.
- A **verification hook** now runs typecheck, lint, format and tests once per turn; it
  lives on `develop` in `.claude/`, not on this branch.

## Resuming

```bash
cd .claude/worktrees/discovery
pnpm install          # postinstall copies the maplibre worker into public/
pnpm db:seed:dev      # optional: something to look at
pnpm dev -p 3001
```

Every step is done and the track is merged into `develop` (`5420b3a`).

Two things follow it rather than block it. The seeded data is drafted from public sources and
**not verified against any lab** — Phase 3.4 is where that happens, and the review doc lists
what to check, prices first. And the three labs that could not be pinned are best added
through Track B's Add Lab form once it exists, which dogfoods the form at the same time.

Two things this track leaves deliberately unfinished, both waiting on other tracks rather
than on more work here:

- **Atmosphere photos render but there is nothing to render.** `lab_photos` has no write
  path until Track C, and the section is absent while `SUPABASE_URL` is unset.
- **Badges are read-only.** `toggleLabBadge` is Phase 3 (build plan 3.2). The roster is
  rendered as static rows rather than disabled buttons, because a control that cannot do
  anything is worse than no control.

`/films/[id]` and `/labs/[id]/edit` are linked from the page and 404 until Track B merges.
That is intentional — the hrefs are fixed by the route table, so writing them now saves
revisiting the page later.
