# Grilling backlog

Features from [Idea.md](Idea.md) not yet walked through in a grilling session. Each needs its own persona/journey/scope pass before build, same as [Lab Directory & Discovery](prd/lab-directory-discovery.md).

- **B. Film Stock Index & Gallery** — catalog contribution model, catalog entry identity, and gallery sourcing model resolved; see [prd/film-stock-index-gallery.md](prd/film-stock-index-gallery.md). Gallery is a derived view of Film-Stock-tagged Photos (atomic entity, see **D**'s Are.na pivot) — this now only depends on the Photo upload/trust model in D, not on Photobook curation mechanics. Catalog browsing (name/ISO/format) and reverse search mechanics still to walk through.
- **D. Minimal Photobook Portfolio (`/u/@username`)** — **Pivoted (2026-09-01) from a rigid Lab → Roll → Photo hierarchy to an Are.na-inspired model**; core mechanics now resolved, see [prd/photobook-portfolio.md](prd/photobook-portfolio.md): the Photo/Photobook/Connection model itself, content-integrity rule reaffirmed (Scanner model OK, Lab attribution never), Connections are references (not copies), Photos are instant-live (no draft state), per-user cap applies to original uploads only, no restriction on Connecting, one artist's note per Photobook, and deleted Connections silently reflow (no tombstone). Remaining loose ends (lower priority, mechanical rather than structural): exact numeric cap value, and which Photo metadata fields are mandatory vs. optional at upload.
- **Design Direction & Visual Identity** — translating the visual/typography/color brief into concrete UI decisions.
- **Tech stack decision** — expanded into its own ranked backlog of 9 open infrastructure/architecture decisions; see [tech-decisions-backlog.md](tech-decisions-backlog.md).

## Post-MVP

Features intentionally out of scope for MVP. Not yet grilled — each needs its own persona/journey/scope pass when it comes up for a future release, same as the MVP backlog above.

- **User-to-user discovery (following/feed)** — deferred (2026-09-04) when reviewing **D**'s discovery model; see decision 9 in [prd/photobook-portfolio.md](prd/photobook-portfolio.md). MVP discovery is Connection-graph-only (Film Stock gallery / Photobook → Photo → uploader's `/u/@username`), with no following, followers, or feed. Open note for whenever this is grilled: consider a lighter-weight primitive ("more Photobooks by this curator") before defaulting to a conventional follow/feed model, since a social graph and notification system sit in tension with the product's quiet, ad-free, no-like-counts positioning.
