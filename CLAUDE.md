# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev            # dev server on :3000 (Turbopack)
pnpm build          # production build
pnpm lint           # eslint
pnpm typecheck      # next typegen && tsc --noEmit  — typegen must run first on Next 16
pnpm format         # prettier --write .
pnpm format:check   # what CI runs
```

Database (all read `DIRECT_URL`, the session pooler on port 5432):

```bash
pnpm db:generate --name <name>   # creates an EMPTY migration to hand-write; --custom is deliberate
pnpm db:migrate                  # apply pending migrations to grains-dev
pnpm db:studio                   # browse the database
```

Production is a separate, deliberate command that refuses to run until it is
told which project it is about to change:

```bash
GRAINS_CONFIRM_PROD=postgres.<prod-project-ref> pnpm db:migrate:prod
```

It reads `DIRECT_URL_PROD`. Selecting the target with a variable alone was not
enough of a guard — one stray value migrated production unintentionally during
Ticket 1 — so the confirmation token must match the database user, which means
confirming requires reading which project is named.

Tests:

```bash
pnpm test                                        # whole suite (Vitest)
pnpm vitest run tests/db/schema-invariants.test.ts -t "no lab_id column"
```

The schema tests read `DIRECT_URL` and skip themselves when it is absent, which
is how CI runs them without holding credentials.

## Layout

```
app/                    routes — Server Components, Server Actions, Route Handlers
lib/db/schema.ts        Drizzle schema, mirrors the migrations; source of inferred types
lib/db/index.ts         the client (transaction pooler, prepare: false, lazy)
lib/queries/            the only place SQL exists
lib/env.ts              validated environment access
db/migrations/          hand-written SQL, applied by drizzle-kit
tests/                  Vitest; tests/db/ run against grains-dev
docs/                   requirements, architecture and plans — see README.md
```

## Auth

Google only — there is no email/password path and no account creation flow.
`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are Auth.js conventions, not ours: it
auto-discovers `AUTH_<PROVIDER>_ID`/`_SECRET`. `AUTH_SECRET` signs the session
and comes from `openssl rand -base64 32`.

The session is a JWT carrying the user id and nothing else. Copying the
username in would freeze it at sign-in, so `currentUser()` reads the row
instead, cached per request. Authorisation is ownership checks in Server
Actions; there is no RLS and no policy layer.

Google's authorised redirect URIs must include
`http://localhost:3000/api/auth/callback/google` for local work, and the
production domain's equivalent. Preview deployments get a different hostname
each time and therefore cannot sign in.

## Environment

Copy `.env.example` to `.env.local` and fill it from the Supabase dashboard.
Both variables address the same database and differ only in port, and the
difference matters:

| Variable | Port | Used by |
| --- | --- | --- |
| `DATABASE_URL` | 6543, transaction pooler | the running app; requires `prepare: false` |
| `DIRECT_URL` | 5432, session pooler | drizzle-kit only; DDL needs a real session |

Local development and Vercel preview deploys both use `grains-dev`. Production
uses `grains-prod`. Never point a local shell at `grains-prod` except to run a
migration on purpose — production migrations are run by hand, never on build.

`GET /api/health` reports the deployment region and pings the database. It is
infrastructure, not product API; the product Route Handlers are the three in
[docs/api-surface.md](docs/api-surface.md).

## Working agreements

- **Env files are off limits to the agent.** `.env`, `.env.local` and the rest
  hold live database and OAuth credentials, so Claude never reads, edits or
  shells out to them. `.env.example` is the exception — it is committed, lists
  variable names only, and is the place to learn what the project expects; ask
  for any actual value. Enforced by `permissions.deny` and a PreToolUse hook in
  [.claude/settings.json](.claude/settings.json), not by good intentions.
- **SQL only in `lib/queries/`.** Pages, Server Actions and Route Handlers call
  those functions and never write SQL inline. This is the one layering rule.
- **Migrations are hand-written.** `pnpm db:generate` produces an empty file on
  purpose: drizzle renders the PostGIS geography type as a quoted identifier,
  which Postgres rejects, so generated DDL cannot be trusted for this schema.
  Nothing generates `lib/db/schema.ts` from a migration or the reverse, so a
  migration and the schema file change in the same pull request — that parity
  is a review item, not something a tool checks.
- **Production migrations are run by hand**, from a laptop, never on build, and
  never without the confirmation token above. With two databases behind one
  repository, a build hook that migrates is a footgun.
- **The deployed app never reads the `_PROD` variables.** It reads
  `DATABASE_URL`, which Vercel sets per environment. `DIRECT_URL_PROD` exists
  only so a laptop can migrate production.
- **No dark mode.** The palette is light only and `--radius` is 0. Both are
  enforced in `app/globals.css` rather than per component.
- **Prose is not formatted.** Markdown and `docs/` are excluded from Prettier.
- **Every write starts with `requireUser()`** (`lib/auth.ts`). It returns a user
  who is signed in *and* has claimed a username, so no caller has to handle the
  half-registered state.
- **Reach the database through `getDb()`**, not a module-level client. Reading
  the environment at import breaks `next build`, which runs without one. It is
  a function rather than a lazily-proxied object because a proxy hides the
  client's class from libraries that detect the dialect from it.

Domain vocabulary (canonical terms and what to avoid) is tracked in [CONTEXT.md](CONTEXT.md), not here — check it before introducing new terminology. Per-feature requirements decisions live in [docs/prd/](docs/prd/), not here — where a PRD and Idea.md disagree, the PRD is canonical. The build plan, phase by phase, is [docs/plans/build-plan.html](docs/plans/build-plan.html).

`AGENTS.md` is written by `next dev` on every run and is committed rather than fought; it points at the Next.js docs bundled in `node_modules`.

## Product concept

Grains is a crowdsourced platform for finding film-developing labs ("film labs"), similar in spirit to specialty-coffee-shop-finder apps. Two content types are treated with deliberately different editorial rules:

- **Labs (ร้านล้างฟิล์ม)** — information-first: accurate, structured, easy-to-scan data (pricing, turnaround, process support, hours, contact).
- **Films (ฟิล์ม)** — inspiration-first: mood/tone sample photos from the community.
- **Important content-integrity rule:** community-uploaded photos are never directly attributed to the lab that developed them, to avoid a bad scan reflecting on a lab's reputation. Keep this separation in mind for any schema or feature involving photo uploads — photos link to a film stock, not to a lab.

## MVP feature areas (from Idea.md, resolved decisions in docs/prd/)

**A. Lab Directory & Discovery**
- Geospatial search by coordinates/radius (PostGIS / `ST_DWithin`)
- Filters: chemical process (C-41, ECN-2, B&W, E-6) and scanner model (Fuji Frontier, Noritsu, SP-3000)
- Lab metadata: per-process pricing, turnaround time, drop-box/mail-in service, contact info, map location, hours, open/closed status
- Lab inventory: film stock (linked to the Film Stock catalog) and darkroom supplies (curated tags + contributor-added freeform tags) carried in-store — no quantity or "Last Verified" mechanic (see [docs/prd/lab-directory-discovery.md](docs/prd/lab-directory-discovery.md))

**B. Film Stock Index & Gallery**
- Catalog browsing by name, ISO (100/200/400/800), format (135/120)
- Community inspiration gallery of sample photos per film stock
- Reverse search: from a film's detail page, show nearby labs that stock it

**C. Community & Data Integrity**
- "Suggest Lab" / "Suggest Edit" submission flow
- Community upvotes/badges on labs (e.g. "Fast Turnaround", "Clean Scan")

**D. Minimal Photobook Portfolio (`/u/@username`)**
- Public profile page: Early-Instagram × fine-art photobook — no ads, no like counts
- Are.na-inspired model (see [CONTEXT.md](CONTEXT.md) and [docs/prd/photobook-portfolio.md](docs/prd/photobook-portfolio.md)): **Photo** is the atomic unit and can belong to multiple **Photobooks**; **Connection** lets a user save another user's public Photo into their own Photobook by reference, without re-uploading it. "Roll" is retired as the curation-unit term.
- A Photobook is a thematic, curated collection displayed as a minimal grid that respects true aspect ratio (3:2, 1:1, 6:7)
- Analog metadata linkage: each Photo ties to Film Stock, Camera, and Scanner — never to a specific Lab, per the content-integrity rule above
- Short artist's note (2-3 lines) per Photobook
- MVP safeguard: per-user cap on original photo uploads (Connections don't count against it), to bound storage and push toward "best shots only"

## Design direction & visual identity

**The visual contract is [docs/design-system/component-library.html](docs/design-system/component-library.html) and [docs/design/grains-prototype.html](docs/design/grains-prototype.html) — read one of them before writing any UI.** The prose below is the intent; those two are the specification, down to exact tokens, component states and layout ratios. The prototype is an exported artifact that greps as noise, so use the `prototype-fidelity` skill (`.claude/skills/prototype-fidelity/`) to open it — building from the wireframe or from this prose alone is how the lab detail page got rewritten once already.

Note that `app/globals.css` and the design system have **not** been formally reconciled: the palette here was set from the prose example at scaffold time (P7), and the design system's own values differ. Map onto the existing semantic tokens rather than pasting hex values out of the prototype, and raise the difference rather than editing the palette from a feature branch.

- Influences: street/editorial photographers — Saul Leiter, Cartier-Bresson, Vivian Maier, Joe Greer, Willem Verbeeck
- Layout: editorial grid, high negative space, no heavy borders or generic-SaaS drop shadows, no rounded corners (sharp, flat rectangles only)
- Color: warm fine-art paper (e.g. `#F9F8F6`) — light mode only, no dark theme
- Typography: editorial serif for headings/series titles (e.g. Instrument Serif, Newsreader) paired with a minimal sans for metadata/UI labels (exhibition-tag feel) — no monospace/typewriter fonts
- Frame respect: no forced cropping; supports contact-sheet-style display with original film edges

## Authentication (not yet implemented)

- Google OAuth 2.0 only — no email/password sign-in or account creation flow. The sign-in surface shows a single "Continue with Google" action.

## Tech stack (decided)

Decided in [docs/00_BACKLOG.md](docs/00_BACKLOG.md), which carries the rationale, the options rejected, and the costs accepted for each. Do not re-litigate these without reading that file first.

- **One Next.js application** — App Router, Tailwind, shadcn/ui. Server Components for reads, Server Actions for writes, Route Handlers only for what the browser fetches after load. No separate backend service, no OpenAPI contract, no codegen.
- **SQL lives only in `lib/queries/`.** Pages, actions and handlers call those functions; none of them write SQL inline. This is the one layering rule.
- **Database:** PostgreSQL + PostGIS on Supabase (Singapore), via Drizzle. Migrations are raw `.sql`. PostGIS is kept for query *correctness*, not performance — do not cite speed as its justification. Schema: [db/migrations/0000_init.sql](db/migrations/0000_init.sql), mirrored by [lib/db/schema.ts](lib/db/schema.ts).
- **Hosting:** Vercel, function region `sin1`, co-located with the database. Region is the one setting that must not be got wrong.
- **Auth:** Auth.js v5, Google provider, JWT session, Drizzle adapter — identity lives in our own `users` table.
- **Photos:** Cloudflare R2, not Supabase Storage (reversed 2026-09-08 — see 00_BACKLOG.md). Uploaded directly to R2 via short-lived presigned PUTs, never through the app server; served public-read from a custom domain and resized on the fly by Cloudflare Images. Writes are [lib/storage.ts](lib/storage.ts), which is `server-only` and holds the credentials; the public origin, `publicUrl` and the `next/image` loader are [lib/image-loader.ts](lib/image-loader.ts), which is isomorphic because a loader runs in the browser. R2 has no bucket-level mime or size limits, so those are checked *after* the object lands and it is deleted if wrong (P19).
- **Map:** MapLibre GL JS with CARTO Positron tiles; map and filter state live in the URL via nuqs. PROPOSED — these three came from the build brief rather than from an argued decision in 00_BACKLOG.md, so they are cheap to overturn before the discovery track starts.
- **No Redis, no staging tier, no Terraform** — all deliberately cut; see the cut table in 00_BACKLOG.md before reintroducing any of them.

Three invariants are enforced by the schema rather than by code, and must stay that way: `photos` has no `lab_id` column; `lab_pricing` foreign-keys to `(lab_id, process)`; only curated services/supplies are indexed. [tests/db/schema-invariants.test.ts](tests/db/schema-invariants.test.ts) asserts all three against a real database — both that the constraint exists and that the database actually rejects the write.

## Parallel tracks

Once the foundation is in place the build splits across three git worktrees. File ownership is fixed so two tracks never edit one file:

| Track | Owns |
| --- | --- |
| A — discovery | `lib/queries/labs.ts`, `app/api/labs/**`, `app/labs/page.tsx`, `app/labs/[id]/page.tsx`, `components/map/**`, `components/labs/**` |
| B — curation | `lib/queries/lab-edits.ts`, `lib/queries/films.ts`, `lib/labs/paths.ts`, `app/labs/actions.ts`, `app/labs/new/**`, `app/labs/[id]/edit/**`, `components/lab-form/**`, `app/films/**` |
| C — media | `lib/storage.ts`, `lib/queries/photos.ts`, `lib/queries/books.ts`, `app/photos/actions.ts`, `app/u/**`, `components/upload/**`, `components/photobook/**` |

`lib/db/schema.ts` and `db/migrations/` are frozen during that phase: they change only through a pull request to `main` that every track then rebases on.
