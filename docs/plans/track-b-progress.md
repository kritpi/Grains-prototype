# Track B — Curation & Invariants: progress

Phase 2, worktree `directory`, branch `claude/track-b-directory`, cut from `develop` at `d44c502`.
Last updated 2026-09-08.

Step numbering follows [build-plan.html](build-plan.html). **B1–B5 are done.** 202 tests,
up from 151 when the track started.

| Step | State | Commit |
| --- | --- | --- |
| B1 `lib/labs/paths.ts` — the leaf-path grammar | done | `a2f0f25` |
| B2 `lib/queries/lab-edits.ts` + completeness | done | `ebc59c7` |
| B3 `app/labs/actions.ts` | done | `39e44ee` |
| B4 `components/lab-form/**`, `/labs/new`, `/labs/[id]/edit` | done | `2b68036` |
| B5 film stocks end to end | done | `93cc556` |
| B6 tests | absorbed into B1–B5 | — |

B6 was never a separate step in practice. Every test the plan lists for it —
stale version conflicts with zero writes, one history row per mutation, disjoint
leaf edits both landing, unoffered-process pricing rejected, completeness
recomputed, `setLabStatus` logging history, film-stock identity uniqueness — is
written next to the thing it tests, which is where each of them actually found
something.

The two design artefacts that came before any code, and the reasoning behind
every decision below, are in [track-b-design.md](track-b-design.md). That file
is the review artefact; this one is the state of the branch.

## What is verified, and how

- **The grammar**, as pure functions: every path family, every rejection, and —
  the one that matters — that the shapes already written to `edit_history` by
  both seed files still parse. History that can no longer be read is the failure
  this module exists to prevent.
- **The write layer**, against a real `grains-dev` inside transactions that roll
  back. `tests/db/tx.ts` is the helper the suite did not have: the schema
  invariants use a raw postgres.js client because they assert on error codes,
  but every function in `lib/queries/lab-edits.ts` takes a drizzle transaction
  precisely so a test can run the real function and leave nothing behind.
- **The actions**, run for real and cleaned up afterwards, because an action
  opens its own transaction and that is the behaviour under test. `requireUser`
  and `revalidatePath` are mocked — they are the two things that need a request
  — and nothing else is.
- **The diff**, as pure functions, including the assertion that binds the two
  halves of this track together: every change set `diffDraft` produces is one
  `labChangesSchema` accepts.
- **Both forms and both film pages, in a browser**, against `grains-dev`: the
  pricing matrix, the seven-row week materialising from nothing, the services
  checklist, contacts, the pin dropping and the duplicate warning, the catalog
  facets, and the typeahead — including that an exact name match suppresses the
  "add it" offer, which is the whole reason the endpoint returns that flag.
- **The route handler over HTTP**: partial match, exact match, and a 400 for a
  missing query.
- **The guarded routes**, which 307 to `/sign-in` carrying a `next` parameter.

**What is not verified: the signed-in path.** Every route behind `requireUser`
was exercised through a temporary unguarded preview route, because signing in
needs a Google session that only a person can produce. Nothing has yet gone: sign
in → add a lab → see it on `/labs`. That is the first thing to do with this
branch, and [track-a-lab-seed-review.md](track-a-lab-seed-review.md) names three
Bangkok labs that could not be seeded because no source could pin them — adding
them through the form is both the missing data and the dogfood run.

## Decisions taken here, worth a review

1. **Completeness is a tiebreaker, not a score.** It appears three times in the
   whole corpus and is never displayed, so the formula only has to rank a lab
   with data above a stub. Every facet is `least(count, cap) × unit` and never a
   proportion — a denominator that grows when somebody adds a fact punishes the
   contributor, which is the bug in the obvious formula.
2. **`pnpm db:backfill:completeness` has been run against `grains-dev`.** Seven
   labs recomputed, scoring 20 to 60, with the mock fixture at 100. It must be
   run against production once, after the migration and before launch, or the
   ranking tiebreaker is inert there too.
3. **Creation takes a document, not a diff.** `insertLab` and `createFilmStock`
   take a whole entity; only edits take leaves. Forcing creation through the diff
   path would land a new lab at version 2 with a founding dump of forty leaves
   burying every real edit after it.
4. **`from` admits null for every leaf**, including booleans, enums and NOT NULL
   columns. Null on the way in means the leaf did not exist yet, which is what
   adding anything looks like.
5. **Turnaround takes one input per format** in the prototype's TURNAROUND
   column — P25 resolved the way Track A resolved it on the read view.
6. **Status is not on the lab form.** The prototype does not draw it and
   `setLabStatus` is reached from the lab page, where "Mark as closed" belongs.
7. **Film stocks render hueless.** The prototype keys every tile by chemical
   process; `film_stocks` has no such column. Guessing one from a stock's name
   would invent data. See the foundation items below.
8. **Every page carries a back link** (`components/layout/back-link.tsx`),
   including `/labs`, which had none. Written as links to known places rather
   than `history.back()`, which does nothing for somebody arriving from a
   bookmark or a redirect after sign-in.
9. **Two edits to files this track does not own**, both additive and both
   explained where they are: `services` and `supplies` added to
   `edit-log-format.ts`'s opaque-key set, so a contributor's freeform row does
   not print a uuid in the log; and C-41's `--proc-ink` corrected from white to
   ink in `lab-detail.css`, which the component library specifies and both
   stylesheets had wrong.

## For the foundation PR to `main`

Two things need a migration, and migrations are frozen for Phase 2. Neither
blocks this merge; both should land before launch.

- **The CHECK constraints in `0000_init.sql` are anonymous**, so Postgres named
  them itself — `lab_pricing_check`, `_check1`, `_check2`, by declaration order.
  `lib/db/schema.ts` calls them `lab_pricing_not_empty`,
  `lab_pricing_turnaround_min_present` and `lab_pricing_turnaround_order`, names
  that exist in no database. `lib/constraint-messages.ts` is keyed on the real
  ones and `tests/actions/constraint-names.test.ts` asserts they exist, so a
  reordering fails a test rather than attaching the wrong sentence to the wrong
  rule. Naming them properly makes the mirror true again.
- **`film_stocks` has no `process` column**, which the design assumes
  everywhere films appear. Adding it makes `/films` look like the prototype
  instead of thirty-two identical grey tiles.

## Things found the hard way

- **A dropped map pin never appeared, and nothing threw or logged.** React
  mounts effects twice in development, so `BaseMap` builds a map, discards it
  and builds another; a marker held across that lands on the discarded one,
  attached to a real canvas container that is not in the document. Tie a
  marker's life to the effect that created it.
- **MapLibre writes `transform: translate(...)` onto a marker element inline**,
  so a `transform: rotate()` in a stylesheet is silently overwritten. The
  standalone `rotate` property composes with it.
- **Drizzle wraps driver errors**, so `constraint_name` is never on the error
  that is thrown — it is on `cause`. Every mapped constraint message was
  surfacing as a 500 while the mapping silently did nothing.
- **Postgres reports the first constraint a row violates**, so which message
  comes back depends on the row and not only on the mistake. A pricing cell with
  an upper turnaround bound and nothing else fails the not-empty rule before it
  reaches the one about bounds.
- **zod runs an array-level refinement even when an element has already
  failed**, so set-level rules cannot read anything a per-element transform was
  meant to attach.
- **An inline element ignores `width` and `aspect-ratio`.** Every film tile is a
  `<Link>`, so its parts are spans, and the whole grid of duotones collapsed to
  hairlines until they were made block-level.
- **Clearing async results in the effect that noticed the input was empty** is a
  synchronous `setState` in an effect. Key results to the query they answer and
  render them only while that is still what the box says — which removes the
  stale-response race at the same time.
- **A seed can be wrong in a way only another seed catches.** Five stocks went in
  as "Ilford HP5 Plus 400" and the like, putting the ISO in the name when it is
  already a column. It surfaced because `mock-lab.sql` had created "Ilford HP5
  Plus" already and the catalog ended up with two entries for one film.

## Housekeeping

- **`grains-dev` holds 32 film stocks** from
  [db/seed/film-stocks.sql](../../db/seed/film-stocks.sql), attributed to
  `@grains`. Re-running refreshes formats rather than duplicating rows, and only
  new stocks get a founding history entry. Four of them were created by
  `mock-lab.sql` first and keep that ownership.
- **The seven seeded labs now have real completeness scores.** Nothing else about
  them changed; they are still unverified against any lab, which is Phase 3.4.
- **No test data is left behind.** The action tests delete their labs and their
  `edit_history` rows — `entity_id` carries no foreign key on purpose, because
  history is polymorphic and outlives its subject, so that is a cleanup
  obligation rather than a cascade.

## Resuming

```bash
cd .claude/worktrees/directory
pnpm install
pnpm dev -p 3002
```

Copy the local environment file into the worktree first — gitignored files do not
follow worktrees, and without it every database-backed test skips itself rather
than failing.

## What Track C needs from here

- **`/api/film-stocks?q=` is live** and returns `{ film_stocks, exact_match }`.
  C3's photo metadata form is its second consumer and needs no fixture — the
  contract in `docs/api-surface.md` is what shipped.
- **`createFilmStock` is a Server Action** and can be called from the photo form
  the same way the lab form's picker calls it, so "add a stock inline" does not
  need reimplementing.
- **`/films/[id]` has an INSPIRATION slot** that says what it is waiting for.
  Composing it with `listGalleryPhotos` is Phase 3.
- **`lib/labs/photo-url.ts` is still Track A's stand-in** for `lib/storage.ts`'s
  `publicUrl` and should be deleted when the real one lands (P24). Nothing in
  Track B touched it.
- **The lab form's atmosphere-photo slot is drawn and disabled.** It is the place
  C's uploader goes.
