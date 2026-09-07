import { z } from "zod";

import { CHEM_PROCESSES, type ChemProcess } from "@/lib/labs/search-params";

// Re-exported so a consumer of the grammar has one import for it, and does not
// have to know that the process list lives in the search module.
export { CHEM_PROCESSES, type ChemProcess };
import type { contactChannel, filmFormat, labStatus } from "@/lib/db/schema";

/**
 * The leaf-path diff grammar.
 *
 * A path addresses one leaf of a lab viewed as a *document* — not a column and
 * not a row. `pricing.c41.135.price_thb` names a single cell; `hours.3.open`
 * names Wednesday's opening time. `edit_history.changes` is an array of
 * `{path, from, to}` in exactly this vocabulary.
 *
 * The log is a consequence, not the purpose. The purpose is that **the form
 * submits a diff rather than a document.** A contributor who opened the page an
 * hour ago must not silently revert every field somebody else has changed
 * since, and the only way to guarantee that is for the write to touch the named
 * leaves and nothing else. `labs.version` is the second, coarser net: it catches
 * concurrent edits at document level so the UI can say *what moved*. Both, not
 * either — a whole-form write passes the version check and still destroys data.
 *
 * This module is imported by client components (the form computes its own
 * diff), so it must stay free of runtime imports from the query layer. The
 * schema imports below are type-only and therefore erased; the enum literals
 * are written out and proved against the schema at compile time, the same
 * arrangement and for the same reason as lib/labs/search-params.ts.
 *
 * Track A's components/labs/edit-log-format.ts renders these paths by reading
 * their shape and deliberately does not import this module — it has to keep
 * rendering entries written by a version of this grammar it has never seen. So
 * the heads here stay inside the set that file knows how to label.
 *
 * The full design, including what was rejected, is in
 * docs/plans/track-b-design.md.
 */

// ---------------------------------------------------------------------------
// Enum literals, written out so no value crosses into the browser.
// ---------------------------------------------------------------------------

export const FILM_FORMATS = ["135", "120"] as const;
export type FilmFormat = (typeof FILM_FORMATS)[number];

export const CONTACT_CHANNELS = [
  "phone",
  "line",
  "instagram",
  "facebook",
  "website",
  "email",
] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const LAB_STATUSES = [
  "open",
  "temporarily_closed",
  "permanently_closed",
] as const;
export type LabStatus = (typeof LAB_STATUSES)[number];

/**
 * Compile-time proof that each list above is the database enum, in the same
 * shape search-params.ts uses. If one drifts, the failing assignment names the
 * direction it went.
 */
type Exact<A extends string, B extends string, Name extends string> = [
  A,
] extends [B]
  ? [B] extends [A]
    ? true
    : [`${Name} lists a value the schema does not have`]
  : [`${Name} is missing a value the schema has`];

export const ENUMS_MATCH_SCHEMA: [
  Exact<(typeof filmFormat.enumValues)[number], FilmFormat, "FILM_FORMATS">,
  Exact<
    (typeof contactChannel.enumValues)[number],
    ContactChannel,
    "CONTACT_CHANNELS"
  >,
  Exact<(typeof labStatus.enumValues)[number], LabStatus, "LAB_STATUSES">,
] = [true, true, true];

// ---------------------------------------------------------------------------
// The grammar
// ---------------------------------------------------------------------------

/**
 * Scalar columns on `labs`. `name_en` and `status` are NOT NULL; the rest are
 * nullable, and null is the only way to say "cleared".
 */
export const SCALAR_COLUMNS = [
  "name_en",
  "name_th",
  "area_en",
  "area_th",
  "street",
  "landmark_note",
  "status",
  "status_note",
] as const;
export type ScalarColumn = (typeof SCALAR_COLUMNS)[number];

export const HOURS_FIELDS = ["closed", "open", "close"] as const;
export const PRICING_FIELDS = [
  "price_thb",
  "turnaround_min_d",
  "turnaround_max_d",
] as const;
export const CONTACT_FIELDS = ["channel", "value", "position"] as const;

/** A parsed leaf. B2 switches on `kind` rather than re-splitting the string. */
export type LabPathLeaf =
  | { kind: "scalar"; column: ScalarColumn }
  | { kind: "location" }
  | {
      kind: "hours";
      /** 0 = Sunday, matching `extract(dow)` and DAY_LABELS. */
      day: number;
      field: (typeof HOURS_FIELDS)[number];
    }
  | { kind: "process"; process: ChemProcess }
  | { kind: "scanner"; model: string }
  | {
      kind: "pricing";
      process: ChemProcess;
      format: FilmFormat;
      field: (typeof PRICING_FIELDS)[number];
    }
  | { kind: "curated_service"; key: string; field: "offered" | "note" }
  | { kind: "custom_service"; id: string; field: "custom_label" | "note" }
  | { kind: "curated_supply"; key: string }
  | { kind: "custom_supply"; id: string }
  | {
      kind: "contact";
      id: string;
      field: (typeof CONTACT_FIELDS)[number];
    }
  | { kind: "stock"; filmStockId: string };

export type LabPathKind = LabPathLeaf["kind"];

/**
 * A segment may not contain a `.`, and the grammar says so rather than trusting
 * that none ever will.
 *
 * Every segment in the product today is safe — catalog keys are snake_case and
 * the scanner models are `Fuji Frontier`, `Noritsu`, `SP-3000`, `Flatbed`. But
 * `scanner_models.model` is unconstrained `text`, and one future row called
 * `Nikon Coolscan v.2` would split into two segments and quietly corrupt
 * history that is already written and can no longer be re-parsed.
 * tests/labs/paths.test.ts asserts every catalog row is path-safe, so that
 * migration fails a test instead of the log.
 */
const SEGMENT = /^[A-Za-z0-9 _-]+$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(segment: string): boolean {
  return UUID.test(segment);
}

function has<T extends readonly string[]>(
  list: T,
  value: string,
): value is T[number] {
  return (list as readonly string[]).includes(value);
}

export type ParsedPath =
  { ok: true; leaf: LabPathLeaf } | { ok: false; reason: string };

/**
 * `"pricing.c41.135.price_thb"` → a leaf B2 can write.
 *
 * Returns a reason rather than throwing, because every caller is either zod —
 * which wants the message — or a test.
 */
export function parseLabPath(path: string): ParsedPath {
  const segments = path.split(".");
  if (segments.some((s) => !SEGMENT.test(s))) {
    return {
      ok: false,
      reason: `"${path}" has an empty or illegal segment`,
    };
  }

  const [head, ...rest] = segments;

  switch (head) {
    case "location":
      return rest.length === 0
        ? { ok: true, leaf: { kind: "location" } }
        : {
            ok: false,
            // A pin is one fact. Two leaves let half a diff land, and half of a
            // coordinate pair is a lab in the Gulf of Thailand.
            reason: "location is written whole, not as location.lat/.lng",
          };

    case "hours": {
      const [day, field] = rest;
      if (rest.length !== 2 || !/^[0-6]$/.test(day ?? "")) {
        return {
          ok: false,
          reason: "expected hours.<0-6>.<closed|open|close>",
        };
      }
      if (!has(HOURS_FIELDS, field)) {
        return { ok: false, reason: `"${field}" is not an hours field` };
      }
      return { ok: true, leaf: { kind: "hours", day: Number(day), field } };
    }

    case "processes": {
      const [process] = rest;
      if (rest.length !== 1 || !has(CHEM_PROCESSES, process)) {
        return { ok: false, reason: "expected processes.<c41|ecn2|bw|e6>" };
      }
      return { ok: true, leaf: { kind: "process", process } };
    }

    case "scanners": {
      const [model] = rest;
      if (rest.length !== 1 || !model) {
        return { ok: false, reason: "expected scanners.<model>" };
      }
      // Existence is the scanner_models foreign key's job, not ours.
      return { ok: true, leaf: { kind: "scanner", model } };
    }

    case "pricing": {
      const [process, format, field] = rest;
      if (rest.length !== 3) {
        return {
          ok: false,
          reason: "expected pricing.<process>.<135|120>.<field>",
        };
      }
      if (!has(CHEM_PROCESSES, process)) {
        return { ok: false, reason: `"${process}" is not a process` };
      }
      if (!has(FILM_FORMATS, format)) {
        return { ok: false, reason: `"${format}" is not a format` };
      }
      if (!has(PRICING_FIELDS, field)) {
        return { ok: false, reason: `"${field}" is not a pricing field` };
      }
      return { ok: true, leaf: { kind: "pricing", process, format, field } };
    }

    case "services": {
      // Curated rows are keyed by their catalog key, custom rows by the row's
      // uuid, and the two are told apart by shape. Catalog keys are hand-written
      // snake_case, so one can never be uuid-shaped.
      const [key, field] = rest;
      if (rest.length !== 2 || !key) {
        return {
          ok: false,
          reason:
            "expected services.<key>.<offered|note> or services.<uuid>.<custom_label|note>",
        };
      }
      if (isUuid(key)) {
        if (field !== "custom_label" && field !== "note") {
          return {
            ok: false,
            reason: `"${field}" is not a custom service field`,
          };
        }
        return { ok: true, leaf: { kind: "custom_service", id: key, field } };
      }
      if (field !== "offered" && field !== "note") {
        return { ok: false, reason: `"${field}" is not a service field` };
      }
      return { ok: true, leaf: { kind: "curated_service", key, field } };
    }

    case "supplies": {
      const [key, field] = rest;
      if (rest.length === 1 && key && !isUuid(key)) {
        return { ok: true, leaf: { kind: "curated_supply", key } };
      }
      if (rest.length === 2 && key && isUuid(key) && field === "custom_label") {
        return { ok: true, leaf: { kind: "custom_supply", id: key } };
      }
      return {
        ok: false,
        reason: "expected supplies.<key> or supplies.<uuid>.custom_label",
      };
    }

    case "contacts": {
      const [id, field] = rest;
      if (rest.length !== 2 || !id || !isUuid(id)) {
        return { ok: false, reason: "expected contacts.<uuid>.<field>" };
      }
      if (!has(CONTACT_FIELDS, field)) {
        return { ok: false, reason: `"${field}" is not a contact field` };
      }
      return { ok: true, leaf: { kind: "contact", id, field } };
    }

    case "stock": {
      const [id, field] = rest;
      if (rest.length !== 2 || !id || !isUuid(id) || field !== "formats") {
        return { ok: false, reason: "expected stock.<film_stock_id>.formats" };
      }
      return { ok: true, leaf: { kind: "stock", filmStockId: id } };
    }

    case "photos":
      // Reserved rather than unknown: `lab_photos` has no write path until
      // Track C, and saying so is more use to a caller than "unknown path".
      return {
        ok: false,
        reason: "photos are not editable through this form yet (Track C)",
      };

    default:
      if (has(SCALAR_COLUMNS, head)) {
        return rest.length === 0
          ? { ok: true, leaf: { kind: "scalar", column: head } }
          : { ok: false, reason: `${head} is a scalar and takes no sub-path` };
      }
      return { ok: false, reason: `"${head}" is not a field of a lab` };
  }
}

// ---------------------------------------------------------------------------
// Builders — so the form never hand-writes a path string
// ---------------------------------------------------------------------------

export const labPath = {
  scalar: (column: ScalarColumn) => column,
  location: () => "location",
  hours: (day: number, field: (typeof HOURS_FIELDS)[number]) =>
    `hours.${day}.${field}`,
  process: (process: ChemProcess) => `processes.${process}`,
  scanner: (model: string) => `scanners.${model}`,
  pricing: (
    process: ChemProcess,
    format: FilmFormat,
    field: (typeof PRICING_FIELDS)[number],
  ) => `pricing.${process}.${format}.${field}`,
  curatedService: (key: string, field: "offered" | "note") =>
    `services.${key}.${field}`,
  customService: (id: string, field: "custom_label" | "note") =>
    `services.${id}.${field}`,
  curatedSupply: (key: string) => `supplies.${key}`,
  customSupply: (id: string) => `supplies.${id}.custom_label`,
  contact: (id: string, field: (typeof CONTACT_FIELDS)[number]) =>
    `contacts.${id}.${field}`,
  stock: (filmStockId: string) => `stock.${filmStockId}.formats`,
} as const;

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/**
 * An empty string is never a value.
 *
 * Null means "nothing here" and is the only way to say it. Storing `""`
 * alongside NULL would give the product two spellings of absent, which the
 * detail page and the log would then both have to know about — and the log
 * already prints them identically ("not set"), so the distinction could never
 * be seen anyway.
 */
const text = z.string().trim().min(1, 'use null to clear a field, not ""');
const nullableText = text.nullable();

const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected a 24-hour HH:MM time");

/** The column is numeric(8,2); the bound is its range, not a product limit. */
const priceThb = z.number().nonnegative().max(999_999.99).nullable();
const turnaroundDays = z.number().int().positive().max(365).nullable();

const coordinates = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const formats = z
  .array(z.enum(FILM_FORMATS))
  .refine((v) => new Set(v).size === v.length, "formats are repeated")
  .nullable();

const SCALAR_VALUES: Record<ScalarColumn, z.ZodType> = {
  name_en: text, // NOT NULL — a lab cannot lose its name
  name_th: nullableText,
  area_en: nullableText,
  area_th: nullableText,
  street: nullableText,
  landmark_note: nullableText,
  status: z.enum(LAB_STATUSES), // NOT NULL
  status_note: nullableText,
};

/**
 * The value schema for one leaf.
 *
 * Deliberately shape only. `lab_pricing`'s check constraints — a max without a
 * min, a max below its min, an all-null row — and the composite foreign key
 * that rejects pricing an unoffered process are enforced by the database, and
 * duplicating them here would create a second opinion that eventually disagrees
 * with the first. B3 maps the constraint violation to a message; the grammar
 * does not re-litigate it.
 */
export function valueSchema(leaf: LabPathLeaf): z.ZodType {
  switch (leaf.kind) {
    case "scalar":
      return SCALAR_VALUES[leaf.column];
    case "location":
      return coordinates; // NOT NULL — a lab always has a pin
    case "hours":
      return leaf.field === "closed" ? z.boolean() : clockTime.nullable();
    case "process":
    case "scanner":
    case "curated_supply":
      return z.boolean();
    case "pricing":
      return leaf.field === "price_thb" ? priceThb : turnaroundDays;
    case "curated_service":
      return leaf.field === "offered" ? z.boolean() : nullableText;
    case "custom_service":
    case "custom_supply":
      // A null custom_label removes the row; there is no curated key behind it
      // to fall back to.
      return nullableText;
    case "contact":
      if (leaf.field === "channel") return z.enum(CONTACT_CHANNELS);
      if (leaf.field === "position") return z.number().int().min(0);
      return nullableText;
    case "stock":
      // null deletes the row; [] is a lab that carries the stock in a format
      // nobody has recorded. Both are real states.
      return formats;
  }
}

// ---------------------------------------------------------------------------
// The change set
// ---------------------------------------------------------------------------

export type LabChange = {
  path: string;
  leaf: LabPathLeaf;
  from: unknown;
  to: unknown;
};

/** What is written to `edit_history.changes`, and what the log reads back. */
export type HistoryChange = { path: string; from: unknown; to: unknown };

/**
 * A ceiling on one submission. A full form is some sixty leaves; 200 is well
 * clear of that and well short of a hand-crafted payload worth executing.
 */
const MAX_CHANGES = 200;

const labChangeSchema = z
  .object({
    path: z.string(),
    from: z.unknown(),
    to: z.unknown(),
  })
  .superRefine((change, ctx) => {
    const parsed = parseLabPath(change.path);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", path: ["path"], message: parsed.reason });
      return;
    }

    const schema = valueSchema(parsed.leaf);
    for (const side of ["from", "to"] as const) {
      // `from` is validated too, though nothing writes it: it is what the log
      // renders, and a malformed one is a lie recorded permanently.
      const result = schema.safeParse(change[side]);
      if (!result.success) {
        ctx.addIssue({
          code: "custom",
          path: [side],
          message: result.error.issues[0]?.message ?? "invalid value",
        });
      }
    }

    if (JSON.stringify(change.from) === JSON.stringify(change.to)) {
      ctx.addIssue({
        code: "custom",
        message: `${change.path} is unchanged`,
      });
    }
  });

/**
 * The whole `changes[]` payload.
 *
 * Two set-level rules that no single change can enforce:
 *
 * **One change per leaf.** Two entries for the same path make the write
 * order-dependent and the history ambiguous about what the value actually
 * became.
 *
 * **A process being turned off may not also be priced.** `lab_pricing`'s
 * foreign key to `(lab_id, process)` is ON DELETE CASCADE, so dropping a
 * process destroys every price and turnaround entered for it. A set that says
 * both "e6 is gone" and "e6/135 costs 380" is incoherent whichever order it is
 * applied in.
 *
 * What this cannot check is the other half of that rule — that the set
 * *accounts for* the cells the cascade will delete, so the log does not lie by
 * omission about prices that vanished. That needs the lab's current rows, so it
 * is a precondition inside `applyLabChanges`, which has the transaction.
 */
export const labChangesSchema = z
  .array(labChangeSchema)
  .min(1, "a save with no changes is not a save")
  .max(MAX_CHANGES)
  .superRefine((changes, ctx) => {
    const seen = new Set<string>();
    for (const change of changes) {
      if (seen.has(change.path)) {
        ctx.addIssue({
          code: "custom",
          message: `${change.path} appears more than once`,
        });
      }
      seen.add(change.path);
    }

    // Parsed here rather than read off the elements: zod runs this check even
    // when an element above has already failed, so the leaf may not exist yet.
    // An unparseable path is that element's issue to report, not this one's.
    const leaves = changes.map((c) => parseLabPath(c.path));

    const dropped = new Set<ChemProcess>();
    changes.forEach((c, i) => {
      const parsed = leaves[i];
      if (parsed.ok && parsed.leaf.kind === "process" && c.to === false) {
        dropped.add(parsed.leaf.process);
      }
    });

    changes.forEach((c, i) => {
      const parsed = leaves[i];
      if (!parsed.ok || parsed.leaf.kind !== "pricing") return;
      if (dropped.has(parsed.leaf.process) && c.to !== null) {
        ctx.addIssue({
          code: "custom",
          message: `${c.path} prices ${parsed.leaf.process}, which the same save removes`,
        });
      }
    });
  })
  /**
   * The leaf is attached last, so it exists only on a change set that passed
   * every check above — zod skips a transform once an issue has been raised.
   */
  .transform((changes): LabChange[] =>
    changes.map((change) => {
      const parsed = parseLabPath(change.path);
      // Unreachable: an unparseable path is already an issue on the element.
      if (!parsed.ok) throw new Error(parsed.reason);
      return { ...change, leaf: parsed.leaf };
    }),
  );

export type LabChanges = z.infer<typeof labChangesSchema>;

/** Back to the wire shape, which is what `edit_history.changes` stores. */
export function toHistoryChanges(changes: LabChange[]): HistoryChange[] {
  return changes.map(({ path, from, to }) => ({ path, from, to }));
}
