-- Photobooks, Photos and a Connection — the fixture for looking at /u/@username.
--
-- THESE PHOTOGRAPHS DO NOT EXIST. Only the rows do. No object has ever been
-- uploaded for them, so the frames render as broken images until somebody puts
-- files at these keys — which is the point: the layout, the counts, the credit
-- lines and the prev/next walk can all be checked without storage working, and
-- storage is blocked on an entitlement nobody here can fix.
--
--   pnpm db:seed db/seed/mock-photobook.sql
--   pnpm db:seed db/seed/mock-lab-remove.sql   removes it, along with the lab
--
-- It reuses the `mock-…@grains.invalid` users that mock-lab.sql creates, so it
-- depends on that file having run and needs no removal file of its own:
-- photobooks, photos and items all cascade from `users`, and the lab fixture's
-- removal deletes those users.
--
-- What it is shaped to show, because each of these was a bug in the prototype:
--
--   * a book of the owner's own work, which must show NO credit lines (K3)
--   * a mixed book, whose card must read "4 photos · 2 connected" rather than
--     folding Connections into one total (J12/J13)
--   * one Photo in two books owned by different people, so "Also appears in ·
--     2" is a cross-user count and not the viewer's own (L2)
--   * a Photo in no book at all, which has nowhere to live except its owner's
--     own profile (J11)
--   * mixed aspect ratios, so the true-aspect grid is visibly ragged (K2)

DELETE FROM photos
WHERE owner_id IN (SELECT id FROM users WHERE email LIKE 'mock-%@grains.invalid');
--> statement-breakpoint

DELETE FROM photobooks
WHERE owner_id IN (SELECT id FROM users WHERE email LIKE 'mock-%@grains.invalid');
--> statement-breakpoint

-- Amp's photographs. Deliberately varied ratios: 3:2 landscape, 1:1, 4:5 and
-- 3:4 portrait, so the masonry has something to be ragged about.
INSERT INTO photos (owner_id, storage_key, width, height,
                    film_stock_id, format, frame_size, camera, scanner_model, chemistry)
SELECT u.id,
       'photos/' || u.id || '/mock-photo-' || v.n,
       v.w, v.h,
       (SELECT id FROM film_stocks WHERE lower(name) = lower(v.stock) LIMIT 1),
       v.fmt::film_format, v.frame, v.cam, v.scanner, v.chem
FROM users u, LATERAL (VALUES
  (1, 3000, 2000, 'Kodak Portra 400',   '135', '3:2', 'Contax T2',     'Fuji Frontier', 'C-41'),
  (2, 2400, 2400, 'Ilford HP5 Plus',    '120', '1:1', 'Hasselblad 500', 'Noritsu',      'HC-110'),
  (3, 2000, 2500, 'Kodak Gold 200',     '135', '4:5', 'Nikon FM2',     'SP-3000',       'C-41'),
  (4, 1800, 2400, 'Fujifilm Velvia 50', '120', '3:4', 'Pentax 67',     'Flatbed',       'E-6')
) AS v(n, w, h, stock, fmt, frame, cam, scanner, chem)
WHERE u.email = 'mock-amp@grains.invalid';
--> statement-breakpoint

-- Nok's one photograph, so there is somebody else's work to connect.
INSERT INTO photos (owner_id, storage_key, width, height,
                    film_stock_id, format, frame_size, camera, scanner_model)
SELECT u.id,
       'photos/' || u.id || '/mock-photo-nok-1',
       2600, 1733,
       (SELECT id FROM film_stocks WHERE lower(name) = lower('Kodak Vision3 500T') LIMIT 1),
       '135'::film_format, '3:2', 'Leica M6', 'Fuji Frontier'
FROM users u
WHERE u.email = 'mock-nok@grains.invalid';
--> statement-breakpoint

INSERT INTO photobooks (owner_id, title, slug, artist_note, position)
SELECT u.id, v.title, v.slug, v.note, v.pos
FROM users u, LATERAL (VALUES
  ('Bangkok Overcast', 'bangkok-overcast',
   'Six weeks of flat grey light, shot mostly before eight in the morning. The city looks like this more often than anyone admits.', 0),
  ('Borrowed Frames', 'borrowed-frames',
   'Work by other people that I keep coming back to, alongside two of my own.', 1)
) AS v(title, slug, note, pos)
WHERE u.email = 'mock-amp@grains.invalid';
--> statement-breakpoint

-- Book one: Amp's own work only. Every frame here must render with NO credit
-- line — a credit under a photo its owner took reads as a denial of authorship.
INSERT INTO photobook_items (photobook_id, photo_id, position)
SELECT b.id, p.id, v.pos
FROM photobooks b
JOIN users u ON u.id = b.owner_id AND u.email = 'mock-amp@grains.invalid'
JOIN LATERAL (VALUES ('mock-photo-1', 0), ('mock-photo-2', 1), ('mock-photo-3', 2))
  AS v(key, pos) ON true
JOIN photos p ON p.owner_id = u.id AND p.storage_key LIKE '%' || v.key
WHERE b.slug = 'bangkok-overcast';
--> statement-breakpoint

-- Book two: two of Amp's own plus Nok's, so the card reads "3 photos · 1
-- connected" and only the last frame carries "via @nok_mock".
INSERT INTO photobook_items (photobook_id, photo_id, position)
SELECT b.id, p.id, 0
FROM photobooks b
JOIN users u ON u.id = b.owner_id AND u.email = 'mock-amp@grains.invalid'
JOIN photos p ON p.owner_id = u.id AND p.storage_key LIKE '%mock-photo-1'
WHERE b.slug = 'borrowed-frames';
--> statement-breakpoint

INSERT INTO photobook_items (photobook_id, photo_id, position)
SELECT b.id, p.id, 1
FROM photobooks b
JOIN users u ON u.id = b.owner_id AND u.email = 'mock-amp@grains.invalid'
JOIN photos p ON p.owner_id = u.id AND p.storage_key LIKE '%mock-photo-2'
WHERE b.slug = 'borrowed-frames';
--> statement-breakpoint

INSERT INTO photobook_items (photobook_id, photo_id, position)
SELECT b.id, p.id, 2
FROM photobooks b
JOIN users bu ON bu.id = b.owner_id AND bu.email = 'mock-amp@grains.invalid'
JOIN users nu ON nu.email = 'mock-nok@grains.invalid'
JOIN photos p ON p.owner_id = nu.id
WHERE b.slug = 'borrowed-frames';
--> statement-breakpoint

-- Nok's own book, holding Amp's first photograph as well as their own. This is
-- what makes "Also appears in · 2" true across two owners rather than one.
INSERT INTO photobooks (owner_id, title, slug, artist_note, position)
SELECT u.id, 'Night Buses', 'night-buses',
       'Tungsten film, moving vehicles, no tripod. Mostly failures.', 0
FROM users u WHERE u.email = 'mock-nok@grains.invalid';
--> statement-breakpoint

INSERT INTO photobook_items (photobook_id, photo_id, position)
SELECT b.id, p.id, 0
FROM photobooks b
JOIN users nu ON nu.id = b.owner_id AND nu.email = 'mock-nok@grains.invalid'
JOIN photos p ON p.owner_id = nu.id
WHERE b.slug = 'night-buses';
--> statement-breakpoint

INSERT INTO photobook_items (photobook_id, photo_id, position)
SELECT b.id, p.id, 1
FROM photobooks b
JOIN users nu ON nu.id = b.owner_id AND nu.email = 'mock-nok@grains.invalid'
JOIN users au ON au.email = 'mock-amp@grains.invalid'
JOIN photos p ON p.owner_id = au.id AND p.storage_key LIKE '%mock-photo-1'
WHERE b.slug = 'night-buses';
