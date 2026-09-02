# PRD: Community & Data Integrity — Upvotes/Badges

Status: grilling in progress. Note: the broader "Suggest Lab / Suggest Edit" contribution model (trust-by-default, live edits, attributed to logged-in users) was already resolved during Lab Directory grilling — see [lab-directory-discovery.md](lab-directory-discovery.md). This document covers the upvote/badge system specifically.

## Decision Ledger

### 1. Badge set model: fixed vs. freeform — RESOLVED (2026-09-01)

**Decision:** Badges are a fixed, curated list defined in the product itself (e.g. "Fast Turnaround," "Clean Scan," "Accurate Colors," "Good for Beginners" — exact roster TBD as a content decision, not a requirements one). Users vote to endorse/apply an existing badge on a Lab; they cannot propose new badge names.

**Rationale:** There is no Moderator/Admin persona in MVP (locked in the Lab Directory PRD). Freeform tagging has no backstop to consolidate duplicates/synonyms ("Fast," "Quick Turnaround," "Speedy" could all coexist as separate badges), which would undermine the entire point of a badge — a comparable, scannable signal across every Lab. This matches the "Labs = information-first, structured" core rule already established in [CLAUDE.md](../../CLAUDE.md). A fixed list can still be expanded later via a product update; a polluted freeform namespace has no cleanup path without an admin role.

### 2. Vote retractability and cardinality — RESOLVED (2026-09-01)

**Decision:** Badge votes are a retractable toggle. Each (user, lab, badge) combination is a single binary on/off state — a user can endorse a badge on a lab and later un-endorse it, at any time. A badge's displayed strength is always the current count of active endorsements, not a historical total.

- This also settles cardinality: one vote per user per badge per lab is inherent to the toggle (there's only one state to flip), no separate spam-prevention rule needed for repeat voting by the same user.

**Rationale:** Consistent with the correction-friendly philosophy already established across the rest of the product (live edits, full edit history, manual status overrides for exceptions). Badges should reflect current community sentiment about a lab, not an irreversible historical ledger — a lab that's declined shouldn't be stuck wearing a badge it earned once and can never lose.

### 3. Badge display threshold — RESOLVED (2026-09-01)

**Decision:** No minimum vote count required. A badge displays on a Lab's page as soon as it has ≥1 active endorsement, always shown alongside its current count (e.g. "Clean Scan · 1").

**Rationale:** Matches the transparency-over-gatekeeping pattern already used elsewhere in the product (visible edit history rather than hiding low-confidence edits, showing raw distance/completeness in search ranking rather than a black-box score). A visible count lets users judge credibility themselves, and avoids inventing an untuned threshold constant or a cold-start "pending badge" state for lower-traffic labs.
