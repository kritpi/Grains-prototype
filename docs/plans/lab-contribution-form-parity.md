# Lab contribution form — data parity with the lab detail page

Status: implemented 2026-09-04 in `grains-prototype.html`, [lab-directory-discovery.md](../prd/lab-directory-discovery.md) (new Decision Ledger), and [CONTEXT.md](../../CONTEXT.md) (Landmark note term). Verified interactively: edit round-trip (pricing/services/contacts/pin/history/revert) and the create-lab flow (required-field gating, duplicate-pin warning, publish) all confirmed working in-browser.

## Context

The prototype's lab detail page (wireframe ref `1d`, prototype screen `lab`) renders far more structured data than the contribution form (wireframe ref `1h`, prototype screen `edit`) can capture. The form has six inputs — processes, scanners, one turnaround string, one price string, one address string, weekly hours. The detail page displays a per-process pricing table, a services list, film-stock and darkroom-supply inventory, a map, three contact channels, and atmosphere photos.

Some of that display is fiction: the 4-column pricing table (Process / 135 / 120 / Turnaround) is derived from a single `price` scalar, with the 120 column invented by `bumpPrice()` adding 20%. Services, inventory, contacts and photos are seed-data-only — no contributor can ever enter or change them. And there is no add-a-lab flow at all: both `addLab` entry points (the `+` tab and the "Add the first lab" empty-state CTA) fire a "out of scope for this prototype" toast.

The outcome we want: every field the detail page displays is a field a contributor can fill, in the same shape and the same order, from one form that serves both creating a lab and editing one. Plus the six additions listed below. All of it recorded in the PRD so the prototype and the requirements stay in step.

**Confirmed decisions (this session):**
1. Pricing goes to a full per-process × format matrix, not just per-process turnaround. `bumpPrice()` is deleted.
2. Custom (freeform) services and supplies are allowed, but display-only — they never become search-filter options. Curated defaults stay canonical.
3. Create and edit are one shared form in two modes, not a separate wizard.

---

## Critical mechanic: the file is a bundle, not editable HTML

`grains-prototype.html` is 392 physical lines; the entire 1,511-line app lives as a single JSON-escaped string on **physical line 390**, inside `<script type="__bundler/template">`. Editing the physical file directly will not work.

Workflow — decode, edit the decoded text, re-encode:

```bash
python3 -c '
import json
p="grains-prototype.html"
s=open(p,encoding="utf-8").read()
i=s.rindex("__bundler/template"); j=s.index(">",i)+1; k=s.index("</script>",j)
open("/tmp/proto.txt","w",encoding="utf-8").write(json.loads(s[j:k].strip()))'
```

Edit `/tmp/proto.txt` (use the session scratchpad, not `/tmp`), then splice back. **The escaping convention matters**: every `</` in the template is written as `</` so the payload cannot break out of its own `<script>` tag, and the envelope is a leading `\n` plus a trailing `\n  `. This exact recipe round-trips the current file byte-identically (verified):

```python
re_enc = "\n" + json.dumps(t, ensure_ascii=False).replace("</", "<\\u002F") + "\n  "
```

Do a byte-identical round-trip check *before* making any edits, and re-open the file in the browser after each write.

All line numbers below are **decoded-template** line numbers.

---

## Data model changes

In `state.labs[]` (decoded line 990–996), for all seven seed labs `l1`–`l7`:

| Old | New |
|---|---|
| `price: '฿180 / roll'`, `turnaround: '2–3 days'` | `pricing: { c41: { p135, p120, turn }, e6: {...} }` — keyed by process key, one entry per offered process; empty string = not offered (`—`) |
| `services: { dropbox: true, mailIn: '฿60', pushPull: true }` | `services: [ { k: 'dropbox', on: true, note: '' }, { k: 'mailIn', on: true, note: 'from ฿60' }, … ]` — plus `{ k: 'custom', label: 'free text', on: true }` entries |
| `addr: 'Soi 71, Phra Khanong'` | keep `addr` (now auto-derived from the pin — simulated reverse geocode) and add `landmark: 'ตรงข้าม 7-Eleven ชั้น 2'` |
| `phone`, `ig`, `line` (three fixed keys) | `contacts: [ { ch: 'phone', v: '02-381-4420' }, { ch: 'facebook', v: '…' }, … ]` |
| — (atmosphere photos hardcoded to "1 of 4") | `photos: [ { id, tone } ]` |
| `x`, `y` (map pin, already present) | unchanged — these become the pin the form writes to |

Preserve the deliberate sparseness of the seed rows — `l2` (no turnaround/address/phone), `l5` (no price), `l7` (closed, everything empty) exist to exercise the "Not yet added — + Add" empty state. Give them the new shape with the same holes.

New module-level constants next to `PROCS` / `SCANNERS` / `BADGES` (lines 917–930):

- `SERVICES` — curated catalog, each `{ k, label, labelTh, hasNote }`: storefront drop-box · 24h, mail-in · nationwide, push / pull processing, hi-res scan, negative return · pickup, negative return · delivery.
- `SUPPLY_TAGS` — developing chemicals, tanks & reels, enlarging paper, changing bag, thermometer, drying clips, fixer, stop bath.
- `CONTACT_CHANNELS` — `{ ch, label, prefix }` for phone (`☏`), LINE, Instagram (`IG`), Facebook (`FB`), website, email.

Delete `bumpPrice()` (lines 945–950). Add `priceSummary(lab)` (lowest 135 price → "from ฿150 / roll") and `turnSummary(lab)` (fastest turnaround) to feed the two places that still want a scalar: the completeness `score()` in `filtered()` (lines 1103–1110) and the discovery card `meta` / `metaTh` strings (lines 1222–1223).

---

## Form: one page, two modes (decoded lines 662–721)

`state.draft` gains `mode: 'create' | 'edit'`. `openEditDraft(labId)` (line 1124) seeds from an existing lab; a new `openCreateDraft()` seeds an empty draft. Wire `addLab` (line 1353) to `openCreateDraft` — it currently just calls `say()`. Both go through the existing `this.auth(...)` gate.

Section order deliberately mirrors the detail page top-to-bottom, so the mapping is visible rather than remembered:

1. **Identity** — `LAB NAME · TH *`, `LAB NAME · EN`. Create mode only (edit mode shows the name as the `<h1>`, as today).
2. **Location** — tappable grid-paper map that drops the diamond pin, with existing nearby lab pins drawn dashed and a soft duplicate warning when a pin lands within range of one (PRD: soft prevention, never a hard block). Below it: an auto-derived area/address readout, then `LANDMARK · WHAT TO LOOK FOR` as a textarea. Replaces the freeform `ADDRESS` input at line 694–697.
3. **Processes offered** — existing chips (lines 669–676), unchanged. Drives which rows appear in §5.
4. **Scanners** — existing chips (lines 677–684), unchanged.
5. **Pricing & turnaround** — the matrix. One row per selected process: process label + `135` price input + `120` price input + turnaround input (`e.g. within a day`). Blank renders `—` on the detail page. Replaces the `TURNAROUND` and `PRICE PER ROLL` inputs at lines 686–693.
6. **Services** — a checkbox row per `SERVICES` entry, reusing the `[data-svstate]` / `.svbox` styling already defined at line 232 so the form and the detail page share one visual language. Ticking a row with `hasNote` reveals a small detail input (`from ฿60`). Below: `+ add a service` for a freeform row, visually marked as display-only.
7. **In store · film stock** — a search field over `this.stocks` (line 1020) plus tick-chips for the catalog. Film stock must resolve to a catalog entry (Lab Directory PRD, Inventory section) — so custom text is *not* offered here; instead `+ add a stock to the catalog` opens an inline name / ISO / format row, which the Film Stock PRD §1 already permits any logged-in user to do.
8. **Darkroom supplies** — tick-chips from `SUPPLY_TAGS` + freeform `+ add`, display-only.
9. **Contact** — repeatable rows: channel `<select>` from `CONTACT_CHANNELS` + value input + remove; `+ add contact`.
10. **Opening hours** — existing 7-row control (lines 699–713), unchanged.
11. **Atmosphere photos** — add/remove tile grid using `data-stripe` placeholders, carrying the same integrity note the detail page shows at line 520 ("Venue documentation only — sample scans are never attached to a lab").
12. **Note for the history log** *(optional)* — the PRD already grants this ("Contributor may optionally attach a short note") and wireframe `1h` sketches it; the prototype never built it. Cheap to add here.
13. **Save bar** — edit mode keeps `Save — goes live now` + the diff counter; create mode shows `Publish lab`, disabled until name + pin + ≥1 process are present, with a required-fields counter in place of the diff counter.

Follow the existing form idiom exactly (see lines 686–697): a `<label>` column with a `700 10px / .1em / var(--faint)` caps micro-label carrying both `<span data-l="en">` and `<span data-l="th">`, over a `2px solid var(--ink)` input. Every new label needs its Thai sibling — the bilingual mechanism at CSS lines 243–246 hides one or the other; a missing `data-l="th"` span silently renders blank in Thai.

---

## Diff / history engine (lines 1145–1180)

`diffs()` currently hardcodes `proc`, `scanners`, the three scalars, and an hours summary. Generalize it to a descriptor table — one entry per top-level field with a `label` and a `summarize(value)` function — so adding a field later is a table row, not new branching. `pricing`, `services`, `contacts`, `stockCarried`, `supplies`, `photos`, `landmark` and `pin` all join `proc` / `scanners` / `hours`.

Emit one history entry per changed *leaf* (so the log reads `Pricing · C-41 · 135  ฿180 → ฿200` rather than "pricing changed"), but set each entry's `fromRaw` / `toRaw` to the whole top-level object snapshot. That keeps `saveEdit()` (line 1172, `next[d.key] = d.toRaw`) and `revert()` (line 1187) working verbatim — the only cost is that reverting one pricing cell reverts the whole pricing group. Acceptable in a prototype; flagged in the PRD as a real-backend concern. When several leaves under one key change, apply that key once from the final draft value rather than replaying each entry.

Also remap the seeded history entries at lines 999–1006 (`turnaround`, `price`) onto the new keys, or the History screen will show `from → to` values that no longer correspond to any live field.

---

## Detail page changes (screen `lab`, lines 486–660)

Mostly the display side catching up to real data:

- **Pricing table** (565–578): `pricingRows` (line 1229) reads `lab.pricing` instead of fanning one price across every process. Only offered processes get rows; blank cells render `—`. The existing footnote already explains `—` = not offered.
- **Services** (580–591): `serviceRows` (line 1234) maps over `lab.services`, appending the per-service note to the label and rendering custom entries after the curated ones.
- **Location** (627–633): keep the map and pin; below it render the derived area line *and* the new landmark note, each with the `data-filled` empty-state treatment (line 231).
- **Contact** (648–655): replace the three fixed rows with a loop over `lab.contacts`, prefixed per `CONTACT_CHANNELS`. The `Call` and `LINE` action buttons (549–550) should only render when the lab actually has that channel.
- **Atmosphere** (493–519): `atmosLabel` (line 1374) reads `photos.length` instead of the hardcoded `4`; when there are none, show an `+ Add the first photo` empty state rather than a phantom carousel.
- *Optional polish*: make each `Not yet added — + Add` empty-state line clickable, opening the form scrolled to that section (`openEdit(anchor)`). The copy already promises this affordance.

---

## PRD updates

**`docs/prd/lab-directory-discovery.md`** — this PRD has no Decision Ledger yet, unlike the other two. Add one in the same style as [community-data-integrity.md](../prd/community-data-integrity.md), with a decision + rationale per item:

1. **Pricing & turnaround granularity** — per process × format (135/120) matrix, with turnaround per process. Blank = not offered. Rationale: the detail page has always displayed this shape; a single scalar forced the UI to invent values.
2. **Service list model** — curated catalog with an optional per-service detail string; contributor-added services allowed but display-only and never filterable. Rationale: cites the badge precedent in community-data-integrity.md §1 — no moderator persona means a freeform filter namespace has no cleanup path.
3. **Inventory entry model** — film stock must resolve to a Film Stock catalog entry (inline catalog-add permitted per film-stock-index-gallery.md §1, which reverse search depends on); supplies are curated tags + custom, non-filterable.
4. **Location capture** — the map pin is the source of truth, no full street address required; adds a contributor-written **landmark note** as a displayed field.
5. **Contact channels** — typed, repeatable list (phone, LINE, Instagram, Facebook, website, email), replacing the fixed three. Update the existing "contact info (phone, Instagram, LINE)" bullet under **Add Lab** to match.
6. **Atmosphere photos in the contribution form** — restate the integrity rule (venue documentation only; sample scans attach to Film Stock, never to a Lab).
7. **One form, two modes** — create and edit share a single form; create gates publish on name + pin + ≥1 process, matching the existing "minimum required to publish" bullet.

Add to **Open questions**: diff granularity for structured fields — whether `pricing` / `services` / `contacts` diff per cell (so two contributors editing different processes' prices don't collide) or per field group, and how that interacts with the unresolved same-field collision question already listed.

**`CONTEXT.md`** — add **Landmark note** as a term (a contributor-written "what to look for" line attached to a Lab's pin; not an address, and not a review).

*Noticed in passing, out of scope unless you want it:* CLAUDE.md's Lab Directory bullet still says lab inventory carries "a 'Last Verified' date", which the PRD explicitly moved to Out of scope. One-line fix.

---

## Verification

The prototype is a standalone static file — open it directly in the browser pane, no dev server.

1. **Round-trip first**: run the decode → re-encode check and confirm byte identity before editing. Re-open the file after every write; a bad escape produces a blank page, and the console will show the parse error.
2. **Detail page** — land on `lab` for `l1`: pricing table shows real per-process 135/120/turnaround values, services show notes, location shows area + landmark, contacts include Facebook, atmosphere count matches `photos.length`. Then check `l7` (closed, empty) renders empty states everywhere rather than blanks or `undefined`.
3. **Edit round trip** — `Suggest an edit` → change one pricing cell, tick a service, add a custom supply, add a Facebook contact, move the pin, add a landmark note, add a photo → `Save`. Every change must appear on the detail page, and the diff counter and toast must count them.
4. **History** — the same changes appear in the edit history with readable `from → to` labels; `revert` on one restores it and logs the revert as its own entry.
5. **Create flow** — the `+` tab and the "Add the first lab" empty-state CTA both open create mode. Publish stays disabled until name + pin + ≥1 process; the duplicate warning appears when the pin lands near an existing lab; after publish the new lab appears in discovery and its detail page renders.
6. **Bilingual + responsive** — toggle Thai and confirm no new label renders blank; toggle mobile/desktop and confirm the matrix and contact rows don't overflow the 390px frame.
