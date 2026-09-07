-- ---------------------------------------------------------------------------
-- Film Stock catalog — the stocks a Bangkok lab is actually asked about.
--
--   pnpm db:seed db/seed/film-stocks.sql
--
-- Identity is name + ISO and format is an attribute of the entry, not a
-- separate entry (PRD B #2). So "Kodak Portra 400" is one row carrying both
-- 135 and 120, and a 120 sample still surfaces when somebody browses the stock
-- by name. `film_stocks_identity_idx` is on `lower(name), iso`, which is why
-- ON CONFLICT below names the expression rather than the bare column.
--
-- Re-running is safe and refreshes formats rather than duplicating rows. The
-- catalog is community-editable from here on (PRD B #1); this is a starting
-- point, not a canon.
--
-- Attributed to the same @grains seed user as db/seed/bangkok-labs.sql, and
-- created there if that file has not been run. Every stock gets one
-- edit_history row saying it appeared, so the catalog's log is never empty and
-- a later contributor's edit has something to supersede.
--
-- Names are the product name and nothing else: HP5 Plus is called HP5 Plus, and
-- its 400 lives in the `iso` column. Portra 400 and Gold 200 do carry a number
-- because that is genuinely part of their names. Getting this wrong produces a
-- catalog with two entries for one film, which is exactly what the name + ISO
-- identity rule exists to prevent — caught here by colliding with the entries
-- db/seed/mock-lab.sql had already created.
--
-- NOT recorded: which chemical process each stock takes. The prototype's stock
-- tiles are keyed by process and `film_stocks` has no column for it — see
-- docs/plans/track-b-design.md. Nothing here guesses one.
-- ---------------------------------------------------------------------------

INSERT INTO users (email, name, username)
VALUES ('seed@grains.app', 'Grains', 'grains')
ON CONFLICT (lower(email)) DO NOTHING;
--> statement-breakpoint

CREATE TEMP TABLE seed_stocks (
  name    text NOT NULL,
  iso     smallint NOT NULL,
  formats film_format[] NOT NULL
) ON COMMIT DROP;
--> statement-breakpoint

INSERT INTO seed_stocks (name, iso, formats) VALUES
  -- Kodak, colour negative (C-41)
  ('Kodak Portra 160',            160, '{135,120}'),
  ('Kodak Portra 400',            400, '{135,120}'),
  ('Kodak Portra 800',            800, '{135,120}'),
  ('Kodak Ektar 100',             100, '{135,120}'),
  ('Kodak Gold 200',              200, '{135,120}'),
  ('Kodak ColorPlus 200',         200, '{135}'),
  ('Kodak UltraMax 400',          400, '{135}'),
  ('Kodak Pro Image 100',         100, '{135}'),

  -- Kodak, cinema negative (ECN-2) — the reason the process enum has ecn2
  ('Kodak Vision3 50D',            50, '{135}'),
  ('Kodak Vision3 250D',          250, '{135}'),
  ('Kodak Vision3 200T',          200, '{135}'),
  ('Kodak Vision3 500T',          500, '{135}'),

  -- Kodak, black and white
  ('Kodak Tri-X 400',             400, '{135,120}'),
  ('Kodak T-Max 100',             100, '{135,120}'),
  ('Kodak T-Max 400',             400, '{135,120}'),

  -- Kodak, reversal (E-6)
  ('Kodak Ektachrome E100',       100, '{135,120}'),

  -- Fujifilm, colour negative
  ('Fujifilm Superia X-TRA 400',  400, '{135}'),
  ('Fujifilm C200',               200, '{135}'),
  ('Fujifilm Pro 400H',           400, '{135,120}'),

  -- Fujifilm, reversal
  ('Fujifilm Velvia 50',           50, '{135,120}'),
  ('Fujifilm Velvia 100',         100, '{135,120}'),
  ('Fujifilm Provia 100F',        100, '{135,120}'),

  -- Fujifilm, black and white
  ('Fujifilm Neopan 100 Acros II',100, '{135,120}'),

  -- Ilford, black and white
  ('Ilford HP5 Plus',             400, '{135,120}'),
  ('Ilford FP4 Plus',             125, '{135,120}'),
  ('Ilford Delta 3200',          3200, '{135,120}'),
  ('Ilford XP2 Super',            400, '{135}'),
  ('Ilford Pan F Plus',            50, '{135,120}'),

  -- Others in common circulation
  ('CineStill 800T',              800, '{135,120}'),
  ('CineStill 400D',              400, '{135,120}'),
  ('Lomography Color Negative 400',400,'{135,120}'),
  ('Kentmere Pan 400',            400, '{135}');
--> statement-breakpoint

-- The insert, and the id of every row it touched, so history can be attached
-- to new rows only. A stock that was already here keeps the log it has.
CREATE TEMP TABLE seed_inserted (id uuid NOT NULL) ON COMMIT DROP;
--> statement-breakpoint

WITH upserted AS (
  INSERT INTO film_stocks (name, iso, formats, created_by)
  SELECT s.name, s.iso, s.formats,
         (SELECT id FROM users WHERE email = 'seed@grains.app')
    FROM seed_stocks s
  ON CONFLICT (lower(name), iso) DO UPDATE
     SET formats = excluded.formats,
         updated_at = now()
  RETURNING id, (xmax = 0) AS inserted
)
INSERT INTO seed_inserted (id)
SELECT id FROM upserted WHERE inserted;
--> statement-breakpoint

-- One entry per new stock: "this appeared", the same convention createLab and
-- bangkok-labs.sql use. `xmax = 0` above is how Postgres distinguishes an
-- insert from an update inside ON CONFLICT, which is what keeps a re-run from
-- writing a second founding entry for a stock that was already here.
INSERT INTO edit_history (entity, entity_id, editor_id, note, changes)
SELECT 'film_stock', f.id,
       (SELECT id FROM users WHERE email = 'seed@grains.app'),
       'Seeded from the stocks commonly sold and developed in Bangkok, September 2026.',
       jsonb_build_array(
         jsonb_build_object('path', 'name', 'from', NULL, 'to', f.name)
       )
  FROM film_stocks f
  JOIN seed_inserted i ON i.id = f.id;
