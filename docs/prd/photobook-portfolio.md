# PRD: Minimal Photobook Portfolio (`/u/@username`)

Status: grilling in progress — decisions logged below as resolved; persona/journeys/full edge cases to follow.

## Decision Ledger

### 1. Model pivot: Are.na-style Photo / Photobook / Connection — RESOLVED (2026-09-01)

**Decision:** Replace the original rigid `Lab → Roll → Photo` hierarchy with an Are.na-inspired model:

- **Photo** — the atomic entity. Carries metadata (Film Stock, Scanner model, Camera, Chemistry — never a specific Lab, see decision 2). A Photo can belong to multiple Photobooks and exists independently of any of them.
- **Photobook** — a thematic, concept-driven collection curated by a user (e.g. "Bangkok Overcast," "Portra 400 Skin Tones"). Public by default. Can mix the curator's own Photos with Photos Connected from other users. Replaces "Roll" as the curation unit.
- **Connection** — a user saving another user's public Photo into their own Photobook without re-uploading it. Creates the interconnected discovery graph described in the product vision (browse a Photobook → click a Photo → see its Film Stock/Scanner metadata).

"Roll" is retired as a curation-unit term (see [CONTEXT.md](../../CONTEXT.md) Retired Terms) — a photo is no longer locked to the single group it was originally curated into.

**Rationale:** User-directed pivot. Individual photos as reusable, independently-discoverable atomic blocks (rather than fixed once inside a Roll) better serves the "emergent community knowledge" and cross-user discovery goals than the original rigid grouping.

### 2. Content-integrity rule reaffirmed under the new model — RESOLVED (2026-09-01)

**Decision:** The existing no-lab-attribution rule (see [CONTEXT.md](../../CONTEXT.md)) survives the pivot unchanged in spirit, with one clarification: Scanner *model* (e.g. Noritsu, Frontier, SP-3000) is allowed on a Photo as neutral technical metadata — the same category as Camera — but the specific Lab that processed a Photo is never shown or linkable from it, individually or in aggregate.

**Why this came up:** The pivot's original "Reverse Attribution" pitch ("clicking a photo they love, and seeing the exact Lab + Scanner used") directly conflicted with the locked rule that community photos never attribute to a specific Lab, since the same photo→lab link that lets a good scan reflect well on a lab also lets a bad one reflect badly. Considered and rejected: (B) knowingly override the rule, (C) lab-level aggregate "aesthetic signature" opt-in. Rejected because the user's own briefing said to keep the lab-directory core intact, and Scanner model already provides most of the aesthetic-discovery value the pivot wants (Noritsu vs. Frontier vs. SP-3000 is a known differentiator in this community) without reintroducing per-photo reputational risk to a specific business.

**Rationale:** Preserves a deliberately-designed protection rather than silently reversing it as a side effect of an unrelated model pivot.

### 3. Connection semantics: reference vs. copy — RESOLVED (2026-09-01)

**Decision:** Connections use a reference model. There is one canonical Photo object; every Photobook that Connects it holds a pointer to that same object, not a duplicate.

- Editing the original Photo's metadata (e.g. correcting a Film Stock tag) updates it everywhere it's Connected.
- Attribution ("via @original-uploader") is automatic and provable, not a stored/copyable fact.
- If the original uploader deletes the Photo (or their account), it's removed from every Photobook that Connected it. The Connecting Photobook shows a "removed by uploader" placeholder in that slot rather than silently collapsing the layout or breaking — full removal-cascade UX to be defined as an edge case later.
- This keeps the Film Stock Gallery (feature B, which derives from Photo metadata) always consistent with the source Photo — no drift between what the Gallery shows and what the original uploader intended.

**Rationale:** True Are.na-style behavior — one canonical object per Photo is what actually produces "emergent community knowledge" (everyone connecting a given Photo is looking at/citing the same source of truth) rather than a fork the moment someone saves it.

### 4. Photo visibility model: instant-live vs. draft — RESOLVED (2026-09-01)

**Decision:** A Photo is public, connectable, and Film-Stock-Gallery-eligible the moment it's uploaded and tagged. No draft/private state, no separate publish step.

- Matches the trust-by-default precedent already set for Labs and the Film Stock catalog.
- Matches actual Are.na block behavior — a block is live the instant it's added, since it's raw curatable material rather than a finished composition.
- No state machine needed on the Photo entity for MVP.

**Rationale:** The reference-model Connection (decision 3) is the real Are.na mechanic, and that mechanic assumes blocks are live immediately — there's no "moment of unveiling" for a single Photo the way there was for a whole Roll. Curation/composition happens at the Photobook level, which is already public-by-default per the product brief, so gating individual Photos behind a draft state would add a visibility state machine without a clear matching benefit.

### 5. Per-user Photo cap: scope after the reference-model pivot — RESOLVED (2026-09-01)

**Decision:** The MVP per-user Photo cap applies only to a user's own **original uploads**. Connecting other users' Photos into one's own Photobooks is unlimited — Connections don't count against the cap.

- Exact numeric value of the cap still to be set (not a requirements-level decision — deferred to a later, more mechanical pass).

**Why this needed re-deciding:** The original rationale (Idea.md: bound storage, push toward "best shots only") assumed every Photo in a Photobook was a stored copy. Under the reference model (decision 3), Connections are pointers with zero additional storage cost, so the storage argument no longer applies to them — only to original uploads.

**Rationale:** Capping total Photos including Connections (rejected alternative) would directly work against the network-effect/interconnected-discovery goal the whole Are.na pivot is built around — it would ration the very behavior (Connecting widely) the model wants to encourage. Keeping the cap on original uploads only preserves the intended curatorial discipline ("make your own contributions count") without taxing collaborative discovery.

### 6. Connection consent — RESOLVED (2026-09-01)

**Decision:** No restriction for MVP. Any public Photo can be freely Connected into any user's Photobook by any other user — no opt-out, no per-Photo or account-wide permission gate.

- An uploader's only recourse if unhappy with how a Photo is being used elsewhere is to delete the Photo outright, which cascades and removes it from every Photobook that Connected it (per decision 3's "removed by uploader" placeholder behavior).

**Rationale:** Matches Are.na's actual precedent — public blocks are freely reusable, no permission layer on reuse. Avoids building Connection-time permission checks before there's evidence uploaders actually want this control, and any friction here directly undermines the network-effect goal the pivot is built around. Easier to add restriction later if abuse proves real than to retrofit openness into a product that launched restrictive.

### 7. Artist's note placement — RESOLVED (2026-09-01)

**Decision:** One short artist's note (2-3 lines) per Photobook, shown once for the whole collection. No per-Photo caption within a Photobook.

**Rationale:** Matches the original brief's wording almost exactly ("under a curated set") and protects the fine-art-photobook visual direction — high negative space, no generic-SaaS clutter. A caption under every photo slot, especially as Photobooks grow via free Connecting, would push the layout toward a busier, more caption-heavy feel than intended.

### 8. Deleted-source Connection behavior — RESOLVED (2026-09-01)

**Decision:** Silent removal. When the canonical Photo behind a Connection is deleted, its slot is removed entirely from every Photobook that Connected it, and the grid re-flows as if that Connection never existed. No placeholder/tombstone.

**Amends decision 3**, which had left this open with a placeholder assumption ("removed by uploader" tombstone) — superseded by this decision.

**Rationale:** User-directed: prioritizes every Photobook always presenting as clean and intentional over surfacing the fact that a removal happened. Note for later grilling: this means a curator gets no signal that their composition/sequence changed and no record of what used to occupy that slot — worth revisiting if this turns out to matter once Photobooks are used as deliberately sequenced photo-essays rather than loose grids.
