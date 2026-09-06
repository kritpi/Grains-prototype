/**
 * Drizzle schema — mirrors db/migrations/0000_init.sql and is the source of
 * inferred types for every query in lib/queries.
 *
 * Nothing generates this file from the migrations or the migrations from this
 * file: PostGIS DDL is hand-written, so `pnpm db:generate` produces an empty
 * migration on purpose. A migration and this file therefore change in the same
 * pull request, and that parity is a review item.
 *
 * Three product rules are enforced structurally here and in the migration,
 * because a rule the schema cannot express is a rule that gets broken:
 *   1. `photos` has no lab_id column, and must never get one.
 *   2. A lab can only be priced for a process it actually offers.
 *   3. Only catalog-keyed services and supplies are indexed, so only they can
 *      back a search filter.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { geographyPoint } from "./types";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export const chemProcess = pgEnum("chem_process", ["c41", "ecn2", "bw", "e6"]);
export const filmFormat = pgEnum("film_format", ["135", "120"]);
export const labStatus = pgEnum("lab_status", [
  "open",
  "temporarily_closed",
  "permanently_closed",
]);
export const contactChannel = pgEnum("contact_channel", [
  "phone",
  "line",
  "instagram",
  "facebook",
  "website",
  "email",
]);
export const editEntity = pgEnum("edit_entity", ["lab", "film_stock"]);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Column names follow the Auth.js Drizzle adapter so the stock adapter works
 * unmodified — the property names on the left are the adapter's, the SQL names
 * on the right are ours. `username` is ours alone, claimed once at first
 * sign-in, and backs /u/@username.
 *
 * Auth.js also defines `sessions` and `verification_tokens`. With the JWT
 * session strategy and Google-only sign-in they would stay empty, so they are
 * not created.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    username: text("username"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(sql`lower(${t.email})`),
    uniqueIndex("users_username_idx").on(sql`lower(${t.username})`),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("accounts_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Reference catalogs (curated; a row is data, not a migration)
// ---------------------------------------------------------------------------

export const scannerModels = pgTable("scanner_models", {
  model: text("model").primaryKey(),
  sortOrder: smallint("sort_order").notNull().default(0),
});

export const serviceCatalog = pgTable("service_catalog", {
  key: text("key").primaryKey(),
  labelEn: text("label_en").notNull(),
  labelTh: text("label_th").notNull(),
  sortOrder: smallint("sort_order").notNull().default(0),
});

export const supplyCatalog = pgTable("supply_catalog", {
  key: text("key").primaryKey(),
  labelEn: text("label_en").notNull(),
  labelTh: text("label_th").notNull(),
  sortOrder: smallint("sort_order").notNull().default(0),
});

export const badgeCatalog = pgTable("badge_catalog", {
  key: text("key").primaryKey(),
  labelEn: text("label_en").notNull(),
  labelTh: text("label_th").notNull(),
  sortOrder: smallint("sort_order").notNull().default(0),
});

// ---------------------------------------------------------------------------
// A. Labs
// ---------------------------------------------------------------------------

export const labs = pgTable(
  "labs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nameEn: text("name_en").notNull(),
    nameTh: text("name_th"),
    location: geographyPoint("location").notNull(),
    areaEn: text("area_en"),
    areaTh: text("area_th"),
    /** Optional; intended to be auto-filled from the pin. */
    street: text("street"),
    /** CONTEXT.md "Landmark note" — how a person actually finds the place. */
    landmarkNote: text("landmark_note"),
    status: labStatus("status").notNull().default("open"),
    /** Free text for a temporary status, e.g. "Renovating until 15 Oct". */
    statusNote: text("status_note"),
    /**
     * 7 entries, index 0 = Sunday:
     * {"closed":true} | {"open":"10:00","close":"19:00"}.
     * "Open now" is computed in Asia/Bangkok at read time.
     */
    hours: jsonb("hours").notNull().default([]),
    /** 0-100, recomputed inside every write transaction; backs search ranking. */
    completeness: smallint("completeness").notNull().default(0),
    /** Optimistic concurrency — see 00_BACKLOG.md Pillar 2. */
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("labs_location_idx").using("gist", t.location),
    check(
      "labs_hours_shape",
      sql`jsonb_typeof(${t.hours}) = 'array' AND jsonb_array_length(${t.hours}) IN (0, 7)`,
    ),
    check("labs_completeness_range", sql`${t.completeness} BETWEEN 0 AND 100`),
  ],
);

export const labProcesses = pgTable(
  "lab_processes",
  {
    labId: uuid("lab_id")
      .notNull()
      .references(() => labs.id, { onDelete: "cascade" }),
    process: chemProcess("process").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.labId, t.process] }),
    index("lab_processes_process_idx").on(t.process, t.labId),
  ],
);

/**
 * The pricing matrix: per process, per format.
 *
 * An absent row means "not entered yet"; the process not being in
 * lab_processes means "not offered". PRD A #1 requires those to be
 * distinguishable, and the composite foreign key is what guarantees it —
 * pricing a process the lab does not offer is rejected by the database, not
 * by a code path someone can forget.
 */
export const labPricing = pgTable(
  "lab_pricing",
  {
    labId: uuid("lab_id").notNull(),
    process: chemProcess("process").notNull(),
    format: filmFormat("format").notNull(),
    priceThb: numeric("price_thb", { precision: 8, scale: 2 }),
    turnaroundMinD: smallint("turnaround_min_d"),
    turnaroundMaxD: smallint("turnaround_max_d"),
  },
  (t) => [
    primaryKey({ columns: [t.labId, t.process, t.format] }),
    foreignKey({
      columns: [t.labId, t.process],
      foreignColumns: [labProcesses.labId, labProcesses.process],
      name: "lab_pricing_lab_id_process_fkey",
    }).onDelete("cascade"),
    // An all-null row is a blank cell; don't store it.
    check(
      "lab_pricing_not_empty",
      sql`${t.priceThb} IS NOT NULL OR ${t.turnaroundMinD} IS NOT NULL`,
    ),
    check(
      "lab_pricing_turnaround_min_present",
      sql`${t.turnaroundMaxD} IS NULL OR ${t.turnaroundMinD} IS NOT NULL`,
    ),
    check(
      "lab_pricing_turnaround_order",
      sql`${t.turnaroundMaxD} IS NULL OR ${t.turnaroundMaxD} >= ${t.turnaroundMinD}`,
    ),
  ],
);

export const labScanners = pgTable(
  "lab_scanners",
  {
    labId: uuid("lab_id")
      .notNull()
      .references(() => labs.id, { onDelete: "cascade" }),
    model: text("model")
      .notNull()
      .references(() => scannerModels.model),
  },
  (t) => [
    primaryKey({ columns: [t.labId, t.model] }),
    index("lab_scanners_model_idx").on(t.model, t.labId),
  ],
);

/**
 * Curated key OR contributor freeform label, never both.
 *
 * Only curated rows get an index, which is the structural half of "custom
 * entries display but never filter" (PRD A #2). The rule lives in the index
 * definition rather than in a code review.
 */
export const labServices = pgTable(
  "lab_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    labId: uuid("lab_id")
      .notNull()
      .references(() => labs.id, { onDelete: "cascade" }),
    serviceKey: text("service_key").references(() => serviceCatalog.key),
    customLabel: text("custom_label"),
    /** e.g. "from ฿60" */
    note: text("note"),
  },
  (t) => [
    check(
      "lab_services_one_of",
      sql`(${t.serviceKey} IS NULL) <> (${t.customLabel} IS NULL)`,
    ),
    uniqueIndex("lab_services_curated_idx")
      .on(t.labId, t.serviceKey)
      .where(sql`service_key IS NOT NULL`),
    index("lab_services_filter_idx")
      .on(t.serviceKey, t.labId)
      .where(sql`service_key IS NOT NULL`),
  ],
);

export const labSupplies = pgTable(
  "lab_supplies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    labId: uuid("lab_id")
      .notNull()
      .references(() => labs.id, { onDelete: "cascade" }),
    supplyKey: text("supply_key").references(() => supplyCatalog.key),
    customLabel: text("custom_label"),
  },
  (t) => [
    check(
      "lab_supplies_one_of",
      sql`(${t.supplyKey} IS NULL) <> (${t.customLabel} IS NULL)`,
    ),
    uniqueIndex("lab_supplies_curated_idx")
      .on(t.labId, t.supplyKey)
      .where(sql`supply_key IS NOT NULL`),
  ],
);

export const labContacts = pgTable(
  "lab_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    labId: uuid("lab_id")
      .notNull()
      .references(() => labs.id, { onDelete: "cascade" }),
    channel: contactChannel("channel").notNull(),
    value: text("value").notNull(),
    position: smallint("position").notNull().default(0),
  },
  (t) => [index("lab_contacts_lab_idx").on(t.labId, t.position)],
);

/**
 * Lab Atmosphere Photos. Deliberately NOT rows in `photos` — they are venue
 * documentation attached to a Lab, not Photos in the CONTEXT.md sense: not
 * Connectable, not counted against the upload cap, never on /u/@username.
 */
export const labPhotos = pgTable(
  "lab_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    labId: uuid("lab_id")
      .notNull()
      .references(() => labs.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("lab_photos_lab_idx").on(t.labId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// C. Badges — a retractable toggle, so retracting is a DELETE and the primary
// key alone gives one-vote-per-user-per-badge-per-lab (PRD C #2).
// ---------------------------------------------------------------------------

export const labBadgeVotes = pgTable(
  "lab_badge_votes",
  {
    labId: uuid("lab_id")
      .notNull()
      .references(() => labs.id, { onDelete: "cascade" }),
    badgeKey: text("badge_key")
      .notNull()
      .references(() => badgeCatalog.key),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.labId, t.badgeKey, t.userId] })],
);

// ---------------------------------------------------------------------------
// B. Film stocks
// ---------------------------------------------------------------------------

/**
 * Identity is name + ISO. Format is an attribute, not a separate entry, so a
 * 120 sample still surfaces when someone browses "Portra 400" (PRD B #2).
 */
export const filmStocks = pgTable(
  "film_stocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Full display name, e.g. "Kodak Portra 400". */
    name: text("name").notNull(),
    iso: smallint("iso").notNull(),
    formats: filmFormat("formats").array().notNull().default([]),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("film_stocks_identity_idx").on(sql`lower(${t.name})`, t.iso),
  ],
);

/**
 * Lab inventory. The reverse-search index is the reason this is a real link
 * and not a text label (PRD A #3).
 */
export const labStock = pgTable(
  "lab_stock",
  {
    labId: uuid("lab_id")
      .notNull()
      .references(() => labs.id, { onDelete: "cascade" }),
    filmStockId: uuid("film_stock_id")
      .notNull()
      .references(() => filmStocks.id, { onDelete: "cascade" }),
    formats: filmFormat("formats").array().notNull().default([]),
  },
  (t) => [
    primaryKey({ columns: [t.labId, t.filmStockId] }),
    index("lab_stock_film_idx").on(t.filmStockId, t.labId),
  ],
);

// ---------------------------------------------------------------------------
// D. Photobook portfolio
// ---------------------------------------------------------------------------

/**
 * CONTENT-INTEGRITY RULE — there is no lab_id column here and there must never
 * be one. A Photo attributes to a Film Stock, a Camera and a scanner *model*;
 * never to the lab that developed it. An invariant enforced by the absence of
 * a column cannot be violated by any code path in any language, which is
 * strictly stronger than filtering in the application. Do not add one "just
 * for admin". tests/db/schema-invariants.test.ts asserts the absence.
 */
export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    /** Stored so the grid can reserve true aspect ratio before the image loads. */
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    filmStockId: uuid("film_stock_id").references(() => filmStocks.id, {
      onDelete: "set null",
    }),
    format: filmFormat("format"),
    /** "6x7", "3:2" — display detail alongside format. */
    frameSize: text("frame_size"),
    camera: text("camera"),
    scannerModel: text("scanner_model").references(() => scannerModels.model),
    chemistry: text("chemistry"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // The Film Stock Gallery is exactly this index: a derived view, with no
    // upload path of its own (PRD B #3).
    index("photos_gallery_idx")
      .on(t.filmStockId, t.createdAt.desc())
      .where(sql`film_stock_id IS NOT NULL`),
    index("photos_owner_idx").on(t.ownerId, t.createdAt.desc()),
  ],
);

export const photobooks = pgTable(
  "photobooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    /** 2-3 lines, one per Photobook (PRD D #7). */
    artistNote: text("artist_note"),
    position: smallint("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("photobooks_owner_slug_key").on(t.ownerId, t.slug)],
);

/**
 * A Connection needs no table of its own: it IS an item whose photo belongs to
 * someone other than the photobook's owner. One canonical Photo, many pointers
 * (PRD D #3). The cascade from photos gives PRD D #8's silent reflow for free
 * — deleting a Photo removes it everywhere with no tombstone.
 */
export const photobookItems = pgTable(
  "photobook_items",
  {
    photobookId: uuid("photobook_id")
      .notNull()
      .references(() => photobooks.id, { onDelete: "cascade" }),
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.photobookId, t.photoId] }),
    // "Also appears in · N Photobooks"
    index("photobook_items_photo_idx").on(t.photoId),
    index("photobook_items_order_idx").on(t.photobookId, t.position),
  ],
);

// ---------------------------------------------------------------------------
// Edit history — one table for both community-edited entities. The check is
// the teeth on the invariant: every mutation writes exactly one row, and a row
// always records at least one changed value.
// ---------------------------------------------------------------------------

export const editHistory = pgTable(
  "edit_history",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    entity: editEntity("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    editorId: uuid("editor_id")
      .notNull()
      .references(() => users.id),
    /** Optional contributor note, shown in the log. */
    note: text("note"),
    /**
     * [{"path":"pricing.c41.135.price_thb","from":180,"to":200}, …] — leaf
     * paths, so two contributors editing different cells produce disjoint
     * diffs.
     */
    changes: jsonb("changes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "edit_history_changes_nonempty",
      sql`jsonb_typeof(${t.changes}) = 'array' AND jsonb_array_length(${t.changes}) > 0`,
    ),
    index("edit_history_entity_idx").on(
      t.entity,
      t.entityId,
      t.createdAt.desc(),
    ),
  ],
);
