# Grains - Discover film labs near me

1. Core Vision & Concept
- Vision: A crowdsourced platform for finding and cataloging film-developing labs and film stocks, for the community (similar in spirit to specialty-coffee-shop-finder apps).
- Core Rule:
  - Labs (ร้านล้างฟิล์ม): Information-first (accurate, clear, easy-to-access data).
  - Films (ฟิล์ม): Inspiration-first (mood & tone, sample photos from the community).
  - Community-uploaded photos are never directly attributed to the lab that developed them, to avoid a bad scan reflecting on a lab's reputation.
2. Core Features (MVP)

A. Lab Directory & Discovery
- Geospatial Search: find nearby labs by coordinates and radius (PostGIS / ST_DWithin).
- Process & Scanner Filters:
  - Chemical Process: C-41 (standard color), ECN-2 (motion picture film), B&W (black & white), E-6 (slide).
  - Scanner Models: Fuji Frontier (warm skin tones/color), Noritsu (sharp, high contrast), SP-3000.
- Lab Metadata & Details:
  - Pricing per process, and Turnaround Time.
  - Additional services: storefront drop-box / mail-in shipping.
  - Contact info, map location, hours, and lab status.
- Lab Inventory & Supplies (additional feature):
  - Search for film stock carried in-store (e.g. Kodak Double-X, Cinestill).
  - Darkroom equipment & chemicals (D-76 developer, tanks, printing paper).
  - "Last Verified" system showing the last stock-update date.

B. Film Stock Index & Gallery
- Catalog & Metadata: search by film name, ISO (100, 200, 400, 800), and format (135, 120).
- Community Inspiration Gallery: sample photos from each film stock to preview its tone before buying.
- Reverse Search: a film stock's detail page shows which nearby labs carry it.

C. Community & Data Integrity
- "Suggest Lab / Suggest Edit": a form to propose a new lab or flag a change to existing data.
- Community Upvote / Badges: vote on a lab's strengths, e.g. "Fast Turnaround", "Clean Scan".

D. Minimal Photobook Portfolio (/u/@username)
- Concept: a public profile page styled like Early Instagram meets a fine-art photobook — showcasing craft, with no ad noise and no like counts.
- Core Mechanics:
  - Curation by Photobook: photos are displayed as a curated set (Photobook) or minimal grid that respects true aspect ratio (3:2, 1:1, 6:7).
    - **Superseded (2026-09-01):** the curation unit was originally "Roll" (a fixed set, one Lab/Camera/Scanner/Film Stock context per group). This is retired — see [CONTEXT.md](../CONTEXT.md) and [docs/prd/photobook-portfolio.md](prd/photobook-portfolio.md) for the resolved decision. The model pivoted to an Are.na-style **Photo** (the atomic unit; can belong to many Photobooks) + **Photobook** (the curated collection) + **Connection** (saving another user's public Photo into your own Photobook by reference, without re-uploading it). Treat the linked PRD as canonical.
  - Analog Metadata Linkage: each Photo ties to Film Stock, Camera, and Scanner in the central directory — never to a specific Lab, per the content-integrity rule above.
  - Short Artist Note: a short 2-3 line note under each Photobook.
  - MVP Safeguards: a cap on original photo uploads per user, to bound storage and push toward "best shots only" (Connections don't count against the cap).

3. Design Direction & Visual Identity
- Vibe & Influence: inspired by street & editorial photographers (Saul Leiter, Cartier-Bresson, Vivian Maier, Joe Greer, Willem Verbeeck).
- Layout & Space: editorial grid, high negative space, no heavy borders or generic-SaaS drop shadows, no rounded corners.
- Color Palette:
  - Light: warm fine-art paper (e.g. #F9F8F6, off-white).
  - **Superseded (2026-09-04):** a dark palette was originally planned here. Decided against a dark theme — light mode only. See [CLAUDE.md](../CLAUDE.md#design-direction--visual-identity-not-yet-implemented) and [docs/design-system/visual-identity.html](design-system/visual-identity.html).
- Typography Pairing:
  - Headings / Series Title: editorial serif (e.g. Instrument Serif or Newsreader).
  - Metadata / UI Labels: clean minimalist sans, like an exhibition tag in a gallery.
    - **Superseded (2026-09-04):** "small mono" was originally offered as an alternative here. Decided against any monospace/typewriter font for UI text — sans only. See [CLAUDE.md](../CLAUDE.md#design-direction--visual-identity-not-yet-implemented).
- Frame Respect: no forced cropping; supports contact-sheet-style display with original film edges.
- Authentication: Google OAuth 2.0 only — no email/password sign-in. See [CLAUDE.md](../CLAUDE.md#authentication-not-yet-implemented).

4. Suggested Tech Stack
- Frontend: Next.js (App Router), Tailwind CSS, shadcn/ui.
- Backend / API: Go, or Next.js Server Actions / API Routes.
- Database: PostgreSQL (Supabase) + PostGIS extension for distance/proximity calculations.
