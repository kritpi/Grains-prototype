-- Grains — initial schema
--
-- Written at the design stage. At scaffold time this becomes
-- db/migrations/0001_init.sql, applied by drizzle-kit as a custom SQL migration
-- (PostGIS DDL is written by hand, never generated).
--
-- Three product rules are enforced here by structure rather than by application
-- code, because a rule the schema cannot express is a rule that gets broken:
--   1. `photos` has no lab_id column, and must never get one (CONTEXT.md).
--   2. A lab can only be priced for a process it actually offers (FK below).
--   3. Only catalog-keyed services/supplies are indexed, so only they can back
--      a search filter (PRD A, Decision #2).

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Shared types
-- ---------------------------------------------------------------------------

CREATE TYPE chem_process    AS ENUM ('c41', 'ecn2', 'bw', 'e6');
CREATE TYPE film_format     AS ENUM ('135', '120');
CREATE TYPE lab_status      AS ENUM ('open', 'temporarily_closed', 'permanently_closed');
CREATE TYPE contact_channel AS ENUM ('phone', 'line', 'instagram', 'facebook', 'website', 'email');
CREATE TYPE edit_entity     AS ENUM ('lab', 'film_stock');

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

-- Column names follow the Auth.js Drizzle adapter so the stock adapter works
-- unmodified. `username` is ours, claimed once at first sign-in, and backs
-- /u/@username. Auth.js also defines `sessions` and `verification_tokens`;
-- with the JWT session strategy and Google-only sign-in they stay empty —
-- create them only if you keep the adapter's full schema.
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text,
  email          text NOT NULL,
  email_verified timestamptz,
  image          text,
  username       text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_idx    ON users (lower(email));
CREATE UNIQUE INDEX users_username_idx ON users (lower(username));

CREATE TABLE accounts (
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                 text NOT NULL,
  provider             text NOT NULL,
  provider_account_id  text NOT NULL,
  refresh_token        text,
  access_token         text,
  expires_at           integer,
  token_type           text,
  scope                text,
  id_token             text,
  session_state        text,
  PRIMARY KEY (provider, provider_account_id)
);
CREATE INDEX accounts_user_idx ON accounts (user_id);

-- ---------------------------------------------------------------------------
-- Reference catalogs (curated; a row is data, not a migration)
-- ---------------------------------------------------------------------------

CREATE TABLE scanner_models (
  model      text PRIMARY KEY,
  sort_order smallint NOT NULL DEFAULT 0
);

CREATE TABLE service_catalog (
  key        text PRIMARY KEY,
  label_en   text NOT NULL,
  label_th   text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0
);

CREATE TABLE supply_catalog (
  key        text PRIMARY KEY,
  label_en   text NOT NULL,
  label_th   text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0
);

CREATE TABLE badge_catalog (
  key        text PRIMARY KEY,
  label_en   text NOT NULL,
  label_th   text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- A. Labs
-- ---------------------------------------------------------------------------

CREATE TABLE labs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en       text NOT NULL,
  name_th       text,
  -- geography, not geometry: ST_DWithin takes metres and returns a true circle.
  -- Kept for correctness, not speed — see 00_BACKLOG.md Pillar 2.
  location      geography(Point, 4326) NOT NULL,
  area_en       text,
  area_th       text,
  street        text,          -- optional; intended to be auto-filled from the pin
  landmark_note text,          -- CONTEXT.md "Landmark note"
  status        lab_status NOT NULL DEFAULT 'open',
  status_note   text,          -- free text for a temporary status, e.g. "Renovating until 15 Oct"
  -- 7 entries, index 0 = Sunday: {"closed":true} | {"open":"10:00","close":"19:00"}.
  -- "Open now" is computed in Asia/Bangkok at read time.
  hours         jsonb NOT NULL DEFAULT '[]'::jsonb,
  completeness  smallint NOT NULL DEFAULT 0,   -- 0–100, recomputed inside every write txn; backs search ranking
  version       integer  NOT NULL DEFAULT 1,   -- optimistic concurrency; see 00_BACKLOG.md Pillar 2
  created_by    uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(hours) = 'array' AND jsonb_array_length(hours) IN (0, 7)),
  CHECK (completeness BETWEEN 0 AND 100)
);
CREATE INDEX labs_location_idx ON labs USING GIST (location);

CREATE TABLE lab_processes (
  lab_id  uuid NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  process chem_process NOT NULL,
  PRIMARY KEY (lab_id, process)
);
CREATE INDEX lab_processes_process_idx ON lab_processes (process, lab_id);

-- The pricing matrix: per process, per format. An absent row means "not entered
-- yet"; the process not being in lab_processes means "not offered" — PRD A #1
-- requires those to be distinguishable, and the composite FK guarantees it.
CREATE TABLE lab_pricing (
  lab_id           uuid NOT NULL,
  process          chem_process NOT NULL,
  format           film_format NOT NULL,
  price_thb        numeric(8, 2),
  turnaround_min_d smallint,
  turnaround_max_d smallint,
  PRIMARY KEY (lab_id, process, format),
  FOREIGN KEY (lab_id, process) REFERENCES lab_processes (lab_id, process) ON DELETE CASCADE,
  CHECK (price_thb IS NOT NULL OR turnaround_min_d IS NOT NULL),   -- an all-null row is a blank cell; don't store it
  CHECK (turnaround_max_d IS NULL OR turnaround_min_d IS NOT NULL),
  CHECK (turnaround_max_d IS NULL OR turnaround_max_d >= turnaround_min_d)
);

CREATE TABLE lab_scanners (
  lab_id uuid NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  model  text NOT NULL REFERENCES scanner_models(model),
  PRIMARY KEY (lab_id, model)
);
CREATE INDEX lab_scanners_model_idx ON lab_scanners (model, lab_id);

-- Curated key OR contributor freeform label, never both. Only curated rows get
-- an index, which is the structural half of "custom entries display but never
-- filter" (PRD A #2).
CREATE TABLE lab_services (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id       uuid NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  service_key  text REFERENCES service_catalog(key),
  custom_label text,
  note         text,          -- e.g. "from ฿60"
  CHECK ((service_key IS NULL) <> (custom_label IS NULL))
);
CREATE UNIQUE INDEX lab_services_curated_idx ON lab_services (lab_id, service_key) WHERE service_key IS NOT NULL;
CREATE INDEX lab_services_filter_idx ON lab_services (service_key, lab_id) WHERE service_key IS NOT NULL;

CREATE TABLE lab_supplies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id       uuid NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  supply_key   text REFERENCES supply_catalog(key),
  custom_label text,
  CHECK ((supply_key IS NULL) <> (custom_label IS NULL))
);
CREATE UNIQUE INDEX lab_supplies_curated_idx ON lab_supplies (lab_id, supply_key) WHERE supply_key IS NOT NULL;

CREATE TABLE lab_contacts (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id   uuid NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  channel  contact_channel NOT NULL,
  value    text NOT NULL,
  position smallint NOT NULL DEFAULT 0
);
CREATE INDEX lab_contacts_lab_idx ON lab_contacts (lab_id, position);

-- Lab Atmosphere Photos. Deliberately NOT rows in `photos` — they are venue
-- documentation attached to a Lab, not Photos in the CONTEXT.md sense: not
-- Connectable, not counted against the upload cap, never on /u/@username.
CREATE TABLE lab_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id      uuid NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  width       integer NOT NULL,
  height      integer NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lab_photos_lab_idx ON lab_photos (lab_id, created_at);

-- ---------------------------------------------------------------------------
-- C. Badges — a retractable toggle, so retracting is a DELETE and the primary
-- key alone gives one-vote-per-user-per-badge-per-lab (PRD C #2).
-- ---------------------------------------------------------------------------

CREATE TABLE lab_badge_votes (
  lab_id     uuid NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  badge_key  text NOT NULL REFERENCES badge_catalog(key),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lab_id, badge_key, user_id)
);

-- ---------------------------------------------------------------------------
-- B. Film stocks
-- ---------------------------------------------------------------------------

-- Identity is name + ISO. Format is an attribute, not a separate entry, so a
-- 120 sample still surfaces when someone browses "Portra 400" (PRD B #2).
CREATE TABLE film_stocks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,                          -- full display name, e.g. "Kodak Portra 400"
  iso        smallint NOT NULL,
  formats    film_format[] NOT NULL DEFAULT '{}',
  version    integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX film_stocks_identity_idx ON film_stocks (lower(name), iso);

-- Lab inventory. The reverse-search index is the reason this is a real link and
-- not a text label (PRD A #3).
CREATE TABLE lab_stock (
  lab_id        uuid NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  film_stock_id uuid NOT NULL REFERENCES film_stocks(id) ON DELETE CASCADE,
  formats       film_format[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (lab_id, film_stock_id)
);
CREATE INDEX lab_stock_film_idx ON lab_stock (film_stock_id, lab_id);

-- ---------------------------------------------------------------------------
-- D. Photobook portfolio
-- ---------------------------------------------------------------------------

-- CONTENT-INTEGRITY RULE — there is no lab_id column here and there must never
-- be one. A Photo attributes to a Film Stock, a Camera and a scanner *model*;
-- never to the lab that developed it. An invariant enforced by the absence of a
-- column cannot be violated by any code path. Do not add one "just for admin".
CREATE TABLE photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key   text NOT NULL UNIQUE,
  width         integer NOT NULL,        -- stored so the grid can reserve true aspect ratio before load
  height        integer NOT NULL,
  film_stock_id uuid REFERENCES film_stocks(id) ON DELETE SET NULL,
  format        film_format,
  frame_size    text,                    -- "6x7", "3:2" — display detail alongside format
  camera        text,
  scanner_model text REFERENCES scanner_models(model),
  chemistry     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- The Film Stock Gallery is exactly this index: a derived view, no upload path
-- of its own (PRD B #3).
CREATE INDEX photos_gallery_idx ON photos (film_stock_id, created_at DESC) WHERE film_stock_id IS NOT NULL;
CREATE INDEX photos_owner_idx   ON photos (owner_id, created_at DESC);

CREATE TABLE photobooks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  slug        text NOT NULL,
  artist_note text,                      -- 2–3 lines, one per Photobook (PRD D #7)
  position    smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, slug)
);

-- A Connection needs no table of its own: it IS an item whose photo belongs to
-- someone other than the photobook's owner. One canonical Photo, many pointers
-- (PRD D #3). ON DELETE CASCADE from photos gives PRD D #8's silent reflow for
-- free — deleting a Photo removes it everywhere with no tombstone.
CREATE TABLE photobook_items (
  photobook_id uuid NOT NULL REFERENCES photobooks(id) ON DELETE CASCADE,
  photo_id     uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  position     integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (photobook_id, photo_id)
);
CREATE INDEX photobook_items_photo_idx ON photobook_items (photo_id);                 -- "Also appears in · N Photobooks"
CREATE INDEX photobook_items_order_idx ON photobook_items (photobook_id, position);

-- ---------------------------------------------------------------------------
-- Edit history — one table for both community-edited entities. The CHECK is the
-- teeth on the invariant: every mutation writes exactly one row, and a row
-- always records at least one changed value.
-- ---------------------------------------------------------------------------

CREATE TABLE edit_history (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity     edit_entity NOT NULL,
  entity_id  uuid NOT NULL,
  editor_id  uuid NOT NULL REFERENCES users(id),
  note       text,                       -- optional contributor note, shown in the log
  -- [{"path":"pricing.c41.135.price_thb","from":180,"to":200}, …] — leaf paths,
  -- so two contributors editing different cells produce disjoint diffs.
  changes    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(changes) = 'array' AND jsonb_array_length(changes) > 0)
);
CREATE INDEX edit_history_entity_idx ON edit_history (entity, entity_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Seed: the curated namespaces. Rosters are content decisions, expandable
-- without a migration.
-- ---------------------------------------------------------------------------

INSERT INTO scanner_models (model, sort_order) VALUES
  ('Fuji Frontier', 1), ('Noritsu', 2), ('SP-3000', 3), ('Flatbed', 4);

INSERT INTO service_catalog (key, label_en, label_th, sort_order) VALUES
  ('dropbox',         'Storefront drop-box',  'จุดรับฝากหน้าร้าน', 1),
  ('mail_in',         'Mail-in',              'ส่งทางไปรษณีย์',    2),
  ('push_pull',       'Push / pull processing','ดันไฟล์ม / ดึงฟิล์ม', 3),
  ('hi_res_scan',     'Hi-res scan',          'สแกนความละเอียดสูง', 4),
  ('negative_pickup', 'Negative return — pickup',   'รับฟิล์มคืนที่ร้าน', 5),
  ('negative_deliver','Negative return — delivery', 'ส่งฟิล์มคืนทางไปรษณีย์', 6);

INSERT INTO supply_catalog (key, label_en, label_th, sort_order) VALUES
  ('chemicals',    'Developing chemicals', 'น้ำยาล้างฟิล์ม',   1),
  ('tanks_reels',  'Tanks & reels',        'แท็งก์และรีล',     2),
  ('enlarge_paper','Enlarging paper',      'กระดาษอัดรูป',     3),
  ('film_sold',    'Film sold in-store',   'ขายฟิล์ม',         4);

INSERT INTO badge_catalog (key, label_en, label_th, sort_order) VALUES
  ('clean',    'Clean Scan',        'สแกนสะอาด',      1),
  ('fast',     'Fast Turnaround',   'ล้างไว',          2),
  ('color',    'Accurate Colors',   'สีตรง',           3),
  ('beginner', 'Good for Beginners','เหมาะกับมือใหม่',  4);

COMMIT;
