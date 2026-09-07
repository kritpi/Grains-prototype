# A6 — the ten Bangkok labs, drafted and awaiting verification

Drafted 2026-09-07 from public sources. **Nothing here has been checked against a lab.**
The seed is [db/seed/bangkok-labs.sql](../../db/seed/bangkok-labs.sql); this file is the
argument behind it and the list of what still needs a person.

```bash
pnpm db:seed db/seed/bangkok-labs.sql
```

It will refuse to run until the pins are filled in. That is deliberate.

## Sources, and how they were weighed

| # | Source | What it is good for |
| --- | --- | --- |
| 1 | findmyfilmlab.com | Structured directory. Full postal addresses, scanners, turnaround, phone. |
| 2 | timeout.com/bangkok/shopping/bangkok-best-film-labs | Editorial, 2026. Addresses, hours, scanners, turnaround prose. |
| 3 | kitzonaroll.com/bangkok-film-labs | Community list, last updated July 2025. The only full price grid. |

**How the ten were chosen.** They are exactly the intersection of sources 2 and 3 — every
lab below appears in both, independently. Source 3 lists around forty labs and marks
twenty-two as closed, so picking ten out of it alone would have been my taste standing in
for evidence. Two editors landing on the same shop is the nearest thing to corroboration
available without visiting, and it also biases toward labs still trading.

That rule has a cost worth naming: it favours central, English-facing, press-covered labs.
Several well-reviewed places in source 3 — Hyperdev, Lang Arn, Him, Toiletlab, Charoen Lab
— are absent only because Time Out did not cover them. If you know the scene, overriding
this list is an improvement, not a correction.

## What you have to supply

### 1. Ten pins — the blocking item

No public source carries coordinates. The editorial lists give a street and a BTS stop, the
directory gives a postal address, and the two databases that hold real pins (Google,
Foursquare) are behind logins. Deriving a pin from a street address is a guess, and on a
product whose main surface is a map a guess puts a lab on the wrong side of a soi.

So the seed has none, and refuses to run without them. Open each link, drop a pin on the
door, copy the two numbers out of the URL into `seed_coords` in the SQL file — latitude
first, which is the order the URL gives them.

| Slug | Lab | Address to search |
| --- | --- | --- |
| `xanap` | XANAP Filmlab | [Lido Connect, Rama I Rd, Pathum Wan](https://www.google.com/maps/search/?api=1&query=Lido+Connect+Rama+I+Road+Pathum+Wan+Bangkok) |
| `sweet-film` | Sweet Film Bar | [2, 1 Trok Wat Tritosthep, Ban Phan Thom](https://www.google.com/maps/search/?api=1&query=Trok+Wat+Tritosthep+Ban+Phan+Thom+Bangkok+10200) |
| `a-and-b` | A&B Digital Lab | [1152/13 Phahon Yothin Rd, opposite Central Ladprao](https://www.google.com/maps/search/?api=1&query=1152+Phahon+Yothin+Road+Chatuchak+Bangkok) |
| `fotoclub` | Fotoclub BKK | [1158 Charoen Krung Soi 32, Bang Rak](https://www.google.com/maps/search/?api=1&query=1158+Charoen+Krung+32+Bang+Rak+Bangkok+10500) |
| `patani` | Patani Studio | [59 Soi Nana, Pom Prap Sattru Phai](https://www.google.com/maps/search/?api=1&query=59+Soi+Nana+Pom+Prap+Sattru+Phai+Bangkok) |
| `brotherhood` | Brotherhood Filmlab | [Chulalongkorn Soi 42, Pathum Wan](https://www.google.com/maps/search/?api=1&query=Chulalongkorn+Soi+42+Pathum+Wan+Bangkok) |
| `flashbox` | Flashbox Filmlab | [352 Phatthanakan Soi 30, Suan Luang](https://www.google.com/maps/search/?api=1&query=352+Phatthanakan+Soi+30+Suan+Luang+Bangkok) |
| `warinda` | Warinda Studio | [338/7 Mahaisawan Rd, Bang Rak](https://www.google.com/maps/search/?api=1&query=338%2F7+Mahaisawan+Road+Bang+Rak+Bangkok) |
| `him-lab` | HiM Lab | [135/8 Pan Rd, Si Lom, Bang Rak](https://www.google.com/maps/search/?api=1&query=135%2F8+Pan+Road+Si+Lom+Bang+Rak+Bangkok) |
| `filmtastic` | Filmtastic | [Chulalongkorn Soi 15, Pathum Wan](https://www.google.com/maps/search/?api=1&query=Chulalongkorn+Soi+15+Pathum+Wan+Bangkok) |

The seed also range-checks the result against a Bangkok bounding box, which catches the
transposition that otherwise passes silently: latitude ~13.7 and longitude ~100.5 are both
plausible numbers, and swapping them lands the lab in the Indian Ocean.

### Geocoded candidates — 7 of 10, none of them in the seed

Looked up against OpenStreetMap's Nominatim on 2026-09-07. These are **not** in
`bangkok-labs.sql`; they are here so the pin-dropping is a check rather than a search.

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

**Three still have nothing and need a person either way:**

| Slug | Why |
| --- | --- |
| `flashbox` | ซอยพัฒนาการ 30 comes back as two disconnected segments, 1.2 km apart. House 352 cannot choose between them |
| `warinda` | Mahaisawan Road is not in OSM under any spelling tried, Thai or romanised |
| `a-and-b` | Neither the Phahon Yothin house number nor Central Ladprao as a landmark resolves |

### 2. The prices, which are the part most likely to be wrong

Every price is dev+scan from source 3, **last updated July 2025** — over a year old, on the
most volatile field in the schema. Treat the grid as a starting point for a phone call.

### 3. Thai names — all ten are blank

Every source is written in English and none gives the shop's own Thai signage.
Transliterating an English name back into Thai would invent a name the lab does not use, so
`name_th` is NULL throughout. This is the field a Thai-reading contributor adds fastest, and
it matters: the product is bilingual and the search index is on both.

## Conflicts between sources, resolved conservatively

Where sources disagreed about a **process**, the process was omitted. A missing one reads as
"not offered" and invites a correction; a wrongly-claimed one sends somebody across Bangkok
with a roll of E-6. The optimistic readings are recorded here so they are not lost.

| Lab | Conflict | Seeded as | The other claim |
| --- | --- | --- | --- |
| Fotoclub BKK | Processes | C-41, B&W, E-6, ECN-2 | Source 3 says C-41 and B&W only; sources 1 and 2 both say all four, so the fuller reading won here on a 2-to-1 |
| XANAP | ECN-2 | Not offered | Source 2 says ECN-2 is a strength |
| HiM Lab | E-6 | Not offered | Source 3 says E-6; source 2 omits it |
| Patani Studio | C-41 | Not offered | Source 3 lists a C-41 dev price; source 2 describes an E-6 and B&W house |
| Warinda Studio | 120 format | Priced for 120 | Source 2 could not confirm the lab takes 120 at all |
| A&B Digital Lab | Address and hours | 1152/13, daily 09:30–20:00 | A search result gives 1152/**3**, daily 08:00–24:00, phone 02-511-3498 — possibly a different shop on the same road. **Worth resolving before you seed: the street number is in the file.** |
| Sweet Film Bar | Hours | Left empty | Source 2 says Mon–Fri 12:00–21:00, Sat–Sun 10:00–18:00; another says Wed–Sun 10:00–17:00 by appointment. Too far apart to pick |

## Fields deliberately left empty

- **Turnaround**, everywhere. Source 2 gives it as prose — "same-day possible", "B&W
  Mondays and Fridays", "E-6 every 2–3 weeks" — and the column is a day range. "E-6 every
  2–3 weeks" is a *schedule*, not a duration; flattening it to 14–21 days would
  misrepresent a lab that runs one batch a fortnight. The prose, kept for whoever fills it
  in: XANAP 1–2 h C-41 and 7–10 days B&W · A&B ~3 h C-41 and ~5 days E-6 · Fotoclub B&W
  Mondays and Fridays, E-6 every 2–3 weeks · Patani E-6 monthly, B&W weekly · Brotherhood
  24–48 h · Flashbox same-day possible · HiM 2–3 h · Sweet Film Bar 1–2 working days, rush
  same-day for +฿100.
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
