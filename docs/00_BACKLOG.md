# Tech decisions — the lean blueprint

Replaces the nine-topic `tech-decisions-backlog.md`, deleted 2026-09-06 — recoverable with `git show 5c930d9:docs/tech-decisions-backlog.md` if the rationale behind a pruned topic is ever wanted. Same product, one engineer, three decisions.

The old backlog wasn't wrong so much as *sized for a different company*. It ranked nine infrastructure topics, resolved two of them across roughly 250 lines, and left the remaining seven — provider selection, environment matrices, observability stacks, Redis cache keys — queued ahead of the first line of application code. For a solo MVP with zero users that ordering inverts the actual risk: the thing most likely to kill Grains is not an unpooled connection, it is nine months of infrastructure decisions and no product.

So: **three pillars, decided here, and a build order.**

## What was cut, and why

| Cut | Why it was there | Why it goes |
| --- | --- | --- |
| Redis / cache-aside (old §9) | ranked last already | No traffic means no measured hot path. Next.js `revalidate` + Vercel's CDN covers every public page for free. Revisit when a real query is measurably slow, not before. |
| OpenAPI spec + codegen + CI freshness check (old §1.2, §2.2–2.3) | protection against FE/BE drift | The drift it protects against only exists because of the split. Remove the split and the protection is TypeScript, for free. |
| Five-file hexagonal Go packages (old §2.5–2.6) | uniformity for agent predictability | Six files per endpoint is the opposite of agent-friendly when four of them are pass-throughs. One rule survives: SQL lives in exactly one directory. |
| `infra/` + Terraform (old §2.1) | reproducible infrastructure | Two dashboards, configured once. Terraform for two SaaS projects is ceremony with a state file attached. |
| local → staging → production (old §7) | environment isolation | Two environments. Staging with no users is production with worse data. |
| ~~Multi-vendor storage/CDN split (old §6)~~ **reversed 2026-09-08** | zero egress fees on R2 | Cut on "irrelevant at zero, revisit at the first egress bill that stings". Revisited before any bill, because the reason for cutting it turned out not to hold — see [Object storage: R2, not Supabase](#object-storage-r2-not-supabase-reversed-2026-09-08). |
| Observability tooling as a decision (old §8) | ops maturity | It is one line: Sentry's free tier, plus the host's logs. Not a topic. |
| Priority-ranking exercise itself | sequencing the nine | Three decisions don't need a ranking table. |

Kept from the old document, because none of it was bloat: **Singapore co-location**, **photos never transit the app server**, **PostGIS for correctness not speed**, **the content-integrity rule enforced by schema**, **a version column present in the first migration**, and **no Redis**.

---

## Pillar 1 — Stack architecture

**Decision: one Next.js application.** App Router, Server Components for reads, Server Actions for writes, Drizzle over Postgres. No separate backend service, no wire contract, no second language, one deploy.

### Request flow

```
Server Component  →  lib/queries/*.ts  →  Postgres        (reads, no HTTP hop)
Server Action     →  lib/queries/*.ts  →  Postgres        (writes, one transaction)
Route Handler     →  lib/queries/*.ts  →  Postgres        (only what the browser fetches after load)
```

One discipline survives from the old hexagonal plan: **SQL exists only in `lib/queries/`**. Pages, actions and handlers call those functions and never write SQL inline. That is the boundary worth having; the other four layers were paying for a database swap that a PostGIS-dependent product can never perform. Full surface in [api-surface.md](api-surface.md).

### Map and URL state — PROPOSED

Added at scaffold time from the build brief rather than argued here: **MapLibre GL JS** with **CARTO Positron** tiles for the map, and **nuqs** for keeping map and filter state in the URL. All three are cheap to overturn before the discovery track starts, since no schema or hosting decision depends on them. They are written down rather than left implicit because otherwise the discovery track picks something on the day and it becomes a decision by accident.

### Rationale

- **Server Components delete the API for reads.** A lab page, a film gallery and a profile are all server-rendered — which this product needs anyway for SEO, since discovery is the point. Under the split, every one of those renders was Next → Go → Postgres. Now it is a function call. That is not a small saving; it is most of the endpoints.
- **The hardest open question disappears.** Old §5's central problem was how a Go service verifies a session the frontend's auth provider created. In one process, `auth()` returns the session. The decision evaporates rather than getting answered.
- **Agent-assisted development is the stated primary mode** (old §2.1). Adding an endpoint went: edit `openapi.yaml` → regenerate → `lab.go` → `repository.go` → `postgres.go` → `service.go` → `http.go` → regenerate the client. It now goes: add a query function, call it. Fewer files per task is worth more to an agent than uniform files per task.
- **The old objection to serverless doesn't apply here.** Old §1.3 ruled out per-request functions because 50 concurrent invocations means 50 database connections. Supabase's transaction pooler is built for precisely that; `postgres.js` with `prepare: false` against port 6543 handles it, and the free tier allows 200 client connections against traffic that will be near zero. The *other* half of §1.3 — region co-location — was the expensive-to-reverse half, and it is kept in full.

### Costs knowingly accepted

- **The developer wanted to write Go, and this takes that away.** That was the honest, primary and legitimate reason the old §1 chose a Go service, and nothing in this document refutes it — it is a preference, and preferences about what you enjoy building are load-bearing on a solo side project. See the override note below.
- Vendor gravity toward Vercel. Server Actions and RSC run elsewhere, but not without work.
- No language boundary means no structural guard against business logic leaking into components. Mitigated only by the `lib/queries/` rule and by keeping `updateLab` — the one endpoint with real invariants — as a single transactional function.

### Override note — if you want the Go backend anyway

That is a sufficient reason on its own and costs no credibility; it was chosen on preference and reversing a preference-based decision is free. But take the *lean* Go shape, not the old one:

- Go + `chi` + `sqlc`. No hexagonal five-file packages, no service layer where there is no logic.
- No OpenAPI codegen. Roughly 20 endpoints and one consumer — a hand-written `lib/api.ts` with typed fetch wrappers is a smaller, more honest cost than the generate/commit/CI-check pipeline.
- Next.js still server-renders, so it calls the Go service over private networking in the same Singapore region.
- Auth becomes real work again: the Go service must verify the Auth.js JWT. Budget a day for it, and use a shared `AUTH_SECRET` with HS256 rather than standing up JWKS.

Everything else in this document — the schema, the data layer, hosting, the build order — holds unchanged under either branch.

---

## Pillar 2 — Data layer

**Decision: PostgreSQL 15 + PostGIS on Supabase, Singapore (`ap-southeast-1`). Drizzle ORM. Raw SQL migrations. No cache.**

Full DDL: [db/migrations/0000_init.sql](../db/migrations/0000_init.sql), mirrored by `lib/db/schema.ts`.

### The pieces

- **Supabase over Neon** on one argument: this is a photo product, so object storage is needed on day one. Neon's branching is genuinely better, but picking it means a second vendor for storage anyway. One vendor, one dashboard, one bill wins at this size. Accepted: Supabase's free tier pauses a project after 7 days of inactivity, and its branching is weaker than Neon's. **That argument no longer holds** — storage moved to R2 on 2026-09-08, so the second vendor exists regardless. Not enough on its own to revisit the database, which is chosen for PostGIS and Singapore rather than for bundling, but the reasoning above should not be read as still standing.
- **Drizzle, not Prisma** — schema-as-TypeScript, types inferred rather than generated, and it gets out of the way when a query needs raw SQL, which every geospatial query does.
- **Migrations are raw `.sql` files** applied by `drizzle-kit`. PostGIS DDL is hand-written. This was already the right call in the old §7 and survives the prune intact.
- **PostGIS is for correctness, not speed.** At tens to low hundreds of labs, haversine over float columns would also run in well under a millisecond. It stays because the usual hand-rolled substitute is a bounding box — which returns a square, so a lab 7km away shows up in a "5km" search — and because hand-written haversine invites an earth-radius constant that differs between the `WHERE` and the `ORDER BY`, silently filtering and sorting by different distances. `ST_DWithin` is one line and correct. Do not cite performance as its justification.
- **No Redis.** See the cut table.

### Three invariants the schema enforces structurally

1. **`photos` has no `lab_id` column and never will.** The content-integrity rule ([CONTEXT.md](../CONTEXT.md)) is enforced by the absence of a column, which no code path in any language can violate — strictly stronger than application-layer filtering. Lab Atmosphere Photos live in a separate `lab_photos` table for exactly this reason; they are not `Photo` in the CONTEXT.md sense.
2. **A lab cannot be priced for a process it doesn't offer.** `lab_pricing` has a composite foreign key to `(lab_id, process)` in `lab_processes`. This is what makes "blank cell" and "not offered" distinguishable, as PRD A #1 requires.
3. **Only curated services and supplies are indexed.** The partial indexes cover `WHERE service_key IS NOT NULL`, so contributor freeform entries can display but can never back a filter (PRD A #2) — the rule is in the index definition, not in a code review.

### Same-field edit collision — PROPOSED

The old backlog flagged this as blocking the first migration, correctly. Proposed resolution, cheap to overturn before implementation:

**Whole-row optimistic concurrency on `labs.version`, with per-leaf-path diffs in `edit_history`.** An edit sends the version it loaded; `UPDATE labs SET …, version = version + 1 WHERE id = $1 AND version = $2` affects zero rows if someone got there first, and the form reloads showing what changed. Diffs record individual leaf values (`pricing.c41.135.price_thb`), not field groups, so the history log stays precise.

This is slightly pessimistic — two contributors editing genuinely different fields will collide. At this traffic that is approximately never, and the alternative (per-field version vectors) is a large amount of machinery to avoid a conflict dialog nobody will see. The column exists in the first migration, which is the part that could not be retrofitted cheaply.

---

## Pillar 3 — Hosting & auth

**Decision: Vercel + Supabase, both Singapore. Auth.js v5 with Google. Two environments.**

| Concern | Choice | Note |
| --- | --- | --- |
| Hosting | Vercel Hobby, function region `sin1` | `export const preferredRegion = 'sin1'` — a US default against a Singapore database costs ~400ms per render against a sub-millisecond query. This is the one setting that must not be got wrong. |
| Database | Supabase, `ap-southeast-1` | transaction pooler (`:6543`, `prepare: false`) for the app; direct connection (`:5432`) for migrations |
| Object storage | Cloudflare R2, served on a custom domain | presigned S3 uploads; Cloudflare Images transformations resize on the fly; free egress. **Reversed from Supabase Storage on 2026-09-08** — see below |
| Auth | Auth.js v5, Google provider, JWT session, Drizzle adapter | Google-only is already a resolved product decision; this is plumbing |
| Errors | Sentry free tier, both runtimes | plus Vercel's own logs. That is the entire observability answer for MVP |
| Environments | `grains-dev` + `grains-prod` | two Supabase projects, both free |

### Object storage: R2, not Supabase (reversed 2026-09-08)

The original line was "one vendor, one bill, one set of credentials", with object
storage bundled into the reason for choosing Supabase over Neon at all. Two facts
found while planning Track C undo it.

**Image transforms are not on the free plan.** The row above used to read
"signed upload URLs and image transforms in the same SDK", and that is the half
that does not exist: Supabase Image Transformations require Pro ($25/month), and
then include 100 origin images before $5 per 1,000. So the feature this choice
was partly made for was never available on the plan this project runs on. It is
not a limit we would grow into — it is a capability that is absent today.

**The free tier is small for a photo product.** 1 GB of storage and 5 GB of
egress a month, against R2's 10 GB and no egress charge at all. A single
photobook view of unresized scans is over 100 MB, so 5 GB is a few dozen page
views; resizing fixes that far more than the vendor choice does, and resizing is
the thing Supabase free cannot do.

What it costs us:

- **Upload limits stop being bucket configuration.** Supabase enforces
  `allowed_mime_types` and `file_size_limit` on the bucket. R2 has no equivalent.
  Signing `Content-Type` and `Content-Length` into a presigned PUT is possible in
  principle, but browser uploads add headers that then fail the signature check,
  so it is fragile in exactly the case we need. Enforcement therefore moves into
  `confirmPhoto`: HEAD the object, delete it and refuse if the type or size is
  wrong. That is our code holding a rule the platform used to hold, and it is the
  real price of this change.
- **A second set of credentials**, which is the thing the original cut was
  protecting against. Accepted deliberately: Google, Supabase, Cloudflare and the
  host are already four vendors, so this is the fifth credential rather than the
  second.

What it buys beyond storage and egress:

- **Transformations on the free tier** — Cloudflare Images gives 5,000 unique
  transformations a month free, then $0.50 per 1,000, and works on objects stored
  in R2. `/cdn-cgi/image/` runs on any Cloudflare-proxied domain, so serving R2
  through a custom domain means resizing works whether the app is deployed on
  Vercel or on Cloudflare. That decision stays open.
- **The orphan cleanup cron is deleted.** R2 has prefix-scoped object lifecycle
  rules, so `pending/` objects older than a day are removed by bucket
  configuration rather than by a weekly job we have to write, deploy and watch.
  See the upload flow below.

Postgres stays on Supabase. Nothing about this touches the database, the pooler
ports, or Singapore co-location.

### Auth.js over Supabase Auth

Supabase Auth would mean two identity sources to reconcile — `auth.users` alongside our own `users` table — and a cross-schema foreign key. Auth.js keeps identity in our schema, where `photos.owner_id` and `edit_history.editor_id` already point. It also keeps Supabase swappable for Neon later, since nothing but Postgres and Storage would be in use. Authorization is plain ownership checks in Server Actions; no RLS, no policy layer.

### No local Postgres

Local development connects to `grains-dev`, the same project Vercel preview deploys use. That deletes docker-compose, deletes "keep PostGIS versions consistent across environments", and deletes an entire class of works-on-my-machine drift. Cost: no offline development, and ~30ms per query from Bangkok. Add a `docker-compose.yml` later if offline work turns out to matter.

### Photo upload — the one flow worth drawing

```
1. browser → Server Action    requestUploadUrl: content-type, size
2. server                     auth() → check the per-user original-upload cap →
                              presigned PUT into pending/{userId}/{uuid}, ~10 min TTL
3. browser → R2               PUT the bytes; they never touch the app server
4. browser → Server Action    confirmPhoto: key + metadata
5. server                     HEAD the object: reject and delete unless the type and
                              size are allowed → move out of pending/ → INSERT the row
```

Step 2 has to run on the server because it is the only place that can check the session and enforce the cap (PRD D #5). Handing the browser unmediated bucket access would let anyone store anything.

**Step 5 is where content-type and size are enforced**, and that is a change from the original design, which put them in the signature. Signing `Content-Type` and `Content-Length` into a presigned PUT does constrain the upload — but a browser adds headers of its own that then fail the signature check, so it is unreliable in the one case that matters. Checking the object after it lands is less elegant and actually works: an upload that is the wrong type or too large is deleted before a row is ever written, so nothing but a short-lived object in `pending/` ever exists.

**The orphan gap:** steps 3 and 5 are separate, so closing the tab in between leaves a billable object with no row pointing at it. R2 has prefix-scoped object lifecycle rules, so a bucket rule deletes `pending/` objects older than a day — configuration rather than a cron job to write, deploy and watch. This was a planned piece of work under Supabase Storage, which has no lifecycle rules; it is now a checkbox.

### Cost

$0 through build and launch. R2 gives 10 GB of storage and free egress; Cloudflare Images gives 5,000 transformations a month, which at roughly six variants per photo covers about 800 new photos a month before anything is billed.

Roughly $45/month when the free tiers stop being appropriate — Supabase Pro at $25 (which also ends the 7-day pause), Vercel Pro at $20 if the Hobby plan's terms become a problem. Storage no longer contributes to that number: R2 is $0.015/GB-month and transformations are $0.50 per 1,000 beyond the free allowance, both of which stay in the cents for a long time.

---

## Still genuinely open

Short, and none of it blocks the first commit.

- **Numeric value of the per-user upload cap.** 50 as a placeholder (PRD D #12). A content decision, not an architecture one.
- **Badge and service catalog rosters.** Seeded in [the first migration](../db/migrations/0000_init.sql) as a starting set; they are rows, so changing them is not a migration.
- **Reverse search → lab map filter.** Cross-feature dependency flagged in PRD A; the schema and the `/api/labs` handler already support `film_stock_id`, so this is a UI question now.
- **Where a Photo belonging to no Photobook surfaces on `/u/@username`** (PRD D #10). A design question.
- **Bilingual strategy.** `name_en`/`name_th` are in the schema; the UI-copy approach (next-intl vs. a hand-rolled dictionary) is unresolved and cheap either way.

## Build order

Not a ranking of decisions — a ranking of tickets.

1. **Scaffold.** `create-next-app`, Tailwind, shadcn/ui, Drizzle, Auth.js. Two Supabase projects. Deploy an empty page to Vercel on `sin1` and confirm the region. Update [CLAUDE.md](../CLAUDE.md) with the real commands in the same commit.
2. **Migration 0000** — the design-stage `schema.sql` verbatim, seeds included. Done: [db/migrations/0000_init.sql](../db/migrations/0000_init.sql).
3. **Google sign-in + `claimUsername`.** Everything that writes depends on a user row existing.
4. **Labs read path.** `/api/labs` with `ST_DWithin`, `/labs/[id]`. Seed 10 real Bangkok labs by hand — the discovery product is untestable and unlaunchable without real rows, and 10 real ones beat 200 fake ones.
5. **Labs write path.** `createLab` / `updateLab`, one form two modes, version check, `edit_history`. The endpoint with actual invariants; give it the most care and the only tests worth writing early.
6. **Film stocks** — catalog, inline add, `lab_stock` linkage, reverse search.
7. **Photos and Photobooks** — the upload flow above, then `/u/@username`, then Connections.
8. **Badges.** One table, one toggle, an afternoon.
9. **Sentry.** The `pending/` cleanup that used to sit here is an R2 lifecycle rule set during C1, not a job.

Ship after 7. Badges and cleanup can follow the first real users.
