-- Ten real Bangkok film labs — A6.
--
-- DRAFTED FROM PUBLIC SOURCES, NOT VERIFIED. Every value below came off a
-- published directory or listing on 2026-09-07 and none of it has been checked
-- against the lab. Prices in particular move, and the PRD is explicit that they
-- are a community guide rather than a quote.
--
-- Sources, in the order they were trusted when they disagreed:
--   1. findmyfilmlab.com  — structured directory; full postal addresses,
--                           scanners, turnaround. Best per-field source.
--   2. timeout.com/bangkok/shopping/bangkok-best-film-labs — editorial, dated
--                           2026; addresses, hours, scanners, turnaround.
--   3. kitzonaroll.com/bangkok-film-labs — community list, last updated
--                           July 2025; the only source with a full price grid.
--
-- The ten labs here are exactly the intersection of sources 2 and 3: every one
-- appears in both, independently. That was the selection rule, in preference to
-- picking favourites out of the ~40 labs source 3 lists — two editors landing on
-- the same shop is the closest thing to corroboration available without visiting.
--
-- WHAT IS MISSING, AND WHY IT IS MISSING
--
-- Coordinates. No public source carries them: the editorial lists give a street
-- and a BTS stop, the structured directory gives a postal address, and the two
-- venue databases that hold real pins (Foursquare, Google) are behind logins.
-- Deriving a pin from a street address is a guess, and a guess puts a lab on the
-- wrong side of a soi in a product whose main surface is a map — so this file
-- does not contain one. Fill in COORDS below by dropping a pin; the guard
-- underneath refuses to seed until every row has one.
--
-- Hours are entered only where a source stated them, and the array is left empty
-- otherwise. Empty is not "closed": `OPEN_NOW` in lib/queries/labs.ts treats a
-- lab with no hours as not open, which is the honest reading of absent data, and
-- the detail page prompts a contributor to fill it in.
--
-- ONE PRICE PER CELL, AND IT IS DEV+SCAN
--
-- Every source quotes two tiers — "dev only" and "dev + scan" — and
-- `lab_pricing` holds one `price_thb` per (process, format). Dev+scan is the
-- number seeded, because it is what most people actually buy and what every
-- source quotes most consistently. The dev-only figures are dropped rather than
-- averaged in. Whether the schema should carry both tiers is a real question and
-- is raised in docs/plans/track-a-lab-seed-review.md rather than papered over
-- here; the wireframe's pricing editor assumes two boards.

-- ---------------------------------------------------------------------------
-- The contributor every seeded row is attributed to.
--
-- Contributions are attributed forever (PRD A), so seeded data cannot be
-- anonymous. This is a real row in `users` with a claimed username, not a
-- sentinel: `labs.created_by` and `edit_history.editor_id` are both real
-- foreign keys, and the detail page prints the username on the contribution
-- line. Re-running the file reuses it rather than duplicating it.
-- ---------------------------------------------------------------------------
-- ON CONFLICT infers `lower(email)`, not `email`: the uniqueness of an address
-- here is case-insensitive and lives in a functional index (`users_email_idx`),
-- so naming the bare column raises "no unique or exclusion constraint matching
-- the ON CONFLICT specification". The expression has to match the index's.
INSERT INTO users (email, name, username)
VALUES ('seed@grains.app', 'Grains', 'grains')
ON CONFLICT (lower(email)) DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- FILL THIS IN. One row per lab: the pin, dropped by a person.
--
-- Open the maps link in the review doc, drop a pin on the door, copy the two
-- numbers. Latitude first — that is the order they appear in a Google Maps URL,
-- and the opposite of the order ST_MakePoint takes them, which is handled below
-- rather than left as a trap.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE seed_coords (slug text PRIMARY KEY, lat double precision, lng double precision) ON COMMIT DROP;
--> statement-breakpoint

INSERT INTO seed_coords (slug, lat, lng) VALUES
  ('xanap',        NULL, NULL),  -- Lido Connect 2F, Rama I Rd, Wang Mai, Pathum Wan 10330
  ('sweet-film',   NULL, NULL),  -- 2, 1 Trok Wat Tritosthep, Ban Phan Thom 10200
  ('a-and-b',      NULL, NULL),  -- 1152/13 Phahon Yothin Rd, opposite Central Ladprao — SEE REVIEW DOC, address disputed
  ('fotoclub',     NULL, NULL),  -- 1158 Charoen Krung 32 Alley, Bang Rak 10500
  ('patani',       NULL, NULL),  -- 59 Soi Nana, Pom Prap Sattru Phai
  ('brotherhood',  NULL, NULL),  -- Chulalongkorn Soi 42, Pathum Wan
  ('flashbox',     NULL, NULL),  -- 352 Phatthanakan Soi 30, Suan Luang
  ('warinda',      NULL, NULL),  -- 338/7 Mahaisawan Rd, Bang Rak
  ('him-lab',      NULL, NULL),  -- 135/8 Pan Rd, Si Lom, Bang Rak
  ('filmtastic',   NULL, NULL);  -- Chulalongkorn Soi 15, Pathum Wan
--> statement-breakpoint

-- The guard. `labs.location` is NOT NULL, so an unfilled pin would fail anyway —
-- but it would fail on the first insert with a constraint violation naming a
-- column, several statements after the actual mistake. This says what is wrong.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(slug, ', ' ORDER BY slug) INTO missing
  FROM seed_coords WHERE lat IS NULL OR lng IS NULL;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'bangkok-labs.sql: no pin for %. Drop a pin per lab and fill in seed_coords — see docs/plans/track-a-lab-seed-review.md.',
      missing;
  END IF;

  -- Bangkok, generously bounded. Catches the classic transposition: latitude
  -- ~13.7 and longitude ~100.5 are both plausible-looking numbers, and swapping
  -- them lands the lab in the Indian Ocean without anything complaining.
  SELECT string_agg(slug, ', ' ORDER BY slug) INTO missing
  FROM seed_coords
  WHERE lat NOT BETWEEN 13.4 AND 14.1 OR lng NOT BETWEEN 100.2 AND 100.9;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION
      'bangkok-labs.sql: % is outside Bangkok. Latitude is the first number (~13.7), longitude the second (~100.5).',
      missing;
  END IF;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- The labs.
--
-- `completeness` is left at the column default and is NOT set here. Track B's
-- recomputeCompleteness owns that number; a hand-written guess would be
-- overwritten by the first edit and would meanwhile skew search ranking, which
-- orders on it.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE seed_labs (
  slug text PRIMARY KEY, name_en text, name_th text,
  area_en text, area_th text, street text, landmark_note text, hours jsonb
) ON COMMIT DROP;
--> statement-breakpoint

INSERT INTO seed_labs (slug, name_en, name_th, area_en, area_th, street, landmark_note, hours) VALUES
  -- Hours: daily 12:00–20:00, except Wednesday which closes at 18:00 (source 2).
  ('xanap', 'XANAP Filmlab', NULL, 'Pathum Wan', 'ปทุมวัน',
   'Lido Connect, 2nd floor, Rama I Road',
   'Second floor of Lido Connect, the cinema block on Rama I — not street level.',
   '[{"open":"12:00","close":"20:00"},{"open":"12:00","close":"20:00"},{"open":"12:00","close":"20:00"},{"open":"12:00","close":"18:00"},{"open":"12:00","close":"20:00"},{"open":"12:00","close":"20:00"},{"open":"12:00","close":"20:00"}]'::jsonb),

  -- Hours disputed between sources — left empty. See the review doc.
  ('sweet-film', 'Sweet Film Bar', NULL, 'Phra Nakhon', 'พระนคร',
   '2, 1 Trok Wat Tritosthep, Ban Phan Thom',
   'In the Banglamphu lanes north of Khao San Road. It is a bar as well as a lab.',
   '[]'::jsonb),

  -- Hours: daily 09:30–20:00 (source 2). Conflicting report of 08:00–24:00 —
  -- see the review doc; the wider claim may describe a different shop.
  ('a-and-b', 'A&B Digital Lab', NULL, 'Chatuchak', 'จตุจักร',
   '1152/13 Phahon Yothin Road',
   'On Phahon Yothin opposite Central Ladprao.',
   '[{"open":"09:30","close":"20:00"},{"open":"09:30","close":"20:00"},{"open":"09:30","close":"20:00"},{"open":"09:30","close":"20:00"},{"open":"09:30","close":"20:00"},{"open":"09:30","close":"20:00"},{"open":"09:30","close":"20:00"}]'::jsonb),

  -- Hours: daily 11:00–20:00 (sources 1 and 2 agree).
  ('fotoclub', 'Fotoclub BKK', NULL, 'Bang Rak', 'บางรัก',
   '1158 Charoen Krung Soi 32',
   NULL,
   '[{"open":"11:00","close":"20:00"},{"open":"11:00","close":"20:00"},{"open":"11:00","close":"20:00"},{"open":"11:00","close":"20:00"},{"open":"11:00","close":"20:00"},{"open":"11:00","close":"20:00"},{"open":"11:00","close":"20:00"}]'::jsonb),

  -- Hours: Wed–Sun 10:00–17:00, closed Mon–Tue (source 2).
  ('patani', 'Patani Studio', NULL, 'Pom Prap Sattru Phai', 'ป้อมปราบศัตรูพ่าย',
   '59 Soi Nana',
   'Off Charoen Krung in Chinatown. Appointments are essential.',
   '[{"open":"10:00","close":"17:00"},{"closed":true},{"closed":true},{"open":"10:00","close":"17:00"},{"open":"10:00","close":"17:00"},{"open":"10:00","close":"17:00"},{"open":"10:00","close":"17:00"}]'::jsonb),

  -- Hours: 13:00–19:00, closed Wednesday (source 2).
  ('brotherhood', 'Brotherhood Filmlab', NULL, 'Pathum Wan', 'ปทุมวัน',
   'Chulalongkorn Soi 42',
   'A few streets from Chulalongkorn University, near MRT Sam Yan.',
   '[{"open":"13:00","close":"19:00"},{"open":"13:00","close":"19:00"},{"open":"13:00","close":"19:00"},{"closed":true},{"open":"13:00","close":"19:00"},{"open":"13:00","close":"19:00"},{"open":"13:00","close":"19:00"}]'::jsonb),

  -- Hours: 13:00–20:00, closed Wednesday (source 2).
  ('flashbox', 'Flashbox Filmlab', NULL, 'Suan Luang', 'สวนหลวง',
   '352 Phatthanakan Soi 30',
   NULL,
   '[{"open":"13:00","close":"20:00"},{"open":"13:00","close":"20:00"},{"open":"13:00","close":"20:00"},{"closed":true},{"open":"13:00","close":"20:00"},{"open":"13:00","close":"20:00"},{"open":"13:00","close":"20:00"}]'::jsonb),

  -- Source 2 could not confirm hours; left empty rather than invented.
  ('warinda', 'Warinda Studio', NULL, 'Bang Rak', 'บางรัก',
   '338/7 Mahaisawan Road',
   'Near BTS Saphan Taksin. Contact the studio before visiting.',
   '[]'::jsonb),

  -- Source 2 could not confirm hours; left empty rather than invented.
  ('him-lab', 'HiM Lab', NULL, 'Bang Rak', 'บางรัก',
   '135/8 Pan Road, Si Lom',
   NULL,
   '[]'::jsonb),

  -- Hours: daily 10:00–20:00 (source 2).
  ('filmtastic', 'Filmtastic', NULL, 'Pathum Wan', 'ปทุมวัน',
   'Chulalongkorn Soi 15',
   'Near MRT Sam Yan, beside Samyan Mitrtown.',
   '[{"open":"10:00","close":"20:00"},{"open":"10:00","close":"20:00"},{"open":"10:00","close":"20:00"},{"open":"10:00","close":"20:00"},{"open":"10:00","close":"20:00"},{"open":"10:00","close":"20:00"},{"open":"10:00","close":"20:00"}]'::jsonb);
--> statement-breakpoint

-- Thai names are NULL throughout. Every source is written in English and none
-- gives the shop's own Thai signage; transliterating an English name back into
-- Thai would invent a name the lab does not use. Left for a contributor who can
-- read the shopfront.

INSERT INTO labs (name_en, name_th, area_en, area_th, street, landmark_note, location, hours, created_by)
SELECT
  l.name_en, l.name_th, l.area_en, l.area_th, l.street, l.landmark_note,
  -- Longitude first: ST_MakePoint takes (x, y), and the seed_coords table above
  -- is deliberately (lat, lng) because that is the order a person reads them off
  -- a map. The swap happens here, once.
  ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
  l.hours,
  (SELECT id FROM users WHERE email = 'seed@grains.app')
FROM seed_labs l
JOIN seed_coords c ON c.slug = l.slug;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Processes offered.
--
-- Where sources disagreed on whether a lab runs a process, the process is
-- OMITTED rather than included. A missing process reads as "not offered" on the
-- detail page and invites a correction; a wrongly-claimed one sends somebody
-- across Bangkok with a roll of E-6. Each disagreement is listed in the review
-- doc so the optimistic reading is not simply lost.
-- ---------------------------------------------------------------------------
INSERT INTO lab_processes (lab_id, process)
SELECT id, p::chem_process FROM labs, LATERAL (VALUES
  ('XANAP Filmlab', 'c41'), ('XANAP Filmlab', 'bw'),
  ('Sweet Film Bar', 'c41'), ('Sweet Film Bar', 'bw'), ('Sweet Film Bar', 'e6'), ('Sweet Film Bar', 'ecn2'),
  ('A&B Digital Lab', 'c41'), ('A&B Digital Lab', 'bw'), ('A&B Digital Lab', 'e6'), ('A&B Digital Lab', 'ecn2'),
  ('Fotoclub BKK', 'c41'), ('Fotoclub BKK', 'bw'), ('Fotoclub BKK', 'e6'), ('Fotoclub BKK', 'ecn2'),
  ('Patani Studio', 'bw'), ('Patani Studio', 'e6'),
  ('Brotherhood Filmlab', 'c41'), ('Brotherhood Filmlab', 'bw'), ('Brotherhood Filmlab', 'ecn2'),
  ('Flashbox Filmlab', 'c41'), ('Flashbox Filmlab', 'bw'), ('Flashbox Filmlab', 'ecn2'),
  ('Warinda Studio', 'c41'), ('Warinda Studio', 'bw'), ('Warinda Studio', 'ecn2'),
  ('HiM Lab', 'c41'), ('HiM Lab', 'bw'), ('HiM Lab', 'ecn2'),
  ('Filmtastic', 'c41'), ('Filmtastic', 'bw')
) AS v(lab, p)
WHERE labs.name_en = v.lab;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Scanners. Only where a source names the model.
--
-- The values must match `scanner_models`, which holds 'Fuji Frontier',
-- 'Noritsu', 'SP-3000' and 'Flatbed'. Sources naming a specific unit — Sweet
-- Film Bar's "Noritsu HS-1800" and "Frontier SP3000" — are mapped onto that
-- roster rather than expanding it: the catalog is a filter namespace, and one
-- lab's exact model number is display detail the schema has nowhere to put.
-- ---------------------------------------------------------------------------
INSERT INTO lab_scanners (lab_id, model)
SELECT id, m FROM labs, LATERAL (VALUES
  ('Sweet Film Bar', 'Noritsu'), ('Sweet Film Bar', 'SP-3000'),
  ('A&B Digital Lab', 'Fuji Frontier'),
  ('Fotoclub BKK', 'Noritsu'), ('Fotoclub BKK', 'Fuji Frontier'),
  ('Patani Studio', 'Noritsu'), ('Patani Studio', 'Fuji Frontier'),
  ('Flashbox Filmlab', 'Noritsu'), ('Flashbox Filmlab', 'Fuji Frontier'),
  ('Filmtastic', 'Noritsu'), ('Filmtastic', 'Fuji Frontier')
) AS v(lab, m)
WHERE labs.name_en = v.lab;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Pricing: dev + scan, in baht, per (process, format).
--
-- From source 3, the only source with a full grid. A cell is omitted where the
-- source had no figure — the detail page renders that as "not entered", which
-- is true, and distinguishes it from a process the lab does not run.
--
-- Turnaround is NULL throughout. Source 2 gives it as prose per lab ("same-day
-- possible", "B&W Mondays and Fridays", "E-6 every 2–3 weeks") and the column
-- is a day range; "E-6 every 2–3 weeks" is a schedule, not a duration, and
-- flattening it to 14–21 days would misrepresent a lab that runs one batch a
-- fortnight. Left for a contributor. The prose is in the review doc.
-- ---------------------------------------------------------------------------
INSERT INTO lab_pricing (lab_id, process, format, price_thb)
SELECT id, p::chem_process, f::film_format, price FROM labs, LATERAL (VALUES
  ('XANAP Filmlab',      'c41', '135', 160), ('XANAP Filmlab',      'c41', '120', 220),
  ('Sweet Film Bar',     'c41', '135', 180), ('Sweet Film Bar',     'c41', '120', 200),
  ('Sweet Film Bar',     'bw',  '135', 200), ('Sweet Film Bar',     'bw',  '120', 240),
  ('A&B Digital Lab',    'c41', '135', 100), ('A&B Digital Lab',    'c41', '120', 150),
  ('Fotoclub BKK',       'c41', '135', 150), ('Fotoclub BKK',       'c41', '120', 170),
  ('Brotherhood Filmlab','c41', '135', 150), ('Brotherhood Filmlab','c41', '120', 230),
  ('Flashbox Filmlab',   'c41', '135', 150), ('Flashbox Filmlab',   'c41', '120', 200),
  ('Warinda Studio',     'c41', '135', 120), ('Warinda Studio',     'c41', '120', 150),
  ('HiM Lab',            'c41', '135', 150), ('HiM Lab',            'c41', '120', 180),
  ('Filmtastic',         'c41', '135', 150), ('Filmtastic',         'c41', '120', 150)
) AS v(lab, p, f, price)
WHERE labs.name_en = v.lab;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Contacts. Only the two phone numbers a source actually published, plus the
-- one website. Instagram handles are referred to by every source but quoted by
-- none, so they are not guessed from the lab's name.
-- ---------------------------------------------------------------------------
INSERT INTO lab_contacts (lab_id, channel, value, position)
SELECT id, ch::contact_channel, val, pos FROM labs, LATERAL (VALUES
  ('Fotoclub BKK',   'phone',   '+66 87 673 7333',        0),
  ('Fotoclub BKK',   'website', 'https://www.fotoclubbkk.com', 1),
  ('Sweet Film Bar', 'phone',   '+66 95 860 1168',        0)
) AS v(lab, ch, val, pos)
WHERE labs.name_en = v.lab;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Services. Only push/pull, and only where a source states it.
--
-- The curated roster also holds dropbox, mail_in, hi_res_scan and the two
-- negative-return keys. No source says which labs offer those, and a service
-- nobody claimed is worse than an empty section: services back a filter, so a
-- wrong one makes a lab appear in a search it does not belong in.
-- ---------------------------------------------------------------------------
INSERT INTO lab_services (lab_id, service_key)
SELECT id, k FROM labs, LATERAL (VALUES
  ('Fotoclub BKK',   'push_pull'),
  ('Sweet Film Bar', 'push_pull')
) AS v(lab, k)
WHERE labs.name_en = v.lab;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- One edit_history row per lab, so the log is never empty.
--
-- Creation is entry #1 for a lab, not an absence — the detail page's
-- contribution line and the log both read from here, and a lab that appeared
-- with no recorded origin would be the one thing in the product with no
-- attribution. The change list names what this file actually set.
-- ---------------------------------------------------------------------------
INSERT INTO edit_history (entity, entity_id, editor_id, note, changes)
SELECT
  'lab', l.id,
  (SELECT id FROM users WHERE email = 'seed@grains.app'),
  'Seeded from public directory listings, September 2026. Unverified — prices and hours especially.',
  jsonb_build_array(jsonb_build_object('path', 'name_en', 'from', NULL, 'to', l.name_en))
FROM labs l
WHERE l.created_by = (SELECT id FROM users WHERE email = 'seed@grains.app');
