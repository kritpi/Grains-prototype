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
| Multi-vendor storage/CDN split (old §6) | zero egress fees on R2 | Real at scale, irrelevant at zero. One vendor, one bill, one set of credentials. Revisit at the first egress bill that stings. |
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

Full DDL: [schema.sql](schema.sql).

### The pieces

- **Supabase over Neon** on one argument: this is a photo product, so object storage is needed on day one. Neon's branching is genuinely better, but picking it means a second vendor for storage anyway. One vendor, one dashboard, one bill wins at this size. Accepted: Supabase's free tier pauses a project after 7 days of inactivity, and its branching is weaker than Neon's.
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
| Object storage | Supabase Storage | signed upload URLs and image transforms in the same SDK; its CDN sits in front |
| Auth | Auth.js v5, Google provider, JWT session, Drizzle adapter | Google-only is already a resolved product decision; this is plumbing |
| Errors | Sentry free tier, both runtimes | plus Vercel's own logs. That is the entire observability answer for MVP |
| Environments | `grains-dev` + `grains-prod` | two Supabase projects, both free |

### Auth.js over Supabase Auth

Supabase Auth would mean two identity sources to reconcile — `auth.users` alongside our own `users` table — and a cross-schema foreign key. Auth.js keeps identity in our schema, where `photos.owner_id` and `edit_history.editor_id` already point. It also keeps Supabase swappable for Neon later, since nothing but Postgres and Storage would be in use. Authorization is plain ownership checks in Server Actions; no RLS, no policy layer.

### No local Postgres

Local development connects to `grains-dev`, the same project Vercel preview deploys use. That deletes docker-compose, deletes "keep PostGIS versions consistent across environments", and deletes an entire class of works-on-my-machine drift. Cost: no offline development, and ~30ms per query from Bangkok. Add a `docker-compose.yml` later if offline work turns out to matter.

### Photo upload — the one flow worth drawing

```
1. browser → Server Action    requestUploadUrl: content-type, size
2. server                     auth() → check the per-user original-upload cap →
                              signed PUT into pending/{userId}/{uuid}, ~10 min TTL,
                              content-type and max size baked into the signature
3. browser → Supabase Storage PUT the bytes; they never touch the app server
4. browser → Server Action    confirmPhoto: key + metadata
5. server                     move out of pending/, INSERT the row
```

Step 2 has to run on the server because it is the only place that can check the session, enforce the cap (PRD D #5), and constrain content-type and size *inside* the signature. Handing the browser unmediated bucket access would let anyone store anything.

**The orphan gap:** steps 3 and 5 are separate, so closing the tab in between leaves a billable object with no row pointing at it. Supabase Storage has no lifecycle rules, so this needs a weekly Vercel Cron job deleting `pending/` objects older than 24h. Week two, not day one — but written down here so it is discovered in this document rather than on a bill.

### Cost

$0 through build and launch. Roughly $45/month when the free tiers stop being appropriate — Supabase Pro at $25 (which also ends the 7-day pause), Vercel Pro at $20 if the Hobby plan's terms become a problem.

---

## Still genuinely open

Short, and none of it blocks the first commit.

- **Numeric value of the per-user upload cap.** 50 as a placeholder (PRD D #12). A content decision, not an architecture one.
- **Badge and service catalog rosters.** Seeded in [schema.sql](schema.sql) as a starting set; they are rows, so changing them is not a migration.
- **Reverse search → lab map filter.** Cross-feature dependency flagged in PRD A; the schema and the `/api/labs` handler already support `film_stock_id`, so this is a UI question now.
- **Where a Photo belonging to no Photobook surfaces on `/u/@username`** (PRD D #10). A design question.
- **Bilingual strategy.** `name_en`/`name_th` are in the schema; the UI-copy approach (next-intl vs. a hand-rolled dictionary) is unresolved and cheap either way.

## Build order

Not a ranking of decisions — a ranking of tickets.

1. **Scaffold.** `create-next-app`, Tailwind, shadcn/ui, Drizzle, Auth.js. Two Supabase projects. Deploy an empty page to Vercel on `sin1` and confirm the region. Update [CLAUDE.md](../CLAUDE.md) with the real commands in the same commit.
2. **Migration 0001** — [schema.sql](schema.sql) verbatim, seeds included.
3. **Google sign-in + `claimUsername`.** Everything that writes depends on a user row existing.
4. **Labs read path.** `/api/labs` with `ST_DWithin`, `/labs/[id]`. Seed 10 real Bangkok labs by hand — the discovery product is untestable and unlaunchable without real rows, and 10 real ones beat 200 fake ones.
5. **Labs write path.** `createLab` / `updateLab`, one form two modes, version check, `edit_history`. The endpoint with actual invariants; give it the most care and the only tests worth writing early.
6. **Film stocks** — catalog, inline add, `lab_stock` linkage, reverse search.
7. **Photos and Photobooks** — the upload flow above, then `/u/@username`, then Connections.
8. **Badges.** One table, one toggle, an afternoon.
9. **Sentry, then the `pending/` cleanup cron.**

Ship after 7. Badges and cleanup can follow the first real users.
