import { sql, type SQL } from "drizzle-orm";

import { getDb } from "@/lib/db";
import type { FilmFormat } from "@/lib/labs/paths";

/**
 * The Film Stock catalog — reads.
 *
 * Identity is name + ISO, and format is an attribute rather than a separate
 * entry (PRD B #2). That is why "Portra 400" is one row carrying `{135,120}`
 * and not two rows a contributor has to choose between — and why a 120 sample
 * still surfaces when somebody browses the stock by name.
 *
 * Sample counts come from `photos`, which is Track C's table. The column exists
 * and the count is honest today: it is zero, because nothing writes photos yet.
 * Deriving the gallery from photos rather than storing a count is the whole
 * point of PRD B #3 — a stock's gallery is whatever people tagged with it.
 */

export type FilmStockCard = {
  id: string;
  name: string;
  iso: number;
  formats: FilmFormat[];
  sampleCount: number;
};

export type FilmStockListInput = {
  q?: string;
  iso?: number[];
  format?: FilmFormat[];
};

/**
 * The catalog, filtered.
 *
 * ISO is OR within (100 or 400), format is OR within (135 or 120) — both are
 * "show me any of these", which is what a facet row of chips means. The text
 * search is a case-insensitive substring rather than full-text: the corpus is a
 * few hundred product names, and a person typing "portra" wants Portra.
 */
export async function listFilmStocks(
  input: FilmStockListInput = {},
): Promise<FilmStockCard[]> {
  const where: SQL[] = [sql`true`];

  const q = input.q?.trim();
  if (q) where.push(sql`f.name ilike ${"%" + q + "%"}`);
  if (input.iso?.length) where.push(sql`f.iso in ${input.iso}`);
  if (input.format?.length) {
    // Overlap, not containment: a 135-and-120 stock matches a 120 filter.
    where.push(sql`f.formats && ${asFormats(input.format)}`);
  }

  const rows = await getDb().execute<{
    id: string;
    name: string;
    iso: number;
    formats: FilmFormat[];
    sample_count: number;
  }>(sql`
    select f.id, f.name, f.iso, f.formats,
           (select count(*)::int from photos p where p.film_stock_id = f.id)
             as sample_count
      from film_stocks f
     where ${sql.join(where, sql` and `)}
     order by f.name
  `);

  return rows.map(toCard);
}

export type FilmStockDetail = FilmStockCard & {
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Who last touched it, for the same line the lab page carries. */
  editCount: number;
  lastEditedAt: string | null;
  lastEditorUsername: string | null;
};

export async function getFilmStock(
  id: string,
): Promise<FilmStockDetail | null> {
  const rows = await getDb().execute<{
    id: string;
    name: string;
    iso: number;
    formats: FilmFormat[];
    version: number;
    created_at: string;
    updated_at: string;
    sample_count: number;
    edit_count: number;
    last_edited_at: string | null;
    last_editor_username: string | null;
  }>(sql`
    select f.id, f.name, f.iso, f.formats, f.version, f.created_at, f.updated_at,
           (select count(*)::int from photos p where p.film_stock_id = f.id)
             as sample_count,
           (select count(*)::int from edit_history h
             where h.entity = 'film_stock' and h.entity_id = f.id) as edit_count,
           (select h.created_at from edit_history h
             where h.entity = 'film_stock' and h.entity_id = f.id
             order by h.created_at desc limit 1) as last_edited_at,
           (select u.username from edit_history h
              join users u on u.id = h.editor_id
             where h.entity = 'film_stock' and h.entity_id = f.id
             order by h.created_at desc limit 1) as last_editor_username
      from film_stocks f
     where f.id = ${id}
  `);

  const row = rows[0];
  if (!row) return null;

  return {
    ...toCard(row),
    version: row.version,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    editCount: row.edit_count,
    lastEditedAt: row.last_edited_at ? String(row.last_edited_at) : null,
    lastEditorUsername: row.last_editor_username,
  };
}

export type FilmStockMatch = {
  id: string;
  name: string;
  iso: number;
  formats: FilmFormat[];
};

/**
 * Typeahead, for the inventory picker and the photo metadata form.
 *
 * `exactMatch` is the whole reason this is not just `listFilmStocks({ q })`.
 * Both callers can create a catalog entry inline (PRD A #3), and the question
 * the UI has to answer is "is what they typed already here?" — so the flag says
 * whether the query *is* a stock's name, case- and space-insensitively, rather
 * than merely resembling one. Without it the form would offer "add Portra 400"
 * to somebody who has just typed the name of a stock that exists, and the
 * catalog would grow a duplicate the unique index then refuses.
 */
export async function searchFilmStocks(
  q: string,
  limit = 8,
): Promise<{ matches: FilmStockMatch[]; exactMatch: boolean }> {
  const query = q.trim();
  if (query === "") return { matches: [], exactMatch: false };

  const rows = await getDb().execute<{
    id: string;
    name: string;
    iso: number;
    formats: FilmFormat[];
    exact: boolean;
  }>(sql`
    select id, name, iso, formats,
           lower(btrim(name)) = lower(btrim(${query})) as exact
      from film_stocks
     where name ilike ${"%" + query + "%"}
     -- Exact first, then by how much of the name the query accounts for, so
     -- "portra" puts Portra 400 above Portra 800 only when it is shorter.
     order by exact desc, length(name), name
     limit ${limit}
  `);

  return {
    matches: rows.map((row) => ({
      id: row.id,
      name: row.name,
      iso: row.iso,
      formats: toFormats(row.formats),
    })),
    exactMatch: rows.some((row) => row.exact),
  };
}

/** ISO values present in the catalog, for the facet row. */
export async function listFilmStockIsos(): Promise<number[]> {
  const rows = await getDb().execute<{ iso: number }>(
    sql`select distinct iso from film_stocks order by iso`,
  );
  return rows.map((row) => row.iso);
}

function toCard(row: {
  id: string;
  name: string;
  iso: number;
  formats: FilmFormat[];
  sample_count: number;
}): FilmStockCard {
  return {
    id: row.id,
    name: row.name,
    iso: row.iso,
    formats: toFormats(row.formats),
    sampleCount: row.sample_count,
  };
}

/** postgres.js hands an array back; the order it stores is not guaranteed. */
function toFormats(value: unknown): FilmFormat[] {
  if (!Array.isArray(value)) return [];
  const wanted: FilmFormat[] = ["135", "120"];
  return wanted.filter((format) => value.includes(format));
}

export function asFormats(formats: FilmFormat[]): SQL {
  return sql`${`{${formats.join(",")}}`}::film_format[]`;
}
