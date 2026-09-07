import { sql, type SQL } from "drizzle-orm";

import type { Db } from "@/lib/db";
import type {
  ChemProcess,
  ContactChannel,
  FilmFormat,
  LabChange,
  LabStatus,
  ScalarColumn,
} from "@/lib/labs/paths";
import type { HistoryChange } from "@/lib/labs/paths";

/**
 * Every write to a lab.
 *
 * Nothing here opens its own transaction. Each function takes the caller's, so
 * that a Server Action composes "apply the diff, recompute completeness, record
 * one history row" into a single atomic write — and so that a test can run the
 * real function and roll back afterwards rather than asserting against a mock.
 *
 * Reads live in lib/queries/labs.ts (Track A). The split is P14: two worktrees
 * on one file guarantees a conflict, and the two halves genuinely have
 * different shapes — a read is one statement, a write is a small graph.
 */

/** Drizzle's transaction handle, without naming its eight type parameters. */
export type LabTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

/**
 * `labs.completeness`, 0–100 — a search ranking tiebreaker and nothing else.
 *
 * It is never displayed. Its whole job is `order by distance_m, completeness
 * desc`: a lab with real data ahead of a stub at the same distance, which is
 * what the prototype's "nearest + most complete first" promises.
 *
 * **Every facet is `least(count, cap) × unit`, never a proportion.** A measure
 * with a denominator that grows when a contributor adds a fact punishes the
 * contributor: a lab with C-41 fully priced is 2/2, and recording that it also
 * runs E-6 — true, useful, and all the contributor knows — drops it to 2/4.
 * Adding information must never lower the score, so the denominator is always
 * 100 and never moves.
 *
 * Not scored, each deliberately:
 *
 * - **What `createLab` gates on** — name, pin, one process. Every lab has them,
 *   so they are a constant added to every row and discriminate nothing.
 * - **Supplies.** Display-only; they back no filter and answer no question a
 *   searcher acts on.
 * - **Atmosphere photos.** No write path until Track C. Scoring a field nobody
 *   can fill would cap every lab in the product below 100 permanently. Nothing
 *   is scored that the product cannot yet write.
 * - **Status.** A lab should not gain search rank for being closed.
 *
 * Curated services only, matching the partial index that keeps a contributor's
 * freeform entry out of the search filter (PRD A #2). Letting a custom row move
 * a ranking number would reintroduce through the back door exactly what that
 * index exists to prevent, and would make the score farmable by typing anything
 * into the custom field.
 *
 * The full argument, including the pricing cap's known cost, is in
 * docs/plans/track-b-design.md.
 */
const COMPLETENESS = sql`least(100,
    5 * least((select count(*) from lab_pricing p
                where p.lab_id = l.id and p.price_thb is not null), 4)
  + 5 * least((select count(*) from lab_pricing p
                where p.lab_id = l.id and p.turnaround_min_d is not null), 2)
  + case when jsonb_array_length(l.hours) = 7 then 15 else 0 end
  + 5 * least((select count(*) from lab_contacts c where c.lab_id = l.id), 2)
  + 5 * least((select count(*) from lab_scanners s where s.lab_id = l.id), 2)
  + 5 * least((select count(*) from lab_services s
                where s.lab_id = l.id and s.service_key is not null), 2)
  + 5 * least((select count(*) from lab_stock st where st.lab_id = l.id), 2)
  + case when l.area_en is not null or l.area_th is not null then 5 else 0 end
  + case when l.street is not null or l.landmark_note is not null then 5 else 0 end
  + case when l.name_th is not null then 5 else 0 end
)::smallint`;

/**
 * Recompute one lab's completeness. Returns the new value.
 *
 * `least(100, …)` is belt-and-braces — the weights sum to exactly 100 and the
 * check constraint is the real backstop — but it costs nothing, and it means a
 * future weight typo degrades the ranking instead of failing every write.
 */
export async function recomputeCompleteness(
  tx: LabTx,
  labId: string,
): Promise<number> {
  const rows = await tx.execute<{ completeness: number }>(sql`
    update labs l
       set completeness = ${COMPLETENESS}
     where l.id = ${labId}
    returning l.completeness
  `);
  return rows[0]?.completeness ?? 0;
}

/**
 * Recompute every lab. Returns how many rows changed.
 *
 * The seeded Bangkok labs were inserted with the column default and have sat at
 * zero ever since, because completeness is only recomputed inside a write
 * transaction and nobody has edited them. Until this runs, the tiebreaker is
 * inert and "most complete first" is a claim the product does not keep.
 * `pnpm db:backfill:completeness` calls it.
 *
 * It lives here rather than in a seed file so the formula exists once: SQL only
 * in lib/queries/ is the one layering rule, and a second copy in db/seed/ would
 * be the copy that goes stale.
 */
export async function recomputeAllCompleteness(tx: LabTx): Promise<number> {
  const rows = await tx.execute<{ id: string }>(sql`
    update labs l
       set completeness = ${COMPLETENESS}
     where l.completeness is distinct from ${COMPLETENESS}
    returning l.id
  `);
  return rows.length;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export type EditHistoryInput = {
  entity: "lab" | "film_stock";
  entityId: string;
  editorId: string;
  note?: string | null;
  changes: HistoryChange[];
};

/**
 * One row. The caller writes exactly one per mutation — that invariant is B3's,
 * because only the action knows where a mutation begins and ends.
 *
 * An empty `changes` array is rejected by `edit_history_changes_nonempty`; the
 * action should have returned "nothing changed" long before reaching here.
 */
export async function appendEditHistory(
  tx: LabTx,
  input: EditHistoryInput,
): Promise<void> {
  await tx.execute(sql`
    insert into edit_history (entity, entity_id, editor_id, note, changes)
    values (
      ${input.entity}, ${input.entityId}, ${input.editorId},
      ${input.note ?? null}, ${JSON.stringify(input.changes)}::jsonb
    )
  `);
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export type NewLabPricing = {
  process: ChemProcess;
  format: FilmFormat;
  priceThb?: number | null;
  turnaroundMinD?: number | null;
  turnaroundMaxD?: number | null;
};

export type NewLabInput = {
  createdBy: string;
  nameEn: string;
  nameTh?: string | null;
  location: { lat: number; lng: number };
  areaEn?: string | null;
  areaTh?: string | null;
  street?: string | null;
  landmarkNote?: string | null;
  status?: LabStatus;
  statusNote?: string | null;
  /** Seven entries or none; the check constraint allows nothing between. */
  hours?: unknown[];
  processes: ChemProcess[];
  scanners?: string[];
  pricing?: NewLabPricing[];
  services?: { key?: string; customLabel?: string; note?: string | null }[];
  supplies?: { key?: string; customLabel?: string }[];
  contacts?: { id?: string; channel: ContactChannel; value: string }[];
  stock?: { filmStockId: string; formats: FilmFormat[] }[];
};

/**
 * Insert a lab and its children. Returns the new id.
 *
 * Creation takes a document, not a diff — the deliberate asymmetry with
 * `applyLabChanges`. There is no prior state to address leaves against, and
 * forcing creation through the diff path would mean a brand-new lab arriving at
 * version 2 with a founding dump of forty leaves in its history, burying every
 * real edit that follows under it.
 *
 * The gates — a name, a pin, at least one process — are the action's (B3), not
 * this function's. What is enforced here is only what the database enforces
 * anyway.
 */
export async function insertLab(
  tx: LabTx,
  input: NewLabInput,
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into labs (
      name_en, name_th, location, area_en, area_th, street, landmark_note,
      status, status_note, hours, created_by
    ) values (
      ${input.nameEn}, ${input.nameTh ?? null},
      -- Longitude first: ST_MakePoint takes (x, y), and getting that backwards
      -- puts every lab in the Indian Ocean without failing anything.
      st_setsrid(st_makepoint(${input.location.lng}, ${input.location.lat}), 4326)::geography,
      ${input.areaEn ?? null}, ${input.areaTh ?? null},
      ${input.street ?? null}, ${input.landmarkNote ?? null},
      ${input.status ?? "open"}, ${input.statusNote ?? null},
      ${JSON.stringify(input.hours ?? [])}::jsonb,
      ${input.createdBy}
    )
    returning id
  `);

  const labId = rows[0].id;
  await writeChildren(tx, labId, input);
  await recomputeCompleteness(tx, labId);
  return labId;
}

/** Children in insert order: processes first, because pricing depends on them. */
async function writeChildren(
  tx: LabTx,
  labId: string,
  input: NewLabInput,
): Promise<void> {
  if (input.processes.length > 0) {
    await tx.execute(sql`
      insert into lab_processes (lab_id, process)
      values ${values(input.processes.map((p) => sql`(${labId}, ${p})`))}
    `);
  }

  if (input.scanners?.length) {
    await tx.execute(sql`
      insert into lab_scanners (lab_id, model)
      values ${values(input.scanners.map((m) => sql`(${labId}, ${m})`))}
    `);
  }

  // The composite foreign key rejects a cell for a process the lab does not
  // offer. That is the invariant, and it is the database's to keep.
  if (input.pricing?.length) {
    await tx.execute(sql`
      insert into lab_pricing
        (lab_id, process, format, price_thb, turnaround_min_d, turnaround_max_d)
      values ${values(
        input.pricing.map(
          (c) => sql`(${labId}, ${c.process}, ${c.format},
                      ${c.priceThb ?? null}, ${c.turnaroundMinD ?? null},
                      ${c.turnaroundMaxD ?? null})`,
        ),
      )}
    `);
  }

  if (input.services?.length) {
    await tx.execute(sql`
      insert into lab_services (lab_id, service_key, custom_label, note)
      values ${values(
        input.services.map(
          (s) => sql`(${labId}, ${s.key ?? null}, ${s.customLabel ?? null},
                      ${s.note ?? null})`,
        ),
      )}
    `);
  }

  if (input.supplies?.length) {
    await tx.execute(sql`
      insert into lab_supplies (lab_id, supply_key, custom_label)
      values ${values(
        input.supplies.map(
          (s) => sql`(${labId}, ${s.key ?? null}, ${s.customLabel ?? null})`,
        ),
      )}
    `);
  }

  if (input.contacts?.length) {
    await tx.execute(sql`
      insert into lab_contacts (id, lab_id, channel, value, position)
      values ${values(
        input.contacts.map(
          (c, i) => sql`(${c.id ?? sql`gen_random_uuid()`}, ${labId},
                         ${c.channel}, ${c.value}, ${i})`,
        ),
      )}
    `);
  }

  if (input.stock?.length) {
    await tx.execute(sql`
      insert into lab_stock (lab_id, film_stock_id, formats)
      values ${values(
        input.stock.map(
          (s) => sql`(${labId}, ${s.filmStockId}, ${asFormats(s.formats)})`,
        ),
      )}
    `);
  }
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

export type LabStatusRow = { status: LabStatus; statusNote: string | null };

/**
 * The two fields `setLabStatus` needs a `from` for.
 *
 * A status change is an edit like any other and so must record what it changed
 * from, but the button that sends it has no form behind it holding the previous
 * values — and the client would be the wrong place to take them from anyway.
 * Small and deliberate rather than reaching for `getLab`, which runs six selects
 * to answer a question about two columns.
 */
export async function readLabStatus(
  tx: LabTx,
  labId: string,
): Promise<LabStatusRow | null> {
  const rows = await tx.execute<{
    status: LabStatus;
    status_note: string | null;
  }>(sql`select status, status_note from labs where id = ${labId}`);
  const row = rows[0];
  return row ? { status: row.status, statusNote: row.status_note } : null;
}

export type ApplyLabChangesResult =
  | { ok: true }
  /** The lab moved under the editor; B3 reloads and shows what changed. */
  | { ok: false; reason: "conflict" }
  /**
   * The diff drops a process without accounting for the pricing that goes with
   * it. Carries the paths the change set should have contained.
   */
  | { ok: false; reason: "cascade"; missing: string[] };

/**
 * Apply a leaf diff to a lab, under optimistic concurrency.
 *
 * The version check runs first and in the same statement as the scalar writes,
 * so a stale caller writes nothing at all rather than writing and then being
 * told. It also takes the row lock that serialises two editors of the same lab
 * for the rest of the transaction.
 *
 * **Only the named leaves are written.** That is the point of the whole
 * grammar, and it is what the version check alone does not give: a caller that
 * submitted its entire form would pass the version check and still overwrite
 * every field a concurrent editor had changed. A field nobody touched is never
 * in a SET clause here.
 */
export async function applyLabChanges(
  tx: LabTx,
  labId: string,
  version: number,
  changes: LabChange[],
): Promise<ApplyLabChangesResult> {
  const cascade = await checkProcessCascade(tx, labId, changes);
  if (cascade.length > 0) {
    return { ok: false, reason: "cascade", missing: cascade };
  }

  const bumped = await applyLabRow(tx, labId, version, changes);
  if (!bumped) return { ok: false, reason: "conflict" };

  await applyProcesses(tx, labId, changes);
  await applyScanners(tx, labId, changes);
  await applyPricing(tx, labId, changes);
  await applyServices(tx, labId, changes);
  await applySupplies(tx, labId, changes);
  await applyContacts(tx, labId, changes);
  await applyStock(tx, labId, changes);

  await recomputeCompleteness(tx, labId);
  return { ok: true };
}

/**
 * The half of the cascade rule the grammar cannot see.
 *
 * `lab_pricing_lab_id_process_fkey` is ON DELETE CASCADE, so dropping a process
 * destroys every price and turnaround entered for it. The zod schema rejects a
 * set that contradicts itself — dropping E-6 and pricing it — but it is handed
 * a diff and not a lab, so it cannot know which cells exist to be accounted
 * for. Without this check the history records one boolean while four price
 * cells vanish, and the log lies by omission about the most volatile data in
 * the schema.
 */
async function checkProcessCascade(
  tx: LabTx,
  labId: string,
  changes: LabChange[],
): Promise<string[]> {
  const dropped = changes
    .filter((c) => c.leaf.kind === "process" && c.to === false)
    .map((c) => (c.leaf as { process: ChemProcess }).process);
  if (dropped.length === 0) return [];

  const rows = await tx.execute<{
    process: ChemProcess;
    format: FilmFormat;
    price_thb: string | null;
    turnaround_min_d: number | null;
    turnaround_max_d: number | null;
  }>(sql`
    select process, format, price_thb, turnaround_min_d, turnaround_max_d
      from lab_pricing
     where lab_id = ${labId} and process in ${dropped}
  `);

  const nulled = new Set(
    changes.filter((c) => c.to === null).map((c) => c.path),
  );

  const missing: string[] = [];
  for (const row of rows) {
    const fields = [
      ["price_thb", row.price_thb],
      ["turnaround_min_d", row.turnaround_min_d],
      ["turnaround_max_d", row.turnaround_max_d],
    ] as const;

    for (const [field, value] of fields) {
      if (value === null) continue;
      const path = `pricing.${row.process}.${row.format}.${field}`;
      if (!nulled.has(path)) missing.push(path);
    }
  }
  return missing;
}

/** Columns on `labs` may be named in SQL only from this closed set. */
const COLUMN_OF: Record<ScalarColumn, string> = {
  name_en: "name_en",
  name_th: "name_th",
  area_en: "area_en",
  area_th: "area_th",
  street: "street",
  landmark_note: "landmark_note",
  status: "status",
  status_note: "status_note",
};

/**
 * The version check, the scalar columns, the pin and the week, in one statement.
 *
 * Returns false when no row matched, which is the conflict: another editor has
 * bumped the version since this form was opened.
 */
async function applyLabRow(
  tx: LabTx,
  labId: string,
  version: number,
  changes: LabChange[],
): Promise<boolean> {
  const sets: SQL[] = [sql`version = l.version + 1`, sql`updated_at = now()`];

  for (const change of changes) {
    if (change.leaf.kind === "scalar") {
      const column = sql.raw(COLUMN_OF[change.leaf.column]);
      sets.push(sql`${column} = ${change.to ?? null}`);
    }
    if (change.leaf.kind === "location") {
      const { lat, lng } = change.to as { lat: number; lng: number };
      sets.push(
        sql`location = st_setsrid(st_makepoint(${lng}, ${lat}), 4326)::geography`,
      );
    }
  }

  const hours = hoursExpression(changes);
  if (hours) sets.push(sql`hours = ${hours}`);

  const rows = await tx.execute<{ id: string }>(sql`
    update labs l
       set ${sql.join(sets, sql`, `)}
     where l.id = ${labId} and l.version = ${version}
    returning l.id
  `);
  return rows.length > 0;
}

/** `{"closed": true}` seven times, the shape an untouched day keeps. */
const BLANK_WEEK = JSON.stringify(
  Array.from({ length: 7 }, () => ({ closed: true })),
);

/**
 * The whole week, rebuilt.
 *
 * Two constraints shape this. `labs_hours_shape` allows 0 or 7 entries and
 * nothing between, so a lab whose hours are `[]` cannot receive `hours.3.open`
 * — the week is materialised first, with every untouched day closed. And a
 * cleared time is *removed* rather than set to null, so a shut day stores
 * exactly `{"closed": true}` and never `{"closed": true, "open": null}`, which
 * the reader would have to learn to ignore.
 *
 * Each change addresses a distinct key (the grammar rejects a repeated path),
 * so the order the operations compose in does not affect the result.
 */
function hoursExpression(changes: LabChange[]): SQL | null {
  const hours = changes.filter((c) => c.leaf.kind === "hours");
  if (hours.length === 0) return null;

  let expr = sql`(case when jsonb_array_length(l.hours) = 7
                       then l.hours else ${BLANK_WEEK}::jsonb end)`;

  for (const change of hours) {
    const leaf = change.leaf as { day: number; field: string };
    const path = sql`${`{${leaf.day},${leaf.field}}`}::text[]`;
    expr =
      change.to === null
        ? sql`(${expr} #- ${path})`
        : sql`jsonb_set(${expr}, ${path}, ${JSON.stringify(change.to)}::jsonb)`;
  }
  return expr;
}

async function applyProcesses(
  tx: LabTx,
  labId: string,
  changes: LabChange[],
): Promise<void> {
  const added: ChemProcess[] = [];
  const removed: ChemProcess[] = [];
  for (const change of changes) {
    if (change.leaf.kind !== "process") continue;
    (change.to === true ? added : removed).push(change.leaf.process);
  }

  if (added.length > 0) {
    await tx.execute(sql`
      insert into lab_processes (lab_id, process)
      values ${values(added.map((p) => sql`(${labId}, ${p})`))}
      on conflict do nothing
    `);
  }
  if (removed.length > 0) {
    // Cascades lab_pricing, which checkProcessCascade has already required the
    // change set to account for.
    await tx.execute(sql`
      delete from lab_processes
       where lab_id = ${labId} and process in ${removed}
    `);
  }
}

async function applyScanners(
  tx: LabTx,
  labId: string,
  changes: LabChange[],
): Promise<void> {
  const added: string[] = [];
  const removed: string[] = [];
  for (const change of changes) {
    if (change.leaf.kind !== "scanner") continue;
    (change.to === true ? added : removed).push(change.leaf.model);
  }

  if (added.length > 0) {
    await tx.execute(sql`
      insert into lab_scanners (lab_id, model)
      values ${values(added.map((m) => sql`(${labId}, ${m})`))}
      on conflict do nothing
    `);
  }
  if (removed.length > 0) {
    await tx.execute(sql`
      delete from lab_scanners
       where lab_id = ${labId} and model in ${removed}
    `);
  }
}

/**
 * Pricing, cell by cell.
 *
 * A cell is read before it is written, because the outcome depends on what is
 * already there: `lab_pricing_not_empty` forbids an all-null row, so clearing
 * the last value in a cell is a DELETE and not an UPDATE, and no upsert can
 * decide that without knowing the other two columns.
 */
async function applyPricing(
  tx: LabTx,
  labId: string,
  changes: LabChange[],
): Promise<void> {
  type Cell = {
    process: ChemProcess;
    format: FilmFormat;
    price?: number | null;
    min?: number | null;
    max?: number | null;
  };
  const cells = new Map<string, Cell>();

  for (const change of changes) {
    if (change.leaf.kind !== "pricing") continue;
    const { process, format, field } = change.leaf;
    const cell = cells.get(cellKey(process, format)) ?? { process, format };
    const value = change.to as number | null;
    if (field === "price_thb") cell.price = value;
    if (field === "turnaround_min_d") cell.min = value;
    if (field === "turnaround_max_d") cell.max = value;
    cells.set(cellKey(process, format), cell);
  }
  if (cells.size === 0) return;

  const current = await tx.execute<{
    process: string;
    format: string;
    price_thb: string | null;
    turnaround_min_d: number | null;
    turnaround_max_d: number | null;
  }>(sql`
    select process, format, price_thb, turnaround_min_d, turnaround_max_d
      from lab_pricing where lab_id = ${labId}
  `);
  const existing = new Map(
    current.map((r) => [cellKey(r.process, r.format), r]),
  );

  for (const [key, cell] of cells) {
    const { process, format } = cell;
    const was = existing.get(key);
    const price = "price" in cell ? cell.price : numeric(was?.price_thb);
    const min = "min" in cell ? cell.min : (was?.turnaround_min_d ?? null);
    const max = "max" in cell ? cell.max : (was?.turnaround_max_d ?? null);

    if (price === null && min === null && max === null) {
      await tx.execute(sql`
        delete from lab_pricing
         where lab_id = ${labId} and process = ${process} and format = ${format}
      `);
      continue;
    }

    await tx.execute(sql`
      insert into lab_pricing
        (lab_id, process, format, price_thb, turnaround_min_d, turnaround_max_d)
      values (${labId}, ${process}, ${format}, ${price ?? null},
              ${min ?? null}, ${max ?? null})
      on conflict (lab_id, process, format) do update
         set price_thb = excluded.price_thb,
             turnaround_min_d = excluded.turnaround_min_d,
             turnaround_max_d = excluded.turnaround_max_d
    `);
  }
}

/**
 * Services, curated and freeform.
 *
 * A curated row is identified by its catalog key and a custom one by the uuid
 * the form generated for it, which is what lets adding, editing and removing a
 * contributor's own entry be the same three shapes as everything else.
 */
async function applyServices(
  tx: LabTx,
  labId: string,
  changes: LabChange[],
): Promise<void> {
  for (const change of changes) {
    const leaf = change.leaf;

    if (leaf.kind === "curated_service") {
      if (leaf.field === "offered") {
        await (change.to === true
          ? tx.execute(sql`
              insert into lab_services (lab_id, service_key)
              values (${labId}, ${leaf.key})
              on conflict (lab_id, service_key) where service_key is not null
              do nothing
            `)
          : tx.execute(sql`
              delete from lab_services
               where lab_id = ${labId} and service_key = ${leaf.key}
            `));
        continue;
      }
      // A note on a service nobody has ticked still means the lab offers it.
      await tx.execute(sql`
        insert into lab_services (lab_id, service_key, note)
        values (${labId}, ${leaf.key}, ${change.to ?? null})
        on conflict (lab_id, service_key) where service_key is not null
        do update set note = excluded.note
      `);
      continue;
    }

    if (leaf.kind === "custom_service") {
      if (leaf.field === "custom_label" && change.to === null) {
        await tx.execute(sql`
          delete from lab_services where id = ${leaf.id} and lab_id = ${labId}
        `);
        continue;
      }
      const column = sql.raw(leaf.field === "note" ? "note" : "custom_label");
      await tx.execute(sql`
        insert into lab_services (id, lab_id, ${column})
        values (${leaf.id}, ${labId}, ${change.to ?? null})
        on conflict (id) do update set ${column} = excluded.${column}
      `);
    }
  }
}

async function applySupplies(
  tx: LabTx,
  labId: string,
  changes: LabChange[],
): Promise<void> {
  for (const change of changes) {
    const leaf = change.leaf;

    if (leaf.kind === "curated_supply") {
      await (change.to === true
        ? tx.execute(sql`
            insert into lab_supplies (lab_id, supply_key)
            values (${labId}, ${leaf.key})
            on conflict (lab_id, supply_key) where supply_key is not null
            do nothing
          `)
        : tx.execute(sql`
            delete from lab_supplies
             where lab_id = ${labId} and supply_key = ${leaf.key}
          `));
      continue;
    }

    if (leaf.kind === "custom_supply") {
      await (change.to === null
        ? tx.execute(sql`
            delete from lab_supplies where id = ${leaf.id} and lab_id = ${labId}
          `)
        : tx.execute(sql`
            insert into lab_supplies (id, lab_id, custom_label)
            values (${leaf.id}, ${labId}, ${change.to})
            on conflict (id) do update set custom_label = excluded.custom_label
          `));
    }
  }
}

/**
 * Contacts, addressed by an id the form generated.
 *
 * A new contact needs both a channel and a value, and the grammar cannot
 * require them together — they are separate leaves. So a row is inserted only
 * once both have arrived in the same change set; a lone `value` on a row that
 * does not exist updates nothing, which is the honest outcome for a diff that
 * addresses something absent.
 */
async function applyContacts(
  tx: LabTx,
  labId: string,
  changes: LabChange[],
): Promise<void> {
  type Draft = {
    channel?: ContactChannel;
    value?: string | null;
    position?: number;
  };
  const drafts = new Map<string, Draft>();

  for (const change of changes) {
    if (change.leaf.kind !== "contact") continue;
    const draft = drafts.get(change.leaf.id) ?? {};
    if (change.leaf.field === "channel")
      draft.channel = change.to as ContactChannel;
    if (change.leaf.field === "value") draft.value = change.to as string | null;
    if (change.leaf.field === "position") draft.position = change.to as number;
    drafts.set(change.leaf.id, draft);
  }

  for (const [id, draft] of drafts) {
    if (draft.value === null) {
      await tx.execute(sql`
        delete from lab_contacts where id = ${id} and lab_id = ${labId}
      `);
      continue;
    }

    if (draft.channel !== undefined && draft.value !== undefined) {
      await tx.execute(sql`
        insert into lab_contacts (id, lab_id, channel, value, position)
        values (${id}, ${labId}, ${draft.channel}, ${draft.value},
                ${draft.position ?? 0})
        on conflict (id) do update
           set channel = excluded.channel,
               value = excluded.value,
               position = excluded.position
      `);
      continue;
    }

    const sets: SQL[] = [];
    if (draft.channel !== undefined) sets.push(sql`channel = ${draft.channel}`);
    if (draft.value !== undefined) sets.push(sql`value = ${draft.value}`);
    if (draft.position !== undefined)
      sets.push(sql`position = ${draft.position}`);
    if (sets.length === 0) continue;

    await tx.execute(sql`
      update lab_contacts set ${sql.join(sets, sql`, `)}
       where id = ${id} and lab_id = ${labId}
    `);
  }
}

async function applyStock(
  tx: LabTx,
  labId: string,
  changes: LabChange[],
): Promise<void> {
  for (const change of changes) {
    if (change.leaf.kind !== "stock") continue;

    if (change.to === null) {
      await tx.execute(sql`
        delete from lab_stock
         where lab_id = ${labId} and film_stock_id = ${change.leaf.filmStockId}
      `);
      continue;
    }

    // `[]` is a lab that carries the stock in a format nobody has recorded,
    // which is a different answer from not carrying it at all.
    await tx.execute(sql`
      insert into lab_stock (lab_id, film_stock_id, formats)
      values (${labId}, ${change.leaf.filmStockId},
              ${asFormats(change.to as FilmFormat[])})
      on conflict (lab_id, film_stock_id)
      do update set formats = excluded.formats
    `);
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** One pricing cell, for matching a change against the row already there. */
function cellKey(process: string, format: string): string {
  return `${process}/${format}`;
}

/** `(a),(b),(c)` for a multi-row VALUES list. */
function values(rows: SQL[]): SQL {
  return sql.join(rows, sql`, `);
}

/** `film_format[]`, which postgres will not infer from an empty array. */
function asFormats(formats: FilmFormat[]): SQL {
  return sql`${`{${formats.join(",")}}`}::film_format[]`;
}

/** numeric arrives as a string; the column is numeric(8,2). */
function numeric(value: string | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}
