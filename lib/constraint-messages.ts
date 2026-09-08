/**
 * Database constraint violations, in the contributor's language.
 *
 * Entity-agnostic and free of any runtime import, so a test can read the map
 * without pulling in Next or Auth.js, and so Track B's film-stock actions (B5)
 * can reuse it for `film_stocks_identity_idx` without importing lab code.
 */

/**
 * Postgres constraints, in the contributor's language.
 *
 * The schema is where this product's rules live, so a violation reaching here
 * is a real answer and not only a bug — but "new row violates check constraint
 * lab_pricing_check1" is not an answer anybody can act on. Mapping the ones a
 * form can actually produce keeps the schema authoritative while still telling
 * a person what to change.
 *
 * **The keys are the names the database actually uses, which are not the names
 * lib/db/schema.ts gives them.** db/migrations/0000_init.sql declares its CHECK
 * constraints anonymously, so Postgres named them itself: single-column ones
 * after their column (`labs_hours_check`), multi-column ones by position
 * (`lab_pricing_check`, `_check1`, `_check2`). The mirror calls those three
 * `lab_pricing_not_empty`, `lab_pricing_turnaround_min_present` and
 * `lab_pricing_turnaround_order` — names that exist in no database. The
 * migration is what ran, so the migration wins, and the mirror's names are
 * documentation. CLAUDE.md already calls that parity a review item; naming them
 * properly is a migration, and migrations are frozen for Phase 2.
 *
 * Positional names are brittle by nature, so tests/actions/constraint-names.test.ts
 * asserts every key here exists in the live database. A reordering that would
 * otherwise attach the wrong sentence to the wrong rule fails a test instead.
 *
 * Anything unmapped is rethrown. A constraint nobody anticipated is a defect,
 * and swallowing it into a polite sentence is how it stays one.
 */
export const CONSTRAINT_MESSAGES: Record<string, string> = {
  // Foreign keys and indexes carry the names the mirror expects; only the
  // anonymous CHECKs drifted.
  lab_pricing_lab_id_process_fkey:
    "That price is for a process this lab does not offer. Add the process first.",
  lab_scanners_model_fkey: "That is not a scanner model the catalog knows.",
  lab_stock_film_stock_id_fkey:
    "That film stock is no longer in the catalog. Search for it again.",
  lab_services_curated_idx: "That service is already on this lab.",
  lab_supplies_curated_idx: "That supply is already on this lab.",
  // Identity is name + ISO (PRD B #2), so a second "Portra 400" at 400 is the
  // same stock rather than a new one — which is the point of the index.
  film_stocks_identity_idx:
    "A film stock with that name and ISO is already in the catalog.",

  // Photos. `storage_key` being UNIQUE is what makes a replayed confirm safe:
  // the second one is refused by the database rather than by a check two
  // concurrent calls could both pass.
  photos_film_stock_id_fkey:
    "That film stock is no longer in the catalog. Search for it again.",
  photos_scanner_model_fkey: "That is not a scanner model the catalog knows.",
  photos_storage_key_key: "That upload has already been saved.",
  lab_photos_storage_key_key: "That upload has already been saved.",
  // The migration declares this inline as UNIQUE (owner_id, slug), so Postgres
  // named it; schema.ts calls the same index photobooks_owner_slug_key, which
  // exists in no database. Same drift as the lab_pricing CHECKs above.
  photobooks_owner_id_slug_key: "You already have a photobook at that address.",

  // schema.ts: lab_pricing_not_empty
  lab_pricing_check:
    "A pricing cell needs a price or a turnaround — leave it blank instead.",
  // schema.ts: lab_pricing_turnaround_min_present
  lab_pricing_check1:
    "A turnaround needs a starting number of days, not only an ending one.",
  // schema.ts: lab_pricing_turnaround_order
  lab_pricing_check2: "That turnaround ends sooner than it starts.",
  // schema.ts: labs_hours_shape
  labs_hours_check: "Opening hours must cover all seven days, or none.",
  // schema.ts: lab_services_one_of
  lab_services_check:
    "A service is either from the list or one of your own, not both.",
  // schema.ts: lab_supplies_one_of
  lab_supplies_check:
    "A supply is either from the list or one of your own, not both.",
};

/**
 * The constraint name, from wherever in the error chain it is hiding.
 *
 * Drizzle wraps a driver error in one of its own — "Failed query: …" with the
 * `PostgresError` as `cause` — so the field is never on the error that is
 * actually thrown. Walking the chain rather than reaching one level down is
 * cheap and means an added layer of wrapping in some future version does not
 * silently turn every mapped message back into a 500.
 */
function constraintNameOf(error: unknown): string | null {
  let current = error;
  for (
    let depth = 0;
    depth < 5 && current !== null && current !== undefined;
    depth++
  ) {
    if (typeof current === "object" && "constraint_name" in current) {
      const name = (current as { constraint_name?: unknown }).constraint_name;
      if (typeof name === "string" && name.length > 0) return name;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Whether an error is a unique violation, whichever constraint raised it.
 *
 * Keyed on the SQLSTATE rather than on a constraint name, because the one
 * caller — minting a photobook slug — retries rather than reports, and a retry
 * should not depend on a name that the schema mirror and the migration disagree
 * about.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current = error;
  for (
    let depth = 0;
    depth < 5 && current !== null && current !== undefined;
    depth++
  ) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: unknown }).code === "23505"
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function describeConstraint(error: unknown): string | null {
  const name = constraintNameOf(error);
  return name ? (CONSTRAINT_MESSAGES[name] ?? null) : null;
}
