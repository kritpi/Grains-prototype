# PRD: Lab Directory & Discovery

Status: scope locked via grilling session, personas/journeys/edge cases to follow before build.

## Persona

Single persona for this feature — the **community member** (a film shooter). No Lab Owner persona, no Moderator/Admin persona in MVP.

- Browsing/searching requires no account.
- Contributing (add a lab, edit a lab, mark closed, upload atmosphere photos) requires a logged-in account. Every contribution is attributed to that user.

## In scope

**Discovery**
- Default entry point auto-locates the user ("labs near me"); manual location/city search is always available as a first-class alternative, not just a permission-denied fallback.
- Filter by chemical process (C-41, ECN-2, B&W, E-6) and scanner model (Fuji Frontier, Noritsu, SP-3000).
- Filter by distance/radius: user-facing control, 5 km default, adjustable. The same default applies everywhere a radius is used — initial search, the "widen radius" prompt on a zero-result filtered search, and reverse search from a Film Stock's detail page.
- Result ranking (nearest first, weighted toward more-complete listings) is the only order offered — no separate user-facing "sort by" control.
- Bilingual: Thai and English.

**Add Lab** (requires login)
- Minimum required to publish: name, location (pin on a map — no full address required), at least one supported chemical process.
- Optional at creation, fillable later by any contributor: pricing and turnaround per process, services, contact info (phone, LINE, Instagram, Facebook, website, email), a landmark note, hours, scanner model, inventory, atmosphere photos.
- Create and Edit are the same form in two modes, not separate flows — see Decision Ledger #7.
- Soft duplicate prevention: existing nearby labs are shown on the map during the location-picking step, so a contributor can notice "this is already listed" before submitting. No automated/fuzzy duplicate detection, no hard block.

**Edit Lab** (requires login)
- Edits go live immediately — no review/moderation queue. Trust by default.
- Edits are submitted as field-level diffs: only changed fields are written, so two contributors editing different fields on the same lab never overwrite each other. (Two contributors editing the *same* field concurrently is not yet resolved — see Open questions.)
- Contributor may optionally attach a short note to their edit, surfaced in the edit history log.
- Full edit history retained (who changed what, when), so bad edits can be traced and reverted.

**Lab status**
- Weekly hours schedule, used to compute "open now" automatically.
- Separate manual status override for exceptions not captured by a weekly schedule (e.g. "Temporarily Closed," "Renovating"). Same trust-by-default editing as any other field.
- "Mark as Closed" (permanent): a status flag, not a delete — preserves history. Closed labs are hidden from default search results but remain viewable via direct link (e.g. a bookmarked URL, or a Film Stock's reverse-search result that still lists it). Same trust-by-default editing as a regular edit.

**Services**
- Curated, fixed catalog (e.g. storefront drop-box, mail-in, push/pull processing, hi-res scan, negative return by pickup or delivery), plus contributor-added freeform entries. See Decision Ledger #2 for why custom entries display but don't filter.

**Photos**
- **Lab Atmosphere Photos** — optional, storefront/interior photos attached directly to the Lab. Any contributor can add. See [CONTEXT.md](../../CONTEXT.md) for the distinction from Film Sample Photos.
- Film Sample Photos are explicitly **not** part of this feature — they attach to Film Stock, never to a Lab (existing core rule).

**Inventory & Supplies** (simplified from Idea.md's original version)
- Film stock sold: must link to an actual entry in the Film Stock catalog (this is what powers reverse search from a film's detail page — a dependency on the not-yet-grilled Film Stock Index & Gallery feature). A contributor naming a stock that isn't in the catalog yet adds it inline (permitted by the Film Stock Index & Gallery PRD's trust-by-default catalog model), rather than being blocked.
- Darkroom equipment/chemicals sold: curated category tags (e.g. "developing chemicals," "enlarging paper") plus contributor-added freeform tags, no catalog linkage. Same display-only, non-filterable treatment as custom Services (Decision Ledger #2).
- No stock quantity, no real-time stock, no "Last Verified" freshness mechanic — this is "what do they sell," not live inventory.

**Empty states**
- No labs found nearby at all: prompt to add the first lab.
- No labs match the current filter: prompt to add/edit a *nearby* lab to include the missing process — not create a brand-new lab. Surface the specific nearby labs as a "near-miss" list of candidates rather than a single generic CTA.

## Decision Ledger — Contribution Form Parity (2026-09-04)

The prototype's lab detail page displayed several fields (per-process pricing, services, contacts, a landmark note) that the Add Lab / Suggest Edit form had no way to actually set. These decisions bring the form's data model in line with the detail page.

### 1. Pricing & turnaround granularity — RESOLVED

**Decision:** Pricing and turnaround are captured per chemical process, and per format (135/120) within that process — a matrix, not a single scalar. A blank cell means that price/turnaround hasn't been entered, distinct from "not offered" (the process isn't selected at all).

**Rationale:** The detail page has always displayed a per-process, per-format pricing table; without this, the underlying prototype was deriving the 120 price by inflating the 135 price by a fixed 20%, which is fictional data presented as if community-sourced. The form must be able to produce the data the detail page claims to show.

### 2. Custom Services and Supplies — RESOLVED

**Decision:** Services and darkroom supplies each have a curated, fixed default list a contributor can tick, plus a freeform "add one not listed" entry. Custom entries display on the lab's page like any other, but never become a search-filter option — only the curated list can back a filter.

**Rationale:** Mirrors the reasoning already locked for badges in [community-data-integrity.md](community-data-integrity.md) Decision #1: there's no Moderator/Admin persona in MVP, so a freeform filter namespace has no cleanup path for synonyms ("push/pull" vs "push-pull processing" vs "stop bath dev"). Restricting custom entries to display-only keeps the flexibility contributors want without polluting the one thing (a filter) that depends on names being consistent.

### 3. Film stock carried must resolve to a catalog entry — RESOLVED

**Decision:** Unchanged from the original Inventory rule, restated here because it interacts with the form: a lab can't "carry" a film stock that isn't a catalog entry. If a contributor's stock isn't listed, they add it to the catalog inline, from within the Add Lab / Suggest Edit form.

**Rationale:** Reverse search from a Film Stock's detail page (this PRD's dependency on [film-stock-index-gallery.md](film-stock-index-gallery.md)) only works if "carries this stock" is a real link, not a text label. The Film Stock PRD's Decision #1 already permits any logged-in user to add a catalog entry, so the inline add-to-catalog affordance in this form isn't a new trust decision — it's exposing an existing one at the point a contributor needs it.

### 4. Location capture: pin over address — RESOLVED

**Decision:** Dropping a pin on a map is the primary, required location input — not typing a full address. A secondary "street / area" field is still available (editable, intended to be auto-filled from the pin) for contributors who want to refine it. A new **Landmark note** field — free text describing what to look for (e.g. "above the 7-Eleven, unmarked door") — is optional and displayed on the lab page alongside the address.

**Rationale:** A pin is faster to place accurately than a Thai address is to type correctly, and it's what distance/proximity search (`ST_DWithin`) actually needs. The landmark note captures the "how a person finds this in practice" information a formal address doesn't, especially relevant for labs down a soi or above another business.

### 5. Contact channels: typed and repeatable — RESOLVED

**Decision:** Contact is a repeatable list of `{channel, value}` pairs — phone, LINE, Instagram, Facebook, website, email — rather than three fixed fields (phone/IG/LINE). A lab can have any subset, including channels not yet offered as defaults.

**Rationale:** Phone/IG/LINE as three hardcoded fields undersold what labs actually use in practice (Facebook Pages are common for small Thai businesses). A typed list is also what lets the detail page conditionally show the "Call" and "LINE" quick-action buttons only when that channel actually exists, instead of always rendering three buttons regardless of whether the lab has a phone number.

### 6. Atmosphere photos are addable from the contribution form — RESOLVED

**Decision:** The Add Lab / Suggest Edit form includes an atmosphere-photo add/remove control, not just the detail page's read-only carousel.

**Rationale:** Restates the existing content-integrity rule at the point of entry: this control is documented in the form itself as "venue documentation only — sample scans are never attached to a lab," so a contributor can't mistake it for a place to upload a film sample photo.

### 7. One form, two modes — RESOLVED

**Decision:** Add Lab and Suggest Edit are the same form, toggled by a create/edit mode rather than being two maintained flows (e.g. a separate multi-step wizard for creation). Create mode adds a name field and gates the publish action on name + pin + at least one process; edit mode seeds every field from the existing lab and gates on there being at least one changed field.

**Rationale:** Every field added to one flow needs to exist in the other anyway — a lab created with only the required minimum immediately needs every optional field editable later. Maintaining one form structurally guarantees the two stay in parity; maintaining two flows makes that a discipline problem instead.

## Out of scope (this MVP round)

- Lab Owner accounts / claim-your-listing flow.
- Moderator/Admin review queue — all contributions trusted and live immediately.
- Automated/fuzzy duplicate detection.
- Formal "merge duplicate labs" tooling — manual cleanup only if a duplicate slips through.
- Real-time or quantity-based stock tracking.
- "Last Verified" timestamp mechanic for inventory.

## Edge cases

1. **Two contributors add the same physical lab** — soft-prevented by surfacing nearby existing labs during the add-lab location step; not hard-blocked. Cleanup, if needed, is manual.
2. **Lab permanently closes** — "Mark as Closed" flag, not deletion; hidden from default search, still viewable via direct link.
3. **Lab temporarily unavailable** (holiday, renovation) — manual status override, independent of both the weekly-hours schedule and the permanent-closed flag.
4. **Search returns zero labs nearby** — CTA to add the first lab.
5. **Filtered search returns zero results** — CTA to add/edit a nearby lab to add the missing process, distinct from the "no labs at all" case.
6. **Photo type ambiguity** — resolved as two distinct concepts with different attachment rules: Lab Atmosphere Photos (linked to Lab) vs. Film Sample Photos (linked to Film Stock, never to Lab).

## Open, smaller questions resolved inline

- Result ranking: nearest + most-complete-data first.
- Language: Thai and English both required in MVP.

## Open questions (not yet resolved)

- **Same-field edit collision**: field-level diffs mean two contributors editing *different* fields never overwrite each other, but what happens when two contributors edit the *same* field concurrently (or a value changes underneath a stale, already-loaded edit form) is undecided.
- **Reverse search → lab map filter**: reverse search from a Film Stock's detail page implies a "carries film stock X" filter on the lab map, which isn't part of this PRD's filter model (process + scanner + radius). Whether the lab map supports this filter, and how it's specified, belongs to the Film Stock Index & Gallery PRD once that feature is grilled — flagged here as a cross-feature dependency.
- **Diff granularity for structured fields**: with pricing, services, and contacts now each a group of values rather than one scalar, it's undecided whether a diff (and the resulting history entry / same-field-collision unit above) should apply per group or per individual value within it — e.g. whether two contributors editing different processes' prices on the same lab collide the way editing the same field does today.
