# Grains

Grains is a crowdsourced platform for discovering film-developing labs and film stocks, built around an Are.na-inspired photobook gallery where analog photographers curate and connect each other's work.

## Status

Idea and requirements stage — no code has been scaffolded yet. The product requirements (personas, business rules, edge cases) have been walked through in detail for all four MVP feature areas; design direction and tech stack are still open. See [CLAUDE.md](CLAUDE.md) for the current project status and [docs/backlog.md](docs/backlog.md) for what's resolved vs. still open.

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

Influenced by street/editorial photographers (Saul Leiter, Cartier-Bresson, Vivian Maier). Editorial grid, high negative space, warm fine-art paper in light mode / muted charcoal in dark mode, editorial serif headings paired with a minimal sans or mono for metadata. No forced cropping — original film aspect ratios (3:2, 1:1, 6:7) are respected throughout. Not yet translated into concrete UI decisions — see [docs/backlog.md](docs/backlog.md).

## Tech stack

Not yet decided. [docs/Idea.md](docs/Idea.md) suggests Next.js (App Router) + Tailwind + shadcn/ui on the frontend, Go or Next.js Server Actions on the backend, and PostgreSQL (Supabase) + PostGIS for geospatial queries — to be confirmed before scaffolding.

## Docs

- [docs/Idea.md](docs/Idea.md) — original product brief
- [docs/backlog.md](docs/backlog.md) — what's resolved vs. still open across all features
- [docs/prd/](docs/prd/) — per-feature PRDs with decision rationale
- [docs/plans/](docs/plans/) — implementation plans awaiting review/execution
- [CONTEXT.md](CONTEXT.md) — domain vocabulary
- [CLAUDE.md](CLAUDE.md) — guidance for working in this repo
