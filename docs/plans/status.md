# Where the project stands

Written 2026-09-08, after C6; re-checked 2026-09-09 and 2026-09-10. A cross-track snapshot, because the three
per-track progress files each tell the truth about one branch and none of them
answers "what is actually left".

**Derived from the code and from `git`, not from the other planning documents.**
That distinction earned its keep: two things the plan says are outstanding are
already built, one thing nothing mentions is a live bug, and the blocker this
file opened with had already been lifted without anyone noticing. Where this
file and [build-plan.html](build-plan.html) disagree, this one was checked more recently — but check again rather than
trusting it. Track C and most of Phase 3 are finished; what is left is mostly
not code.

---

## The one hard blocker

**The R2 write path works. The read path has never been set up.**

Re-tested 2026-09-10, and the answer changed:

```
ok    write over the S3 API  — pending/_check/5deda6f4-….png
ok    read it back (HEAD)  — 70 bytes, image/png
FAIL  public domain serves it  — NEXT_PUBLIC_R2_PUBLIC_URL is unusable:
      it is the S3 API endpoint, not a public domain
FAIL  Images transformations run  — no public domain to test
ok    delete removes it
```

`lib/storage.ts` builds its client exactly as the check does — same endpoint,
same credentials — so what this proves, the app inherits. A presigned PUT will
now land an object.

### `NotEntitled` is resolved, and the reasoning that made it a wall was wrong

The earlier entry said the account had no R2 entitlement, that no env value
could fix it, and that a support ticket was the only path. **Do not file that
ticket.** The write path answers.

The argument for it being an account state was: the same credentials returned
`NotEntitled` on the in-scope bucket and `AccessDenied` on the out-of-scope one,
so the token must be fine and only the account can be at fault. That inference
does not hold. R2 stores a token's bucket scope *with the credential*, so an
out-of-scope bucket is refused before the account is ever resolved — scope check
first, entitlement check second. The observed pair is equally consistent with an
account id that is not an R2-enabled account. It was a plausible reading of the
evidence, not a proof, and it hardened into a fact.

Whether Cloudflare's side changed or the reactivation eventually took, the
lesson is the one that keeps paying: `r2:check` is cheap, so run it before
trusting anything written here about R2.

### Why it went two days without being re-confirmed

`pnpm r2:check` exited on the *first* problem it found, which was the public
URL — a read-path variable that shares nothing with the write path. Every write
check sat behind that exit and never ran.

That is fixed. The script now reports both paths in one run, whichever fails,
and on a write failure runs `ListBuckets` (account-level, names no bucket) and
`HeadBucket` to separate an account problem from a bucket or scope problem, plus
the EU jurisdiction endpoint. **A diagnostic that stops at the first fault hides
the second one** — here it hid a blocker being lifted.

### What is actually left, and it is all in a dashboard

Steps 2, 3 and 5 of [r2-setup.md](r2-setup.md), none of which involve code:

- **Step 2 — bind a public custom domain** to `grains-photos-dev`, proxied
  (orange cloud), then set `NEXT_PUBLIC_R2_PUBLIC_URL` to it. Until this lands,
  **every image URL in the app points at the S3 API**, which answers 401 to an
  unsigned request. `publicUrl` is doing what it is told; it is told the wrong
  origin. Amp's Laboratory's atmosphere strip renders broken frames for this
  reason as much as for the missing objects.
- **Step 3 — the `pending/` lifecycle rule.** It is the orphan cleanup that
  replaces a cron job, and nothing in the code substitutes for it.
- **Step 5 — enable Images transformations on the zone.** Without it an
  unresized 6000 px scan is served whole.

Then re-run `pnpm r2:check`; all five lines should read `ok`.

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

## Three defects found while checking

Neither appears in any other document.

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

---

## What needs a person

Ordered by how much each unblocks, not by effort.

1. **Do steps 2, 3 and 5 of [r2-setup.md](r2-setup.md)** — custom domain,
   `pending/` lifecycle rule, Images transformations — and then set
   `NEXT_PUBLIC_R2_PUBLIC_URL` to that domain. This is now the whole of the R2
   work: the write path answers, so binding the domain is what makes every image
   URL in the app point somewhere that can serve an image. ~~File the Cloudflare
   support ticket for `NotEntitled`~~ — no longer needed, see the blocker above.
2. **Upload three images at the fixture's keys** — the query that prints them is
   in [track-c-progress.md](track-c-progress.md). This renders Amp's
   Laboratory's atmosphere strip and exercises the custom domain, `publicUrl`,
   the image loader and Cloudflare's transformations in one go. P23 has never
   been exercised, and this is the cheapest way to prove it.
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
7. **Launch:** publish the Google consent screen, custom domain and HTTPS on
   Vercel, the production bucket, and a complete production environment — then
   **verify Vercel's Production environment actually overrides `R2_BUCKET`.**
   If it does not, production uploads land in the development bucket and nothing
   errors: the credentials are valid, the bucket exists, the write succeeds. It
   surfaces later as production photos that 404.

---

## Decisions waiting on you

| Decision | Why it matters now |
| --- | --- |
| **The upload cap number** | 50 is a placeholder the PRD explicitly defers. It is in `lib/photos/limits.ts` and the profile's cap meter will display it |
| **The artist's-note length** | 300 characters, read off PRD D #7's "2–3 lines". PROPOSED, and enforced only in `app/u/actions.ts` |
| **Whether a photobook slug should follow its title** | It does not: minted once, never changed, so a rename cannot break a shared link. PROPOSED — the alternative needs a redirect table |
| **Where a Photo in no Photobook surfaces on `/u/@username`** | **Answered, PROPOSED:** on its owner's profile under "NOT IN A PHOTOBOOK · N", owner-only. A visitor's view stays curated sets. Overturning it is one section and one query |
| **The 25 MB ceiling and the JPEG/PNG/WebP/AVIF allowlist** | Both PROPOSED in `lib/photos/limits.ts`. Nothing upstream specifies either; widening the list later is one line, narrowing it after people have uploaded is not |
| **Reverse search → map filter UI** | The schema and `/api/labs` already support `film_stock_id`, so this is only a UI question |
| **The bilingual strategy, on paper twice** | `00_BACKLOG` lists it as unresolved while P22 already decides it (a hand-rolled `lib/i18n.ts`, not next-intl). Reconcile the two so 3.3 does not re-litigate it |

---

## Merge state

`develop` is **59 commits ahead of `main`** — nothing since the architecture
blueprint has reached `main`.

Track C's work — C2 through C5 — is **four commits on
`claude/c2-storage-image-loader-a6c43f`, local only.** The branch has not been
pushed and there is no pull request. Everything else on the shelf is already
merged into `develop`.
