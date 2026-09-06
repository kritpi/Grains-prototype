# Grains

Grains is a crowdsourced platform for discovering film-developing labs and film stocks, built around an Are.na-inspired photobook gallery where analog photographers curate and connect each other's work.

## Status

Scaffolded. The Next.js application is in place and deploys to Vercel in Singapore; the schema and the features are not built yet. Commands, layout and environment variables are in [CLAUDE.md](CLAUDE.md); what is resolved vs. still open is in [docs/backlog.md](docs/backlog.md); the phase-by-phase build plan is [docs/plans/build-plan.html](docs/plans/build-plan.html).

## Concept

Two content types, treated with deliberately different editorial rules:

- **Labs (ร้านล้างฟิล์ม)** — information-first: accurate, structured, easy-to-scan data (pricing, turnaround, process support, hours, contact).
- **Films (ฟิล์ม)** — inspiration-first: mood/tone sample photos surfaced from the community.

Core content-integrity rule: community-uploaded photos are never directly attributed to the lab that developed them, so a subjectively "bad" scan can't damage a specific lab's reputation.

## MVP feature areas

| Feature | Summary | PRD |
| --- | --- | --- |
| **A. Lab Directory & Discovery** | Geospatial search, process/scanner filters, lab metadata, inventory & supplies, community-edited with full history | [docs/prd/lab-directory-discovery.md](docs/prd/lab-directory-discovery.md) |
| **B. Film Stock Index & Gallery** | Community-maintained film stock catalog, plus a gallery of sample photos derived from tagged Photos, and reverse search ("labs that carry this stock near me") | [docs/prd/film-stock-index-gallery.md](docs/prd/film-stock-index-gallery.md) |
| **C. Community & Data Integrity** | Fixed, curated lab badges (e.g. "Fast Turnaround," "Clean Scan") with retractable community voting | [docs/prd/community-data-integrity.md](docs/prd/community-data-integrity.md) |
| **D. Minimal Photobook Portfolio** (`/u/@username`) | Are.na-style model: atomic **Photo** blocks curated into thematic **Photobook** collections, with **Connection** letting any user save another's public Photo into their own Photobook by reference | [docs/prd/photobook-portfolio.md](docs/prd/photobook-portfolio.md) |

Domain vocabulary (canonical terms, retired terms, and what to avoid) is tracked in [CONTEXT.md](CONTEXT.md).

## Design direction

Influenced by street/editorial photographers (Saul Leiter, Cartier-Bresson, Vivian Maier). Editorial grid, high negative space, warm fine-art paper, light mode only, editorial serif headings paired with a minimal sans for metadata. No forced cropping — original film aspect ratios (3:2, 1:1, 6:7) are respected throughout. Not yet translated into concrete UI decisions — see [docs/backlog.md](docs/backlog.md).

## Tech stack

**One Next.js application on Vercel, next to Postgres + PostGIS on Supabase — both in Singapore.** Server Components read the database directly, Server Actions handle every write, and SQL lives in one directory. Auth.js with Google sign-in. Photos upload straight to object storage via short-lived signed URLs and never transit the app server. No Redis, no staging tier, no infrastructure-as-code.

All three architecture decisions are made, with the rationale, the rejected options, and an explicit list of what was cut from the earlier nine-topic backlog — see [docs/00_BACKLOG.md](docs/00_BACKLOG.md).

## Docs

- [docs/Idea.md](docs/Idea.md) — original product brief
- [docs/backlog.md](docs/backlog.md) — what's resolved vs. still open across all features
- [docs/00_BACKLOG.md](docs/00_BACKLOG.md) — the three architecture decisions, what was cut, and the build order
- [docs/schema.sql](docs/schema.sql) — the initial migration
- [docs/api-surface.md](docs/api-surface.md) — every read, write and handler needed to put data behind the prototype
- [docs/prd/](docs/prd/) — per-feature PRDs with decision rationale
- [docs/plans/](docs/plans/) — implementation plans, including the four-phase [build plan](docs/plans/build-plan.html)
- [CONTEXT.md](CONTEXT.md) — domain vocabulary
- [CLAUDE.md](CLAUDE.md) — guidance for working in this repo
