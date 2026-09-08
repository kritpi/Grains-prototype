# Where the project stands

Written 2026-09-08, after C5. A cross-track snapshot, because the three
per-track progress files each tell the truth about one branch and none of them
answers "what is actually left".

**Derived from the code and from `git`, not from the other planning documents.**
That distinction earned its keep: two things the plan says are outstanding are
already built, one thing nothing mentions is a live bug, and the R2 status could
not be re-tested at all. Where this file and [build-plan.html](build-plan.html)
disagree, this one was checked more recently — but check again rather than
trusting it, because it goes stale the moment C6 lands.

---

## The one hard blocker

**R2's S3 API returns `NotEntitled` (403, code 10042).**

It is an account state on Cloudflare's side, not a configuration error. The
subscription reads Active, the dashboard uploads objects happily, and the token
is correctly scoped — proven by the two buckets returning *different* errors for
the same credentials: `NotEntitled` on the bucket the token covers,
`AccessDenied` on the one it does not. Cancelling and reactivating the
subscription, then reissuing the token, changed nothing.

What it blocks is exactly one thing, and it is worth stating precisely because
it is narrower than it sounds:

- **Blocked:** any real object moving through the upload path. No `confirmPhoto`
  has ever seen a real object. `requestUploadUrl` signs, and the browser's PUT
  then fails.
- **Not blocked:** everything else. C2 through C5 are written and tested
  against a real database without it, and C6 can be too.

Do not re-diagnose it. Run `pnpm r2:check`; if it still says `NotEntitled`,
nothing in this repository will fix it and a support ticket is the only path.

### It cannot currently be re-confirmed, and that is its own finding

`pnpm r2:check` run on 2026-09-08 does not reach the entitlement at all. It
stops on the step before:

```
NEXT_PUBLIC_R2_PUBLIC_URL is the S3 API endpoint, not a public domain.
```

**Step 2 of [r2-setup.md](r2-setup.md) — binding a public custom domain to the
bucket — has not been done.** That is why the variable still holds the S3
endpoint, and the check refuses to go further rather than testing against a URL
that could never serve an image.

Two things follow, and they reorder the work below:

- The `NotEntitled` diagnosis is the last *confirmed* observation, not a current
  one. It may or may not still be true; nobody can tell until step 2 lands.
- **Every image URL the app builds today points at the S3 API**, which answers
  401 to an unsigned request. `publicUrl` is doing exactly what it is told; it
  is told the wrong origin. Amp's Laboratory's atmosphere strip renders broken
  frames for this reason as much as for the missing objects.

---

## Where each track stands

| Track | State |
| --- | --- |
| **Ticket 0/1** — scaffold, migration | done, merged |
| **A** — lab discovery & map | A1–A7 done, merged into `develop` |
| **B** — curation & invariants | B1–B5 done, merged into `develop` |
| **C** — media & photobooks | C1 done bar the entitlement; C2–C5 done; **C7 effectively done**; **C6 is the last step** |
| **Phase 3** — integration & ship | partly done ahead of schedule, see below |
| **Phase 4** — hardening | not started |

The whole suite is **295 tests, green, nothing skipped**, run against
`grains-dev` with no residue left behind.

---

## What is left to build

### Track C

| Step | State |
| --- | --- |
| **C5** `app/u/actions.ts` — photobook CRUD, `addToPhotobook`, remove, reorder | done, 31 tests |
| **C6** `/u/[username]`, photobook detail, photo detail in book context | not started. **The largest remaining piece of work in the project**, and the last step of Track C |
| **C7** tests | **done.** All five items the plan lists — cap counts originals only, self-connection rejected, delete cascades items, `alsoAppearsIn` counts across users, `confirmPhoto` refuses a key outside the caller's `pending/` prefix — are written and passing |

### Phase 3 — two corrections to the plan

**3.2 badges is already built.** `toggleLabBadge` is in
`app/labs/[id]/actions.ts` and `components/labs/lab-badges.tsx` calls it. Track B
shipped it. The build plan still lists it as an afternoon of Phase 3 work; it is
not.

**3.1 is half done.** `NearbyLabs` is wired into `/films/[id]`, and the photo
metadata form already uses Track B's real film-stock typeahead rather than the
fixture the plan assumes it would need. What remains of 3.1:

- the film-stock gallery grid on `/films/[id]` — the slot is drawn and says what
  it is waiting for; it needs C6's grid to reuse
- the lab form's atmosphere-photo slot, still a disabled `+`, wired to
  `requestUploadUrl({ kind: 'lab_atmosphere' })` + `confirmLabPhoto`

**3.3 shell and polish** is untouched: `app/not-found.tsx`, `app/error.tsx`,
`app/sitemap.ts`, `app/robots.ts`, `lib/i18n.ts` with the Thai fallback font,
`generateMetadata` for profiles (labs and films already have it), and the
keyboard-accessible alternative to the map.

**Phase 4** — Sentry on both runtimes, paid tiers when their triggers fire.

---

## Two defects found while checking

Neither appears in any other document.

**The site header links somewhere that does not exist.**
`components/layout/site-header.tsx:29` sends a signed-in user to
`/u/{username}`, and `app/u/` has not been built. Signing in and clicking your
own name is a 404 today. C6 closes it; until then it is the first thing a new
user does after authenticating.

**`next build` requires a live database.** `/`, `/films` and `/films/[id]`
declare no `dynamic` export, so they are statically prerendered and the build
queries Postgres. That works on Vercel while the database is awake — but
Supabase's free tier pauses a project after 7 days of inactivity, so **a deploy
after a quiet week fails at build time**, not at runtime, and the error will
read as a missing environment variable rather than as a paused project. Fix it
before launch by either setting `revalidate` or `force-dynamic` on those three,
or by going Supabase Pro, which ends the pause and is already on the Phase 4
list for other reasons.

---

## What needs a person

Ordered by how much each unblocks, not by effort.

1. **File the Cloudflare support ticket for `NotEntitled`.** It gates every real
   upload and nothing in the repository can work around it.
2. **Do steps 2, 3 and 5 of [r2-setup.md](r2-setup.md)** — custom domain,
   `pending/` lifecycle rule, Images transformations — and then set
   `NEXT_PUBLIC_R2_PUBLIC_URL` to that domain. **Do this before 1, or at least
   alongside it.** These are the *read* path and the entitlement does not block
   them; more to the point, `r2:check` stops here and never reaches the
   entitlement, so until this is done nobody can tell whether Cloudflare has
   fixed their side. It is also what makes every image URL in the app point
   somewhere that can serve an image.
3. **Upload three images at the fixture's keys** — the query that prints them is
   in [track-c-progress.md](track-c-progress.md). This renders Amp's
   Laboratory's atmosphere strip and exercises the custom domain, `publicUrl`,
   the image loader and Cloudflare's transformations in one go. P23 has never
   been exercised, and this is the cheapest way to prove it.
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
| **Where a Photo in no Photobook surfaces on `/u/@username`** | Partly blocks C6 — `getProfile` returns Photobooks only, and PRD D #10 leaves this open. Gap plan J11 |
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
