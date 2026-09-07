import { sql } from "drizzle-orm";

import type { FilmFormat, HistoryChange } from "@/lib/labs/paths";
import { asFormats } from "@/lib/queries/films";
import type { LabTx } from "@/lib/queries/lab-edits";

/**
 * Film stock writes — the same shape as lib/queries/lab-edits.ts and for the
 * same reasons: every function takes the caller's transaction, the version is
 * checked in the statement that does the writing, and nothing here records
 * history (that is the action's, because only it knows where a mutation ends).
 *
 * `appendEditHistory` is not duplicated: `edit_history` is one table for both
 * entities, and lab-edits.ts already owns the insert.
 */

export type NewFilmStock = {
  name: string;
  iso: number;
  formats: FilmFormat[];
  createdBy: string;
};

/** Insert a stock. `film_stocks_identity_idx` refuses a duplicate name + ISO. */
export async function insertFilmStock(
  tx: LabTx,
  input: NewFilmStock,
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into film_stocks (name, iso, formats, created_by)
    values (${input.name.trim()}, ${input.iso}, ${asFormats(input.formats)},
            ${input.createdBy})
    returning id
  `);
  return rows[0].id;
}

export type ApplyFilmChangesResult =
  { ok: true } | { ok: false; reason: "conflict" };

/**
 * Apply a leaf diff to a stock, under the same optimistic concurrency a lab
 * gets.
 *
 * One statement: the version check and the writes together, so a stale caller
 * writes nothing rather than writing and then being told. Three columns means
 * this needs none of `applyLabChanges`'s machinery — but it needs the same
 * guarantee, and getting it from the same shape is cheaper than getting it from
 * a second idea.
 */
export async function applyFilmChanges(
  tx: LabTx,
  id: string,
  version: number,
  changes: HistoryChange[],
): Promise<ApplyFilmChangesResult> {
  const sets = [sql`version = version + 1`, sql`updated_at = now()`];

  for (const change of changes) {
    if (change.path === "name") sets.push(sql`name = ${String(change.to)}`);
    if (change.path === "iso") sets.push(sql`iso = ${Number(change.to)}`);
    if (change.path === "formats") {
      sets.push(sql`formats = ${asFormats(change.to as FilmFormat[])}`);
    }
  }

  const rows = await tx.execute<{ id: string }>(sql`
    update film_stocks
       set ${sql.join(sets, sql`, `)}
     where id = ${id} and version = ${version}
    returning id
  `);

  return rows.length > 0 ? { ok: true } : { ok: false, reason: "conflict" };
}

export type FilmStockRow = {
  name: string;
  iso: number;
  formats: FilmFormat[];
  version: number;
};

/** The row a diff is taken against, read inside the caller's transaction. */
export async function readFilmStock(
  tx: LabTx,
  id: string,
): Promise<FilmStockRow | null> {
  const rows = await tx.execute<{
    name: string;
    iso: number;
    formats: FilmFormat[];
    version: number;
  }>(sql`select name, iso, formats, version from film_stocks where id = ${id}`);

  const row = rows[0];
  if (!row) return null;
  return {
    name: row.name,
    iso: row.iso,
    formats: Array.isArray(row.formats) ? row.formats : [],
    version: row.version,
  };
}
