# Tech decisions backlog

Nine open infrastructure and architecture decisions, staged for a Grill → decide → log → ticket → implement pass, one topic at a time. This is the technical counterpart to [backlog.md](backlog.md), which stays scoped to product/feature decisions.

**Nothing below is decided yet.** Each section states the sub-questions and tradeoffs, not an answer. When a topic gets Grilled, log its resolution in place, right under that topic, using the same pattern already established in [prd/lab-directory-discovery.md](prd/lab-directory-discovery.md)'s Decision Ledger — a numbered, dated `### Decision — RESOLVED` heading with **Decision:** / **Rationale:** paragraphs — then flip the `Status:` line and file a ticket for the implementation work.

A rendered, checkable version of this list lives at [html-virtualization/tech-decisions-ledger.html](html-virtualization/tech-decisions-ledger.html) (open it in a browser — checklist state is kept per-browser via `localStorage`, it doesn't sync back here).

## Priority order

Ranked by what actually blocks what, not by how interesting each topic is:

| # | Topic | Why here |
| --- | --- | --- |
| 1 | Application architecture & stack boundaries | Highest-leverage call — sets the language, the auth-token seam, and what hosting shapes are even possible. |
| 2 | Project structure (monorepo) | Cheap once #1 lands, but must be settled before the first scaffold commit. |
| 3 | Core data model & geospatial strategy | Provider-agnostic schema work — can run alongside #1–2, must land before #4/#7 consume it. |
| 4 | Database provider selection | Pooling needs differ for serverless vs. long-running compute — depends on #1's answer. |
| 5 | Authentication & authorization model | Needs #1 (where tokens get verified) and #3's user schema. |
| 6 | Cloud hosting & compute infrastructure | Needs #1 (what's deployed) and #4 (DB region/latency match). |
| 7 | Environment isolation & DB migrations | Needs #2, #3, and #4 all settled to design one reproducible pipeline. |
| 8 | Observability & graceful degradation | Cheap to pick tools for now; not blocking, but harder to retrofit later than caching is. |
| 9 | Caching strategy & Redis integration | Deliberately last — cache keys designed before real query patterns exist is a guess, not a decision. |

---

## 1. Application architecture & stack boundaries

**Status:** Open

**Why now:** Decides the language, whether "monorepo" is even a meaningful question, and where auth verification lives. Everything below reads differently once this lands.

**Key sub-questions:**
- Decoupled backend (Go or NestJS) with a separate Next.js frontend, or a unified Next.js app using Server Actions / Route Handlers with no separate backend at all?
- If decoupled: API contract style — REST, tRPC (TS-only), or GraphQL?
- Where does geospatial query logic and the content-integrity rule (photos never link to a Lab) live — DB views/functions, or an app-layer repository?
- What repository/service-layer boundaries hold regardless of which stack wins — e.g. a `labs` domain package, a `photobooks` domain package?

**Grains-specific context:** `Idea.md` floated Go *or* Next.js Server Actions as the backend option, never confirmed. `ST_DWithin` geospatial queries need good driver support either way. Team appears small/solo at this stage — favors fewer moving parts over maximal separation of concerns.

**Candidate options:** Go backend + Next.js frontend · NestJS backend + Next.js frontend · unified Next.js, no separate backend.

**Definition of done:** Decision + Rationale logged here; ticket filed to scaffold the chosen shape.

## 2. Project structure (monorepo)

**Status:** Open

**Why now:** Fast and low-risk once #1 is known — but it gates the very first commit to the repo.

**Key sub-questions:**
- Monorepo (pnpm/Turborepo workspaces, or a Go module beside a frontend dir) vs. polyrepo (separate FE/BE repos)?
- Where does Terraform live, if adopted — an `/infra` folder in the same repo, or its own repo?
- Build-graph tooling: Turborepo/Nx make sense for a JS-only monorepo, but can't span a Go + TS split — does that push toward plain workspace folders instead?
- Shared types: a `packages/types` package between FE/BE, only relevant if both sides end up in TypeScript.

**Grains-specific context:** Mostly gated by #1. A unified Next.js app makes "monorepo" nearly moot — one app, an optional `/infra` folder. A Go + Next.js split makes monorepo-vs-polyrepo a real tradeoff: no shared build graph across languages, but one repo still buys atomic PRs across the FE/BE boundary.

**Candidate options:** single repo, unified app · monorepo (Turborepo) — web + infra · polyrepo — FE / BE / infra split.

**Definition of done:** Decision logged; ticket to initialize the repo layout — likely the very first implementation ticket.

## 3. Core data model & geospatial strategy

**Status:** Open

**Why now:** Largely provider-agnostic — every managed Postgres+PostGIS offers the same column/index choices — so it can proceed alongside #1–2, but must land before #4 and #7 consume the schema.

**Key sub-questions:**
- `geography(Point,4326)` vs. `geometry(Point,4326)` for lab coordinates — geography gives correct great-circle distance out of the box; geometry is faster but needs manual SRID/projection care.
- GiST vs. SP-GiST index for the point column backing `ST_DWithin` radius search.
- Table shape for Lab ↔ Process (C-41 / ECN-2 / B&W / E-6) ↔ Pricing ↔ Turnaround — one wide table, or a `lab_process_offerings` join table?
- Film Stock catalog schema: how ISO/format (135/120) and community gallery photos attach to a film stock row.
- Photobook domain in SQL: Photo (atomic, belongs to N Photobooks) ↔ Photobook ↔ Connection (reference-only save, no re-upload) — join-table design that avoids duplicating storage.
- Schema-level enforcement of the content-integrity rule — e.g. no `lab_id` column on `photos` at all, only `film_stock_id` / `camera_id` / `scanner_id`, so the rule can't be bypassed at the API layer.
- Badge/upvote data model for community trust signals.

**Grains-specific context:** PostGIS + `ST_DWithin` is already assumed. The photo-never-attributed-to-a-lab rule is a hard product requirement (`CLAUDE.md`, `CONTEXT.md`) that belongs in the schema, not just app-layer filtering. The Photobook/Connection model itself is already resolved in [prd/photobook-portfolio.md](prd/photobook-portfolio.md) — this topic implements that model in SQL, it doesn't redesign it.

**Candidate options:** n/a — modeling choices, not a vendor pick.

**Definition of done:** An ERD + migration-ready schema logged; ticket to write the initial migration.

## 4. Database provider selection

**Status:** Open

**Why now:** Needs #1 settled first — serverless vs. long-running compute changes the connection-pooling requirement, a real differentiator between providers.

**Key sub-questions:**
- Supabase vs. Neon vs. plain managed Postgres (RDS/Cloud SQL) with PostGIS enabled by hand?
- Pooling story: Supabase's PgBouncer-based pooler vs. Neon's built-in pooler vs. self-managed PgBouncer — which matches #1's compute shape?
- Free/hobby tier limits vs. expected MVP load (Postgres row growth from metadata — photo blobs live in object storage, see #6/#9).
- Do we need Supabase's bundled Auth/Storage/Realtime, or only the Postgres+PostGIS layer? This choice reaches into #5 and #6 too.
- Branching/preview-database support for #7 — Neon's branch-per-PR model vs. Supabase's project-per-environment model.

**Grains-specific context:** `Idea.md` already assumes Postgres+PostGIS as the engine — this topic picks the vendor, not the engine. Early-stage and cost-conscious: favor generous free tiers and low operational overhead over headroom nobody needs yet.

**Candidate options:** Supabase · Neon · self-managed Postgres.

**Definition of done:** Decision logged; ticket to provision the project/org and store credentials.

## 5. Authentication & authorization model

**Status:** Open

**Why now:** Needs #1 (where token verification runs) and touches #3's user schema.

**Key sub-questions:**
- Google OAuth-only is already decided (`CLAUDE.md`) — what's open is the implementation: Supabase Auth (if #4 picks Supabase), Clerk, Auth.js/NextAuth, or hand-rolled OAuth + JWT?
- Session strategy: server-side session cookie vs. stateless JWT — and if a separate backend exists per #1, how does it verify a session the frontend's auth provider created?
- Authorization beyond "logged in": only a Photo's owner can add it to a Photobook; only original uploads count against the per-user cap (PRD D). Plain ownership checks, or a policy layer (e.g. Postgres RLS under Supabase)?
- Admin/moderation surface for reviewing "Suggest Lab" / "Suggest Edit" submissions (PRD C) — separate admin auth, or a role flag on the same user model?

**Grains-specific context:** Google-OAuth-only is a resolved product decision — this topic is purely implementation plumbing. The per-user upload cap and the content-integrity rule both imply authorization checks tied to Photo ownership.

**Candidate options:** Supabase Auth · Clerk · NextAuth/Auth.js · custom OAuth + JWT.

**Definition of done:** Decision logged; ticket to wire up sign-in end-to-end.

## 6. Cloud hosting & compute infrastructure

**Status:** Open

**Why now:** Needs #1 (what's actually being deployed) and #4 (DB region for query latency).

**Key sub-questions:**
- Frontend hosting: Vercel (native Next.js fit) vs. Cloudflare Pages/Workers vs. self-hosted.
- Backend compute, if #1 picks a decoupled service: Cloud Run, Fly.io, Railway — a Cloudflare Worker is off the table if Go wins #1, since Go doesn't run there.
- Object storage + CDN for community photo uploads — the largest storage-cost driver in the system: Cloudflare R2, Supabase Storage, or S3 + CloudFront.
- Region alignment between hosting and #4's DB region, to keep geospatial query latency low.
- Cold-start tolerance: serverless functions hitting Postgres directly need pooling (ties to #4); a Cloud Run service can hold a warm pool instead.

**Grains-specific context:** The photo-heavy workload (original uploads, gallery, Connections) makes the object-storage/CDN choice as consequential as the compute choice. No production traffic yet — cost and simplicity should outweigh scaling headroom.

**Candidate options:** Vercel · Cloudflare (Pages/Workers/R2) · GCP Cloud Run · Fly.io/Railway.

**Definition of done:** Decision logged; ticket to stand up the deploy pipeline for one environment.

## 7. Environment isolation & DB migrations

**Status:** Open

**Why now:** Needs #2 (repo layout), #4 (provider), and #3 (schema) all settled to design one reproducible local → staging → production pipeline.

**Key sub-questions:**
- Local dev: Docker Compose running Postgres+PostGIS locally, or developing directly against a free-tier cloud database with no local Postgres at all?
- Migration tool — Prisma Migrate, Drizzle Kit, golang-migrate, Atlas, or provider-native (Supabase CLI migrations)? Partly gated by #1's language.
- Environment matrix local → staging → production — a real separate DB project per stage, or branch-based ephemeral databases (Neon branching, if #4 picks Neon)?
- Secrets/config pipeline — how do per-environment values (DB URL, OAuth secrets, storage keys) reach each environment without hand-copied `.env` files?
- Seed data for local/staging (sample labs, film stocks) so geospatial queries are testable without real community data.

**Grains-specific context:** Greenfield — no CI/CD or environment pipeline exists yet. PostGIS must be enabled consistently across every environment, which some ORM migration tools handle awkwardly; raw SQL migrations may be the safer default for PostGIS-specific DDL.

**Candidate options:** Docker Compose + golang-migrate/Atlas · Docker Compose + Prisma/Drizzle · cloud-branch-only (no local Postgres).

**Definition of done:** Decision logged; ticket to write the first migration and get a fresh clone running locally in under N minutes.

## 8. Observability & graceful degradation

**Status:** Open

**Why now:** Cheap to decide now and not blocking, but harder to retrofit later than caching is — ranked above #9 for that reason.

**Key sub-questions:**
- Structured logging format (JSON logs) and where they ship — provider log tail, or a dedicated sink like Axiom or Better Stack?
- Error tracking — Sentry across frontend and backend is close to a default-yes given its free tier.
- Degradation behavior: does a geospatial search fail hard when Postgres is briefly unavailable, or fall back to a cached/stale result (ties to #9)? Do photos lazy-load with placeholders when the CDN is slow?
- Health-check conventions for whatever hosting platform #6 lands on.
- Minimum alerting at MVP stage — paging, or just async error-tracking review?

**Grains-specific context:** Pre-launch, no real users yet — bias toward cheap defaults now and refinement post-launch, rather than building a full observability stack before there's traffic to observe.

**Candidate options:** Sentry + provider-native logs · Sentry + Axiom/Better Stack · full stack (Grafana/Prometheus) — likely overkill.

**Definition of done:** Decision logged; ticket to wire up error tracking and baseline structured logging.

## 9. Caching strategy & Redis integration

**Status:** Open

**Why now:** Deliberately last: designing cache keys and TTLs before real read-heavy query patterns exist is a guess, not a decision.

**Key sub-questions:**
- Which queries are actually read-heavy enough to need caching — likely candidates are nearby-labs search results, the film-stock catalog listing, and public Photobook page views — but this needs real usage data, not today's guesses.
- Cache-aside pattern: read-through on miss, write-invalidate on lab/film-stock edits. Key naming convention (e.g. `labs:near:{lat}:{lng}:{radius}:{filters_hash}`) and a TTL per query type.
- Provider: Upstash (serverless-friendly, pay-per-request — fits #6 if hosting is serverless) vs. a traditional managed Redis (fits better if #6 picks long-running compute).
- Degradation when Redis is unavailable — must fall back to a direct DB query, never a hard failure (ties to #8).

**Grains-specific context:** There's no traffic yet to identify real hot paths. Caching before that risks solving the wrong problem and adding operational surface — invalidation bugs — before there's a performance problem to justify it. Revisit once #3/#4/#6 are live and real query latency is measured.

**Candidate options:** Upstash Redis · traditional managed Redis · defer, rely on Postgres/CDN caching for now.

**Definition of done:** Decision logged — "defer past MVP launch" is a legitimate resolution here; a ticket is only filed if the decision is to build now.
