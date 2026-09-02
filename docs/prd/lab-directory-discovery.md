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
- Result ranking: nearest first, weighted toward listings with more complete data.
- Bilingual: Thai and English.

**Add Lab** (requires login)
- Minimum required to publish: name, location (address/pin), at least one supported chemical process.
- Optional at creation, fillable later by any contributor: pricing per process, turnaround time, drop-box/mail-in service, contact info, hours, scanner model, inventory, atmosphere photos.
- Soft duplicate prevention: existing nearby labs are shown on the map during the location-picking step, so a contributor can notice "this is already listed" before submitting. No automated/fuzzy duplicate detection, no hard block.

**Edit Lab** (requires login)
- Edits go live immediately — no review/moderation queue. Trust by default.
- Full edit history retained (who changed what, when), so bad edits can be traced and reverted.

**Lab status**
- Weekly hours schedule, used to compute "open now" automatically.
- Separate manual status override for exceptions not captured by a weekly schedule (e.g. "Temporarily Closed," "Renovating"). Same trust-by-default editing as any other field.
- "Mark as Closed" (permanent): a status flag, not a delete — preserves history. Closed labs are hidden from default search results but remain viewable via direct link (e.g. someone's Roll references it). Same trust-by-default editing as a regular edit.

**Photos**
- **Lab Atmosphere Photos** — optional, storefront/interior photos attached directly to the Lab. Any contributor can add. See [CONTEXT.md](../../CONTEXT.md) for the distinction from Film Sample Photos.
- Film Sample Photos are explicitly **not** part of this feature — they attach to Film Stock, never to a Lab (existing core rule).

**Inventory & Supplies** (simplified from Idea.md's original version)
- Film stock sold: must link to an actual entry in the Film Stock catalog (this is what powers reverse search from a film's detail page — a dependency on the not-yet-grilled Film Stock Index & Gallery feature).
- Darkroom equipment/chemicals sold: loose category tags (e.g. "developing chemicals," "enlarging paper"), no catalog linkage.
- No stock quantity, no real-time stock, no "Last Verified" freshness mechanic — this is "what do they sell," not live inventory.

**Empty states**
- No labs found nearby at all: prompt to add the first lab.
- No labs match the current filter: prompt to add/edit a *nearby* lab to include the missing process — not create a brand-new lab.

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
