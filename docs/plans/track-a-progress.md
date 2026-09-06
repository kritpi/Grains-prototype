# Track A — Lab Discovery & Map: progress

Phase 2, worktree `discovery`, branch `claude/track-a-discovery`, cut from `develop` at `c0ce154`.
Last updated 2026-09-06.

Step numbering follows [build-plan.html](build-plan.html). **A1–A4 are done; A5–A7 are not started.**

| Step | State | Commit |
| --- | --- | --- |
| A1 basemap + nuqs adapter | done | `4373ab7` |
| A2 `lib/queries/labs.ts` | done | `39c0fbb` |
| A3 `/api/labs`, `/api/labs/[id]/history` | done | `b9826e3` |
| A4 `/labs` page | done | `c96a9a8` |
| A5 `/labs/[id]` | not started | — |
| A6 Bangkok seed (needs real lab data) | not started | — |
| A7 remaining query tests | mostly done, see below | — |

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

A7 is therefore largely complete — radius, AND/OR semantics, closed-lab exclusion and
open-now all have tests. What A7 still owes is coverage of `getLab` and `listLabHistory`
against populated rows; today they are only asserted to return empty for an unknown id.

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
- **The five-connection pool is small enough to deadlock.** `/labs` needs connections for
  the filter options, the areas, the search and the header's user lookup; when it fanned
  out one more, two overlapping renders each held connections the other waited for and
  the page went from 200 ms to two minutes. `/api/labs` stayed at 78 ms throughout, which
  is what made it look like a rendering problem. Keep per-request fan-out low, or raise
  `max` in `lib/db/index.ts` — a foundation file, so that is a PR to `main`.

## Housekeeping before resuming

- **`grains-dev` currently holds six invented labs** from `db/seed/dev-labs.mjs`, added so
  the page could be looked at. They are namespaced `[dev-seed]`. Remove with
  `pnpm db:seed:dev --clean`. A6 replaces them with the ten real Bangkok labs, which needs
  names, pins and prices from a person.
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

Next step is **A5**, `/labs/[id]`: the pricing matrix that must show "not entered yet"
differently from "not offered", hours and open-now, contacts, curated and custom services
and supplies, inventory, atmosphere photos, read-only badge counts, and the edit log below
the fold via the history handler. `getLab` and `listLabHistory` already return everything
it needs.
