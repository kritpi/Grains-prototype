import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import type { FilmFormat } from "@/lib/labs/paths";
import type { LabTx } from "@/lib/queries/lab-edits";

/**
 * Photos — the atomic unit of the photobook portfolio, and the row the Film
 * Stock Gallery is derived from.
 *
 * **There is no `lab_id` here and there must never be one.** A Photo attributes
 * to a Film Stock, a Camera and a scanner *model*, never to the lab that
 * developed it, so a bad scan cannot reflect on a lab's reputation. The schema
 * enforces it by the absence of a column; nothing in this file should try to
 * reintroduce it by joining its way there.
 *
 * `lab_photos` is a different table for that reason and its writes are here
 * too, kept visibly apart rather than in a shared "media" abstraction that
 * would invite the two to converge.
 */

export type PhotoMetadata = {
  filmStockId: string | null;
  format: FilmFormat | null;
  frameSize: string | null;
  camera: string | null;
  scannerModel: string | null;
  chemistry: string | null;
};

export type NewPhoto = PhotoMetadata & {
  ownerId: string;
  storageKey: string;
  width: number;
  height: number;
};

/**
 * How many Photos a person has uploaded themselves.
 *
 * Originals only, which is the whole point: a Connection is a row in
 * `photobook_items` pointing at somebody else's Photo, costs no storage, and is
 * explicitly not capped (PRD D #5). Counting `photos` by owner rather than
 * counting a user's photobook items is what makes that true by construction —
 * there is no way to write this query that accidentally counts a Connection.
 *
 * The executor is a parameter with a default rather than a fixed `getDb()`.
 * Callers pass nothing; the only reason it exists is that a test can hand it a
 * transaction it then rolls back, which is how the write layer is already
 * tested. A cap is a rule worth asserting against a real database rather than
 * a mock, and this is the cheapest way to do it without leaving rows behind.
 */
export async function countOriginals(
  ownerId: string,
  executor: Pick<LabTx, "execute"> = getDb(),
): Promise<number> {
  const rows = await executor.execute<{ count: number }>(sql`
    select count(*)::int as count from photos where owner_id = ${ownerId}
  `);
  return rows[0].count;
}

/**
 * Insert a confirmed Photo.
 *
 * `storage_key` is UNIQUE, which is the backstop on a confirm being replayed:
 * a second confirm for the same object is refused by the database rather than
 * by a check here that two concurrent calls could both pass.
 */
export async function insertPhoto(tx: LabTx, input: NewPhoto): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into photos (
      owner_id, storage_key, width, height,
      film_stock_id, format, frame_size, camera, scanner_model, chemistry
    ) values (
      ${input.ownerId}, ${input.storageKey}, ${input.width}, ${input.height},
      ${input.filmStockId}, ${input.format}::film_format, ${input.frameSize},
      ${input.camera}, ${input.scannerModel}, ${input.chemistry}
    )
    returning id
  `);
  return rows[0].id;
}

export type PhotoRow = PhotoMetadata & {
  id: string;
  ownerId: string;
  storageKey: string;
  width: number;
  height: number;
};

/** One Photo, by id. Null rather than a throw — a stale link is not an error. */
export async function getPhoto(id: string): Promise<PhotoRow | null> {
  const rows = await getDb().execute<{
    id: string;
    owner_id: string;
    storage_key: string;
    width: number;
    height: number;
    film_stock_id: string | null;
    format: FilmFormat | null;
    frame_size: string | null;
    camera: string | null;
    scanner_model: string | null;
    chemistry: string | null;
  }>(sql`
    select id, owner_id, storage_key, width, height,
           film_stock_id, format, frame_size, camera, scanner_model, chemistry
      from photos
     where id = ${id}::uuid
  `);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    ownerId: row.owner_id,
    storageKey: row.storage_key,
    width: row.width,
    height: row.height,
    filmStockId: row.film_stock_id,
    format: row.format,
    frameSize: row.frame_size,
    camera: row.camera,
    scannerModel: row.scanner_model,
    chemistry: row.chemistry,
  };
}

/**
 * Rewrite a Photo's metadata, owner only.
 *
 * The ownership check is in the WHERE clause rather than in a preceding read,
 * so there is no window between deciding and writing. A non-owner gets zero
 * rows back, which the caller reports as a refusal.
 */
export async function updatePhotoMetadata(
  tx: LabTx,
  id: string,
  ownerId: string,
  metadata: PhotoMetadata,
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update photos
       set film_stock_id = ${metadata.filmStockId},
           format        = ${metadata.format}::film_format,
           frame_size    = ${metadata.frameSize},
           camera        = ${metadata.camera},
           scanner_model = ${metadata.scannerModel},
           chemistry     = ${metadata.chemistry}
     where id = ${id}::uuid and owner_id = ${ownerId}
    returning id
  `);
  return rows.length === 1;
}

/**
 * Delete a Photo, owner only, returning its storage key so the caller can
 * remove the object too.
 *
 * The cascade from `photobook_items` is what gives PRD D #8 its silent reflow:
 * every Connection to this Photo disappears with it, in every other person's
 * Photobook, with no tombstone. That is deliberate and is the uploader's only
 * recourse over how their work is being reused (PRD D #6).
 *
 * Returns null when the row was not theirs or was already gone, which the
 * caller must not treat as licence to delete the object.
 */
export async function deletePhoto(
  tx: LabTx,
  id: string,
  ownerId: string,
): Promise<string | null> {
  const rows = await tx.execute<{ storage_key: string }>(sql`
    delete from photos
     where id = ${id}::uuid and owner_id = ${ownerId}
    returning storage_key
  `);
  return rows[0]?.storage_key ?? null;
}

// ---------------------------------------------------------------------------
// Lab atmosphere photos — a different table, and deliberately so.
// ---------------------------------------------------------------------------

export type NewLabPhoto = {
  labId: string;
  storageKey: string;
  width: number;
  height: number;
  uploadedBy: string;
};

/**
 * Insert venue documentation for a lab.
 *
 * `uploaded_by` records who contributed it, the same way `edit_history` records
 * who changed a field — it is provenance for a community edit, not authorship
 * of a work. It carries no ownership: a lab photo is not Connectable, is not
 * counted against anyone's upload cap, and never appears on /u/@username.
 */
export async function insertLabPhoto(
  tx: LabTx,
  input: NewLabPhoto,
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into lab_photos (lab_id, storage_key, width, height, uploaded_by)
    values (${input.labId}::uuid, ${input.storageKey}, ${input.width},
            ${input.height}, ${input.uploadedBy})
    returning id
  `);
  return rows[0].id;
}

/**
 * Remove venue documentation, returning the lab it belonged to and the object
 * to delete with it.
 *
 * **No owner clause, and that is not an oversight.** `uploaded_by` on this
 * table is provenance rather than ownership — the comment on `insertLabPhoto`
 * says so — and a lab's page is edited by anyone signed in under PRD A's trust
 * model. A photograph of the wrong shopfront that only its uploader could take
 * down would be a page nobody else could correct, which is the opposite of how
 * every other field on a lab works.
 *
 * Returns null when the row was already gone, which the caller must not treat
 * as licence to delete the object: the key is only known to have been this
 * row's if this delete is the one that removed it.
 */
export async function deleteLabPhoto(
  tx: LabTx,
  id: string,
): Promise<{ labId: string; storageKey: string } | null> {
  const rows = await tx.execute<{ lab_id: string; storage_key: string }>(sql`
    delete from lab_photos
     where id = ${id}::uuid
    returning lab_id, storage_key
  `);
  const row = rows[0];
  return row ? { labId: row.lab_id, storageKey: row.storage_key } : null;
}

// ---------------------------------------------------------------------------
// The Film Stock Gallery, and the reference model's one visible proof.
// ---------------------------------------------------------------------------

export type GalleryPhoto = {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  frameSize: string | null;
  format: FilmFormat | null;
  uploaderUsername: string | null;
};

export type GalleryPage = {
  photos: GalleryPhoto[];
  /** Pass back to continue. Null when the last page has been served. */
  nextCursor: string | null;
};

const GALLERY_PAGE = 24;

/**
 * A film stock's gallery.
 *
 * There is no gallery table and no upload path of its own: the gallery *is*
 * `photos_gallery_idx`, a derived view of whatever people tagged with this
 * stock (PRD B #3). Which is why this query orders by exactly the columns that
 * index is built on — `(film_stock_id, created_at desc)` — and why adding a
 * different default sort later means adding an index, not just an ORDER BY.
 *
 * Keyset pagination rather than OFFSET. A gallery is append-heavy and people
 * arrive at it days apart, so an offset silently repeats or skips a photo every
 * time somebody uploads mid-scroll. `(created_at, id)` is unique because `id`
 * breaks the tie, so the cursor names a row rather than a position.
 */
export async function listGalleryPhotos(
  filmStockId: string,
  cursor?: string | null,
  limit: number = GALLERY_PAGE,
): Promise<GalleryPage> {
  const after = decodeCursor(cursor);

  const rows = await getDb().execute<{
    id: string;
    storage_key: string;
    width: number;
    height: number;
    frame_size: string | null;
    format: FilmFormat | null;
    uploader_username: string | null;
    created_at: string;
  }>(sql`
    select p.id, p.storage_key, p.width, p.height, p.frame_size, p.format,
           u.username as uploader_username, p.created_at
      from photos p
      join users u on u.id = p.owner_id
     where p.film_stock_id = ${filmStockId}::uuid
       and (${after === null}::boolean
            or (p.created_at, p.id) <
               (${after?.createdAt ?? null}::timestamptz,
                ${after?.id ?? null}::uuid))
     order by p.created_at desc, p.id desc
     limit ${limit + 1}
  `);

  // One row over the page size answers "is there more" without a second count.
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);

  return {
    photos: page.map((row) => ({
      id: row.id,
      storageKey: row.storage_key,
      width: row.width,
      height: row.height,
      frameSize: row.frame_size,
      format: row.format,
      uploaderUsername: row.uploader_username,
    })),
    nextCursor: hasMore && last ? encodeCursor(last.created_at, last.id) : null,
  };
}

/**
 * "Also appears in · N Photobooks".
 *
 * The one place the reference model is demonstrated rather than asserted in
 * copy (PRD D #11): one canonical Photo, seen in many contexts.
 *
 * **It counts every Photobook, not the viewer's.** Deriving it from whoever is
 * looking would print "1" on a Photo seven people had connected, which is the
 * exact mistake the gap plan's L2 records. There is deliberately no viewer
 * parameter here for that reason — it is a property of the Photo.
 *
 * `photobook_items_photo_idx` is the index that makes it a lookup rather than a
 * scan, and is why it exists.
 */
export async function alsoAppearsIn(photoId: string): Promise<number> {
  const rows = await getDb().execute<{ count: number }>(sql`
    select count(*)::int as count
      from photobook_items
     where photo_id = ${photoId}::uuid
  `);
  return rows[0].count;
}

/**
 * The cursor is `<timestamp>|<uuid>` — opaque to a caller, readable in a log.
 *
 * Not encrypted and not meant to be: it names a public row in a public gallery,
 * so the worst a hand-edited one can do is start the same public list somewhere
 * else. A malformed one is treated as absent rather than as an error, because
 * the honest answer to a corrupted scroll position is the first page.
 */
function encodeCursor(createdAt: string, id: string): string {
  return `${new Date(createdAt).toISOString()}|${id}`;
}

function decodeCursor(
  cursor: string | null | undefined,
): { createdAt: string; id: string } | null {
  if (!cursor) return null;

  const separator = cursor.indexOf("|");
  if (separator < 0) return null;

  const createdAt = cursor.slice(0, separator);
  const id = cursor.slice(separator + 1);
  if (Number.isNaN(Date.parse(createdAt)) || id === "") return null;

  return { createdAt, id };
}

export type PhotoDetail = PhotoRow & {
  /** Resolved for the metadata rail, which shows a name rather than an id. */
  filmStockName: string | null;
  uploaderUsername: string | null;
};

/**
 * One Photo with everything its detail page shows.
 *
 * Separate from `getPhoto` rather than replacing it: the actions need the row
 * and its owner to decide whether a write is allowed, and joining two tables to
 * answer an ownership question would be a wider query for no benefit. This one
 * is for rendering.
 *
 * The metadata rail's row order is fixed — Film Stock, Format, Camera, Scanner,
 * Chemistry — so that a missing field reads as "not tagged" rather than as a
 * different layout. The page renders every row; this only supplies the values.
 */
export async function getPhotoDetail(id: string): Promise<PhotoDetail | null> {
  const rows = await getDb().execute<{
    id: string;
    owner_id: string;
    storage_key: string;
    width: number;
    height: number;
    film_stock_id: string | null;
    film_stock_name: string | null;
    format: FilmFormat | null;
    frame_size: string | null;
    camera: string | null;
    scanner_model: string | null;
    chemistry: string | null;
    uploader_username: string | null;
  }>(sql`
    select p.id, p.owner_id, p.storage_key, p.width, p.height,
           p.film_stock_id, f.name as film_stock_name,
           p.format, p.frame_size, p.camera, p.scanner_model, p.chemistry,
           u.username as uploader_username
      from photos p
      join users u on u.id = p.owner_id
      left join film_stocks f on f.id = p.film_stock_id
     where p.id = ${id}::uuid
  `);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    ownerId: row.owner_id,
    storageKey: row.storage_key,
    width: row.width,
    height: row.height,
    filmStockId: row.film_stock_id,
    filmStockName: row.film_stock_name,
    format: row.format,
    frameSize: row.frame_size,
    camera: row.camera,
    scannerModel: row.scanner_model,
    chemistry: row.chemistry,
    uploaderUsername: row.uploader_username,
  };
}

/**
 * The owner's Photos that are in no Photobook at all.
 *
 * A Photo is live and Gallery-eligible without belonging to anything (PRD D #4),
 * which left it with nowhere to appear on its own author's profile — the open
 * question in PRD D #10 and gap plan J11.
 *
 * **PROPOSED answer, implemented here: they surface, but only for the owner.**
 * A visitor's view of a profile stays what the product says it is — curated
 * sets — while the person who uploaded a frame and has not filed it yet can
 * still find it. Filing it is then the obvious next action rather than a
 * feature nobody can reach. Overturning this means deleting one section and one
 * query, not unpicking a model.
 */
export async function listUnfiledPhotos(
  ownerId: string,
): Promise<GalleryPhoto[]> {
  const rows = await getDb().execute<{
    id: string;
    storage_key: string;
    width: number;
    height: number;
    frame_size: string | null;
    format: FilmFormat | null;
  }>(sql`
    select p.id, p.storage_key, p.width, p.height, p.frame_size, p.format
      from photos p
     where p.owner_id = ${ownerId}
       and not exists (select 1 from photobook_items i where i.photo_id = p.id)
     order by p.created_at desc
  `);

  return rows.map((row) => ({
    id: row.id,
    storageKey: row.storage_key,
    width: row.width,
    height: row.height,
    frameSize: row.frame_size,
    format: row.format,
    uploaderUsername: null,
  }));
}

/**
 * The owner's Photos, each marked with whether this Photobook already holds it.
 *
 * Everything the "add photographs" picker needs in one statement, and the same
 * shape `listPhotobooksForConnect` produces for the Connect sheet — one row per
 * candidate, carrying its current state, because the picker toggles rather than
 * only adds. A sheet that could add but not show what was already filed would
 * make "add" look idempotent and "remove" look impossible.
 *
 * Unbounded, and safe to be: a person's originals are capped at `UPLOAD_CAP`
 * (PRD D #5), so this is fifty rows at the very most. Connections are not
 * listed — a Photo that is somebody else's is Connected from its own page,
 * where the credit line and the reference model are visible.
 */
export async function listOwnPhotosForBook(
  ownerId: string,
  photobookId: string,
): Promise<(GalleryPhoto & { inBook: boolean })[]> {
  const rows = await getDb().execute<{
    id: string;
    storage_key: string;
    width: number;
    height: number;
    frame_size: string | null;
    format: FilmFormat | null;
    in_book: boolean;
  }>(sql`
    select p.id, p.storage_key, p.width, p.height, p.frame_size, p.format,
           exists (select 1 from photobook_items i
                    where i.photo_id = p.id
                      and i.photobook_id = ${photobookId}::uuid) as in_book
      from photos p
     where p.owner_id = ${ownerId}
     order by p.created_at desc
  `);

  return rows.map((row) => ({
    id: row.id,
    storageKey: row.storage_key,
    width: row.width,
    height: row.height,
    frameSize: row.frame_size,
    format: row.format,
    uploaderUsername: null,
    inBook: row.in_book,
  }));
}
