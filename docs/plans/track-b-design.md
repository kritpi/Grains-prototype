# Track B — the two design artefacts, before any code

Phase 2, Track B. Written 2026-09-08, before the worktree is cut.

Two things the build plan asks for but does not specify, and both get expensive
once `components/lab-form/**` exists: the **completeness formula** (B2's
`recomputeCompleteness`) and the **leaf-path grammar** (B1, `lib/labs/paths.ts`
— the plan's "riskiest design artefact in Phase 2"). Neither has a definition
anywhere in the repository. This file is the review artefact; the code follows
it.

---

# 1. Completeness

## What it actually is

`labs.completeness` is a `smallint` 0–100, `CHECK (BETWEEN 0 AND 100)`,
recomputed inside every write transaction. Searching the whole corpus — the
PRDs, `00_BACKLOG.md`, `api-surface.md`, the wireframe, the design system and
the prototype — it appears exactly three times:

- the column, with the comment "backs search ranking";
- `order by distance_m asc, l.completeness desc, l.id` in `searchLabs`;
- one line of prototype copy: **"N labs · nearest + most complete first"**.

So it is **a tiebreaker among labs at similar distance, and it is never shown as
a number.** Nothing in the product displays a percentage, a progress bar or a
"this lab is 60% complete" prompt. That settles more than it looks like it does:
the formula does not have to be defensible to a lab owner reading their own
score, it has to rank a lab with real data above a stub. It needs to be
monotone, cheap in one statement, and stable enough that changing it later is a
backfill rather than a migration.

## The rule that decides the shape

**Adding information must never lower the score.**

The tempting formula is a filled-in ratio — priced cells over possible cells,
say. It is wrong, and wrong in the direction that punishes exactly the
contributor the product wants:

> A lab offers C-41 and has both formats priced. `2/2` — 100%.
> A contributor adds that the lab also runs E-6, and stops there because they
> do not know the E-6 price. `2/4` — 50%.

The lab now carries strictly more true information and ranks lower. Any measure
with a denominator that grows when a contributor adds a fact has this bug. So
every facet below is scored as `least(count, cap) × unit`: a fixed ceiling,
never a proportion. The denominator is always 100 and never moves.

## What is not scored, and why

- **Anything `createLab` gates on** — name, pin, at least one process. Every lab
  has them by construction, so they are a constant added to every row and buy
  nothing in a tiebreaker. They would only shrink the useful range.
- **Darkroom supplies.** Display-only; they back no filter and answer no
  question a searcher acts on. Scoring them would either push the table past
  100 or dilute a field that does.
- **Atmosphere photos.** There is no write path until Track C. Scoring a field
  nobody can fill would cap every lab in the product below 100 permanently,
  which reads as a defect rather than a design. General rule: **nothing is
  scored that the product cannot yet write.** Revisit when C merges.
- **`status` / `status_note`.** A lab should not gain search rank for being
  closed.

## The table

Points go to facts a searcher can act on. The heaviest weights go to fields that
back a filter, or answer the first question anyone asks about a lab.

| Facet | Measure | Points |
| --- | --- | --- |
| Price | `least(count(lab_pricing WHERE price_thb IS NOT NULL), 4) × 5` | 20 |
| Hours | all seven days entered (`jsonb_array_length(hours) = 7`) | 15 |
| Turnaround | `least(count(lab_pricing WHERE turnaround_min_d IS NOT NULL), 2) × 5` | 10 |
| Contacts | `least(count(lab_contacts), 2) × 5` | 10 |
| Scanners | `least(count(lab_scanners), 2) × 5` | 10 |
| Services | `least(count(lab_services WHERE service_key IS NOT NULL), 2) × 5` | 10 |
| Inventory | `least(count(lab_stock), 2) × 5` | 10 |
| Area | `area_en` or `area_th` present | 5 |
| Finding it | `street` or `landmark_note` present | 5 |
| Thai name | `name_th` present | 5 |
| | | **100** |

Two notes on the choices:

- **Services counts curated rows only.** A contributor's freeform service is
  invisible to the search filter by construction (PRD A #2, and the partial
  index that enforces it). Letting it move a search-ranking number would
  reintroduce through the back door the thing the index was built to prevent —
  and would make the score farmable by typing anything into the custom row.
- **Price is worth four cells and turnaround two.** Price is the first question;
  a lab with one price beats a lab with none by 5, and a fully-priced matrix is
  worth a fifth of the whole score. Turnaround caps lower because the schema
  stores it per `(process, format)` and two entered cells already tell a
  searcher what they need.

## Shape of the implementation

One statement, sub-selects per facet, inside the caller's transaction:

```sql
UPDATE labs SET completeness = least(100,
    5 * least((SELECT count(*) FROM lab_pricing p
                WHERE p.lab_id = labs.id AND p.price_thb IS NOT NULL), 4)
  + 5 * least((SELECT count(*) FROM lab_pricing p
                WHERE p.lab_id = labs.id AND p.turnaround_min_d IS NOT NULL), 2)
  + CASE WHEN jsonb_array_length(labs.hours) = 7 THEN 15 ELSE 0 END
  + ...
), updated_at = now()
WHERE id = $1
```

`least(100, …)` is belt-and-braces: the weights already sum to 100, and the
check constraint is the real backstop. It costs nothing and means a future
weight typo degrades the ranking instead of failing the write.

## The backfill nobody has scheduled

**All seven seeded Bangkok labs sit at `completeness = 0`** — `bangkok-labs.sql`
says so explicitly and defers the number to Track B. Since the value is only
recomputed inside a write transaction, those rows stay at zero until somebody
edits them through the form. Until then `order by distance_m, completeness desc`
has an inert tiebreaker and the prototype's "most complete first" is a claim the
product does not keep.

So B2 ships `recomputeAllCompleteness(tx)` alongside the per-lab function, and a
`pnpm db:backfill:completeness` script that calls it. Not a SQL seed file: the
formula would then exist in two places, and the one layering rule says SQL lives
in `lib/queries/`. `db/seed/bangkok-labs.sql` is Track A's file and is not
touched.

---

# 2. The leaf-path grammar

## What a path is

`edit_history.changes` is a non-empty array of `{path, from, to}`. A path
addresses **one leaf of a lab viewed as a document** — not a column, not a row.
The point is not the log; the log is a consequence. The point is:

> **The form submits a diff, not a document.**

This is the thing most easily lost in B3, and losing it passes every test in the
plan except the one that matters. If `applyLabChanges` writes the whole form
back, a contributor who opened the page an hour ago silently reverts every field
somebody else changed in the meantime — while still bumping the version
correctly and still writing exactly one history row. Leaf paths exist so that a
field the editor never touched is never written.

The version check is the second, coarser net: it catches concurrent edits at the
document level so the UI can say *what moved*, which is what the PRD asks for.
Both, not either.

## The heads

Track A's `components/labs/edit-log-format.ts` already renders these by shape,
and does not import this module by design. It is not a contract, but it is the
set of heads the log knows how to label, so the grammar stays inside it:

`name_en` `name_th` `area_en` `area_th` `street` `landmark_note` `location`
`status` `status_note` `hours` `pricing` `processes` `scanners` `services`
`supplies` `contacts` `stock` `photos`

## The eleven families

### 1. Scalars
```
name_en | name_th | area_en | area_th | street | landmark_note | status | status_note
```
Value `string | null`. `status` is constrained to the `lab_status` enum.
Applies as `UPDATE labs SET <column>`.

### 2. Location — atomic
```
location            → { lat, lng }
```
Deliberately **not** `location.lat` and `location.lng`. A pin is one fact; two
leaves let half a diff land and put a lab in the Gulf of Thailand. Never null —
the column is `NOT NULL`.

The log renders an object leaf as JSON, which is ugly but true. Prettying it is
a Phase 3 display item in Track A's file, not a reason to split the path.

### 3. Hours
```
hours.<0-6>.closed  → boolean
hours.<0-6>.open    → "HH:MM"
hours.<0-6>.close   → "HH:MM"
```
Index 0 = Sunday, matching `extract(dow)` and `DAY_LABELS`. Two traps:

- `labs.hours` has `CHECK (jsonb_array_length IN (0, 7))`. A lab with `[]` cannot
  receive `hours.3.open` — **any hours edit materialises all seven days first**,
  with untouched days as `{"closed": true}`.
- Opening a previously-closed day is three leaves (`closed`, `open`, `close`),
  because the reader coerces `{closed: false}` with no times back to closed. So
  hours changes are collected and the array rebuilt **once**, not applied as a
  chain of `jsonb_set` calls whose result depends on order.

### 4. Processes — and the cascade
```
processes.<c41|ecn2|bw|e6>  → boolean
```
`true` inserts into `lab_processes`, `false` deletes.

**`lab_pricing_lab_id_process_fkey` is `ON DELETE CASCADE`.** Turning a process
off destroys every price and turnaround entered for it. If the diff carries only
`processes.e6 → false`, the history records one boolean and the log tells a
reader nothing about the four price cells that vanished — the log lies by
omission, on the most volatile data in the schema.

So: **a change set that sets a process to `false` must also carry the
`pricing.<process>.*` leaves going to `null`.**

That rule splits in two, and only half of it can live in the grammar. The zod
schema is pure — it sees the diff and not the lab — so it can reject a set that
*contradicts itself* (drops E-6 and prices it in the same save) but cannot know
which cells exist to be accounted for. The other half is a precondition inside
`applyLabChanges`, which has the transaction: it reads the affected
`lab_pricing` rows and refuses a set that leaves any of them unmentioned. Stated
here because the split is not obvious from either side alone, and each half
passes its own tests while the log still ends up lying.

### 5. Scanners
```
scanners.<model>  → boolean
```
`model` is the `scanner_models` primary key — `Fuji Frontier`, `Noritsu`,
`SP-3000`, `Flatbed`. Existence is the foreign key's job.

### 6. Pricing
```
pricing.<process>.<135|120>.price_thb          → number | null
pricing.<process>.<135|120>.turnaround_min_d   → number | null
pricing.<process>.<135|120>.turnaround_max_d   → number | null
```
An all-null row is deleted rather than stored — `lab_pricing_not_empty` requires
it. Pricing a process the lab does not offer is rejected by the composite
foreign key, which is the invariant `tests/db/schema-invariants.test.ts` already
asserts; the grammar does not re-check in code what the database refuses.

### 7. Services — curated and custom
```
services.<service_key>.offered       → boolean
services.<service_key>.note          → string | null
services.<uuid>.custom_label         → string | null
services.<uuid>.note                 → string | null
```
Curated rows are keyed by their catalog key (`dropbox`, `mail_in`, …), custom
rows by the row's uuid. The two are distinguishable by shape, which is all the
apply step needs.

### 8. Supplies
```
supplies.<supply_key>          → boolean
supplies.<uuid>.custom_label   → string | null
```

### 9. Contacts — and client-generated ids
```
contacts.<uuid>.channel    → contact_channel enum
contacts.<uuid>.value      → string | null
contacts.<uuid>.position   → number
```
**The uuid is generated by the client** when a contact row is drafted, not
assigned by the server on insert. That single choice makes add, edit and remove
the same shape — `from: null` is an add, `to: null` is a removal, both a change
— and makes the path stable from the moment the row exists in the form. The
alternative, letting the server assign and rewrite paths afterwards, produces a
history whose paths do not match the diff the client computed.

A client that supplies a colliding uuid fails on the primary key, which is the
correct outcome and needs no check of ours.

### 10. Inventory
```
stock.<film_stock_id>.formats  → ("135" | "120")[] | null
```
`null` deletes the row; `[]` is a lab that carries the stock in a format nobody
has recorded. Both are real states and the column is `NOT NULL DEFAULT '{}'`, so
the distinction is kept.

Note the mock fixture writes `stock.velvia-50.formats` — a slug. `film_stocks`
has no slug column; that path is invented and readable only by luck. Real paths
carry the uuid.

### 11. Photos — reserved
```
photos.<uuid>  → reserved, Track C / Phase 3
```
Declared now so that neither the zod schema nor the log's formatter has to
change when the write path arrives.

## Cross-cutting rules

**Segment charset.** `[A-Za-z0-9 _-]`, and never a `.`. Every segment today is
safe — catalog keys are snake_case, scanner models are `Fuji Frontier` and
`SP-3000` — but `scanner_models.model` is unconstrained `text`, and one future
row called `Nikon Coolscan v.2` would silently split into two segments and
corrupt history that is already written. B6 gets a test asserting every
`scanner_models` row is path-safe, so that migration fails a test instead.

**`from` is advisory.** The write sets the leaf; `from` exists for the log to
render a diff. The precondition is `labs.version`, not the old value. Per-leaf
check-and-set was considered — it would give true per-leaf conflict detection
and no version column — and rejected: the PRD wants a document-level "here is
what moved since you opened this", which is one comparison against one version,
not a reconciliation of nine partial failures.

**Empty diff is not a write.** No `edit_history` row, no version bump, no
`revalidatePath`. The action returns "nothing changed". The check constraint
`edit_history_changes_nonempty` would reject the row anyway; the action should
not get that far.

**Creation records one change.** `[{path: "name_en", from: null, to: "…"}]` —
matching both `bangkok-labs.sql` and `mock-lab.sql`. The first entry means "this
lab appeared"; replaying forty leaves at creation buries every real edit that
follows it under the founding dump.

## The one cross-track edit

Custom services and supplies are keyed by uuid, and
`edit-log-format.ts` drops uuid segments only for heads in `OPAQUE_KEYED`
(`contacts`, `stock`, `photos`). Without `services` and `supplies` in that set,
the log prints `Service · 7c9e1f30-4a2b-… · Label`.

Adding two strings to that set is the whole fix, it is additive and
display-only, and Track A's own note says the formatter is built to render paths
it has never seen. It is the single change Track B needs in a file it does not
own, and it landed in B1's commit where the reason is visible. A curated key is
not uuid-shaped, so `services.dropbox.note` still prints its key; only the
freeform rows lose an id nobody could have used.

---

---

# What B1 shipped

`lib/labs/paths.ts` — the enum literals with their compile-time proofs against
the schema, `parseLabPath` returning a reason rather than throwing, a `labPath`
builder per family so the form never hand-writes a string, a value schema per
leaf, and `labChangesSchema` with the set-level rules. `tests/labs/paths.test.ts`
covers every family, every rejection, and asserts that the path shapes already
written to `edit_history` by both seed files still parse — the failure mode this
module exists to prevent is history that can no longer be read.

Three things the writing of it settled:

- **Empty string is never a value.** Null is the only way to say "nothing here",
  because two spellings of absent would have to be understood by the detail
  page and the log, and the log already prints them identically.
- **`from` is validated too**, though nothing writes it. It is what the log
  renders forever, and a malformed one is a lie recorded permanently. It admits
  null for *every* leaf, including booleans, enums and NOT NULL columns — null
  on the way in does not mean "cleared", it means the leaf did not exist yet.
  B2's tests found this: a contact being added has no previous channel, a day
  has no previous `closed` until the week is materialised, and a lab's own name
  begins at null in the entry recording its creation. Requiring a typed `from`
  made adding anything unrepresentable.
- **The value schema stops at shape.** `lab_pricing`'s check constraints and the
  composite foreign key are the database's, and restating them here would create
  a second opinion that eventually disagrees with the first. B3 turns the
  constraint violation into a message.

---

# What B2 shipped

`lib/queries/lab-edits.ts` — `insertLab`, `applyLabChanges`,
`recomputeCompleteness`, `recomputeAllCompleteness` and `appendEditHistory`,
each taking the caller's transaction. `tests/db/tx.ts` is the rollback helper the
suite did not have: the schema invariants use a raw postgres.js client because
they assert on error codes, but the write layer takes a drizzle transaction
precisely so a test can run the real function and leave nothing behind.
`tests/queries/lab-edits.test.ts` covers all of it against `grains-dev`.

**Creation takes a document, not a diff** — the deliberate asymmetry with
`applyLabChanges`. There is no prior state to address leaves against, and
forcing creation through the diff path would land a new lab at version 2 with a
founding dump of forty leaves burying every real edit that follows.

Three things the database decided rather than the design:

- **Pricing reads before it writes.** `lab_pricing_not_empty` forbids an all-null
  row, so clearing the last value in a cell is a DELETE and not an UPDATE, and
  no upsert can tell which without knowing the other two columns.
- **The version check and the scalar writes are one statement.** A stale caller
  writes nothing at all rather than writing and then being told, and the same
  UPDATE takes the row lock that serialises two editors for the rest of the
  transaction.
- **A cleared time is removed, not nulled.** A shut day stores exactly
  `{"closed": true}`, never `{"closed": true, "open": null}` — a shape every
  reader would otherwise have to learn to ignore.

The backfill has run: **seven labs recomputed**, and the spread is what a
tiebreaker needs — 20 to 60 across the real Bangkok seven, with the
fully-populated `mock-lab.sql` fixture at 100. No clustering, no accidental
ceiling. That is also the first evidence the weight table discriminates on real
data rather than only on a fixture built to satisfy it.

---

# What B3 shipped

`app/labs/actions.ts` — `createLab`, `updateLab`, `setLabStatus`, each the same
four steps in the same order: `requireUser()`, one transaction, exactly one
`edit_history` row, `revalidatePath`. `lib/labs/lab-input.ts` holds the create
gate as a zod schema the form validates against too, and
`lib/constraint-messages.ts` turns a database rule into a sentence.

`setLabStatus` goes through the diff path rather than writing the two columns
directly, which is what gives it a `from` and a `to` in the log like every other
edit, and the same conflict semantics for free.

An empty save is `unchanged`, not an error — the contributor opened the form,
changed their mind, and pressed save. Nothing is wrong, and nothing is recorded.

## The constraint names do not match the schema mirror

`db/migrations/0000_init.sql` declares its CHECK constraints anonymously, so
Postgres named them itself. Single-column ones came out sensibly
(`labs_hours_check`); `lab_pricing`'s three came out **positionally** —
`lab_pricing_check`, `_check1`, `_check2`. `lib/db/schema.ts` calls those three
`lab_pricing_not_empty`, `lab_pricing_turnaround_min_present` and
`lab_pricing_turnaround_order`, names that exist in no database.

The migration is what ran, so the migration wins and the mirror's names are
documentation. This is exactly the parity CLAUDE.md says is a review item and
not something a tool checks — and nothing caught it until a message had to be
keyed on one. Naming them properly is a migration, and migrations are frozen for
Phase 2, so it belongs in a foundation PR to `main`.

Positional names can be reordered without anybody noticing, and the failure
would be silent — the wrong sentence attached to the wrong rule, which is worse
than no sentence. `tests/actions/constraint-names.test.ts` asserts every mapped
name exists in the live database, which makes that loud instead.

Two more things the tests found, both of which would have shipped:

- **Drizzle wraps driver errors**, so `constraint_name` is never on the error
  that is thrown — it is on `cause`. The mapping silently did nothing until the
  chain was walked, and every mapped rule would have surfaced as a 500.
- **Postgres reports the first constraint a row violates**, so which sentence
  comes back depends on the row and not only on the mistake. A cell with an
  upper turnaround bound and nothing else fails the not-empty rule before it
  reaches the one about bounds.

---

# What B4 shipped

`components/lab-form/**` — one form, two modes, and `components/lab-form/draft.ts`,
which is the half that had to be right: the contributor's typing becoming the
set of leaves they actually touched. Everything is held as a string the way a
form holds it, and parsed once at diff time, so `"180"`, `" ฿180 "` and a stored
`180` all produce no change at all. `tests/lab-form/draft.test.ts` asserts that
every diff it emits is one `labChangesSchema` accepts — the contract between the
two halves of this track, checked rather than assumed.

Built against the prototype's own `edit` screen via the `prototype-fidelity`
skill: same section order, the two input weights, `data-on` chips, the checklist
boxes, the dashed caveat notes, and the signal-coloured save whose copy carries
the promise ("Save — goes live now"). Four things the diff-against-the-design
turned up, none of which a test would have:

- **C-41 pairs with dark ink, not paper.** The component library says so and
  both this stylesheet and Track A's had `#ffffff`. Fixed in both.
- **The save button is the one signal-coloured thing on the screen.** It was ink.
- **The pin hint sat on top of MapLibre's attribution** at 375px.
- **The atmosphere-photo slot is drawn, not omitted** — zero is an invitation.
  It is disabled until Track C gives it something to upload.

## The bug that only a browser could find

The dropped pin never appeared. Nothing threw, nothing logged, and `addTo(map)`
ran with a real `Marker`: React mounts effects twice in development, so BaseMap
builds a map, discards it and builds another, and a marker held across that
lands on the discarded one — attached to a real canvas container that is not in
the document. The marker's life is now tied to the effect that made it, so it
always belongs to the map on screen.

Its class was also `.grains-pin`, which `components/map/lab-map.css` already
uses for a search result. Renamed to `.grains-drop-pin`. And the teardrop needs
`rotate: -45deg` rather than `transform: rotate()`, because MapLibre positions a
marker by writing `transform: translate(...)` inline and a transform here is
simply overwritten.

## Deviations, recorded rather than invented

- **Turnaround gets one input per format**, in the prototype's TURNAROUND column
  and at its width. The prototype gives a process one input; the schema stores
  turnaround per `(process, format)`. This is P25 again, resolved the way Track
  A resolved it on the read view.
- **Status is not on this form.** The plan's B4 lists "status + note", the
  prototype's screen does not draw it, and `setLabStatus` already exists as its
  own action reached from the lab page — which is where "Mark as closed"
  belongs. Putting it in both places would mean two ways to do one thing.
- **The inventory picker lists and edits, but cannot search.** A lab may only
  carry a catalog entry (PRD A #3), so adding one needs the film-stock typeahead,
  and that is B5. The section renders what a lab already has.
- **Back links.** Every page now says where it came from — `/labs` → `/`,
  `/labs/new` → `/labs`, `/labs/[id]/edit` → that lab. Written as links to known
  places rather than `history.back()`, which does nothing for somebody arriving
  from a bookmark or a post-sign-in redirect. `components/layout/back-link.tsx`
  matches the breadcrumb the lab detail page already carried.

---

# Open question for review

**The pricing cap.** Four priced cells is a full matrix for a single-process
lab and a quarter of one for a lab running all four processes. That is
deliberate — the cap is what keeps the measure monotone — but it does mean a
thorough four-process lab and a thorough one-process lab score the same on
price. The alternative is a cap that scales with `count(lab_processes)`, which
reintroduces the moving denominator and its bug. Recommendation: keep the flat
cap, and revisit only if search results visibly rank a stub above a rich lab.

The seeded spread above is the first real evidence either way, and it does not
show the failure this cap could produce: no stub outranks a rich lab. Revisit if
one ever does.
