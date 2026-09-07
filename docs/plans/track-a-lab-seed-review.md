# A6 — seven Bangkok labs, drafted and awaiting verification

Drafted 2026-09-07 from public sources. **Nothing here has been checked against a lab.**
The seed is [db/seed/bangkok-labs.sql](../../db/seed/bangkok-labs.sql); this file is the
argument behind it and the list of what still needs a person.

```bash
pnpm db:seed db/seed/bangkok-labs.sql
```

Seven labs, seeded and live. Nothing is outstanding in the file.

## Sources, and how they were weighed

| # | Source | What it is good for |
| --- | --- | --- |
| 1 | findmyfilmlab.com | Structured directory. Full postal addresses, scanners, turnaround, phone. |
| 2 | timeout.com/bangkok/shopping/bangkok-best-film-labs | Editorial, 2026. Addresses, hours, scanners, turnaround prose. |
| 3 | kitzonaroll.com/bangkok-film-labs | Community list, last updated July 2025. The only full price grid. |

**How they were chosen.** The intersection of sources 2 and 3 — every lab below appears in
both, independently. Source 3 lists around forty labs and marks twenty-two as closed, so
picking from it alone would have been my taste standing in for evidence. Two editors landing
on the same shop is the nearest thing to corroboration available without visiting, and it
also biases toward labs still trading.

**Ten met that rule; seven are seeded.** The three dropped are below.

That rule has a cost worth naming: it favours central, English-facing, press-covered labs.
Several well-reviewed places in source 3 — Hyperdev, Lang Arn, Him, Toiletlab, Charoen Lab
— are absent only because Time Out did not cover them. If you know the scene, overriding
this list is an improvement, not a correction.

## The three labs that were dropped

A&B Digital Lab, Flashbox Filmlab and Warinda Studio met the selection rule but could not be
given a location by any means available here, and a lab without a pin cannot be seeded at
all — `labs.location` is NOT NULL, and rightly so, because a lab that cannot be found on a
map is not a listing. Rather than carry three rows that never insert, they were removed.

Their research is kept here so it is not lost, and **the place they belong is Track B's Add
Lab form** — whose pin-on-a-map step is precisely the thing this file could not do. Adding
them through the product is more honest than a seed anyway, and it dogfoods the form.

| Lab | Area | Address | Processes | Dev+scan 135 / 120 | Why no pin |
| --- | --- | --- | --- | --- | --- |
| A&B Digital Lab | Chatuchak | 1152/13 Phahon Yothin Rd, opposite Central Ladprao | C-41, B&W, E-6, ECN-2 | ฿100 / ฿150 | Resolves by neither house number nor Central Ladprao as a landmark. Street number also disputed — a second source says 1152/**3** with hours 08:00–24:00 rather than 09:30–20:00, and may be describing a different shop |
| Flashbox Filmlab | Suan Luang | 352 Phatthanakan Soi 30 | C-41, B&W, ECN-2 | ฿150 / ฿200 | ซอยพัฒนาการ 30 comes back as two disconnected segments 1.2 km apart; house 352 cannot choose between them |
| Warinda Studio | Bang Rak | 338/7 Mahaisawan Rd, near BTS Saphan Taksin | C-41, B&W, ECN-2 | ฿120 / ฿150 | Mahaisawan Road is not in OSM under any spelling tried, Thai or romanised |

Other details worth keeping: A&B is the only one of the three with a scanner on record (Fuji
Frontier) and daily 09:30–20:00 hours; Flashbox runs Noritsu and Frontier, 13:00–20:00 closed
Wednesdays, same-day possible; Warinda's hours were never confirmed by any source, and source
2 could not confirm it takes 120 at all.

## What still needs you

### 1. The pins are approximate

Looked up against OpenStreetMap's Nominatim on 2026-09-07 and seeded. Listed here so
checking them is a glance rather than a search.

A geocode is a real lookup rather than a guess, but with one caveat that matters: except
for XANAP these are **street centroids, not doors**. Good enough for `ST_DWithin` — a
150-metre error is nothing in a 5 km search — and visibly off on the detail page's map at
zoom 15.

| Slug | Latitude | Longitude | What OSM matched | Precision |
| --- | --- | --- | --- | --- |
| `xanap` | 13.7451699 | 100.5324766 | ลิโด้ คอนเนกต์ / Lido Connect, สยามสแควร์ | **Building** — the named venue itself |
| `sweet-film` | 13.7633377 | 100.4995320 | ตรอกวัดตรีทศเทพ, บ้านพานถม 10200 | Street |
| `fotoclub` | 13.7274940 | 100.5148339 | ซอยเจริญกรุง 32, บางรัก 10500 | Street |
| `brotherhood` | 13.7352321 | 100.5276142 | ซอยจุฬาลงกรณ์ 42, วังใหม่ 10330 | Street |
| `filmtastic` | 13.7341053 | 100.5276229 | ซอยจุฬาลงกรณ์ 15, วังใหม่ 10330 | Street |
| `him-lab` | 13.7223646 | 100.5237278 | ถนนปั้น, สีลม, บางรัก 10500 | Street |
| `patani` | 13.7398522 | 100.5140294 | ซอยนานา, ป้อมปราบศัตรูพ่าย 10100 | Street |

Every row was checked against the postal address before being written down — soi number,
sub-district and postcode all have to match. That check is not ceremony. The English query
`Charoen Krung 32, Bang Rak, Bangkok` confidently returned a shop on **Soi Charoen Krung
36**, which would have pinned Fotoclub on the wrong soi; the Thai-language query returned
the right one. `ซอยนานา` is the same trap — there is a Soi Nana on Sukhumvit and a
different one in Chinatown, and only the district tells them apart.

### 2. The prices, which are the part most likely to be wrong

Every price is dev+scan from source 3, **last updated July 2025** — over a year old, on the
most volatile field in the schema. Treat the grid as a starting point for a phone call.

### 3. Thai names — all seven are blank

Every source is written in English and none gives the shop's own Thai signage.
Transliterating an English name back into Thai would invent a name the lab does not use, so
`name_th` is NULL for all seven. This is the field a Thai-reading contributor adds fastest, and
it matters: the product is bilingual and the search index is on both.

## Conflicts between sources, resolved conservatively

Where sources disagreed about a **process**, the process was omitted. A missing one reads as
"not offered" and invites a correction; a wrongly-claimed one sends somebody across Bangkok
with a roll of E-6. The optimistic readings are recorded here so they are not lost. Only the
seven seeded labs are listed; the dropped three carry their conflicts in the section above.

| Lab | Conflict | Seeded as | The other claim |
| --- | --- | --- | --- |
| Fotoclub BKK | Processes | C-41, B&W, E-6, ECN-2 | Source 3 says C-41 and B&W only; sources 1 and 2 both say all four, so the fuller reading won here on a 2-to-1 |
| XANAP | ECN-2 | Not offered | Source 2 says ECN-2 is a strength |
| HiM Lab | E-6 | Not offered | Source 3 says E-6; source 2 omits it |
| Patani Studio | C-41 | Not offered | Source 3 lists a C-41 dev price; source 2 describes an E-6 and B&W house |
| Sweet Film Bar | Hours | Left empty | Source 2 says Mon–Fri 12:00–21:00, Sat–Sun 10:00–18:00; another says Wed–Sun 10:00–17:00 by appointment. Too far apart to pick |

## Fields deliberately left empty

- **Turnaround**, everywhere. Source 2 gives it as prose — "same-day possible", "B&W
  Mondays and Fridays", "E-6 every 2–3 weeks" — and the column is a day range. "E-6 every
  2–3 weeks" is a *schedule*, not a duration; flattening it to 14–21 days would
  misrepresent a lab that runs one batch a fortnight. The prose, kept for whoever fills it
  in: XANAP 1–2 h C-41 and 7–10 days B&W · Fotoclub B&W Mondays and Fridays, E-6 every 2–3
  weeks · Patani E-6 monthly, B&W weekly · Brotherhood 24–48 h · HiM 2–3 h · Sweet Film Bar
  1–2 working days, rush same-day for +฿100. For the dropped three: A&B ~3 h C-41 and ~5
  days E-6 · Flashbox same-day possible · Warinda unknown.
- **Services** beyond push/pull. No source says which labs offer a drop-box, mail-in or
  hi-res scanning. Services back a *filter*, so a wrong one makes a lab appear in a search
  it does not belong in — worse than an empty section.
- **Instagram handles.** Every source refers to them, none quotes one. Guessing a handle
  from a lab's name would produce a link to somebody else's account.
- **Inventory and supplies.** Nothing published.
- **`completeness`.** Track B's `recomputeCompleteness` owns it. A hand-written guess would
  be overwritten by the first edit and would meanwhile skew search ranking, which orders on
  it.

## One thing the seed found that is a schema question, not a data question

**Every source quotes two price tiers — "dev only" and "dev + scan" — and `lab_pricing`
holds one `price_thb` per (process, format).** The gap is consistent across all three
sources and all ten labs, so it is how this market actually prices, not a quirk of one
listing. The seed takes dev+scan and drops dev-only.

The wireframe already assumed two boards: its pricing editor has a `MODE: Dev+scan / Dev
only` toggle at the top, described as "two price boards, not two columns". The schema does
not have it, and the schema is frozen during Phase 2.

Not urgent — dev+scan is the number most people want — but it is a real omission, it will
be visible the first time a contributor tries to enter a dev-only price and cannot, and it
is cheaper to decide before Track B builds the pricing editor around the single-price
shape. Raising it here rather than acting on it.

## When this is verified

Phase 3.4 asks you to verify the ten by calling or visiting. At that point the seeded
`edit_history` note — "Seeded from public directory listings, September 2026. Unverified" —
should stop being true, and the honest way to record that is a real edit through Track B's
form rather than a rewrite of this file.
