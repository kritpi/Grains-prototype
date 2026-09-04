# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repository is in the requirements/design stage — no application code has been scaffolded yet, and there is no build system, package manager, linter, or test runner to document. Current docs: [docs/Idea.md](docs/Idea.md) (original product brief), [CONTEXT.md](CONTEXT.md) (domain vocabulary), [docs/backlog.md](docs/backlog.md) (resolved vs. open decisions), [docs/prd/](docs/prd/) (per-feature PRDs with decision rationale), and [docs/html-virtualization/](docs/html-virtualization/) (exploratory HTML output). See [README.md](README.md) for the full map. Once the project is scaffolded (frontend/backend/database), update this file with the actual commands (dev server, build, lint, test — including how to run a single test) and remove this section.

Domain vocabulary (canonical terms and what to avoid) is tracked in [CONTEXT.md](CONTEXT.md), not here — check it before introducing new terminology. Per-feature requirements decisions live in [docs/prd/](docs/prd/), not here — where a PRD and Idea.md disagree, the PRD is canonical.

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

## Design direction & visual identity (not yet implemented)

- Influences: street/editorial photographers — Saul Leiter, Cartier-Bresson, Vivian Maier, Joe Greer, Willem Verbeeck
- Layout: editorial grid, high negative space, no heavy borders or generic-SaaS drop shadows, no rounded corners (sharp, flat rectangles only)
- Color: warm fine-art paper (e.g. `#F9F8F6`) — light mode only, no dark theme
- Typography: editorial serif for headings/series titles (e.g. Instrument Serif, Newsreader) paired with a minimal sans for metadata/UI labels (exhibition-tag feel) — no monospace/typewriter fonts
- Frame respect: no forced cropping; supports contact-sheet-style display with original film edges

## Authentication (not yet implemented)

- Google OAuth 2.0 only — no email/password sign-in or account creation flow. The sign-in surface shows a single "Continue with Google" action.

## Suggested tech stack (not yet implemented)

- Frontend: Next.js (App Router), Tailwind CSS, shadcn/ui
- Backend/API: Go, or Next.js Server Actions / API Routes
- Database: PostgreSQL (Supabase) + PostGIS extension for distance/proximity queries

This stack is a starting suggestion from Idea.md, not a locked-in decision — confirm with the user before scaffolding.
