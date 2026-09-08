-- Amp's Laboratory — an invented lab with every field filled.
--
-- THIS LAB DOES NOT EXIST. Every value is made up, including the address, the
-- prices and the pin. It is a fixture for looking at /labs/[id] with nothing
-- missing: the pricing matrix with no blank and no "not offered", all four
-- scanners, curated and custom services and supplies, all six contact channels,
-- a full week of hours, inventory, atmosphere photos, every badge endorsed, and
-- an edit log with several contributors.
--
--   pnpm db:seed db/seed/mock-lab.sql          add or refresh it
--   pnpm db:seed db/seed/mock-lab-remove.sql   take it out again
--
-- HOW IT IS KEPT SEPARATE FROM REAL DATA
--
-- The name is exactly "Amp's Laboratory" with no marker on it, because a prefix
-- like "[mock]" would appear in the page heading and defeat the point of having
-- a page to look at. So the separation is carried everywhere else instead:
--
--   * It is owned by its own users, all at `@grains.invalid` — a reserved TLD
--     that can never be a real address — and never by `seed@grains.app`, which
--     owns the seven real labs. One `created_by` tells the two apart.
--   * The removal file deletes by that ownership, so it cannot take a real lab
--     with it, and this file deletes before it inserts, so re-running refreshes
--     rather than duplicates.
--   * Its seeded edit_history entry says it is a fixture, which is the one place
--     the product itself shows provenance — anyone looking at the page can see
--     what it is without leaving it.
--
-- It is a development fixture and nothing more: `pnpm db:seed` only ever reads
-- DIRECT_URL, so this cannot reach production even by accident.

-- Delete first, so the file is idempotent. Ordered like the removal file:
-- edit_history has no foreign key from labs and does not cascade.
DELETE FROM edit_history
WHERE editor_id IN (SELECT id FROM users WHERE email LIKE 'mock-%@grains.invalid');
--> statement-breakpoint

DELETE FROM labs
WHERE created_by IN (SELECT id FROM users WHERE email LIKE 'mock-%@grains.invalid');
--> statement-breakpoint

DELETE FROM film_stocks
WHERE created_by IN (SELECT id FROM users WHERE email LIKE 'mock-%@grains.invalid');
--> statement-breakpoint

DELETE FROM users WHERE email LIKE 'mock-%@grains.invalid';
--> statement-breakpoint

-- Four contributors, because badge endorsements are unique per
-- (lab, badge, user): one user can only ever produce counts of 1, and a roster
-- where every bar is full shows nothing about a component whose job is relative
-- strength. Four also gives the edit log more than one author.
INSERT INTO users (email, name, username) VALUES
  ('mock-amp@grains.invalid',   'Amp',        'amp'),
  ('mock-nok@grains.invalid',   'Nok',        'nok_mock'),
  ('mock-som@grains.invalid',   'Somchai',    'somchai_mock'),
  ('mock-fah@grains.invalid',   'Fah',        'fah_mock');
--> statement-breakpoint

-- Film stock for the inventory chips. ON CONFLICT because Track B's real
-- catalog seed may already hold these names, and identity is (lower(name), iso);
-- the lookup below then finds whichever row won.
INSERT INTO film_stocks (name, iso, formats, created_by)
SELECT v.name, v.iso, v.formats::film_format[],
       (SELECT id FROM users WHERE email = 'mock-amp@grains.invalid')
FROM (VALUES
  ('Kodak Portra 400',    400, '{135,120}'),
  ('Kodak Gold 200',      200, '{135}'),
  ('Ilford HP5 Plus',     400, '{135,120}'),
  ('Fujifilm Velvia 50',   50, '{135,120}'),
  ('Kodak Vision3 500T',  500, '{135}')
) AS v(name, iso, formats)
ON CONFLICT (lower(name), iso) DO NOTHING;
--> statement-breakpoint

-- The lab.
--
-- `completeness` is set to 100 here, unlike the real seed which leaves it at the
-- default for Track B's recomputeCompleteness to own. This row genuinely has
-- every field, so 100 is what a recompute would produce — and search orders on
-- it, which puts the fixture at the top of the list where it is easy to find.
INSERT INTO labs (
  name_en, name_th, area_en, area_th, street, landmark_note,
  location, hours, status, status_note, completeness, created_by
) VALUES (
  'Amp''s Laboratory', 'แล็บของแอมป์', 'Pathum Wan', 'ปทุมวัน',
  '48/2 Soi Chulalongkorn 22, Wang Mai',
  'Third floor above the noodle shop — ring the bell by the roller door, the stairwell is unlit.',
  ST_SetSRID(ST_MakePoint(100.5310, 13.7398), 4326)::geography,
  -- Index 0 is Sunday. Closed Sunday so the table shows both renderings; the
  -- rest run late, which keeps "open now" true for most of a working day.
  '[{"closed":true},
    {"open":"09:00","close":"22:00"},
    {"open":"09:00","close":"22:00"},
    {"open":"09:00","close":"22:00"},
    {"open":"09:00","close":"22:00"},
    {"open":"09:00","close":"23:00"},
    {"open":"10:00","close":"20:00"}]'::jsonb,
  'open',
  -- Filled for completeness, but NOT rendered while status is 'open': the note
  -- belongs to a manual override, and the detail page only shows it in the
  -- banner for a temporarily- or permanently-closed lab. Set status to
  -- 'temporarily_closed' to see it.
  'Second darkroom closed for maintenance until the end of the month.',
  100,
  (SELECT id FROM users WHERE email = 'mock-amp@grains.invalid')
);
--> statement-breakpoint

-- All four processes, so the pricing matrix has no "not offered" row.
INSERT INTO lab_processes (lab_id, process)
SELECT id, p::chem_process FROM labs, LATERAL (VALUES
  ('c41'), ('ecn2'), ('bw'), ('e6')
) AS v(p)
WHERE labs.name_en = 'Amp''s Laboratory';
--> statement-breakpoint

-- All four scanner models in the catalog.
INSERT INTO lab_scanners (lab_id, model)
SELECT id, m FROM labs, LATERAL (VALUES
  ('Fuji Frontier'), ('Noritsu'), ('SP-3000'), ('Flatbed')
) AS v(m)
WHERE labs.name_en = 'Amp''s Laboratory';
--> statement-breakpoint

-- Every cell of the matrix: four processes x two formats, each with a price and
-- a turnaround range. Nothing reads "Not entered".
INSERT INTO lab_pricing (lab_id, process, format, price_thb, turnaround_min_d, turnaround_max_d)
SELECT id, p::chem_process, f::film_format, price, tmin, tmax
FROM labs, LATERAL (VALUES
  ('c41',  '135', 150, 1, 2),
  ('c41',  '120', 180, 1, 2),
  ('ecn2', '135', 260, 3, 5),
  ('ecn2', '120', 320, 4, 6),
  ('bw',   '135', 200, 2, 4),
  ('bw',   '120', 240, 3, 5),
  ('e6',   '135', 380, 5, 7),
  ('e6',   '120', 450, 6, 9)
) AS v(p, f, price, tmin, tmax)
WHERE labs.name_en = 'Amp''s Laboratory';
--> statement-breakpoint

-- All six curated services, each with the note that a curated label cannot
-- carry, plus two freeform entries. Both kinds render identically on purpose —
-- Decision Ledger #2 makes custom entries display-only, which is a rule about
-- the filter, not about the reader.
INSERT INTO lab_services (lab_id, service_key, note)
SELECT id, k, n FROM labs, LATERAL (VALUES
  ('dropbox',          '24 hours, box by the roller door'),
  ('mail_in',          'nationwide, from ฿60'),
  ('push_pull',        'up to +3 stops, ฿50 per stop'),
  ('hi_res_scan',      '80 MP TIFF, ฿120 per roll'),
  ('negative_pickup',  'held for 30 days'),
  ('negative_deliver', 'Kerry, ฿50')
) AS v(k, n)
WHERE labs.name_en = 'Amp''s Laboratory';
--> statement-breakpoint

INSERT INTO lab_services (lab_id, custom_label, note)
SELECT id, l, n FROM labs, LATERAL (VALUES
  ('Same-day rush before 11:00', 'add ฿100'),
  ('Scans burned to CD',         NULL)
) AS v(l, n)
WHERE labs.name_en = 'Amp''s Laboratory';
--> statement-breakpoint

-- All four curated supplies plus two freeform tags.
INSERT INTO lab_supplies (lab_id, supply_key)
SELECT id, k FROM labs, LATERAL (VALUES
  ('chemicals'), ('tanks_reels'), ('enlarge_paper'), ('film_sold')
) AS v(k)
WHERE labs.name_en = 'Amp''s Laboratory';
--> statement-breakpoint

INSERT INTO lab_supplies (lab_id, custom_label)
SELECT id, l FROM labs, LATERAL (VALUES
  ('Changing bags'), ('Darkroom timers')
) AS v(l)
WHERE labs.name_en = 'Amp''s Laboratory';
--> statement-breakpoint

-- All six contact channels, so every quick action appears and the contact list
-- shows each link style: tel:, mailto:, a bare URL, and the two handle-to-URL
-- conventions the page is willing to guess (Instagram, LINE).
INSERT INTO lab_contacts (lab_id, channel, value, position)
SELECT id, ch::contact_channel, val, pos FROM labs, LATERAL (VALUES
  ('phone',     '02 214 5580',                 0),
  ('line',      '@ampslab',                    1),
  ('instagram', '@amps.laboratory',            2),
  ('facebook',  'AmpsLaboratoryBKK',           3),
  ('website',   'https://amps-laboratory.invalid', 4),
  ('email',     'hello@amps-laboratory.invalid',   5)
) AS v(ch, val, pos)
WHERE labs.name_en = 'Amp''s Laboratory';
--> statement-breakpoint

-- Inventory, joined to the catalog so each chip links to a film page.
INSERT INTO lab_stock (lab_id, film_stock_id, formats)
SELECT l.id, fs.id, v.formats::film_format[]
FROM labs l, LATERAL (VALUES
  ('Kodak Portra 400',   400, '{135,120}'),
  ('Kodak Gold 200',     200, '{135}'),
  ('Ilford HP5 Plus',    400, '{135,120}'),
  ('Fujifilm Velvia 50',  50, '{120}'),
  ('Kodak Vision3 500T', 500, '{135}')
) AS v(name, iso, formats)
JOIN film_stocks fs ON lower(fs.name) = lower(v.name) AND fs.iso = v.iso
WHERE l.name_en = 'Amp''s Laboratory';
--> statement-breakpoint

-- Atmosphere photos. The rows are real and the page now builds URLs for them
-- unconditionally (lib/storage.ts `publicUrl`), so the frames render as broken
-- images until objects exist at these exact keys. Uploading three through the
-- R2 dashboard is the cheapest end-to-end check of the custom domain, the
-- loader and Cloudflare's transformations — see docs/plans/track-c-progress.md.
-- Keys follow the confirmed-photo shape Track C will write,
-- `photos/{userId}/{uuid}`.
INSERT INTO lab_photos (lab_id, storage_key, width, height, uploaded_by)
SELECT l.id,
       'photos/' || u.id || '/mock-amp-' || v.n,
       v.w, v.h, u.id
FROM labs l
CROSS JOIN users u
CROSS JOIN (VALUES (1, 2000, 1333), (2, 1600, 1600), (3, 1800, 2400)) AS v(n, w, h)
WHERE l.name_en = 'Amp''s Laboratory'
  AND u.email = 'mock-amp@grains.invalid';
--> statement-breakpoint

-- Every badge endorsed, with counts of 4, 3, 2 and 1 so the bars differ.
INSERT INTO lab_badge_votes (lab_id, badge_key, user_id)
SELECT l.id, v.badge, u.id
FROM labs l, LATERAL (VALUES
  ('fast',     'mock-amp@grains.invalid'),
  ('fast',     'mock-nok@grains.invalid'),
  ('fast',     'mock-som@grains.invalid'),
  ('fast',     'mock-fah@grains.invalid'),
  ('clean',    'mock-amp@grains.invalid'),
  ('clean',    'mock-nok@grains.invalid'),
  ('clean',    'mock-som@grains.invalid'),
  ('color',    'mock-amp@grains.invalid'),
  ('color',    'mock-nok@grains.invalid'),
  ('beginner', 'mock-amp@grains.invalid')
) AS v(badge, email)
JOIN users u ON u.email = v.email
WHERE l.name_en = 'Amp''s Laboratory';
--> statement-breakpoint

-- An edit log with several contributors, notes, and a spread of leaf-path shapes
-- — a price, an hours entry, a scanner, a contact keyed by uuid, a stock entry —
-- so the log's path formatter is exercised on more than one grammar.
--
-- Inserted oldest-last: listLabHistory orders by id descending, so seeding in
-- display order would put "created the listing" at the top.
INSERT INTO edit_history (entity, entity_id, editor_id, note, changes)
SELECT 'lab', l.id, u.id, v.note, v.changes::jsonb
FROM labs l, LATERAL (VALUES
  ('mock-fah@grains.invalid',
   'Added the Velvia — they had a fridge full of it.',
   '[{"path":"stock.velvia-50.formats","from":null,"to":["120"]}]'),
  ('mock-som@grains.invalid',
   NULL,
   '[{"path":"contacts.7c9e1f30-4a2b-4d81-9f55-2e6b8c0a1d42.value","from":"02 214 5500","to":"02 214 5580"},
     {"path":"scanners.Flatbed","from":null,"to":true}]'),
  ('mock-nok@grains.invalid',
   'Rang them — E-6 went up this month.',
   '[{"path":"pricing.e6.135.price_thb","from":340,"to":380},
     {"path":"pricing.e6.120.price_thb","from":400,"to":450}]'),
  ('mock-nok@grains.invalid',
   'They open an hour earlier now.',
   '[{"path":"hours.1.open","from":"10:00","to":"09:00"}]'),
  ('mock-amp@grains.invalid',
   'Fixture lab — invented for development, not a real business.',
   '[{"path":"name_en","from":null,"to":"Amp''s Laboratory"}]')
) AS v(email, note, changes)
JOIN users u ON u.email = v.email
WHERE l.name_en = 'Amp''s Laboratory';
