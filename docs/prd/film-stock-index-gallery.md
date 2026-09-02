# PRD: Film Stock Index & Gallery

Status: grilling in progress — decisions logged below as resolved; persona/journeys/edge cases to follow.

## Decision Ledger

### 1. Catalog contribution model — RESOLVED

**Decision:** Film Stock catalog uses the same trust-by-default model as Labs (see [Lab Directory & Discovery](lab-directory-discovery.md)).

- Any logged-in user can add a new film stock entry (name, ISO, format) or edit an existing one.
- Edits go live immediately — no moderation/review queue.
- Full edit history retained (who changed what, when).
- Soft duplicate prevention: similar existing stocks are surfaced while adding a new one, so a contributor can notice "this already exists" before submitting. No automated/fuzzy duplicate detection, no hard block.

**Rationale:** Consistent with the precedent already set for Labs. Keeps the Lab Directory's Inventory→Film Stock linkage (locked in the Lab Directory PRD) from becoming a launch blocker — a lab carrying a niche or regional film stock isn't stuck waiting on an admin. Film stock names are also a lower-risk namespace to crowdsource than lab business data (pricing, hours, contact info); a junk or duplicate entry is cheap to spot and merge later.

### 2. Catalog entry identity (format granularity) — RESOLVED

**Decision:** One catalog entry per film name + ISO. Format (135, 120, …) is a multi-select attribute on the entry, not a separate entry.

- "Kodak Portra 400" is a single entry, tagged with the formats it's available in (e.g. `[135, 120]`).
- Lab Inventory (Lab Directory PRD) links to the one entry; a lab can indicate which formats of that stock it carries.
- Gallery sample photos attach to the one entry and may optionally be tagged with the format that specific photo was shot on, but do not fork the catalog identity.
- Reverse search matches on the entry; format is a filterable attribute on top, not a separate search space.

**Rationale:** The emulsion is identical across formats of the same stock — format describes how a specific roll was shot, not a property of the film stock itself. Splitting by format would fragment the inspiration gallery (a 120 sample doesn't surface when browsing what most people search as "Portra 400") and double catalog maintenance for every stock sold in multiple formats, without giving reverse search or inventory linkage a benefit that a format attribute doesn't already provide.

### 3. Gallery sourcing model — RESOLVED (superseded by Are.na pivot, still holds)

**Decision:** The Film Stock Gallery has no upload flow of its own. It is a derived view: any Photo a user uploads and tags with a Film Stock automatically surfaces on that stock's public Gallery — independent of which Photobook(s), if any, that Photo has been curated into.

- No separate direct-upload path for feature B.
- **Update following the Are.na-model pivot (see [backlog.md](../backlog.md)):** the source of Gallery photos is now the atomic **Photo** entity directly, not a "Roll." A Photo only needs Film Stock metadata tagged on upload to qualify for the Gallery — it doesn't need to belong to any Photobook at all. This *simplifies* the original dependency: the Gallery no longer depends on Photobook-curation mechanics (draft/publish state, grouping), only on Photo upload + Film Stock tagging.
- Scanner *model* may appear as metadata on a Gallery photo (per [CONTEXT.md](../../CONTEXT.md)'s content-integrity rule); the specific Lab that processed it is never shown or linkable.
- **Still open:** whether Photo upload itself is trust-by-default/instant-live (matching Labs and the Film Stock catalog) — this is being resolved as part of feature D's Photo/Photobook/Connection model, since that's where upload happens.
- **Accepted MVP risk:** cold start — a film stock can have zero gallery photos if no one has uploaded a tagged Photo yet.

**Rationale:** Reuses community-tagged Photos rather than standing up a second, uncurated upload surface that would work against the "inspiration-first" mood-board intent for Films. The Are.na pivot actually *reduces* this feature's dependency on feature D, since Gallery inclusion now hinges only on the Photo entity (upload + tagging), not on Photobook curation mechanics.
