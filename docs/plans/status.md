# Where the project stands

Written 2026-09-08, after C6; re-checked 2026-09-09 and twice on 2026-09-10.
A cross-track snapshot, because the three per-track progress files each tell the
truth about one branch and none of them answers "what is actually left".

**Derived from the code and from `git`, not from the other planning documents.**
That distinction earned its keep three times over: two things the plan called
outstanding were already built, one live bug appeared in no document at all, and
the blocker this file opened with had been lifted without anyone noticing —
twice, for two different reasons. Where this file and
[build-plan.html](build-plan.html) disagree, this one was checked more recently;
check again rather than trusting it.

**Track C and Phase 3 are finished, and photos work end to end.** What is left
is one code task that needs an account, a handful of things only a person can
do, and a production hardening step that is deferred rather than done.

---

## No hard blocker any more

**Photos work end to end.** A real upload went through the app on
2026-09-10: signed PUT, `confirmPhoto`, the object moved into
`photos/{userId}/{uuid}`, and it renders. The `NotEntitled` wall, then the
missing read origin, are both gone.

```
ok    write over the S3 API
ok    read it back (HEAD)
ok    public domain serves it  — HTTP 200
warn  Images transformations — not available on an r2.dev URL
ok    delete removes it
```

### The two things that were actually wrong, and neither was in this file

**CORS, which [r2-setup.md](r2-setup.md) never mentioned.** Six steps, none of
them the one that makes a browser upload work. Every upload failed with a `403`
on the preflight, which surfaces in the browser as an unexplained "CORS error"
and in the app as nothing at all — the PUT never happens, so no code path runs.

The missing line was `AllowedHeaders`. The browser sends
`Content-Type: image/jpeg` with the PUT, deliberately: R2 records that header,
serves the object back with it, and `confirmPhoto` reads the recorded type to
decide whether to keep the object. A `Content-Type` outside the three
CORS-simple values triggers a preflight that must authorise it *by name*, and
R2 refuses without it. **The fix was the bucket policy, not the code.** There is
now a step 7 in r2-setup.md with the policy and two `curl` commands that
diagnose it without a browser.

**`pnpm r2:check` cannot catch that class of bug.** It runs in Node, where CORS
does not exist, so it passed while every real upload failed. It reports the
server path and is silent about the browser path — the same shape as the defect
fixed in it that morning, where one early `process.exit` hid a blocker being
lifted.

### The read origin: working, on a fallback

`NEXT_PUBLIC_R2_PUBLIC_URL` is R2's **public development URL**,
`https://pub-<hash>.r2.dev`, not a custom domain. That is a deliberate,
documented fallback for having no domain on Cloudflare yet, and it is
local-only:

- **No resizing.** `/cdn-cgi/image/` only runs on a zone somebody configured,
  and `r2.dev` is Cloudflare's hostname. `lib/image-loader.ts` detects the host
  and serves objects untransformed; `next.config.ts` declares `unoptimized` so
  `next/image` is told the truth rather than warned at. One uploaded frame
  measured **4.3 MB**, so a photobook of twenty is roughly 85 MB.
- **Rate-limited, uncached, and on a hostname we do not control**, with every
  storage key published against it.

`pnpm r2:check` passes and prints *"NOT ready for production"* on every run.

### What is left, and it is no longer urgent

- **Step 2 — bind a public custom domain**, proxied (orange cloud), and point
  `NEXT_PUBLIC_R2_PUBLIC_URL` at it. **Before launch, not before more work.**
- **Step 5 — Images transformations on the zone.** Meaningless until step 2.
- **Step 3 — the `pending/` lifecycle rule**, if it is not already set. It is
  the orphan cleanup that replaces a cron job, `r2:check` does not test it, and
  nothing in the code substitutes for it. **This one is worth confirming now.**
- **Add the production origin to the CORS policy at launch.** `localhost` alone
  fails there exactly the way a missing `AllowedHeaders` failed locally.

### Still true

The **fixture objects were never uploaded**. `photos/…/mock-photo-1` and its
siblings return 404 — the rows are seeded, the objects are not — so Amp's
Laboratory and the mock photobook still render broken frames. That is the
"upload three images at the fixture's keys" task, not a defect.

---

## Where each track stands

| Track | State |
| --- | --- |
| **Ticket 0/1** — scaffold, migration | done, merged |
| **A** — lab discovery & map | A1–A7 done, merged into `develop` |
| **B** — curation & invariants | B1–B5 done, merged into `develop` |
| **C** — media & photobooks | **complete.** C1 done bar the entitlement; C2–C7 done |
| **Phase 3** — integration & ship | 3.1, 3.2, 3.3 and 3.5 done; see below |
| **Phase 4** — hardening | reverse-search filter done; Sentry needs an account |

The whole suite is **301 tests, green, nothing skipped**, run against
`grains-dev` with no residue left behind.

**Counted, as of 2026-09-09: 11 code tasks, 12 that need a person, and 6 open
decisions.** No feature area is unbuilt — A, B and C are all complete.

---

## What is left to build

### Track C

| Step | State |
| --- | --- |
| **C5** `app/u/actions.ts` — photobook CRUD, `addToPhotobook`, remove, reorder | done, 31 tests |
| **C6** `/u/[username]`, photobook detail, photo detail in book context | done. Driven in a browser against `db/seed/mock-photobook.sql`, owner-only branches included |
| **C7** tests | **done.** All five items the plan lists — cap counts originals only, self-connection rejected, delete cascades items, `alsoAppearsIn` counts across users, `confirmPhoto` refuses a key outside the caller's `pending/` prefix — are written and passing |

### Phase 3 — two corrections to the plan

**3.2 badges is already built.** `toggleLabBadge` is in
`app/labs/[id]/actions.ts` and `components/labs/lab-badges.tsx` calls it. Track B
shipped it. The build plan still lists it as an afternoon of Phase 3 work; it is
not.

**3.1 is done.** The film-stock gallery is `PhotoGrid` over
`listGalleryPhotos`, with a denser column width for a wall of many people's
frames and "by" rather than "via" under each — every frame there is by the
person named, and calling that "via" is the soft version of gap plan K3. The
lab form's atmosphere slot is wired to `requestUploadUrl` + `confirmLabPhoto`,
and stays disabled while *creating* a lab because a key is
`labs/{labId}/{uuid}` and there is no id yet.

Two prototype deviations recorded in the code rather than resolved: the
gallery has no format/scanner filter chips (they need a query that takes more
than a stock and a cursor), and "+ Add a sample" links to your profile instead
of opening a second uploader, because PRD D #10 put the upload surface next to
the cap meter that constrains it.

**3.3 shell and polish is done.** `app/not-found.tsx`, `app/error.tsx`,
`app/sitemap.ts`, `app/robots.ts`, the section nav, and `lib/i18n.ts` with the
Thai face and `<html lang>` (P22) all landed on `claude/phase-3-app-shell`.

**3.5 is done too** — [runbook.md](../runbook.md) covers a dead site, a paused
database, a production migration, a rotated credential and a restore. It says
out loud which parts have never been rehearsed, and that the free tier takes no
backups at all, so today there is nothing to restore *from*. That is the
document's biggest finding and it is a plan decision, not an operational one.

Four notes on what landed:

- **The nav has two items, not the prototype's three.** Labs and Film stocks.
  The prototype's chrome also carries "Photobooks", but that predates PRD D #9 —
  the Connection graph is the only discovery path, so there is no global
  photobook index for a tab to open, and a person's own photobooks are already
  the `@username` link. Recorded in `components/layout/site-nav.tsx`.
- **The links show at every width.** The prototype hides them below its desktop
  breakpoint because mobile gets a `Labs · Films · + · Profile` bottom tab bar.
  That bar is not built, and hiding the links to match would reproduce exactly
  the bug they fix. When the bar is built, this is what moves into it.
- **`robots.txt` is closed by default and only opens on production.** A Vercel
  preview is the whole app on a public hostname reading `grains-dev`, which
  holds unverified seed prices for real, named businesses.
- **A long handle now truncates in the header.** A username may be 30
  characters, and signed in at 375px the page measured 395px — horizontal
  scroll on every screen of the site. The handle is the only unbounded element
  in the header, so it is the one that gives; the full value stays in `title`.
  Anything added to that row has to be measured at 375px signed *in*.

**One trap worth knowing, found the hard way here.** `execute<T>()` is an
unchecked cast: it tells TypeScript what to believe and verifies nothing. The
sitemap's timestamps were annotated `Date`, compiled clean, type-checked clean,
and were strings at runtime — and Postgres renders `timestamptz` as
`2026-09-10 07:17:41.55411+00`, which is not a valid `<lastmod>`. Next writes a
string into the XML untouched, so the entire sitemap would have been
syntactically wrong while every check in the repo passed. `films.ts` and
`labs.ts` already type their timestamps as `string` for this reason; the fix was
to match them and normalise in SQL. **Nothing but a test that reads a real row
catches this class of bug.**

Two items on that list are already done and should not be rebuilt:

- **`generateMetadata` for profiles**, added by C6 across all three `/u` routes.
  Labs and films already had theirs.
- **A keyboard-reachable alternative to the map.** `/labs` renders a real `<ul>`
  of lab cards beside the map, from Track A. What is left is an accessibility
  pass, not a build.

**One more the plan lists that is already correct:** 3.1's "correct the
signed-URL wording in 00_BACKLOG (P19)". That file's upload flow already says
type and size are enforced in `confirmPhoto`, and explains why they moved out
of the signature.

**Phase 4 — reverse search is built; Sentry is not.**

The reverse-search map filter is done and marked PROPOSED, per the note in the
open-decisions list that it was a UI question with the schema and handler
already behind it. `/labs?stock=<id>` filters the map and result list, and a
film stock's page links into it with "Find these on the map" — shown even when
the 10 km list found nothing, since that is exactly when somebody wants to
widen the search. The chip sits above the other filters and removes rather than
toggles, because it was set by a link from another page and there is nothing
here to turn back on.

**Sentry needs you, not code.** It wants a Sentry account and a DSN, and the
task's own acceptance test is a planted error from each runtime — which cannot
be verified without one. The call site is already there:
`app/error.tsx` logs to the console with a comment naming it. See the human
list below.

---

## Defects found while checking

None of these appeared in any other document, and all but the last are fixed.
The pattern is worth naming: **every one was found by running something, not by
reading it.** Type checking, linting and the test suite were green through all
of them.

**~~The site header links somewhere that does not exist.~~ FIXED by C6.**
`components/layout/site-header.tsx:29` sends a signed-in user to
`/u/{username}`, which had not been built — signing in and clicking your own
name was a 404. The route exists now.

**~~`next build` requires a live database.~~ FIXED on
`claude/phase-3-app-shell`.** `/films` and `/films/[id]` declared no `dynamic`
export, so they were statically prerendered and the build queried Postgres.
Supabase's free tier pauses a project after 7 days of inactivity, so **a deploy
after a quiet week failed at build time**, not at runtime, and the error read as
a missing environment variable rather than as a paused project.

Reproduced before fixing, by building `develop` in a worktree with no
environment file: `Error occurred prerendering page "/films"` … `Missing or
invalid environment variables: DATABASE_URL, …`. Both pages now declare
`force-dynamic`, and the same build succeeds. `app/sitemap.ts` declares it too,
for the same reason — a sitemap generated at build would have reintroduced the
defect on its first day.

**One correction to the original entry:** it listed `/` as a third page that
queried Postgres. It does not. `app/page.tsx` is a placeholder `<h1>` with no
data of any kind, so only the two film routes were ever affected.

*Not* fixed by this: `revalidate` would not have worked. An ISR page is still
prerendered at build, so it queries the database exactly when the problem
occurs. Supabase Pro remains the other half of the answer, for the runtime pause
rather than the build one.

**Two `/u/` URLs serve the same page.** `handleOf` in the profile route strips
a leading `@`, so `/u/@amp` and `/u/amp` both render — but every link in the
application uses the bare form, including all nine `revalidatePath` calls in
`app/u/actions.ts`. The sitemap therefore lists the bare form, since the `@`
form would advertise URLs no revalidation ever refreshes. What is still missing
is a `canonical` in the three `/u` routes' `generateMetadata`, so a crawler that
finds the `@` form from somewhere is told which one counts. Small, and not done
here because those are Track C's files.

**~~The sitemap's dates were invalid in every entry.~~ FIXED.** `execute<T>()`
is an unchecked cast — it tells TypeScript what to believe and verifies
nothing — so annotating a timestamp column `Date` compiled clean, type-checked
clean, and was a string at runtime. Postgres renders `timestamptz` as
`2026-09-10 07:17:41.55411+00`: a space instead of `T`, an offset without
minutes, and not a W3C Datetime. Next writes a string into `<lastmod>`
untouched, so the whole document would have been syntactically wrong while every
gate in the repository stayed green. `films.ts` and `labs.ts` already typed
theirs as `string`; the fix was to match them and convert in SQL. **Nothing but
a test that reads a real row catches this class of bug.**

**~~The header scrolled sideways when signed in.~~ FIXED.** A username may be 30
characters, and at 375px the page measured 395px — horizontal scroll on every
screen of the site, not just one. The handle was the only unbounded element in
the header, so it truncates now, with the full value in `title`. Found because
the check was run signed *in*; signed out it fitted exactly, which is the easy
case and the wrong one.

**~~`next/image` warned on every image under the `r2.dev` fallback.~~ FIXED.**
A custom loader must put the requested `width` into the URL it returns, and the
fallback cannot — so `next.config.ts` now declares `unoptimized` for that
origin, which is simply the truth. The tempting alternative, appending an inert
`?width=`, would have passed the check by asserting something false.

---

## What needs a person

Ordered by how much each unblocks, not by effort.

1. **Upload three images at the fixture's keys** — the query that prints them is
   in [track-c-progress.md](track-c-progress.md). Those objects were never
   uploaded, so Amp's Laboratory and the mock photobook render broken frames
   against real rows. Everything else in that path is now proven by a real
   upload, so this is the last thing standing between the app and looking
   finished.
2. **Confirm the `pending/` lifecycle rule exists** (step 3 of
   [r2-setup.md](r2-setup.md)) — delete after 1 day, prefix `pending/`. It is
   the orphan cleanup that replaces a cron job, `pnpm r2:check` does not test
   it, and nothing in the code substitutes for it. Two minutes, and it is the
   only R2 item that matters before launch.
3. **Create a Sentry project and give me the DSN.** It is the one code task
   left and it cannot be finished without an account: the free tier needs
   signing up for, and the acceptance test is a planted error caught from each
   runtime, which needs a real DSN to catch it. Until then the product has no
   alerting at all, and the first report of an outage will be a person — see
   the last section of [runbook.md](../runbook.md).
4. **Verify the seven seeded Bangkok labs.** Nothing in
   `db/seed/bangkok-labs.sql` has been checked against an actual lab — prices
   first, then hours. The seeded edit-history note says so on every listing until
   somebody corrects it.
5. **Add the three labs A6 could not pin** — A&B Digital Lab, Flashbox Filmlab,
   Warinda Studio. Drafted in
   [track-a-lab-seed-review.md](track-a-lab-seed-review.md); only the map pin was
   missing.
6. **Review the film-stock seed.**
7. **Bind a public custom domain to the bucket** (steps 2 and 5 of
   [r2-setup.md](r2-setup.md)), proxied, and point
   `NEXT_PUBLIC_R2_PUBLIC_URL` at it. **Required before launch, deferred until
   then.** Today the app reads from `r2.dev`: no resizing, so 4.3 MB per frame
   and roughly 85 MB for a photobook of twenty; rate-limited; and every storage
   key published on a hostname we do not control. Fine while building, wrong the
   moment a stranger loads a page. Needs a domain on Cloudflare, which is the
   real prerequisite and is not a five-minute job if you do not have one.
8. **Launch:** publish the Google consent screen, custom domain and HTTPS on
   Vercel, the production bucket, a production CORS policy carrying the
   production origin, and a complete production environment — then **verify
   Vercel's Production environment actually overrides `R2_BUCKET`.** If it does
   not, production uploads land in the development bucket and nothing errors:
   the credentials are valid, the bucket exists, the write succeeds. It surfaces
   later as production photos that 404.

---

## Decisions waiting on you

| Decision | Why it matters now |
| --- | --- |
| **The upload cap number** | 50 is a placeholder the PRD explicitly defers. It is in `lib/photos/limits.ts` and the profile's cap meter will display it |
| **The artist's-note length** | 300 characters, read off PRD D #7's "2–3 lines". PROPOSED, and enforced only in `app/u/actions.ts` |
| **Whether a photobook slug should follow its title** | It does not: minted once, never changed, so a rename cannot break a shared link. PROPOSED — the alternative needs a redirect table |
| **Where a Photo in no Photobook surfaces on `/u/@username`** | **Answered, PROPOSED:** on its owner's profile under "NOT IN A PHOTOBOOK · N", owner-only. A visitor's view stays curated sets. Overturning it is one section and one query |
| **The 25 MB ceiling and the JPEG/PNG/WebP/AVIF allowlist** | Both PROPOSED in `lib/photos/limits.ts`. Nothing upstream specifies either; widening the list later is one line, narrowing it after people have uploaded is not |
| ~~**Reverse search → map filter UI**~~ | **Answered, PROPOSED:** `/labs?stock=<id>`, with a removable "Carries" chip above the other filters and "Find these on the map" on a stock's page. Built, so overturning it now means changing a UI rather than choosing one |
| **The bilingual strategy, on paper twice** | Settled in code — P22's hand-rolled `lib/i18n.ts` is built and `00_BACKLOG` still lists the question as open. The remaining work is deleting the stale entry, not making the decision |

---

## Merge state

`develop` is **76 commits ahead of `main`** — nothing since the architecture
blueprint has reached `main` — and **17 of those are unpushed**.

Track C and Phase 3 are both merged into `develop`. Two later commits — the
`unoptimized` declaration for `r2.dev` and the `.env.example` documentation —
are still only on `claude/phase-3-app-shell`.

**Everything from 2026-09-09 and 2026-09-10 exists on one laptop.** Nothing is
pushed, there is no pull request, and no deployment exists. That is the largest
single risk on this page and the cheapest one to remove.
